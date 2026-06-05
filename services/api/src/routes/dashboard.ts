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
        prisma.project.count(),
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

    const projectWhere: Record<string, unknown> = { tenantId: tenantId as string };
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

    // Recent projects
    const recentProjects = await prisma.project.findMany({
      where: { ...projectWhere, status: 'active' },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      include: {
        owner: { select: { id: true, firstName: true, lastName: true } },
      },
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
      },
    });
  } catch (err) {
    next(err);
  }
});
