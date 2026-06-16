import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';

export const reportsRouter = Router();
reportsRouter.use(authenticate);
reportsRouter.use(requirePermission('reports:read'));

// ── helpers ────────────────────────────────────────────────────────────────────

function startOf(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOf(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function addMonths(date: Date, n: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

function formatLabel(date: Date, granularity: string): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  if (granularity === 'monthly') {
    return `${months[date.getMonth()]} ${date.getFullYear()}`;
  }
  if (granularity === 'weekly') {
    const d = date.getDate().toString().padStart(2, '0');
    return `${d} ${months[date.getMonth()]}`;
  }
  // daily
  const d = date.getDate().toString().padStart(2, '0');
  return `${d} ${months[date.getMonth()]}`;
}

function bucketKey(date: Date, granularity: string): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  if (granularity === 'monthly') return `${y}-${m}`;
  if (granularity === 'weekly') {
    // ISO week: group by the Monday of the week
    const tmp = new Date(date);
    const day = tmp.getDay() || 7;
    tmp.setDate(tmp.getDate() - day + 1);
    const wy = tmp.getFullYear();
    const wm = (tmp.getMonth() + 1).toString().padStart(2, '0');
    const wd = tmp.getDate().toString().padStart(2, '0');
    return `${wy}-${wm}-${wd}`;
  }
  return `${y}-${m}-${d}`;
}

function generateBuckets(start: Date, end: Date, granularity: string): { key: string; label: string }[] {
  const buckets: { key: string; label: string }[] = [];
  let cur = new Date(start);

  if (granularity === 'monthly') {
    cur = new Date(cur.getFullYear(), cur.getMonth(), 1);
    while (cur <= end) {
      buckets.push({ key: bucketKey(cur, granularity), label: formatLabel(cur, granularity) });
      cur = addMonths(cur, 1);
    }
  } else if (granularity === 'weekly') {
    // Start on Monday of the week containing `start`
    const day = cur.getDay() || 7;
    cur.setDate(cur.getDate() - day + 1);
    while (cur <= end) {
      buckets.push({ key: bucketKey(cur, granularity), label: formatLabel(cur, granularity) });
      cur = addDays(cur, 7);
    }
  } else {
    // daily
    cur = startOf(cur);
    while (cur <= end) {
      buckets.push({ key: bucketKey(cur, granularity), label: formatLabel(cur, granularity) });
      cur = addDays(cur, 1);
    }
  }

  return buckets;
}

const STAGE_NAMES: Record<string, string> = {
  file_creation: 'File Creation',
  inward: 'Inward',
  scrutiny: 'Scrutiny',
  report_generation: 'Report Generation',
  approval: 'Approval',
  completed_stage: 'Completed',
  // generic aliases
  new_file: 'New File',
  requirements: 'Requirements',
  analysis: 'Analysis',
  design: 'Design',
  development: 'Development',
  testing: 'Testing / QA',
  uat: 'UAT',
  deployment: 'Deployment',
  completed: 'Completed',
};

function stageName(key: string): string {
  return STAGE_NAMES[key] || key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── GET /api/reports/summary ───────────────────────────────────────────────────

reportsRouter.get('/summary', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthRequest;
    const { tenantId, userId, permissions, isSuperAdmin } = authReq.user;

    // Date range
    const now = new Date();
    const rawStart = req.query.startDate as string;
    const rawEnd = req.query.endDate as string;
    const stageFilter = req.query.stage as string || 'all';
    const statusFilter = req.query.status as string || 'all';
    const granularity = (req.query.granularity as string) || 'monthly';

    const start = rawStart ? startOf(new Date(rawStart)) : startOf(addMonths(now, -1));
    const end = rawEnd ? endOf(new Date(rawEnd)) : endOf(now);

    // Build base where
    const baseWhere: Record<string, unknown> = isSuperAdmin
      ? {}
      : { tenantId: tenantId as string };

    const canViewAll = isSuperAdmin || (permissions || []).includes('projects:view_all');
    if (!canViewAll) {
      baseWhere.OR = [
        { ownerId: userId },
        { followUpOwnerId: userId },
      ];
    }

    // Status filter applied to period queries
    // Note: stageFilter is used for stageDistribution only (via ProjectStage records), not for project counts
    const periodExtra: Record<string, unknown> = {};
    if (statusFilter !== 'all') periodExtra.status = statusFilter;

    const periodWhere = { ...baseWhere, ...periodExtra };

    // ── KPI ──────────────────────────────────────────────────────────────────

    const [
      totalProjects,
      completedProjects,
      activeProjects,
      onHoldProjects,
      cancelledProjects,
      overdueProjects,
      startedInPeriod,
      completedInPeriod,
    ] = await Promise.all([
      prisma.project.count({ where: periodWhere }),
      prisma.project.count({ where: { ...periodWhere, status: 'completed' } }),
      prisma.project.count({ where: { ...periodWhere, status: 'active' } }),
      prisma.project.count({ where: { ...periodWhere, status: 'on_hold' } }),
      prisma.project.count({ where: { ...periodWhere, status: 'cancelled' } }),
      prisma.project.count({
        where: {
          ...periodWhere,
          status: { in: ['active', 'on_hold'] },
          dueDate: { lt: now },
        },
      }),
      prisma.project.count({
        where: {
          ...periodWhere,
          createdAt: { gte: start, lte: end },
        },
      }),
      prisma.project.count({
        where: {
          ...periodWhere,
          status: 'completed',
          updatedAt: { gte: start, lte: end },
        },
      }),
    ]);

    // ── Stage distribution (from ProjectStage records) ────────────────────────

    // Get project IDs in scope for stage distribution
    const scopedProjectIds = (
      await prisma.project.findMany({
        where: periodWhere,
        select: { id: true },
      })
    ).map((p) => p.id);

    const stageGroups = await prisma.projectStage.groupBy({
      by: ['stageKey', 'stageName'],
      where: {
        projectId: { in: scopedProjectIds },
        ...(stageFilter !== 'all' && { stageKey: stageFilter }),
      },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });

    const stageDistribution = stageGroups.map((g) => ({
      stage: g.stageKey,
      name: g.stageName || stageName(g.stageKey),
      count: g._count.id,
    }));

    // ── Status distribution ───────────────────────────────────────────────────

    const statusGroups = await prisma.project.groupBy({
      by: ['status'],
      where: { ...baseWhere, ...periodExtra },
      _count: { id: true },
    });

    const STATUS_LABELS: Record<string, string> = {
      active: 'Active',
      completed: 'Completed',
      on_hold: 'On Hold',
      cancelled: 'Cancelled',
    };
    const STATUS_COLORS: Record<string, string> = {
      active: '#3b82f6',
      completed: '#10b981',
      on_hold: '#f59e0b',
      cancelled: '#ef4444',
    };

    const statusDistribution = statusGroups.map((g) => ({
      status: g.status,
      name: STATUS_LABELS[g.status] || g.status,
      count: g._count.id,
      color: STATUS_COLORS[g.status] || '#94a3b8',
    }));

    // ── Trends ───────────────────────────────────────────────────────────────

    const [createdProjects, completedTrendProjects] = await Promise.all([
      prisma.project.findMany({
        where: { ...periodWhere, createdAt: { gte: start, lte: end } },
        select: { createdAt: true },
      }),
      prisma.project.findMany({
        where: { ...periodWhere, status: 'completed', updatedAt: { gte: start, lte: end } },
        select: { updatedAt: true },
      }),
    ]);

    const buckets = generateBuckets(start, end, granularity);
    const createdMap: Record<string, number> = {};
    const completedMap: Record<string, number> = {};

    for (const b of buckets) {
      createdMap[b.key] = 0;
      completedMap[b.key] = 0;
    }

    for (const p of createdProjects) {
      const k = bucketKey(new Date(p.createdAt), granularity);
      if (createdMap[k] !== undefined) createdMap[k]++;
    }
    for (const p of completedTrendProjects) {
      const k = bucketKey(new Date(p.updatedAt), granularity);
      if (completedMap[k] !== undefined) completedMap[k]++;
    }

    const trends = buckets.map((b) => ({
      label: b.label,
      created: createdMap[b.key] || 0,
      completed: completedMap[b.key] || 0,
    }));

    // ── Projects list (for export) ────────────────────────────────────────────

    const projects = await prisma.project.findMany({
      where: { ...periodWhere, createdAt: { gte: start, lte: end } },
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: {
        owner: { select: { firstName: true, lastName: true, email: true } },
      },
    });

    res.json({
      success: true,
      data: {
        period: { start: start.toISOString(), end: end.toISOString(), granularity },
        kpi: {
          totalProjects,
          completedProjects,
          activeProjects,
          onHoldProjects,
          cancelledProjects,
          overdueProjects,
          startedInPeriod,
          completedInPeriod,
        },
        stageDistribution,
        statusDistribution,
        trends,
        projects,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/reports/stages (available stages for filters) ─────────────────────

reportsRouter.get('/stages', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthRequest;
    const { tenantId, isSuperAdmin } = authReq.user;

    // Get project IDs in scope
    const scopedProjects = await prisma.project.findMany({
      where: isSuperAdmin ? {} : { tenantId: tenantId as string },
      select: { id: true },
    });
    const projectIds = scopedProjects.map((p) => p.id);

    const stageGroups = await prisma.projectStage.groupBy({
      by: ['stageKey', 'stageName'],
      where: { projectId: { in: projectIds } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });

    const stages = stageGroups.map((g) => ({
      key: g.stageKey,
      name: g.stageName || stageName(g.stageKey),
      count: g._count.id,
    }));

    res.json({ success: true, data: stages });
  } catch (err) {
    next(err);
  }
});
