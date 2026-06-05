import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { createAuditLog } from '../lib/audit';

export const stagesRouter = Router();
stagesRouter.use(authenticate);

// GET /api/stages/project/:projectId
stagesRouter.get('/project/:projectId', requirePermission('projects:read'), async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { tenantId } = authReq.user;

    const project = await prisma.project.findFirst({
      where: { id: req.params.projectId, tenantId: tenantId as string },
    });

    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }

    const stages = await prisma.projectStage.findMany({
      where: { projectId: req.params.projectId },
      orderBy: { stageOrder: 'asc' },
      include: {
        stageHistory: {
          orderBy: { createdAt: 'desc' },
          include: {
            changedBy: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        documents: {
          where: { isActive: true },
          select: { id: true, fileName: true, originalName: true, fileType: true, version: true, createdAt: true },
        },
      },
    });

    res.json({ success: true, data: stages });
  } catch (err) {
    next(err);
  }
});

// GET /api/stages/:id
stagesRouter.get('/:id', requirePermission('projects:read'), async (req, res, next) => {
  try {
    const stage = await prisma.projectStage.findUnique({
      where: { id: req.params.id },
      include: {
        stageHistory: {
          orderBy: { createdAt: 'desc' },
          include: {
            changedBy: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        documents: { where: { isActive: true } },
        project: { select: { id: true, name: true, projectNumber: true, tenantId: true } },
      },
    });

    if (!stage) {
      res.status(404).json({ success: false, error: 'Stage not found' });
      return;
    }

    const authReq = req as AuthRequest;
    if (stage.project.tenantId !== authReq.user.tenantId && !authReq.user.isSuperAdmin) {
      res.status(403).json({ success: false, error: 'Access denied' });
      return;
    }

    res.json({ success: true, data: stage });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/stages/:id
stagesRouter.patch('/:id', requirePermission('stages:update'), async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { userId } = authReq.user;
    const { status, notes, assignedTo, startDate, completionDate, comment, checklist } = req.body;

    const stage = await prisma.projectStage.findUnique({
      where: { id: req.params.id },
      include: { project: true },
    });

    if (!stage) {
      res.status(404).json({ success: false, error: 'Stage not found' });
      return;
    }

    const previousStatus = stage.status;

    const updated = await prisma.projectStage.update({
      where: { id: req.params.id },
      data: {
        ...(status && { status }),
        ...(notes !== undefined && { notes }),
        ...(assignedTo !== undefined && { assignedTo }),
        ...(startDate && { startDate: new Date(startDate) }),
        ...(completionDate && { completionDate: new Date(completionDate) }),
        ...(checklist && { checklist }),
      },
    });

    // Record history
    if (status && status !== previousStatus) {
      await prisma.stageHistory.create({
        data: {
          stageId: stage.id,
          changedById: userId,
          previousStatus,
          newStatus: status,
          comment: comment || null,
        },
      });

      // Update project current stage if advancing
      if (status === 'completed') {
        const nextStage = await prisma.projectStage.findFirst({
          where: { projectId: stage.projectId, stageOrder: stage.stageOrder + 1 },
        });
        if (nextStage) {
          await prisma.project.update({
            where: { id: stage.projectId },
            data: { currentStage: nextStage.stageKey },
          });
          await prisma.projectStage.update({
            where: { id: nextStage.id },
            data: { status: 'in_progress', startDate: new Date() },
          });
        } else {
          // All stages complete
          await prisma.project.update({
            where: { id: stage.projectId },
            data: { status: 'completed', completionDate: new Date() },
          });
        }
      }
    }

    await createAuditLog({
      req: authReq,
      action: 'STATUS_CHANGED',
      module: 'stages',
      entityId: stage.id,
      entityType: 'stage',
      entityName: stage.stageName,
      previousData: { status: previousStatus },
      newData: { status, notes },
      metadata: { projectId: stage.projectId, projectName: stage.project.name },
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});
