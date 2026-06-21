import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';

export const dashboardRouter = Router();
dashboardRouter.use(authenticate);

// GET /api/dashboard/stats
dashboardRouter.get('/stats', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { tenantId, userId, isSuperAdmin, permissions } = authReq.user;

    if (isSuperAdmin) {
      // Super admin stats
      const [
        totalTenants, activeTenants, totalUsers, activeUsers, totalProjects, totalDocuments,
      ] = await Promise.all([
        prisma.tenant.count(),
        prisma.tenant.count({ where: { isActive: true } }),
        prisma.user.count({ where: { tenantId: { not: null } } }),
        prisma.user.count({ where: { tenantId: { not: null }, isActive: true } }),
        prisma.project.count({ where: { deletedAt: null } }),
        prisma.document.count({ where: { isActive: true } }),
      ]);

      const recentTenants = await prisma.tenant.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { _count: { select: { users: true, projects: true } } },
      });

      return res.json({
        success: true,
        data: {
          totalTenants,
          activeTenants,
          totalUsers,
          activeUsers,
          totalProjects,
          totalDocuments,
          recentTenants: recentTenants.map((t) => ({
            ...t,
            userCount: t._count.users,
            projectCount: t._count.projects,
          })),
          systemHealth: { database: 'healthy', api: 'healthy', storage: 'healthy' },
        },
      });
    }

    // Tenant stats
    const canViewAll = permissions.includes('projects:view_all');

    const projectWhere: Record<string, unknown> = {
      tenantId: tenantId as string,
      deletedAt: null,            // exclude soft-deleted
      status: { not: 'cancelled' }, // exclude cancelled
    };
    if (!canViewAll) {
      projectWhere.OR = [
        { ownerId: userId },
        { teamMembers: { has: userId } },
        { followUpOwnerId: userId },
      ];
    }

    const followUpWhere: Record<string, unknown> = { tenantId: tenantId as string };
    if (!canViewAll) {
      followUpWhere.OR = [{ ownerId: userId }, { createdById: userId }];
    }

    const now = new Date();

    const [
      totalProjects, activeProjects, completedProjects, onHoldProjects,
      totalFollowUps, pendingFollowUps, overdueFollowUps, totalDocuments,
      projectsByStatus, projectsByPriority,
    ] = await Promise.all([
      prisma.project.count({ where: projectWhere }),
      prisma.project.count({ where: { ...projectWhere, status: 'active' } }),
      prisma.project.count({ where: { ...projectWhere, status: 'completed' } }),
      prisma.project.count({ where: { ...projectWhere, status: 'on_hold' } }),
      prisma.followUp.count({ where: followUpWhere }),
      prisma.followUp.count({ where: { ...followUpWhere, status: 'pending' } }),
      prisma.followUp.count({ where: { ...followUpWhere, status: { in: ['overdue', 'pending'] }, nextFollowUp: { lt: now } } }),
      prisma.document.count({ where: { tenantId: tenantId as string, isActive: true } }),
      prisma.project.groupBy({
        by: ['status'],
        where: projectWhere,
        _count: { id: true },
      }),
      prisma.project.groupBy({
        by: ['priority'],
        where: projectWhere,
        _count: { id: true },
      }),
    ]);

    // Upcoming follow-ups (next 7 days)
    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);

    const upcomingFollowUps = await prisma.followUp.findMany({
      where: {
        ...followUpWhere,
        status: 'pending',
        nextFollowUp: { gte: now, lte: nextWeek },
      },
      orderBy: { nextFollowUp: 'asc' },
      take: 5,
      include: {
        project: { select: { id: true, name: true, projectNumber: true, clientName: true } },
        owner: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    const PRIORITY_ORDER: Record<string, number> = { urgent: 1, high: 2, medium: 3, low: 4 };

    // Active projects sorted by priority (urgent first), then by updated date
    const recentProjectsRaw = await prisma.project.findMany({
      where: { ...projectWhere, status: 'active' },
      orderBy: { updatedAt: 'desc' },
      take: 20,
      include: {
        owner: { select: { id: true, firstName: true, lastName: true } },
        projectWorkflows: {
          select: {
            stages: { select: { status: true, stageOrder: true } },
          },
        },
      },
    });
    const recentProjects = [...recentProjectsRaw]
      .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 5) - (PRIORITY_ORDER[b.priority] ?? 5))
      .slice(0, 8)
      .map((p) => {
        const allStages = p.projectWorkflows.flatMap((pw) => pw.stages);
        const totalStages = allStages.length;
        const completedStages = allStages.filter((s) => s.status === 'completed').length;
        const inProgressStages = allStages.filter((s) => s.status === 'in_progress').length;
        // Credit completed stages fully + in_progress stages at 50% so the bar
        // reflects active work, not just fully-closed stages.
        const overallProgressPct = totalStages > 0
          ? Math.min(100, Math.round(((completedStages + inProgressStages * 0.5) / totalStages) * 100))
          : null;
        const { projectWorkflows: _pw, ...rest } = p;
        return { ...rest, overallProgressPct, completedStages, totalStages };
      });

    // Workflow pipeline: use ProjectWorkflow + ProjectStage for accurate counts
    const workflowTemplates = await prisma.workflowTemplate.findMany({
      where: { tenantId: tenantId as string },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });

    // Get active project IDs (scoped by canViewAll)
    const activeProjectIds = (
      await prisma.project.findMany({
        where: { ...projectWhere, status: 'active' },
        select: { id: true },
      })
    ).map((p) => p.id);

    // Fetch ProjectWorkflow IDs for active projects (needed for groupBy — Prisma groupBy can't filter by relation)
    const activeProjectWorkflows = await prisma.projectWorkflow.findMany({
      where: {
        projectId: { in: activeProjectIds },
        workflowTemplateId: { in: workflowTemplates.map((w) => w.id) },
      },
      select: { id: true, workflowTemplateId: true, projectId: true },
    });
    const activeProjectWorkflowIds = activeProjectWorkflows.map((pw) => pw.id);

    // For new ProjectWorkflow system: find the current stage per workflow instance.
    // Current stage = first in_progress stage (by stageOrder), else first pending stage.
    // This ensures every active project appears in exactly one stage column, so the
    // header badge (totalProjects) always equals the sum of the per-stage counts.
    const allStagesForActiveWorkflows = await prisma.projectStage.findMany({
      where: { projectWorkflowId: { in: activeProjectWorkflowIds } },
      select: { projectWorkflowId: true, stageKey: true, status: true, stageOrder: true },
      orderBy: [{ stageOrder: 'asc' }],
    });

    // Map: projectWorkflowId → current stageKey
    const currentStageByPwId = new Map<string, string>();
    for (const pwId of activeProjectWorkflowIds) {
      const stages = allStagesForActiveWorkflows.filter((s) => s.projectWorkflowId === pwId);
      const inProgress = stages.find((s) => s.status === 'in_progress');
      const pending = stages.find((s) => s.status === 'pending');
      const current = inProgress ?? pending;
      if (current) currentStageByPwId.set(pwId, current.stageKey);
    }

    // Also include legacy project stages (projectWorkflowId = null)
    const legacyProjectsByStage = await prisma.project.groupBy({
      by: ['workflowId', 'currentStage'],
      where: { ...projectWhere, status: 'active' },
      _count: { id: true },
    });

    // Build maps: workflowTemplateId → Set of projectWorkflowIds / projectIds
    const templateToWorkflowIds = new Map<string, Set<string>>();
    const templateToProjectIds = new Map<string, Set<string>>();
    for (const pw of activeProjectWorkflows) {
      if (!templateToWorkflowIds.has(pw.workflowTemplateId)) {
        templateToWorkflowIds.set(pw.workflowTemplateId, new Set());
        templateToProjectIds.set(pw.workflowTemplateId, new Set());
      }
      templateToWorkflowIds.get(pw.workflowTemplateId)!.add(pw.id);
      templateToProjectIds.get(pw.workflowTemplateId)!.add(pw.projectId);
    }

    const workflowPipeline = workflowTemplates.map((w) => {
      const templateStages = (w.stages as Array<{ key?: string; stageKey?: string; name?: string; stageName?: string; order: number; color?: string }>)
        .slice()
        .sort((a, b) => a.order - b.order);

      const pwIds = templateToWorkflowIds.get(w.id) ?? new Set<string>();

      const stagesWithCounts = templateStages.map((stage) => {
        const key = stage.key || stage.stageKey || '';
        const name = stage.name || stage.stageName || '';

        // Count from new ProjectWorkflow system: projects whose current stage is this key
        const newCount = [...pwIds].filter((pwId) => currentStageByPwId.get(pwId) === key).length;

        // Count from legacy system
        const legacyCount = legacyProjectsByStage
          .find((p) => p.workflowId === w.id && p.currentStage === key)?._count.id ?? 0;

        return {
          key,
          name,
          order: stage.order,
          color: stage.color,
          count: newCount + legacyCount,
        };
      });

      // Total = sum of per-stage counts (ensures header badge == sum of stage counts)
      const totalProjects = stagesWithCounts.reduce((s, st) => s + st.count, 0);
      return { id: w.id, name: w.name, isDefault: w.isDefault, totalProjects, stages: stagesWithCounts };
    });

    // Overdue follow-ups
    const overdueList = await prisma.followUp.findMany({
      where: {
        ...followUpWhere,
        status: { in: ['overdue', 'pending'] },
        nextFollowUp: { lt: now },
      },
      orderBy: { nextFollowUp: 'asc' },
      take: 5,
      include: {
        project: { select: { id: true, name: true, projectNumber: true, clientName: true } },
        owner: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // Recent audit activity
    const recentActivity = await prisma.auditLog.findMany({
      where: { tenantId: tenantId as string },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        action: true,
        module: true,
        entityId: true,
        entityType: true,
        entityName: true,
        userEmail: true,
        metadata: true,
        createdAt: true,
      },
    });

    const statusMap = Object.fromEntries(projectsByStatus.map((s) => [s.status, s._count.id]));
    const priorityMap = Object.fromEntries(projectsByPriority.map((p) => [p.priority, p._count.id]));

    res.json({
      success: true,
      data: {
        totalProjects,
        activeProjects,
        completedProjects,
        onHoldProjects,
        totalFollowUps,
        pendingFollowUps,
        overdueFollowUps,
        totalDocuments,
        projectsByStatus: statusMap,
        projectsByPriority: priorityMap,
        upcomingFollowUps,
        overdueList,
        recentProjects,
        recentActivity,
        workflowPipeline,
      },
    });
  } catch (err) {
    next(err);
  }
});
