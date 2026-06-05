import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';

export const auditRouter = Router();
auditRouter.use(authenticate, requirePermission('audit:read'));

// GET /api/audit
auditRouter.get('/', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { tenantId, isSuperAdmin } = authReq.user;
    const {
      page = '1', pageSize = '50', userId, action, module, entityId,
      dateFrom, dateTo, search,
    } = req.query as Record<string, string>;

    const skip = (parseInt(page) - 1) * parseInt(pageSize);

    const where: Record<string, unknown> = {};

    if (!isSuperAdmin) {
      where.tenantId = tenantId as string;
    } else if (req.query.tenantId) {
      where.tenantId = req.query.tenantId as string;
    }

    if (userId) where.userId = userId;
    if (action) where.action = action;
    if (module) where.module = module;
    if (entityId) where.entityId = entityId;

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) (where.createdAt as Record<string, unknown>).gte = new Date(dateFrom);
      if (dateTo) (where.createdAt as Record<string, unknown>).lte = new Date(dateTo);
    }

    if (search) {
      where.OR = [
        { userEmail: { contains: search, mode: 'insensitive' } },
        { entityName: { contains: search, mode: 'insensitive' } },
        { action: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip,
        take: parseInt(pageSize),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        items: logs,
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

// GET /api/audit/project/:projectId
auditRouter.get('/project/:projectId', async (req, res, next) => {
  try {
    const logs = await prisma.auditLog.findMany({
      where: { entityId: req.params.projectId, entityType: 'project' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    // Also get stage changes, document uploads, follow-up activities
    const projectStages = await prisma.projectStage.findMany({
      where: { projectId: req.params.projectId },
      select: { id: true },
    });
    const stageIds = projectStages.map((s) => s.id);

    const stageHistory = await prisma.stageHistory.findMany({
      where: { stageId: { in: stageIds } },
      orderBy: { createdAt: 'desc' },
      include: {
        changedBy: { select: { id: true, firstName: true, lastName: true } },
        stage: { select: { stageName: true } },
      },
      take: 100,
    });

    res.json({
      success: true,
      data: {
        auditLogs: logs,
        stageHistory,
      },
    });
  } catch (err) {
    next(err);
  }
});
