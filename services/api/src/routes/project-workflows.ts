import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { createAuditLog } from '../lib/audit';

export const projectWorkflowsRouter = Router();
projectWorkflowsRouter.use(authenticate);

// Helper: compute progress for a set of stages
function computeProgress(stages: Array<{ status: string }>) {
  if (!stages.length) return { progressPct: 0, completedStages: 0, totalStages: 0 };
  const completed = stages.filter((s) => s.status === 'completed').length;
  return {
    progressPct: Math.round((completed / stages.length) * 100),
    completedStages: completed,
    totalStages: stages.length,
  };
}

// Helper: derive workflow status from stages
function deriveWorkflowStatus(stages: Array<{ status: string }>): string {
  if (!stages.length) return 'not_started';
  const statuses = stages.map((s) => s.status);
  if (statuses.every((s) => s === 'completed')) return 'completed';
  if (statuses.some((s) => s === 'in_progress' || s === 'completed')) return 'in_progress';
  if (statuses.some((s) => s === 'on_hold')) return 'blocked';
  return 'not_started';
}

// GET /api/project-workflows/project/:projectId
// List all workflows attached to a project
projectWorkflowsRouter.get('/project/:projectId', requirePermission('projects:view'), async (req, res, next) => {
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

    const workflows = await prisma.projectWorkflow.findMany({
      where: { projectId: req.params.projectId },
      orderBy: { order: 'asc' },
      include: {
        workflowTemplate: { select: { id: true, name: true, stages: true } },
        stages: {
          orderBy: { stageOrder: 'asc' },
          include: {
            stageHistory: {
              orderBy: { createdAt: 'desc' },
              take: 10,
              include: { changedBy: { select: { id: true, firstName: true, lastName: true } } },
            },
            documents: { where: { isActive: true }, orderBy: { createdAt: 'desc' } },
            subTasks: { orderBy: { order: 'asc' } },
          },
        },
        documents: { where: { isActive: true }, select: { id: true } },
      },
    });

    const withProgress = workflows.map((wf) => {
      const progress = computeProgress(wf.stages);
      return {
        ...wf,
        ...progress,
        stages: wf.stages.map((s) => ({ ...s, history: s.stageHistory })),
      };
    });

    res.json({ success: true, data: withProgress });
  } catch (err) {
    next(err);
  }
});

const addWorkflowSchema = z.object({
  workflowTemplateId: z.string(),
  order: z.number().int().min(1).optional(),
});

// POST /api/project-workflows/project/:projectId
// Attach a workflow template to a project
projectWorkflowsRouter.post('/project/:projectId', requirePermission('projects:edit'), async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { tenantId } = authReq.user;
    const data = addWorkflowSchema.parse(req.body);

    const project = await prisma.project.findFirst({
      where: { id: req.params.projectId, tenantId: tenantId as string },
    });
    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }

    const template = await prisma.workflowTemplate.findFirst({
      where: { id: data.workflowTemplateId, tenantId: tenantId as string },
    });
    if (!template) {
      res.status(404).json({ success: false, error: 'Workflow template not found' });
      return;
    }

    // Check if already attached
    const existing = await prisma.projectWorkflow.findFirst({
      where: { projectId: req.params.projectId, workflowTemplateId: data.workflowTemplateId },
    });
    if (existing) {
      res.status(409).json({ success: false, error: 'This workflow is already attached to the project' });
      return;
    }

    // Determine order
    const maxOrder = await prisma.projectWorkflow.aggregate({
      where: { projectId: req.params.projectId },
      _max: { order: true },
    });
    const order = data.order ?? (maxOrder._max.order ?? 0) + 1;

    const projectWorkflow = await prisma.projectWorkflow.create({
      data: {
        projectId: req.params.projectId,
        workflowTemplateId: data.workflowTemplateId,
        name: template.name,
        order,
        status: 'not_started',
      },
    });

    // Create stage instances from template
    const templateStages = template.stages as Array<Record<string, unknown>>;
    if (templateStages.length > 0) {
      await prisma.projectStage.createMany({
        data: templateStages.map((s) => ({
          projectId: req.params.projectId,
          projectWorkflowId: projectWorkflow.id,
          stageName: (s.name || s.stageName) as string,
          stageKey: (s.key || s.stageKey) as string,
          stageOrder: s.order as number,
          isRequired: (s.isRequired ?? true) as boolean,
          status: 'pending',
          checklist: (s.checklist as object[]) || [],
        })),
      });
    }

    await createAuditLog({
      req: authReq,
      action: 'CREATED',
      module: 'project_workflows',
      entityId: projectWorkflow.id,
      entityType: 'project_workflow',
      entityName: template.name,
      metadata: { projectId: req.params.projectId, projectName: project.name, workflowName: template.name },
    });

    const created = await prisma.projectWorkflow.findUnique({
      where: { id: projectWorkflow.id },
      include: {
        workflowTemplate: { select: { id: true, name: true } },
        stages: { orderBy: { stageOrder: 'asc' } },
      },
    });

    res.status(201).json({ success: true, data: { ...created, ...computeProgress(created!.stages) } });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/project-workflows/:id
