import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { createAuditLog } from '../lib/audit';

export const stagesRouter = Router();
stagesRouter.use(authenticate);

// GET /api/stages/project/:projectId
stagesRouter.get('/project/:projectId', requirePermission('projects:view'), async (req, res, next) => {
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
          select: { id: true, fileName: true, originalName: true, fileType: true, mimeType: true, filePath: true, version: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        },
        subTasks: { orderBy: { order: 'asc' } },
      },
    });

    res.json({ success: true, data: stages.map((s) => ({ ...s, history: s.stageHistory })) });
  } catch (err) {
    next(err);
  }
});

// GET /api/stages/:id
stagesRouter.get('/:id', requirePermission('projects:view'), async (req, res, next) => {
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
        documents: { where: { isActive: true }, orderBy: { createdAt: 'desc' } },
        subTasks: { orderBy: { order: 'asc' } },
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

    res.json({ success: true, data: { ...stage, history: stage.stageHistory } });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/stages/:id
// Records history for EVERY update (including duplicate values as required)
stagesRouter.patch('/:id', requirePermission('projects:edit'), async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { userId } = authReq.user;
    const { status, notes, assignedTo, assignedById, startDate, completionDate, comment, checklist, isRequired } = req.body;

    const stage = await prisma.projectStage.findUnique({
      where: { id: req.params.id },
      include: { project: { select: { id: true, name: true, tenantId: true } } },
    });

    if (!stage) {
      res.status(404).json({ success: false, error: 'Stage not found' });
      return;
    }

    const previousStatus = stage.status;
    const newStatus = status || stage.status;

    // Determine change type and description for history
    let changeType = 'update';
    let fieldChanged: string | null = null;
    let previousValue: string | null = null;
    let newValue: string | null = null;

    if (status !== undefined) {
      changeType = 'status';
      fieldChanged = 'status';
      previousValue = stage.status;
      newValue = status;
    } else if (assignedTo !== undefined) {
      changeType = 'assignment';
      fieldChanged = 'assignedTo';
      previousValue = stage.assignedTo || null;
      newValue = assignedTo || null;
    } else if (notes !== undefined) {
      changeType = 'notes';
      fieldChanged = 'notes';
      previousValue = stage.notes || null;
      newValue = notes || null;
    } else if (checklist !== undefined) {
      changeType = 'checklist';
      fieldChanged = 'checklist';
    } else if (isRequired !== undefined) {
      changeType = 'update';
      fieldChanged = 'isRequired';
      previousValue = String(stage.isRequired);
      newValue = String(isRequired);
    }

    const updated = await prisma.projectStage.update({
      where: { id: req.params.id },
      data: {
        ...(status !== undefined && { status }),
        ...(notes !== undefined && { notes }),
        ...(assignedTo !== undefined && { assignedTo }),
        ...(assignedById !== undefined && { assignedById }),
        ...(assignedTo !== undefined && assignedTo !== stage.assignedTo && { assignedAt: new Date() }),
        ...(startDate && { startDate: new Date(startDate) }),
        ...(completionDate && { completionDate: new Date(completionDate) }),
        ...(checklist !== undefined && { checklist }),
        ...(isRequired !== undefined && { isRequired }),
      },
      include: {
        subTasks: { orderBy: { order: 'asc' } },
      },
    });

    // Always record history (requirement: do not skip duplicate updates)
    await prisma.stageHistory.create({
      data: {
        stageId: stage.id,
        changedById: userId,
        changeType,
        fieldChanged,
        previousStatus,
        newStatus,
        previousValue,
        newValue,
        comment: comment || null,
      },
    });

    // If stage completed: advance to next stage in the workflow
    if (status === 'completed' && status !== previousStatus) {
      if (stage.projectWorkflowId) {
        // New multi-workflow system: advance within the workflow
        const nextStage = await prisma.projectStage.findFirst({
          where: { projectWorkflowId: stage.projectWorkflowId, stageOrder: stage.stageOrder + 1 },
        });
        if (nextStage && nextStage.status === 'pending') {
          await prisma.projectStage.update({
            where: { id: nextStage.id },
            data: { status: 'in_progress', startDate: new Date() },
          });
        }

        // Check if all stages in this workflow are complete → mark workflow completed
        const allStages = await prisma.projectStage.findMany({
          where: { projectWorkflowId: stage.projectWorkflowId },
          select: { status: true },
        });
        if (allStages.every((s) => s.status === 'completed')) {
          await prisma.projectWorkflow.update({
            where: { id: stage.projectWorkflowId },
            data: { status: 'completed', completedAt: new Date() },
          });
        } else {
          // Ensure workflow is in_progress
          await prisma.projectWorkflow.updateMany({
            where: { id: stage.projectWorkflowId, status: 'not_started' },
            data: { status: 'in_progress', startedAt: new Date() },
          });
        }
      } else {
        // Legacy single-workflow: advance project.currentStage
        const nextStage = await prisma.projectStage.findFirst({
          where: { projectId: stage.projectId, stageOrder: stage.stageOrder + 1, projectWorkflowId: null },
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
      previousData: { status: previousStatus, assignedTo: stage.assignedTo, notes: stage.notes },
      newData: { status: newStatus, assignedTo: assignedTo ?? stage.assignedTo, notes: notes ?? stage.notes },
      metadata: {
        projectId: stage.projectId,
        projectName: stage.project.name,
        projectWorkflowId: stage.projectWorkflowId,
        changeType,
        fieldChanged,
      },
    });

    res.json({ success: true, data: { ...updated, history: [] } });
  } catch (err) {
    next(err);
  }
});

// =============================================
// SUB-TASKS
// =============================================

const createSubTaskSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  isRequired: z.boolean().default(false),
  order: z.number().int().optional(),
});

