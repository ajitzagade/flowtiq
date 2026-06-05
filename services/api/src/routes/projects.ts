import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requirePermission, requireAnyPermission } from '../middleware/rbac';
import { createAuditLog } from '../lib/audit';

export const projectsRouter = Router();
projectsRouter.use(authenticate);

async function generateProjectNumber(tenantId: string): Promise<string> {
  const count = await prisma.project.count({ where: { tenantId } });
  const year = new Date().getFullYear();
  const num = String(count + 1).padStart(3, '0');
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } });
  const prefix = tenant?.slug.toUpperCase().slice(0, 3) || 'FLQ';
  return `${prefix}-${year}-${num}`;
}

// GET /api/projects
projectsRouter.get('/', requireAnyPermission(['projects:read', 'projects:view_all']), async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { tenantId, userId, isSuperAdmin, permissions } = authReq.user;
    const {
      page = '1', pageSize = '20', search, status, priority,
      ownerId, workflowId, sortBy = 'createdAt', sortOrder = 'desc',
    } = req.query as Record<string, string>;

    const skip = (parseInt(page) - 1) * parseInt(pageSize);
    const canViewAll = isSuperAdmin || permissions.includes('projects:view_all');

    const where: Record<string, unknown> = { tenantId: tenantId as string };

    if (!canViewAll) {
      where.OR = [
        { ownerId: userId },
        { teamMembers: { has: userId } },
        { followUpOwnerId: userId },
        { reportingOwnerId: userId },
      ];
    }

    if (search) {
      const searchOr = [
        { name: { contains: search, mode: 'insensitive' } },
        { projectNumber: { contains: search, mode: 'insensitive' } },
        { clientName: { contains: search, mode: 'insensitive' } },
        { location: { contains: search, mode: 'insensitive' } },
      ];
      if (canViewAll) {
        where.OR = searchOr;
      } else {
        where.AND = [{ OR: where.OR }, { OR: searchOr }];
        delete where.OR;
      }
    }

    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (ownerId) where.ownerId = ownerId;
    if (workflowId) where.workflowId = workflowId;

    const [projects, total] = await Promise.all([
      prisma.project.findMany({
        where,
        skip,
        take: parseInt(pageSize),
        orderBy: { [sortBy]: sortOrder },
        include: {
          owner: { select: { id: true, firstName: true, lastName: true, email: true, avatar: true } },
          workflow: { select: { id: true, name: true } },
          _count: { select: { documents: true, followUps: true } },
        },
      }),
      prisma.project.count({ where }),
    ]);

    // Get pending follow-ups count per project
    const projectIds = projects.map((p) => p.id);
    const pendingFollowUps = await prisma.followUp.groupBy({
      by: ['projectId'],
      where: { projectId: { in: projectIds }, status: { in: ['pending', 'overdue'] } },
      _count: { id: true },
    });
    const followUpMap = new Map(pendingFollowUps.map((f) => [f.projectId, f._count.id]));

    res.json({
      success: true,
      data: {
        items: projects.map((p) => ({
          ...p,
          documentsCount: p._count.documents,
          followUpsCount: p._count.followUps,
          pendingFollowUps: followUpMap.get(p.id) || 0,
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

// GET /api/projects/:id
projectsRouter.get('/:id', requirePermission('projects:read'), async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { tenantId } = authReq.user;

    const project = await prisma.project.findFirst({
      where: { id: req.params.id, tenantId: tenantId as string },
      include: {
        owner: { select: { id: true, firstName: true, lastName: true, email: true, avatar: true } },
        workflow: { select: { id: true, name: true, stages: true } },
        stages: {
          orderBy: { stageOrder: 'asc' },
          include: {
            stageHistory: {
              orderBy: { createdAt: 'desc' },
              include: {
                changedBy: { select: { id: true, firstName: true, lastName: true } },
              },
            },
          },
        },
        followUps: {
          where: { status: { in: ['pending', 'overdue'] } },
          orderBy: { nextFollowUp: 'asc' },
          include: {
            owner: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        _count: { select: { documents: true } },
      },
    });

    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }

    res.json({ success: true, data: project });
  } catch (err) {
    next(err);
  }
});

const createProjectSchema = z.object({
  projectNumber: z.string().optional(),
  name: z.string().min(2).max(200),
  description: z.string().optional(),
  clientName: z.string().min(1).max(200),
  location: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  startDate: z.string().optional(),
  dueDate: z.string().optional(),
  workflowId: z.string().optional(),
  ownerId: z.string(),
  teamMembers: z.array(z.string()).default([]),
  followUpOwnerId: z.string().optional(),
  reportingOwnerId: z.string().optional(),
});

// POST /api/projects
projectsRouter.post('/', requirePermission('projects:create'), async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { tenantId } = authReq.user;
    const data = createProjectSchema.parse(req.body);

    const projectNumber = data.projectNumber || await generateProjectNumber(tenantId as string);

    const existing = await prisma.project.findFirst({
      where: { tenantId: tenantId as string, projectNumber },
    });
    if (existing) {
      res.status(409).json({ success: false, error: 'Project number already exists' });
      return;
    }

    const project = await prisma.project.create({
      data: {
        tenantId: tenantId as string,
        projectNumber,
        name: data.name,
        description: data.description,
        clientName: data.clientName,
        location: data.location,
        priority: data.priority,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
        workflowId: data.workflowId,
        ownerId: data.ownerId,
        teamMembers: data.teamMembers,
        followUpOwnerId: data.followUpOwnerId,
        reportingOwnerId: data.reportingOwnerId,
        currentStage: 'file_creation',
      },
      include: {
        owner: { select: { id: true, firstName: true, lastName: true, email: true } },
        workflow: { select: { id: true, name: true, stages: true } },
      },
    });

    // Create stage instances if workflow is set
    if (data.workflowId && project.workflow) {
      const stages = project.workflow.stages as Array<{
        key: string; name: string; order: number; checklist?: object[];
      }>;
      await prisma.projectStage.createMany({
        data: stages.map((s) => ({
          projectId: project.id,
          stageName: s.name,
          stageKey: s.key,
          stageOrder: s.order,
          status: s.order === 1 ? 'in_progress' : 'pending',
          checklist: s.checklist || [],
        })),
      });
    }

    await createAuditLog({
      req: authReq,
      action: 'CREATED',
      module: 'projects',
      entityId: project.id,
      entityType: 'project',
      entityName: project.name,
      newData: { projectNumber, name: data.name, clientName: data.clientName },
    });

    res.status(201).json({ success: true, data: project });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/projects/:id
projectsRouter.patch('/:id', requirePermission('projects:update'), async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { tenantId } = authReq.user;

    const project = await prisma.project.findFirst({
      where: { id: req.params.id, tenantId: tenantId as string },
    });

    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }

    const { startDate, dueDate, completionDate, ...rest } = req.body;

    const updated = await prisma.project.update({
      where: { id: req.params.id },
      data: {
        ...rest,
        ...(startDate && { startDate: new Date(startDate) }),
        ...(dueDate && { dueDate: new Date(dueDate) }),
        ...(completionDate && { completionDate: new Date(completionDate) }),
      },
      include: {
        owner: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    await createAuditLog({
      req: authReq,
      action: 'UPDATED',
      module: 'projects',
      entityId: project.id,
      entityType: 'project',
      entityName: project.name,
      previousData: { status: project.status, priority: project.priority },
      newData: req.body,
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/projects/:id
projectsRouter.delete('/:id', requirePermission('projects:delete'), async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { tenantId } = authReq.user;

    const project = await prisma.project.findFirst({
      where: { id: req.params.id, tenantId: tenantId as string },
    });

    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }

    await prisma.project.update({
      where: { id: req.params.id },
      data: { status: 'cancelled' },
    });

    await createAuditLog({
      req: authReq,
      action: 'DELETED',
      module: 'projects',
      entityId: project.id,
      entityType: 'project',
      entityName: project.name,
    });

    res.json({ success: true, message: 'Project cancelled' });
  } catch (err) {
    next(err);
  }
});
