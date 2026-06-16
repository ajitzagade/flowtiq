import { Router } from 'express';
import { z } from 'zod';
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

// Helper: create notification record
async function createNotification(params: {
  tenantId: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
}) {
  await prisma.notification.create({
    data: {
      tenantId: params.tenantId,
      userId: params.userId,
      type: params.type,
      title: params.title,
      message: params.message,
      data: params.data as object | undefined,
    },
  });
}

// Helper: sync project.teamMembers based on stage assignees for a project
async function syncProjectTeamMembers(projectId: string) {
  const stages = await prisma.projectStage.findMany({
    where: { projectId },
    select: { assignedTo: true, assignedToIds: true },
  });
  const memberSet = new Set<string>();
  for (const s of stages) {
    if (s.assignedTo) memberSet.add(s.assignedTo);
    for (const uid of s.assignedToIds) memberSet.add(uid);
  }
  // Fetch current project
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { ownerId: true, teamMembers: true },
  });
  if (!project) return;
  // Merge with existing teamMembers (preserve manually-added ones), just ensure all stage assignees are included
  const merged = Array.from(new Set([...project.teamMembers, ...Array.from(memberSet)]));
  await prisma.project.update({
    where: { id: projectId },
    data: { teamMembers: merged },
  });
}

// PATCH /api/stages/:id
// Records history for EVERY update (including duplicate values as required)
stagesRouter.patch('/:id', requirePermission('projects:update'), async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { userId } = authReq.user;
    const { status, notes, assignedTo, assignedToIds, assignedById, startDate, completionDate, comment, checklist, isRequired } = req.body;

    const stage = await prisma.projectStage.findUnique({
      where: { id: req.params.id },
      include: { project: { select: { id: true, name: true, tenantId: true, projectNumber: true } } },
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
    } else if (assignedTo !== undefined || assignedToIds !== undefined) {
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

    // Compute the effective assignedToIds: merge assignedTo into the array
    let newAssignedToIds: string[] | undefined;
    if (assignedToIds !== undefined || assignedTo !== undefined) {
      const base: string[] = assignedToIds ?? stage.assignedToIds ?? [];
      const primary = assignedTo !== undefined ? assignedTo : stage.assignedTo;
      if (primary && !base.includes(primary)) {
        newAssignedToIds = [primary, ...base];
      } else {
        newAssignedToIds = base.filter(Boolean);
      }
    }

    const updated = await prisma.projectStage.update({
      where: { id: req.params.id },
      data: {
        ...(status !== undefined && { status }),
        ...(notes !== undefined && { notes }),
        ...(assignedTo !== undefined && { assignedTo }),
        ...(newAssignedToIds !== undefined && { assignedToIds: newAssignedToIds }),
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

    // ── Issue 1: Sync project.teamMembers so assigned users see the project ──
    if (assignedTo !== undefined || assignedToIds !== undefined) {
      await syncProjectTeamMembers(stage.projectId);

      // ── Send notifications to newly assigned users ──
      const previousIds = new Set<string>(stage.assignedToIds ?? []);
      if (stage.assignedTo) previousIds.add(stage.assignedTo);
      const currentIds = new Set<string>(newAssignedToIds ?? []);

      const tenantId = stage.project.tenantId;
      for (const uid of currentIds) {
        if (!previousIds.has(uid) && uid !== userId) {
          // Newly assigned — notify
          await createNotification({
            tenantId,
            userId: uid,
            type: 'assignment',
            title: 'You have been assigned to a stage',
            message: `You have been assigned to "${stage.stageName}" in project "${stage.project.name}" (${stage.project.projectNumber}). Please review and take action.`,
            data: { projectId: stage.projectId, stageId: stage.id, stageName: stage.stageName, projectName: stage.project.name },
          });
        }
      }
    }

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
  assignedTo: z.string().optional(),
});

// POST /api/stages/:id/sub-tasks
stagesRouter.post('/:id/sub-tasks', requirePermission('projects:update'), async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { userId } = authReq.user;
    const data = createSubTaskSchema.parse(req.body);

    const stage = await prisma.projectStage.findUnique({
      where: { id: req.params.id },
      include: { project: { select: { tenantId: true, name: true, projectNumber: true, id: true } } },
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
        assignedTo: data.assignedTo || null,
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

    // If sub-task assigned to someone, notify them and add to teamMembers
    if (data.assignedTo && data.assignedTo !== userId) {
      const tenantId = stage.project.tenantId;
      await createNotification({
        tenantId,
        userId: data.assignedTo,
        type: 'assignment',
        title: 'You have been assigned to a sub-task',
        message: `You have been assigned to sub-task "${data.name}" in stage "${stage.stageName}", project "${stage.project.name}" (${stage.project.projectNumber}). Please review and take action.`,
        data: { projectId: stage.project.id, stageId: stage.id, subTaskName: data.name, stageName: stage.stageName, projectName: stage.project.name },
      });
      // Add to project team members so they can see the project
      const project = await prisma.project.findUnique({
        where: { id: stage.project.id },
        select: { teamMembers: true },
      });
      if (project && !project.teamMembers.includes(data.assignedTo)) {
        await prisma.project.update({
          where: { id: stage.project.id },
          data: { teamMembers: [...project.teamMembers, data.assignedTo] },
        });
      }
    }

    res.status(201).json({ success: true, data: subTask });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/stages/:stageId/sub-tasks/:subTaskId
stagesRouter.patch('/:stageId/sub-tasks/:subTaskId', requirePermission('projects:update'), async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { userId } = authReq.user;
    const { status, name, notes, assignedTo } = req.body;

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
        ...(assignedTo !== undefined && { assignedTo: assignedTo || null }),
        ...(status === 'completed' && !subTask.completedAt && { completedAt: new Date() }),
        ...(status && status !== 'completed' && { completedAt: null }),
      },
    });

    // If assignedTo changed, notify new assignee and update teamMembers
    if (assignedTo !== undefined && assignedTo !== subTask.assignedTo && assignedTo && assignedTo !== userId) {
      const project = await prisma.project.findUnique({
        where: { id: stage!.projectId },
        select: { id: true, name: true, projectNumber: true, teamMembers: true, tenantId: true },
      });
      if (project) {
        await createNotification({
          tenantId: project.tenantId,
          userId: assignedTo,
          type: 'assignment',
          title: 'You have been assigned to a sub-task',
          message: `You have been assigned to sub-task "${subTask.name}" in stage "${stage!.stageName}", project "${project.name}" (${project.projectNumber}). Please review and take action.`,
          data: { projectId: project.id, stageId: stage!.projectId, subTaskId: subTask.id, subTaskName: subTask.name, projectName: project.name },
        });
        if (!project.teamMembers.includes(assignedTo)) {
          await prisma.project.update({
            where: { id: project.id },
            data: { teamMembers: [...project.teamMembers, assignedTo] },
          });
        }
      }
    }

    // Record in stage history
    await prisma.stageHistory.create({
      data: {
        stageId: req.params.stageId,
        changedById: userId,
        changeType: 'sub_task',
        fieldChanged: assignedTo !== undefined ? 'assignment' : 'subTask',
        previousStatus: stage?.status || 'pending',
        newStatus: stage?.status || 'pending',
        previousValue: subTask.status,
        newValue: status || subTask.status,
        comment: assignedTo !== undefined
          ? `Sub-task "${subTask.name}" assigned to user`
          : `Sub-task "${subTask.name}": ${subTask.status} → ${status || subTask.status}`,
      },
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/stages/:stageId/sub-tasks/:subTaskId
stagesRouter.delete('/:stageId/sub-tasks/:subTaskId', requirePermission('projects:update'), async (req, res, next) => {
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