// POST /api/stages/:id/sub-tasks
stagesRouter.post('/:id/sub-tasks', requirePermission('projects:edit'), async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { userId } = authReq.user;
    const data = createSubTaskSchema.parse(req.body);

    const stage = await prisma.projectStage.findUnique({
      where: { id: req.params.id },
      include: { project: { select: { tenantId: true, name: true } } },
    });
    if (!stage) {
      res.status(404).json({ success: false, error: 'Stage not found' });
      return;
    }
    if (stage.project.tenantId !== authReq.user.tenantId && !authReq.user.isSuperAdmin) {
      res.status(403).json({ success: false, error: 'Access denied' });
      return;
    }

    const maxOrder = await prisma.stageSubTask.aggregate({
      where: { stageId: req.params.id },
      _max: { order: true },
    });
    const order = data.order ?? (maxOrder._max.order ?? 0) + 1;

    const subTask = await prisma.stageSubTask.create({
      data: {
        stageId: req.params.id,
        name: data.name,
        description: data.description,
        isRequired: data.isRequired,
        order,
        status: 'pending',
      },
    });

    // Record in stage history
    await prisma.stageHistory.create({
      data: {
        stageId: stage.id,
        changedById: userId,
        changeType: 'sub_task',
        fieldChanged: 'subTask',
        previousStatus: stage.status,
        newStatus: stage.status,
        newValue: data.name,
        comment: `Sub-task added: ${data.name}`,
      },
    });

    res.status(201).json({ success: true, data: subTask });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/stages/:stageId/sub-tasks/:subTaskId
stagesRouter.patch('/:stageId/sub-tasks/:subTaskId', requirePermission('projects:edit'), async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { userId } = authReq.user;
    const { status, name, notes } = req.body;

    const subTask = await prisma.stageSubTask.findFirst({
      where: { id: req.params.subTaskId, stageId: req.params.stageId },
    });
    if (!subTask) {
      res.status(404).json({ success: false, error: 'Sub-task not found' });
      return;
    }

    const stage = await prisma.projectStage.findUnique({
      where: { id: req.params.stageId },
      select: { status: true, stageName: true, projectId: true },
    });

    const updated = await prisma.stageSubTask.update({
      where: { id: req.params.subTaskId },
      data: {
        ...(status && { status }),
        ...(name && { name }),
        ...(notes !== undefined && { notes }),
        ...(status === 'completed' && !subTask.completedAt && { completedAt: new Date() }),
        ...(status && status !== 'completed' && { completedAt: null }),
      },
    });

    // Record in stage history
    await prisma.stageHistory.create({
      data: {
        stageId: req.params.stageId,
        changedById: userId,
        changeType: 'sub_task',
        fieldChanged: 'subTask',
        previousStatus: stage?.status || 'pending',
        newStatus: stage?.status || 'pending',
        previousValue: subTask.status,
        newValue: status || subTask.status,
        comment: `Sub-task "${subTask.name}": ${subTask.status} → ${status || subTask.status}`,
      },
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/stages/:stageId/sub-tasks/:subTaskId
stagesRouter.delete('/:stageId/sub-tasks/:subTaskId', requirePermission('projects:edit'), async (req, res, next) => {
  try {
    const subTask = await prisma.stageSubTask.findFirst({
      where: { id: req.params.subTaskId, stageId: req.params.stageId },
    });
    if (!subTask) {
      res.status(404).json({ success: false, error: 'Sub-task not found' });
      return;
    }
    await prisma.stageSubTask.delete({ where: { id: req.params.subTaskId } });
    res.json({ success: true, message: 'Sub-task deleted' });
  } catch (err) {
    next(err);
  }
});
