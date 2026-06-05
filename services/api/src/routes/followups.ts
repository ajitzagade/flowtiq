import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireAnyPermission, requirePermission } from '../middleware/rbac';
import { createAuditLog } from '../lib/audit';

export const followupsRouter = Router();
followupsRouter.use(authenticate);

// GET /api/follow-ups
followupsRouter.get('/', requireAnyPermission(['followups:create', 'followups:view_all']), async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { tenantId, userId, permissions, isSuperAdmin } = authReq.user;
    const {
      page = '1', pageSize = '20', status, ownerId, projectId,
      overdue, sortBy = 'nextFollowUp', sortOrder = 'asc',
    } = req.query as Record<string, string>;

    const skip = (parseInt(page) - 1) * parseInt(pageSize);
    const canViewAll = isSuperAdmin || permissions.includes('followups:view_all');

    const where: Record<string, unknown> = { tenantId: tenantId as string };

    if (!canViewAll) {
      where.OR = [{ ownerId: userId }, { createdById: userId }];
    }

    if (status) where.status = status;
    if (ownerId) where.ownerId = ownerId;
    if (projectId) where.projectId = projectId;
    if (overdue === 'true') {
      where.nextFollowUp = { lt: new Date() };
      where.status = { in: ['pending', 'overdue'] };
    }

    const [followUps, total] = await Promise.all([
      prisma.followUp.findMany({
        where,
        skip,
        take: parseInt(pageSize),
        orderBy: { [sortBy]: sortOrder },
        include: {
          project: { select: { id: true, name: true, projectNumber: true, clientName: true, status: true } },
          owner: { select: { id: true, firstName: true, lastName: true, email: true } },
          createdBy: { select: { id: true, firstName: true, lastName: true } },
          _count: { select: { history: true } },
        },
      }),
      prisma.followUp.count({ where }),
    ]);

    // Auto-update overdue status
    const now = new Date();
    const overdueIds = followUps
      .filter((f) => f.status === 'pending' && f.nextFollowUp < now)
      .map((f) => f.id);

    if (overdueIds.length > 0) {
      await prisma.followUp.updateMany({
        where: { id: { in: overdueIds } },
        data: { status: 'overdue' },
      });
    }

    res.json({
      success: true,
      data: {
        items: followUps.map((f) => ({
          ...f,
          status: overdueIds.includes(f.id) ? 'overdue' : f.status,
          historyCount: f._count.history,
        })),
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        totalPages: Math.ceil(total / parseInt(pageSize)),
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/follow-ups/:id
followupsRouter.get('/:id', requireAnyPermission(['followups:create', 'followups:view_all']), async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { tenantId } = authReq.user;

    const followUp = await prisma.followUp.findFirst({
      where: { id: req.params.id, tenantId: tenantId as string },
      include: {
        project: { select: { id: true, name: true, projectNumber: true, clientName: true } },
        owner: { select: { id: true, firstName: true, lastName: true, email: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        history: {
          orderBy: { createdAt: 'desc' },
          include: {
            createdBy: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });

    if (!followUp) {
      res.status(404).json({ success: false, error: 'Follow-up not found' });
      return;
    }

    res.json({ success: true, data: followUp });
  } catch (err) {
    next(err);
  }
});

const createFollowUpSchema = z.object({
  projectId: z.string(),
  ownerId: z.string(),
  nextFollowUp: z.string(),
  notes: z.string().optional(),
});

// POST /api/follow-ups
followupsRouter.post('/', requirePermission('followups:create'), async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { tenantId, userId } = authReq.user;
    const data = createFollowUpSchema.parse(req.body);

    const followUp = await prisma.followUp.create({
      data: {
        tenantId: tenantId as string,
        projectId: data.projectId,
        ownerId: data.ownerId,
        createdById: userId,
        nextFollowUp: new Date(data.nextFollowUp),
        notes: data.notes,
      },
      include: {
        project: { select: { id: true, name: true, projectNumber: true, clientName: true } },
        owner: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // Create notification for owner
    await prisma.notification.create({
      data: {
        tenantId: tenantId as string,
        userId: data.ownerId,
        type: 'assignment',
        title: 'New Follow-up Assigned',
        message: `You have a new follow-up for project: ${followUp.project.name}`,
        data: { followUpId: followUp.id, projectId: data.projectId },
      },
    });

    await createAuditLog({
      req: authReq,
      action: 'CREATED',
      module: 'followups',
      entityId: followUp.id,
      entityType: 'followup',
      entityName: followUp.project.name,
      newData: { nextFollowUp: data.nextFollowUp, ownerId: data.ownerId },
    });

    res.status(201).json({ success: true, data: followUp });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/follow-ups/:id
followupsRouter.patch('/:id', requirePermission('followups:update'), async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { tenantId, userId } = authReq.user;
    const { status, ownerId, nextFollowUp, notes, historyNote } = req.body;

    const followUp = await prisma.followUp.findFirst({
      where: { id: req.params.id, tenantId: tenantId as string },
      include: { project: true },
    });

    if (!followUp) {
      res.status(404).json({ success: false, error: 'Follow-up not found' });
      return;
    }

    const previousStatus = followUp.status;

    const updated = await prisma.followUp.update({
      where: { id: req.params.id },
      data: {
        ...(status && { status }),
        ...(ownerId && { ownerId }),
        ...(nextFollowUp && { nextFollowUp: new Date(nextFollowUp) }),
        ...(notes !== undefined && { notes }),
        ...(status === 'completed' && { lastFollowUp: new Date() }),
      },
    });

    // Add history entry
    if (historyNote || (status && status !== previousStatus)) {
      await prisma.followUpHistory.create({
        data: {
          followUpId: req.params.id,
          notes: historyNote || `Status changed to ${status}`,
          createdById: userId,
          status: status || previousStatus,
        },
      });
    }

    await createAuditLog({
      req: authReq,
      action: 'UPDATED',
      module: 'followups',
      entityId: followUp.id,
      entityType: 'followup',
      entityName: followUp.project.name,
      previousData: { status: previousStatus },
      newData: { status, nextFollowUp },
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/follow-ups/:id
followupsRouter.delete('/:id', requirePermission('followups:update'), async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { tenantId } = authReq.user;

    const followUp = await prisma.followUp.findFirst({
      where: { id: req.params.id, tenantId: tenantId as string },
    });

    if (!followUp) {
      res.status(404).json({ success: false, error: 'Follow-up not found' });
      return;
    }

    await prisma.followUp.update({
      where: { id: req.params.id },
      data: { status: 'cancelled' },
    });

    res.json({ success: true, message: 'Follow-up cancelled' });
  } catch (err) {
    next(err);
  }
});
