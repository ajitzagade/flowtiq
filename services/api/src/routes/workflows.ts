import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { createAuditLog } from '../lib/audit';

export const workflowsRouter = Router();
workflowsRouter.use(authenticate);

// GET /api/workflows
// Normalize stages so both seed format (stageKey/stageName) and API format (key/name) work
function normalizeStages(stages: unknown): Array<{ key: string; name: string; order: number; color?: string; requiresApproval?: boolean }> {
  if (!Array.isArray(stages)) return [];
  return stages.map((s: Record<string, unknown>) => ({
    ...s,
    key: (s.key || s.stageKey || '') as string,
    name: (s.name || s.stageName || '') as string,
    order: (s.order ?? 0) as number,
  }));
}

workflowsRouter.get('/', async (req, res, next) => {
  try {
    const { tenantId } = (req as unknown as AuthRequest).user;

    const workflows = await prisma.workflowTemplate.findMany({
      where: { tenantId: tenantId as string },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { projects: true, projectWorkflows: true } } },
    });

    res.json({
      success: true,
      data: workflows.map((w) => ({
        ...w,
        stages: normalizeStages(w.stages),
        projectCount: w._count.projects + w._count.projectWorkflows,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/workflows/:id
workflowsRouter.get('/:id', async (req, res, next) => {
  try {
    const { tenantId } = (req as unknown as AuthRequest).user;

    const workflow = await prisma.workflowTemplate.findFirst({
      where: { id: req.params.id, tenantId: tenantId as string },
      include: { _count: { select: { projects: true, projectWorkflows: true } } },
    });

    if (!workflow) {
      res.status(404).json({ success: false, error: 'Workflow not found' });
      return;
    }

    res.json({ success: true, data: { ...workflow, stages: normalizeStages(workflow.stages), projectCount: workflow._count.projects } });
  } catch (err) {
    next(err);
  }
});

const stageConfigSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  order: z.number().int().min(1),
  description: z.string().optional(),
  color: z.string().optional(),
  isRequired: z.boolean().default(true),
  requiresApproval: z.boolean().default(false),
  canSkip: z.boolean().default(false),
  checklist: z.array(z.object({
    id: z.string(),
    label: z.string(),
    required: z.boolean(),
  })).default([]),
  followUpRules: z.object({
    autoCreate: z.boolean(),
    defaultDaysAhead: z.number(),
    reminderDaysBefore: z.number(),
  }).optional(),
});

const createWorkflowSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().optional(),
  isDefault: z.boolean().default(false),
  stages: z.array(stageConfigSchema).min(1),
});

// POST /api/workflows
workflowsRouter.post('/', requirePermission('workflows:manage'), async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { tenantId } = authReq.user;
    const data = createWorkflowSchema.parse(req.body);

    // Unset other defaults if this is default
    if (data.isDefault) {
      await prisma.workflowTemplate.updateMany({
        where: { tenantId: tenantId as string, isDefault: true },
        data: { isDefault: false },
      });
    }

    const workflow = await prisma.workflowTemplate.create({
      data: {
        tenantId: tenantId as string,
        name: data.name,
        description: data.description,
        isDefault: data.isDefault,
        stages: data.stages,
      },
    });

    await createAuditLog({
      req: authReq,
      action: 'CREATED',
      module: 'workflows',
      entityId: workflow.id,
      entityType: 'workflow',
      entityName: workflow.name,
    });

    res.status(201).json({ success: true, data: workflow });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/workflows/:id
workflowsRouter.patch('/:id', requirePermission('workflows:manage'), async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { tenantId } = authReq.user;

    const workflow = await prisma.workflowTemplate.findFirst({
      where: { id: req.params.id, tenantId: tenantId as string },
    });

    if (!workflow) {
      res.status(404).json({ success: false, error: 'Workflow not found' });
      return;
    }

    if (req.body.isDefault) {
      await prisma.workflowTemplate.updateMany({
        where: { tenantId: tenantId as string, isDefault: true, id: { not: req.params.id } },
        data: { isDefault: false },
      });
    }

    const updated = await prisma.workflowTemplate.update({
      where: { id: req.params.id },
      data: req.body,
    });

    await createAuditLog({
      req: authReq,
      action: 'UPDATED',
      module: 'workflows',
      entityId: workflow.id,
      entityType: 'workflow',
      entityName: workflow.name,
      newData: req.body,
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/workflows/:id
workflowsRouter.delete('/:id', requirePermission('workflows:manage'), async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { tenantId } = authReq.user;

    const workflow = await prisma.workflowTemplate.findFirst({
      where: { id: req.params.id, tenantId: tenantId as string },
      include: { _count: { select: { projects: true, projectWorkflows: true } } },
    });

    if (!workflow) {
      res.status(404).json({ success: false, error: 'Workflow not found' });
      return;
    }

    if ((workflow._count.projects + workflow._count.projectWorkflows) > 0) {
      res.status(400).json({
        success: false,
        error: `Cannot delete workflow that is used by ${workflow._count.projects + workflow._count.projectWorkflows} project(s)`,
      });
      return;
    }

    await prisma.workflowTemplate.delete({ where: { id: req.params.id } });

    await createAuditLog({
      req: authReq,
      action: 'DELETED',
      module: 'workflows',
      entityId: workflow.id,
      entityType: 'workflow',
      entityName: workflow.name,
    });

    res.json({ success: true, message: 'Workflow deleted' });
  } catch (err) {
    next(err);
  }
});