// Update workflow status or order
projectWorkflowsRouter.patch('/:id', requirePermission('projects:edit'), async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { tenantId } = authReq.user;

    const pw = await prisma.projectWorkflow.findFirst({
      where: { id: req.params.id },
      include: { project: { select: { tenantId: true, name: true } } },
    });
    if (!pw || pw.project.tenantId !== tenantId) {
      res.status(404).json({ success: false, error: 'Project workflow not found' });
      return;
    }

    const { status, order } = req.body;
    const updated = await prisma.projectWorkflow.update({
      where: { id: req.params.id },
      data: {
        ...(status && { status }),
        ...(order && { order }),
        ...(status === 'in_progress' && !pw.startedAt && { startedAt: new Date() }),
        ...(status === 'completed' && { completedAt: new Date() }),
      },
    });

    // If this workflow was just completed, check if ALL workflows for the project are done
    if (status === 'completed') {
      const allProjectWorkflows = await prisma.projectWorkflow.findMany({
        where: { projectId: pw.projectId },
        select: { status: true },
      });
      if (allProjectWorkflows.length > 0 && allProjectWorkflows.every((w) => w.status === 'completed')) {
        await prisma.project.update({
          where: { id: pw.projectId },
          data: { status: 'completed', completionDate: new Date() },
        });
      }
    }

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/project-workflows/:id
// Remove a workflow from a project (and its stages)
projectWorkflowsRouter.delete('/:id', requirePermission('projects:edit'), async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { tenantId } = authReq.user;

    const pw = await prisma.projectWorkflow.findFirst({
      where: { id: req.params.id },
      include: {
        project: { select: { tenantId: true, name: true } },
        _count: { select: { stages: true } },
      },
    });
    if (!pw || pw.project.tenantId !== tenantId) {
      res.status(404).json({ success: false, error: 'Project workflow not found' });
      return;
    }

    // Null out document FK references before deleting (no cascade on Document→Stage / Document→ProjectWorkflow)
    const stageIds = (
      await prisma.projectStage.findMany({
        where: { projectWorkflowId: req.params.id },
        select: { id: true },
      })
    ).map((s) => s.id);

    if (stageIds.length > 0) {
      await prisma.document.updateMany({
        where: { stageId: { in: stageIds } },
        data: { stageId: null },
      });
    }
    await prisma.document.updateMany({
      where: { projectWorkflowId: req.params.id },
      data: { projectWorkflowId: null },
    });

    // Delete all stages for this workflow (cascades to history, sub-tasks)
    await prisma.projectStage.deleteMany({ where: { projectWorkflowId: req.params.id } });
    await prisma.projectWorkflow.delete({ where: { id: req.params.id } });

    await createAuditLog({
      req: authReq,
      action: 'DELETED',
      module: 'project_workflows',
      entityId: pw.id,
      entityType: 'project_workflow',
      entityName: pw.name,
      metadata: { projectId: pw.projectId, projectName: pw.project.name },
    });

    res.json({ success: true, message: 'Workflow removed from project' });
  } catch (err) {
    next(err);
  }
});

// GET /api/project-workflows/:id
projectWorkflowsRouter.get('/:id', requirePermission('projects:view'), async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { tenantId } = authReq.user;

    const pw = await prisma.projectWorkflow.findFirst({
      where: { id: req.params.id },
      include: {
        project: { select: { tenantId: true, name: true, projectNumber: true } },
        workflowTemplate: { select: { id: true, name: true, stages: true } },
        stages: {
          orderBy: { stageOrder: 'asc' },
          include: {
            stageHistory: {
              orderBy: { createdAt: 'desc' },
              include: { changedBy: { select: { id: true, firstName: true, lastName: true } } },
            },
            documents: { where: { isActive: true }, orderBy: { createdAt: 'desc' } },
            subTasks: { orderBy: { order: 'asc' } },
          },
        },
      },
    });

    if (!pw || pw.project.tenantId !== tenantId) {
      res.status(404).json({ success: false, error: 'Project workflow not found' });
      return;
    }

    const progress = computeProgress(pw.stages);
    res.json({
      success: true,
      data: {
        ...pw,
        ...progress,
        stages: pw.stages.map((s) => ({ ...s, history: s.stageHistory })),
      },
    });
  } catch (err) {
    next(err);
  }
});
