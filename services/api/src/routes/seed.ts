import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

export const seedRouter = Router();
const prisma = new PrismaClient();

// POST /api/seed — protected one-time seed endpoint
seedRouter.post('/', async (req, res) => {
  const secret = process.env.SEED_SECRET;
  if (!secret || req.headers['x-seed-secret'] !== secret) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  try {
    const existing = await prisma.tenant.findFirst({ where: { slug: 'vastudeep' } });
    if (existing) {
      res.json({ success: true, message: 'Already seeded', tenantId: existing.id });
      return;
    }

    const hash = (pw: string) => bcrypt.hash(pw, 12);
    const DEFAULT_PASSWORD = 'Admin@123';

    // ── Tenant ───────────────────────────────────────────────────────────────
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Vastudeep Associates',
        slug: 'vastudeep',
        subscriptionPlan: 'professional',
        maxUsers: 50,
        branding: { primaryColor: '#1e3a5f', secondaryColor: '#c9a84c', theme: 'light' },
        settings: {
          features: { workflows: true, documents: true, followUps: true, auditLogs: true, notifications: true },
          notificationSettings: { emailEnabled: true, inAppEnabled: true },
          timezone: 'Asia/Kolkata',
          dateFormat: 'DD/MM/YYYY',
        },
      },
    });

    // ── Super Admin ───────────────────────────────────────────────────────────
    await prisma.user.create({
      data: {
        email: 'superadmin@flowtiq.com',
        password: await hash(DEFAULT_PASSWORD),
        firstName: 'Super',
        lastName: 'Admin',
        isSuperAdmin: true,
        isActive: true,
      },
    });

    // ── Tenant Users ──────────────────────────────────────────────────────────
    const [admin, pm, exec1, followupExec] = await Promise.all([
      prisma.user.create({ data: { tenantId: tenant.id, email: 'admin@vastudeep.com', password: await hash(DEFAULT_PASSWORD), firstName: 'Rajesh', lastName: 'Sharma', phone: '+91 98765 43210', isActive: true } }),
      prisma.user.create({ data: { tenantId: tenant.id, email: 'pm@vastudeep.com', password: await hash(DEFAULT_PASSWORD), firstName: 'Priya', lastName: 'Mehta', phone: '+91 87654 32109', isActive: true } }),
      prisma.user.create({ data: { tenantId: tenant.id, email: 'exec1@vastudeep.com', password: await hash(DEFAULT_PASSWORD), firstName: 'Amit', lastName: 'Patel', phone: '+91 76543 21098', isActive: true } }),
      prisma.user.create({ data: { tenantId: tenant.id, email: 'followup@vastudeep.com', password: await hash(DEFAULT_PASSWORD), firstName: 'Sneha', lastName: 'Joshi', phone: '+91 65432 10987', isActive: true } }),
    ]);

    // ── Permissions ───────────────────────────────────────────────────────────
    const permDefs = [
      { code: 'projects:view',     name: 'View Projects',      module: 'projects',   action: 'view' },
      { code: 'projects:view_all', name: 'View All Projects',  module: 'projects',   action: 'view_all' },
      { code: 'projects:create',   name: 'Create Projects',    module: 'projects',   action: 'create' },
      { code: 'projects:edit',     name: 'Edit Projects',      module: 'projects',   action: 'edit' },
      { code: 'projects:delete',   name: 'Delete Projects',    module: 'projects',   action: 'delete' },
      { code: 'documents:upload',  name: 'Upload Documents',   module: 'documents',  action: 'upload' },
      { code: 'documents:download',name: 'Download Documents', module: 'documents',  action: 'download' },
      { code: 'documents:delete',  name: 'Delete Documents',   module: 'documents',  action: 'delete' },
      { code: 'follow_ups:view',   name: 'View Follow-ups',    module: 'follow_ups', action: 'view' },
      { code: 'follow_ups:create', name: 'Create Follow-ups',  module: 'follow_ups', action: 'create' },
      { code: 'follow_ups:edit',   name: 'Edit Follow-ups',    module: 'follow_ups', action: 'edit' },
      { code: 'users:view',        name: 'View Users',         module: 'users',      action: 'view' },
      { code: 'users:create',      name: 'Create Users',       module: 'users',      action: 'create' },
      { code: 'users:edit',        name: 'Edit Users',         module: 'users',      action: 'edit' },
      { code: 'roles:view',        name: 'View Roles',         module: 'roles',      action: 'view' },
      { code: 'roles:manage',      name: 'Manage Roles',       module: 'roles',      action: 'manage' },
      { code: 'workflows:view',    name: 'View Workflows',     module: 'workflows',  action: 'view' },
      { code: 'workflows:manage',  name: 'Manage Workflows',   module: 'workflows',  action: 'manage' },
      { code: 'reports:view',      name: 'View Reports',       module: 'reports',    action: 'view' },
    ];

    const perms = await Promise.all(permDefs.map((p) => prisma.permission.create({ data: p })));
    const permMap = Object.fromEntries(perms.map((p) => [p.code, p.id]));

    // ── Roles ─────────────────────────────────────────────────────────────────
    const allPermIds = perms.map((p) => ({ permissionId: p.id }));

    const adminRole = await prisma.role.create({
      data: {
        tenantId: tenant.id, name: 'Admin', description: 'Full access', color: '#ef4444',
        rolePermissions: { create: allPermIds },
      },
    });

    const pmRole = await prisma.role.create({
      data: {
        tenantId: tenant.id, name: 'Project Manager', description: 'Manage projects', color: '#3b82f6',
        rolePermissions: { create: ['projects:view','projects:view_all','projects:create','projects:edit','documents:upload','documents:download','follow_ups:view','follow_ups:create','follow_ups:edit','reports:view'].map((c) => ({ permissionId: permMap[c] })) },
      },
    });

    const execRole = await prisma.role.create({
      data: {
        tenantId: tenant.id, name: 'File Executive', description: 'Handle files', color: '#10b981',
        rolePermissions: { create: ['projects:view','projects:create','projects:edit','documents:upload','documents:download','follow_ups:view','follow_ups:create'].map((c) => ({ permissionId: permMap[c] })) },
      },
    });

    const followupRole = await prisma.role.create({
      data: {
        tenantId: tenant.id, name: 'Follow-up Executive', description: 'Manage follow-ups', color: '#f59e0b',
        rolePermissions: { create: ['projects:view','follow_ups:view','follow_ups:create','follow_ups:edit'].map((c) => ({ permissionId: permMap[c] })) },
      },
    });

    await Promise.all([
      prisma.userRole.create({ data: { userId: admin.id, roleId: adminRole.id } }),
      prisma.userRole.create({ data: { userId: pm.id, roleId: pmRole.id } }),
      prisma.userRole.create({ data: { userId: exec1.id, roleId: execRole.id } }),
      prisma.userRole.create({ data: { userId: followupExec.id, roleId: followupRole.id } }),
    ]);

    // ── Workflow Templates ─────────────────────────────────────────────────────
    // Legacy workflow (kept for backward compat)
    const legacyWorkflow = await prisma.workflowTemplate.create({
      data: {
        tenantId: tenant.id,
        name: 'Standard File Workflow',
        description: 'Default 6-stage property file workflow',
        isDefault: true,
        stages: [
          { stageName: 'File Creation',    stageKey: 'file_creation',    key: 'file_creation',    name: 'File Creation',     order: 1, color: '#6366f1', isRequired: true,  requiresApproval: false },
          { stageName: 'Inward',           stageKey: 'inward',           key: 'inward',           name: 'Inward',            order: 2, color: '#3b82f6', isRequired: true,  requiresApproval: false },
          { stageName: 'Scrutiny',         stageKey: 'scrutiny',         key: 'scrutiny',         name: 'Scrutiny',          order: 3, color: '#0ea5e9', isRequired: true,  requiresApproval: true },
          { stageName: 'Report Generation',stageKey: 'report_generation',key: 'report_generation',name: 'Report Generation', order: 4, color: '#10b981', isRequired: true,  requiresApproval: false },
          { stageName: 'Approval',         stageKey: 'approval',         key: 'approval',         name: 'Approval',          order: 5, color: '#f59e0b', isRequired: true,  requiresApproval: true },
          { stageName: 'Completed',        stageKey: 'completed_stage',  key: 'completed_stage',  name: 'Completed',         order: 6, color: '#22c55e', isRequired: true,  requiresApproval: false },
        ],
      },
    });

    // 3 Mandatory pre-sanction workflows
    const zoningWorkflow = await prisma.workflowTemplate.create({
      data: {
        tenantId: tenant.id,
        name: 'Zoning',
        description: 'Zoning clearance workflow — mandatory before sanction',
        isDefault: false,
        stages: [
          { key: 'zoning_application',  name: 'Application Submission', order: 1, color: '#6366f1', isRequired: true,  requiresApproval: false, description: 'Submit zoning application to municipal authority' },
          { key: 'zoning_site_visit',   name: 'Site Inspection',        order: 2, color: '#3b82f6', isRequired: true,  requiresApproval: false, description: 'Scheduled site visit by authority inspector' },
          { key: 'zoning_objections',   name: 'Objection Period',       order: 3, color: '#0ea5e9', isRequired: true,  requiresApproval: false, description: 'Public objection window (21 days)' },
          { key: 'zoning_approval',     name: 'Zoning Approval',        order: 4, color: '#10b981', isRequired: true,  requiresApproval: true,  description: 'Final zoning clearance certificate' },
        ],
      },
    });

    const gardeningNocWorkflow = await prisma.workflowTemplate.create({
      data: {
        tenantId: tenant.id,
        name: 'Gardening NOC',
        description: 'Gardening / Horticulture NOC — mandatory before sanction',
        isDefault: false,
        stages: [
          { key: 'garden_noc_apply',    name: 'NOC Application',        order: 1, color: '#16a34a', isRequired: true,  requiresApproval: false, description: 'Apply for NOC from Horticulture Department' },
          { key: 'garden_noc_survey',   name: 'Tree Survey',            order: 2, color: '#15803d', isRequired: true,  requiresApproval: false, description: 'Physical survey of trees on site' },
          { key: 'garden_noc_approval', name: 'NOC Granted',            order: 3, color: '#14532d', isRequired: true,  requiresApproval: true,  description: 'Horticulture NOC certificate issued' },
        ],
      },
    });

    const laqWorkflow = await prisma.workflowTemplate.create({
      data: {
        tenantId: tenant.id,
        name: 'LAQ',
        description: 'Land Acquisition Query clearance — mandatory before sanction',
        isDefault: false,
        stages: [
          { key: 'laq_application',     name: 'LAQ Application',        order: 1, color: '#b45309', isRequired: true,  requiresApproval: false, description: 'Submit LAQ form to revenue department' },
          { key: 'laq_verification',    name: 'Revenue Verification',   order: 2, color: '#92400e', isRequired: true,  requiresApproval: false, description: 'Revenue officer verifies land records' },
          { key: 'laq_encumbrance',     name: 'Encumbrance Check',      order: 3, color: '#78350f', isRequired: false, requiresApproval: false, description: 'Check for existing encumbrances (optional)' },
          { key: 'laq_clearance',       name: 'LAQ Clearance',          order: 4, color: '#7c3aed', isRequired: true,  requiresApproval: true,  description: 'Final LAQ clearance certificate' },
        ],
      },
    });

    // ── Projects ───────────────────────────────────────────────────────────────
    const daysAgo = (n: number) => new Date(Date.now() - n * 86400000);
    const daysFromNow = (n: number) => new Date(Date.now() + n * 86400000);

    const projectsData = [
      { name: 'Sharma Residence - Survey No. 142',     client: 'Arvind Sharma',    num: 'VD-2024-001', stage: 'approval',         status: 'active',    owner: pm,    days: 45, due: 15,  priority: 'high' },
      { name: 'Mehta Commercial Complex - Plot 78',    client: 'Suresh Mehta',     num: 'VD-2024-002', stage: 'report_generation', status: 'active',    owner: exec1, days: 30, due: 30,  priority: 'medium' },
      { name: 'Patel Bungalow - CTS No. 2341',         client: 'Kiran Patel',      num: 'VD-2024-003', stage: 'completed_stage',   status: 'completed', owner: pm,    days: 90, due: -5,  priority: 'low' },
      { name: 'Redevelopment - Old Town Block C',      client: 'City Corp Ltd',    num: 'VD-2024-004', stage: 'scrutiny',          status: 'active',    owner: exec1, days: 20, due: 45,  priority: 'urgent' },
      { name: 'Industrial Land Survey - Zone 4',       client: 'Bharat Industries', num: 'VD-2024-005', stage: 'inward',           status: 'active',    owner: pm,    days: 10, due: 60,  priority: 'medium' },
      { name: 'Gokhale Estate Valuation',              client: 'Prakash Gokhale',  num: 'VD-2024-006', stage: 'file_creation',     status: 'active',    owner: exec1, days: 5,  due: 90,  priority: 'low' },
      { name: 'City Centre Mall - Floor Plan Review',  client: 'Mall Corp Pvt Ltd', num: 'VD-2024-007', stage: 'approval',         status: 'on_hold',   owner: pm,    days: 60, due: -10, priority: 'high' },
      { name: 'Riverside Township - Phase 2',          client: 'Township Builders', num: 'VD-2024-008', stage: 'scrutiny',         status: 'active',    owner: exec1, days: 25, due: 20,  priority: 'high' },
    ];

    const projects = await Promise.all(
      projectsData.map((p) =>
        prisma.project.create({
          data: {
            tenantId: tenant.id,
            workflowId: legacyWorkflow.id,
            name: p.name,
            projectNumber: p.num,
            clientName: p.client,
            description: `Property valuation file for ${p.client}`,
            status: p.status,
            priority: p.priority,
            currentStage: p.stage,
            ownerId: p.owner.id,
            followUpOwnerId: followupExec.id,
            createdAt: daysAgo(p.days),
            dueDate: daysFromNow(p.due),
          },
        })
      )
    );

    // ── Attach 3 mandatory workflows to all projects ───────────────────────────
    const mandatoryWorkflows = [
      { tmpl: zoningWorkflow, order: 1 },
      { tmpl: gardeningNocWorkflow, order: 2 },
      { tmpl: laqWorkflow, order: 3 },
    ];

    // Progress states for seeding realistic data (project index → workflow index → stage statuses)
    const seedProgress: Record<number, Record<number, string[]>> = {
      0: { // Sharma - Approval stage (mostly done)
        0: ['completed', 'completed', 'completed', 'completed'],  // Zoning done
        1: ['completed', 'completed', 'completed'],               // Gardening done
        2: ['completed', 'completed', 'pending', 'in_progress'],  // LAQ in progress
      },
      1: { // Mehta - Report Generation (zoning done, others in progress)
        0: ['completed', 'completed', 'completed', 'completed'],
        1: ['completed', 'in_progress', 'pending'],
        2: ['completed', 'pending', 'pending', 'pending'],
      },
      2: { // Patel - Completed
        0: ['completed', 'completed', 'completed', 'completed'],
        1: ['completed', 'completed', 'completed'],
        2: ['completed', 'completed', 'completed', 'completed'],
      },
      3: { // Redevelopment - Scrutiny (all in early stages)
        0: ['completed', 'in_progress', 'pending', 'pending'],
        1: ['in_progress', 'pending', 'pending'],
        2: ['pending', 'pending', 'pending', 'pending'],
      },
      4: { // Industrial - Inward (just started)
        0: ['in_progress', 'pending', 'pending', 'pending'],
        1: ['pending', 'pending', 'pending'],
        2: ['pending', 'pending', 'pending', 'pending'],
      },
      5: { // Gokhale - File Creation (brand new)
        0: ['pending', 'pending', 'pending', 'pending'],
        1: ['pending', 'pending', 'pending'],
        2: ['pending', 'pending', 'pending', 'pending'],
      },
      6: { // Mall - On Hold
        0: ['completed', 'completed', 'in_progress', 'pending'],
        1: ['completed', 'on_hold', 'pending'],
        2: ['completed', 'pending', 'pending', 'pending'],
      },
      7: { // Riverside - Scrutiny
        0: ['completed', 'completed', 'in_progress', 'pending'],
        1: ['completed', 'completed', 'pending'],
        2: ['in_progress', 'pending', 'pending', 'pending'],
      },
    };

    for (let pi = 0; pi < projects.length; pi++) {
      const project = projects[pi];
      for (let wi = 0; wi < mandatoryWorkflows.length; wi++) {
        const { tmpl, order } = mandatoryWorkflows[wi];
        const stageStatuses = seedProgress[pi]?.[wi] || [];
        const templateStages = tmpl.stages as Array<Record<string, unknown>>;

        // Determine workflow status from stage statuses
        const allCompleted = stageStatuses.every((s) => s === 'completed');
        const anyInProgress = stageStatuses.some((s) => s === 'in_progress' || s === 'completed');
        const wfStatus = allCompleted ? 'completed' : anyInProgress ? 'in_progress' : 'not_started';

        const pw = await prisma.projectWorkflow.create({
          data: {
            projectId: project.id,
            workflowTemplateId: tmpl.id,
            name: tmpl.name,
            order,
            status: wfStatus,
            ...(anyInProgress && { startedAt: daysAgo(Math.max(5, projectsData[pi].days - 5)) }),
            ...(allCompleted && { completedAt: daysAgo(2) }),
          },
        });

        await prisma.projectStage.createMany({
          data: templateStages.map((s, si) => ({
            projectId: project.id,
            projectWorkflowId: pw.id,
            stageName: (s.name || s.stageName) as string,
            stageKey: (s.key || s.stageKey) as string,
            stageOrder: s.order as number,
            isRequired: (s.isRequired ?? true) as boolean,
            status: stageStatuses[si] || 'pending',
            checklist: [],
            ...(stageStatuses[si] === 'completed' && { completionDate: daysAgo(3), startDate: daysAgo(7) }),
            ...(stageStatuses[si] === 'in_progress' && { startDate: daysAgo(2) }),
          })),
        });
      }
    }

    // ── Follow-ups ─────────────────────────────────────────────────────────────
    await Promise.all([
      prisma.followUp.create({
        data: {
          tenantId: tenant.id, projectId: projects[0].id, ownerId: followupExec.id,
          createdById: pm.id, notes: 'Chase approval from municipal office for NOC',
          nextFollowUp: daysFromNow(3), status: 'pending',
        },
      }),
      prisma.followUp.create({
        data: {
          tenantId: tenant.id, projectId: projects[1].id, ownerId: exec1.id,
          createdById: pm.id, notes: 'Site visit required for updated photographs',
          nextFollowUp: daysFromNow(7), status: 'pending',
        },
      }),
      prisma.followUp.create({
        data: {
          tenantId: tenant.id, projectId: projects[3].id, ownerId: followupExec.id,
          createdById: admin.id, notes: 'All documents to be submitted for scrutiny review',
          nextFollowUp: daysFromNow(2), status: 'pending',
        },
      }),
    ]);

    // ── Notifications ──────────────────────────────────────────────────────────
    await Promise.all([
      prisma.notification.create({
        data: {
          tenantId: tenant.id, userId: pm.id, type: 'overdue',
          title: 'Project Overdue',
          message: `${projects[6].name} is past its due date`,
          isRead: false, data: { projectId: projects[6].id },
        },
      }),
      prisma.notification.create({
        data: {
          tenantId: tenant.id, userId: admin.id, type: 'status_changed',
          title: 'Project Completed',
          message: `${projects[2].name} has been marked as completed`,
          isRead: false, data: { projectId: projects[2].id },
        },
      }),
    ]);

    res.json({
      success: true,
      message: 'Database seeded successfully',
      data: {
        tenant: tenant.name,
        users: ['superadmin@flowtiq.com', 'admin@vastudeep.com', 'pm@vastudeep.com', 'exec1@vastudeep.com', 'followup@vastudeep.com'],
        password: DEFAULT_PASSWORD,
        projects: projects.length,
        mandatoryWorkflows: ['Zoning', 'Gardening NOC', 'LAQ'],
      },
    });
  } catch (err) {
    console.error('Seed error:', err);
    res.status(500).json({ success: false, error: String(err) });
  } finally {
    await prisma.$disconnect();
  }
});

// =============================================
// POST /api/seed-projects
// Seeds demo projects using the existing workflows
// (Zoning, LAQ, Sanction, Revised Sanction).
// Idempotent — skips if VD-2025-001 already exists.
// =============================================
seedRouter.post('/projects', async (req, res) => {
  const secret = process.env.SEED_SECRET;
  if (!secret || req.headers['x-seed-secret'] !== secret) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  try {
    // ── Find tenant ───────────────────────────────────────────────────────────
    const tenant = await prisma.tenant.findFirst({ where: { slug: 'vastudeep' } });
    if (!tenant) {
      res.status(404).json({ success: false, error: 'Tenant vastudeep not found. Run POST /api/seed first.' });
      return;
    }

    // ── Idempotency check ─────────────────────────────────────────────────────
    const alreadySeeded = await prisma.project.findFirst({
      where: { tenantId: tenant.id, projectNumber: 'VD-2025-001' },
    });
    if (alreadySeeded) {
      res.json({ success: true, message: 'Demo projects already seeded (VD-2025-001 exists)' });
      return;
    }

    // ── Users ─────────────────────────────────────────────────────────────────
    const users = await prisma.user.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, email: true },
    });
    const uid = (email: string) => users.find((u) => u.email === email)?.id ?? '';
    const pmId       = uid('pm@vastudeep.com');
    const exec1Id    = uid('exec1@vastudeep.com');
    const followupId = uid('followup@vastudeep.com');
    const adminId    = uid('admin@vastudeep.com');

    if (!pmId || !exec1Id || !adminId) {
      res.status(400).json({ success: false, error: 'Required users not found. Run POST /api/seed first.' });
      return;
    }

    // ── Workflows ─────────────────────────────────────────────────────────────
    const allWorkflows = await prisma.workflowTemplate.findMany({
      where: { tenantId: tenant.id, isActive: true },
    });

    // Case-insensitive keyword match — tolerates "Sanction Process", "REVISED SANCTION PROCESS", etc.
    const wfByKeyword = (keyword: string, excludeKeyword?: string) => {
      const kw = keyword.toLowerCase();
      const ex = excludeKeyword?.toLowerCase();
      return allWorkflows.find((w) => {
        const n = w.name.toLowerCase();
        return n.includes(kw) && (!ex || !n.includes(ex));
      });
    };

    const zoningWf          = wfByKeyword('zoning');
    const laqWf             = wfByKeyword('laq');
    const sanctionWf        = wfByKeyword('sanction', 'revised');
    const revisedSanctionWf = wfByKeyword('revised');

    const missing = [
      !zoningWf   && 'Zoning',
      !laqWf      && 'LAQ',
      !sanctionWf && 'Sanction',
    ].filter(Boolean);

    if (missing.length) {
      res.status(400).json({
        success: false,
        error: `Missing workflows: ${missing.join(', ')}. Create them first.`,
        found: allWorkflows.map((w) => w.name),
      });
      return;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    const daysAgo     = (n: number) => new Date(Date.now() - n * 86_400_000);
    const daysFromNow = (n: number) => new Date(Date.now() + n * 86_400_000);

    type StagesJson = Array<{ key?: string; stageKey?: string; name?: string; stageName?: string; order?: number; isRequired?: boolean }>;

    /** Generate per-stage statuses based on a named mode and total count. */
    function buildStatuses(total: number, mode: string): string[] {
      const arr = (n: number, v: string) => Array(Math.max(0, n)).fill(v);
      switch (mode) {
        case 'completed':     return arr(total, 'completed');
        case 'pending':       return arr(total, 'pending');
        case 'first_1_done':  return ['completed', ...arr(total - 1, 'pending')];
        case 'first_2_done':  return total >= 2 ? ['completed','completed',...arr(total-2,'pending')] : arr(total,'completed');
        case 'in_progress_1': return ['in_progress', ...arr(total - 1, 'pending')];
        case 'half_done': {
          const done = Math.ceil(total / 2);
          return [...arr(done, 'completed'), ...arr(total - done, 'pending')];
        }
        case 'half_progress': {
          const done = Math.floor(total / 2);
          return [...arr(done, 'completed'), 'in_progress', ...arr(total - done - 1, 'pending')];
        }
        case 'three_quarters': {
          const done = Math.ceil(total * 3 / 4);
          const rem  = total - done;
          return [...arr(done, 'completed'), ...(rem > 0 ? ['in_progress', ...arr(rem - 1, 'pending')] : [])];
        }
        case 'almost_done':   return [...arr(total - 1, 'completed'), 'in_progress'];
        case 'on_hold_2nd':   return total >= 2 ? ['completed', 'on_hold', ...arr(total - 2, 'pending')] : ['on_hold'];
        case 'blocked_1st':   return ['in_progress', ...arr(total - 1, 'pending')];
        default:              return arr(total, 'pending');
      }
    }

    /** Create ProjectWorkflow + ProjectStage records. Returns { pw, stages } */
    async function attachWorkflow(params: {
      projectId:    string;
      workflow:     NonNullable<ReturnType<typeof wf>>;
      order:        number;
      mode:         string;
      projectDays:  number;
    }) {
      const { projectId, workflow, order, mode, projectDays } = params;
      const templateStages = workflow.stages as StagesJson;
      const statuses = buildStatuses(templateStages.length, mode);

      const allDone     = statuses.every((s) => s === 'completed');
      const anyStarted  = statuses.some((s) => s !== 'pending');
      const wfStatus    = allDone ? 'completed' : anyStarted ? 'in_progress' : 'not_started';

      const pw = await prisma.projectWorkflow.create({
        data: {
          projectId,
          workflowTemplateId: workflow.id,
          name:     workflow.name,
          order,
          status:   wfStatus,
          ...(anyStarted  && { startedAt:   daysAgo(Math.max(3, projectDays - 3)) }),
          ...(allDone     && { completedAt: daysAgo(Math.max(1, Math.floor(projectDays / 3))) }),
        },
      });

      const stageRecords = await prisma.$transaction(
        templateStages.map((s, i) => {
          const status = statuses[i] ?? 'pending';
          return prisma.projectStage.create({
            data: {
              projectId,
              projectWorkflowId: pw.id,
              stageName:   (s.name  ?? s.stageName  ?? `Stage ${i + 1}`),
              stageKey:    (s.key   ?? s.stageKey   ?? `stage_${i + 1}`),
              stageOrder:  s.order  ?? (i + 1),
              isRequired:  s.isRequired ?? true,
              status,
              checklist:   [],
              ...(status === 'completed'   && { startDate: daysAgo(projectDays - i * 3), completionDate: daysAgo(Math.max(1, projectDays - i * 3 - 2)) }),
              ...(status === 'in_progress' && { startDate: daysAgo(2) }),
            },
          });
        })
      );

      return { pw, stageRecords };
    }

    /** Seed a document attached to a stage / workflow. */
    async function seedDoc(params: {
      tenantId:          string;
      projectId:         string;
      projectWorkflowId: string;
      stageId?:          string;
      originalName:      string;
      fileType:          string;
      mimeType:          string;
      filePath:          string;
      fileSize:          bigint;
      uploadedById:      string;
    }) {
      return prisma.document.create({
        data: {
          tenantId:          params.tenantId,
          projectId:         params.projectId,
          projectWorkflowId: params.projectWorkflowId,
          stageId:           params.stageId,
          fileName:          uuidv4(),
          originalName:      params.originalName,
          fileType:          params.fileType,
          mimeType:          params.mimeType,
          filePath:          params.filePath,
          fileSize:          params.fileSize,
          uploadedById:      params.uploadedById,
          version:           1,
          isActive:          true,
          tags:              [],
        },
      });
    }

    /** Seed a stage-history entry for a completed stage. */
    async function seedHistory(stageId: string, changedById: string, prev: string, next: string, comment: string) {
      return prisma.stageHistory.create({
        data: { stageId, changedById, changeType: 'status', previousStatus: prev, newStatus: next, comment },
      });
    }

    // ── Public demo file URLs ─────────────────────────────────────────────────
    const PDF_URL  = 'https://www.w3.org/WAI/WCAG21/Techniques/pdf/sample.pdf';
    const IMG_URLS = [
      'https://picsum.photos/id/1018/800/600',
      'https://picsum.photos/id/164/800/600',
      'https://picsum.photos/id/360/800/600',
      'https://picsum.photos/id/425/800/600',
      'https://picsum.photos/id/475/800/600',
      'https://picsum.photos/id/534/800/600',
      'https://picsum.photos/id/21/800/600',
      'https://picsum.photos/id/91/800/600',
    ];
    const imgUrl = (i: number) => IMG_URLS[i % IMG_URLS.length];
    const PDF_SIZE  = BigInt(524_288);   // 512 KB
    const IMG_SIZE  = BigInt(1_048_576); // 1 MB

    // ── Create 8 demo projects ─────────────────────────────────────────────────
    const summaryProjects: string[] = [];

    // ─────────────────────────────────────────────────────────────────────────
    // PROJECT 1 — Sunrise Heights Block A
    // State: active | Zoning ✓ + LAQ ✓ + Sanction 50% in-progress
    // ─────────────────────────────────────────────────────────────────────────
    {
      const p = await prisma.project.create({
        data: {
          tenantId:       tenant.id,
          workflowId:     sanctionWf!.id,
          projectNumber:  'VD-2025-001',
          name:           'Sunrise Heights - Block A',
          clientName:     'Jayesh Constructors Pvt Ltd',
          description:    'G+14 residential tower on Survey No. 88A, Andheri East. All pre-sanction clearances obtained; building plan sanction in progress.',
          location:       'Andheri East, Mumbai',
          status:         'active',
          priority:       'high',
          ownerId:        pmId,
          followUpOwnerId: followupId,
          startDate:      daysAgo(60),
          dueDate:        daysFromNow(30),
          currentStage:   'in_progress',
          createdAt:      daysAgo(60),
        },
      });
      summaryProjects.push(p.projectNumber);

      const { pw: zPw, stageRecords: zStages } = await attachWorkflow({ projectId: p.id, workflow: zoningWf!, order: 1, mode: 'completed', projectDays: 55 });
      const { pw: lPw, stageRecords: lStages } = await attachWorkflow({ projectId: p.id, workflow: laqWf!,    order: 2, mode: 'completed', projectDays: 45 });
      const { pw: sPw, stageRecords: sStages } = await attachWorkflow({ projectId: p.id, workflow: sanctionWf!, order: 3, mode: 'half_progress', projectDays: 20 });

      // Documents
      await seedDoc({ tenantId: tenant.id, projectId: p.id, projectWorkflowId: zPw.id, stageId: zStages[0].id, originalName: 'Zoning Application Form.pdf', fileType: 'pdf', mimeType: 'application/pdf', filePath: PDF_URL, fileSize: PDF_SIZE, uploadedById: exec1Id });
      await seedDoc({ tenantId: tenant.id, projectId: p.id, projectWorkflowId: zPw.id, stageId: zStages[2].id, originalName: 'Site Inspection Photos.jpg', fileType: 'jpg', mimeType: 'image/jpeg', filePath: imgUrl(0), fileSize: IMG_SIZE, uploadedById: exec1Id });
      await seedDoc({ tenantId: tenant.id, projectId: p.id, projectWorkflowId: zPw.id, stageId: zStages[zStages.length - 1].id, originalName: 'Zoning Clearance Certificate.pdf', fileType: 'pdf', mimeType: 'application/pdf', filePath: PDF_URL, fileSize: PDF_SIZE, uploadedById: pmId });
      await seedDoc({ tenantId: tenant.id, projectId: p.id, projectWorkflowId: lPw.id, stageId: lStages[lStages.length - 1].id, originalName: 'LAQ Clearance Certificate.pdf', fileType: 'pdf', mimeType: 'application/pdf', filePath: PDF_URL, fileSize: PDF_SIZE, uploadedById: pmId });
      await seedDoc({ tenantId: tenant.id, projectId: p.id, projectWorkflowId: sPw.id, stageId: sStages[0].id, originalName: 'Building Plan - Draft Set.pdf', fileType: 'pdf', mimeType: 'application/pdf', filePath: PDF_URL, fileSize: PDF_SIZE, uploadedById: exec1Id });

      // Stage history for completed stages
      for (const s of [...zStages, ...lStages]) {
        if (s.status === 'completed') {
          await seedHistory(s.id, pmId, 'in_progress', 'completed', 'Stage completed — documents verified and approved');
        }
      }

      // Follow-up
      await prisma.followUp.create({ data: { tenantId: tenant.id, projectId: p.id, ownerId: followupId!, createdById: pmId, notes: 'Follow up with municipal office on building plan sanction status — expected next week', nextFollowUp: daysFromNow(4), status: 'pending' } });

      // Notification
      await prisma.notification.create({ data: { tenantId: tenant.id, userId: pmId, type: 'stage_updated', title: 'Sanction In Progress', message: 'Sunrise Heights: Sanction workflow is 50% complete. Follow up needed.', isRead: false, data: { projectId: p.id } } });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PROJECT 2 — Green Valley Villas Phase 1
    // State: active + urgent | Zoning 50% + LAQ early + Sanction not started
    // ─────────────────────────────────────────────────────────────────────────
    {
      const p = await prisma.project.create({
        data: {
          tenantId:       tenant.id,
          workflowId:     laqWf!.id,
          projectNumber:  'VD-2025-002',
          name:           'Green Valley Villas - Phase 1',
          clientName:     'Green Valley Developers',
          description:    '48-unit villa project on 3.5 acre plot, Baner. Pre-sanction clearances currently underway.',
          location:       'Baner, Pune',
          status:         'active',
          priority:       'urgent',
          ownerId:        pmId,
          followUpOwnerId: followupId,
          startDate:      daysAgo(25),
          dueDate:        daysFromNow(60),
          currentStage:   'in_progress',
          createdAt:      daysAgo(25),
        },
      });
      summaryProjects.push(p.projectNumber);

      const { pw: zPw, stageRecords: zStages } = await attachWorkflow({ projectId: p.id, workflow: zoningWf!, order: 1, mode: 'half_progress', projectDays: 20 });
      const { pw: lPw, stageRecords: lStages } = await attachWorkflow({ projectId: p.id, workflow: laqWf!,    order: 2, mode: 'in_progress_1', projectDays: 10 });
      const { pw: sPw }                         = await attachWorkflow({ projectId: p.id, workflow: sanctionWf!, order: 3, mode: 'pending', projectDays: 0 });

      // Documents
      await seedDoc({ tenantId: tenant.id, projectId: p.id, projectWorkflowId: zPw.id, stageId: zStages[0].id, originalName: 'Zoning Application - Green Valley.pdf', fileType: 'pdf', mimeType: 'application/pdf', filePath: PDF_URL, fileSize: PDF_SIZE, uploadedById: exec1Id });
      await seedDoc({ tenantId: tenant.id, projectId: p.id, projectWorkflowId: zPw.id, stageId: zStages[0].id, originalName: 'Site Survey Photo 1.jpg', fileType: 'jpg', mimeType: 'image/jpeg', filePath: imgUrl(1), fileSize: IMG_SIZE, uploadedById: exec1Id });
      await seedDoc({ tenantId: tenant.id, projectId: p.id, projectWorkflowId: lPw.id, stageId: lStages[0].id, originalName: 'LAQ Application Form.pdf', fileType: 'pdf', mimeType: 'application/pdf', filePath: PDF_URL, fileSize: PDF_SIZE, uploadedById: exec1Id });

      // Overdue follow-up
      await prisma.followUp.create({ data: { tenantId: tenant.id, projectId: p.id, ownerId: followupId!, createdById: adminId, notes: 'Urgent: Zoning site inspection needs to be scheduled — already 3 days overdue', nextFollowUp: daysAgo(3), status: 'overdue' } });

      await prisma.notification.create({ data: { tenantId: tenant.id, userId: adminId, type: 'overdue', title: 'Follow-up Overdue', message: 'Green Valley Villas: Zoning site inspection follow-up is overdue by 3 days.', isRead: false, data: { projectId: p.id } } });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PROJECT 3 — Brigade Corporate Tower
    // State: completed | All 4 workflows fully completed
    // ─────────────────────────────────────────────────────────────────────────
    {
      const p = await prisma.project.create({
        data: {
          tenantId:        tenant.id,
          workflowId:      revisedSanctionWf?.id ?? sanctionWf!.id,
          projectNumber:   'VD-2025-003',
          name:            'Brigade Corporate Tower',
          clientName:      'Brigade Estates Ltd',
          description:     'G+20 commercial tower, CBD. Entire approval cycle including revised sanction successfully completed.',
          location:        'CBD Belapur, Navi Mumbai',
          status:          'completed',
          priority:        'high',
          ownerId:         pmId,
          followUpOwnerId: followupId,
          startDate:       daysAgo(120),
          dueDate:         daysAgo(5),
          completionDate:  daysAgo(8),
          currentStage:    'completed_stage',
          createdAt:       daysAgo(120),
        },
      });
      summaryProjects.push(p.projectNumber);

      const { pw: zPw, stageRecords: zStages } = await attachWorkflow({ projectId: p.id, workflow: zoningWf!, order: 1, mode: 'completed', projectDays: 110 });
      const { pw: lPw, stageRecords: lStages } = await attachWorkflow({ projectId: p.id, workflow: laqWf!,    order: 2, mode: 'completed', projectDays: 90 });
      const { pw: sPw, stageRecords: sStages } = await attachWorkflow({ projectId: p.id, workflow: sanctionWf!, order: 3, mode: 'completed', projectDays: 60 });

      // Documents — rich set
      await seedDoc({ tenantId: tenant.id, projectId: p.id, projectWorkflowId: zPw.id, stageId: zStages[0].id, originalName: 'Zoning Application.pdf', fileType: 'pdf', mimeType: 'application/pdf', filePath: PDF_URL, fileSize: PDF_SIZE, uploadedById: exec1Id });
      await seedDoc({ tenantId: tenant.id, projectId: p.id, projectWorkflowId: zPw.id, stageId: zStages[zStages.length - 1].id, originalName: 'Zoning Certificate - Brigade.pdf', fileType: 'pdf', mimeType: 'application/pdf', filePath: PDF_URL, fileSize: PDF_SIZE, uploadedById: pmId });
      await seedDoc({ tenantId: tenant.id, projectId: p.id, projectWorkflowId: lPw.id, stageId: lStages[0].id, originalName: 'Revenue Records Extract.pdf', fileType: 'pdf', mimeType: 'application/pdf', filePath: PDF_URL, fileSize: PDF_SIZE, uploadedById: exec1Id });
      await seedDoc({ tenantId: tenant.id, projectId: p.id, projectWorkflowId: lPw.id, stageId: lStages[lStages.length - 1].id, originalName: 'LAQ Clearance - Brigade.pdf', fileType: 'pdf', mimeType: 'application/pdf', filePath: PDF_URL, fileSize: PDF_SIZE, uploadedById: pmId });
      await seedDoc({ tenantId: tenant.id, projectId: p.id, projectWorkflowId: sPw.id, stageId: sStages[0].id, originalName: 'Architectural Drawings - Full Set.pdf', fileType: 'pdf', mimeType: 'application/pdf', filePath: PDF_URL, fileSize: BigInt(2_097_152), uploadedById: exec1Id });
      await seedDoc({ tenantId: tenant.id, projectId: p.id, projectWorkflowId: sPw.id, stageId: sStages[sStages.length - 1].id, originalName: 'Sanction Order - Approved.pdf', fileType: 'pdf', mimeType: 'application/pdf', filePath: PDF_URL, fileSize: PDF_SIZE, uploadedById: pmId });
      await seedDoc({ tenantId: tenant.id, projectId: p.id, projectWorkflowId: sPw.id, originalName: 'Site Progress Photo.jpg', fileType: 'jpg', mimeType: 'image/jpeg', filePath: imgUrl(2), fileSize: IMG_SIZE, uploadedById: exec1Id });

      if (revisedSanctionWf) {
        const { pw: rPw, stageRecords: rStages } = await attachWorkflow({ projectId: p.id, workflow: revisedSanctionWf, order: 4, mode: 'completed', projectDays: 25 });
        await seedDoc({ tenantId: tenant.id, projectId: p.id, projectWorkflowId: rPw.id, stageId: rStages[0].id, originalName: 'Revised Plan Drawings.pdf', fileType: 'pdf', mimeType: 'application/pdf', filePath: PDF_URL, fileSize: PDF_SIZE, uploadedById: exec1Id });
        await seedDoc({ tenantId: tenant.id, projectId: p.id, projectWorkflowId: rPw.id, stageId: rStages[rStages.length - 1].id, originalName: 'Revised Sanction Order.pdf', fileType: 'pdf', mimeType: 'application/pdf', filePath: PDF_URL, fileSize: PDF_SIZE, uploadedById: pmId });
        for (const s of rStages) {
          await seedHistory(s.id, pmId, 'in_progress', 'completed', 'Approved');
        }
      }

      // History for all stages
      for (const s of [...zStages, ...lStages, ...sStages]) {
        await seedHistory(s.id, pmId, 'in_progress', 'completed', 'Reviewed and approved');
      }

      await prisma.notification.create({ data: { tenantId: tenant.id, userId: adminId, type: 'status_changed', title: 'Project Completed', message: 'Brigade Corporate Tower has completed all approvals and is now marked as completed.', isRead: true, data: { projectId: p.id } } });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PROJECT 4 — Pearl Residency Tower C
    // State: active | Zoning ✓ + LAQ 50% + Sanction not started
    // ─────────────────────────────────────────────────────────────────────────
    {
      const p = await prisma.project.create({
        data: {
          tenantId:        tenant.id,
          workflowId:      laqWf!.id,
          projectNumber:   'VD-2025-004',
          name:            'Pearl Residency - Tower C',
          clientName:      'Suresh Nair & Associates',
          description:     '32-unit mid-rise residential tower, Thane West. Zoning cleared; LAQ and sanction pending.',
          location:        'Thane West, Maharashtra',
          status:          'active',
          priority:        'medium',
          ownerId:         exec1Id,
          followUpOwnerId: followupId,
          startDate:       daysAgo(35),
          dueDate:         daysFromNow(90),
          currentStage:    'in_progress',
          createdAt:       daysAgo(35),
        },
      });
      summaryProjects.push(p.projectNumber);

      const { pw: zPw, stageRecords: zStages } = await attachWorkflow({ projectId: p.id, workflow: zoningWf!, order: 1, mode: 'completed', projectDays: 30 });
      const { pw: lPw, stageRecords: lStages } = await attachWorkflow({ projectId: p.id, workflow: laqWf!,    order: 2, mode: 'half_progress', projectDays: 12 });
      await attachWorkflow({ projectId: p.id, workflow: sanctionWf!, order: 3, mode: 'pending', projectDays: 0 });

      await seedDoc({ tenantId: tenant.id, projectId: p.id, projectWorkflowId: zPw.id, stageId: zStages[zStages.length - 1].id, originalName: 'Zoning Certificate - Pearl Residency.pdf', fileType: 'pdf', mimeType: 'application/pdf', filePath: PDF_URL, fileSize: PDF_SIZE, uploadedById: pmId });
      await seedDoc({ tenantId: tenant.id, projectId: p.id, projectWorkflowId: lPw.id, stageId: lStages[0].id, originalName: 'Revenue Verification Documents.pdf', fileType: 'pdf', mimeType: 'application/pdf', filePath: PDF_URL, fileSize: PDF_SIZE, uploadedById: exec1Id });
      await seedDoc({ tenantId: tenant.id, projectId: p.id, projectWorkflowId: lPw.id, originalName: 'Site Photograph.jpg', fileType: 'jpg', mimeType: 'image/jpeg', filePath: imgUrl(3), fileSize: IMG_SIZE, uploadedById: exec1Id });

      for (const s of zStages) {
        await seedHistory(s.id, exec1Id, 'in_progress', 'completed', 'Clearance received');
      }

      await prisma.followUp.create({ data: { tenantId: tenant.id, projectId: p.id, ownerId: followupId!, createdById: pmId, notes: 'Check LAQ encumbrance certificate status from revenue office', nextFollowUp: daysFromNow(7), status: 'pending' } });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PROJECT 5 — Metro Business Hub
    // State: on_hold | Zoning blocked at site inspection + LAQ pending
    // ─────────────────────────────────────────────────────────────────────────
    {
      const p = await prisma.project.create({
        data: {
          tenantId:        tenant.id,
          workflowId:      zoningWf!.id,
          projectNumber:   'VD-2025-005',
          name:            'Metro Business Hub',
          clientName:      'Metro Developers Pvt Ltd',
          description:     'IT park + retail complex, Vashi. Project on hold — zoning site inspection disputed by adjacent plot owner.',
          location:        'Vashi, Navi Mumbai',
          status:          'on_hold',
          priority:        'urgent',
          ownerId:         pmId,
          followUpOwnerId: followupId,
          startDate:       daysAgo(40),
          dueDate:         daysFromNow(15),
          currentStage:    'on_hold',
          createdAt:       daysAgo(40),
        },
      });
      summaryProjects.push(p.projectNumber);

      const { pw: zPw, stageRecords: zStages } = await attachWorkflow({ projectId: p.id, workflow: zoningWf!, order: 1, mode: 'on_hold_2nd', projectDays: 35 });
      const { pw: lPw }                         = await attachWorkflow({ projectId: p.id, workflow: laqWf!,    order: 2, mode: 'pending', projectDays: 0 });
      await attachWorkflow({ projectId: p.id, workflow: sanctionWf!, order: 3, mode: 'pending', projectDays: 0 });

      await seedDoc({ tenantId: tenant.id, projectId: p.id, projectWorkflowId: zPw.id, stageId: zStages[0].id, originalName: 'Zoning Application - Metro Hub.pdf', fileType: 'pdf', mimeType: 'application/pdf', filePath: PDF_URL, fileSize: PDF_SIZE, uploadedById: exec1Id });
      await seedDoc({ tenantId: tenant.id, projectId: p.id, projectWorkflowId: zPw.id, stageId: zStages[1].id, originalName: 'Site Inspection Report - Contested.jpg', fileType: 'jpg', mimeType: 'image/jpeg', filePath: imgUrl(4), fileSize: IMG_SIZE, uploadedById: exec1Id });

      await seedHistory(zStages[0].id, pmId, 'pending', 'completed', 'Application submitted');
      await seedHistory(zStages[1].id, adminId, 'in_progress', 'on_hold', 'Site inspection disputed by adjacent owner — legal hold applied');

      await prisma.followUp.create({ data: { tenantId: tenant.id, projectId: p.id, ownerId: followupId!, createdById: adminId, notes: 'Urgent: Resolve zoning site inspection dispute — legal notice to be sent to adjacent owner', nextFollowUp: daysAgo(5), status: 'overdue' } });

      await prisma.notification.create({ data: { tenantId: tenant.id, userId: adminId, type: 'overdue', title: 'Project On Hold — Action Required', message: 'Metro Business Hub is on hold due to zoning dispute. Overdue follow-up action required.', isRead: false, data: { projectId: p.id } } });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PROJECT 6 — Saraswati CHS Redevelopment
    // State: active | Zoning ✓ + LAQ ✓ + Sanction ✓ + Revised Sanction 50%
    // ─────────────────────────────────────────────────────────────────────────
    {
      const p = await prisma.project.create({
        data: {
          tenantId:        tenant.id,
          workflowId:      revisedSanctionWf?.id ?? sanctionWf!.id,
          projectNumber:   'VD-2025-006',
          name:            'Saraswati CHS - Redevelopment',
          clientName:      'Saraswati Co-operative Housing Society',
          description:     'Self-redevelopment of a 48-member society, Dadar. Original sanction obtained; revised sanction filed for 2-floor increase.',
          location:        'Dadar West, Mumbai',
          status:          'active',
          priority:        'high',
          ownerId:         pmId,
          followUpOwnerId: followupId,
          startDate:       daysAgo(90),
          dueDate:         daysFromNow(20),
          currentStage:    'in_progress',
          createdAt:       daysAgo(90),
        },
      });
      summaryProjects.push(p.projectNumber);

      const { pw: zPw, stageRecords: zStages } = await attachWorkflow({ projectId: p.id, workflow: zoningWf!,   order: 1, mode: 'completed', projectDays: 80 });
      const { pw: lPw, stageRecords: lStages } = await attachWorkflow({ projectId: p.id, workflow: laqWf!,      order: 2, mode: 'completed', projectDays: 65 });
      const { pw: sPw, stageRecords: sStages } = await attachWorkflow({ projectId: p.id, workflow: sanctionWf!, order: 3, mode: 'completed', projectDays: 40 });

      // Documents — comprehensive set
      await seedDoc({ tenantId: tenant.id, projectId: p.id, projectWorkflowId: zPw.id, stageId: zStages[zStages.length - 1].id, originalName: 'Zoning Certificate - Saraswati.pdf', fileType: 'pdf', mimeType: 'application/pdf', filePath: PDF_URL, fileSize: PDF_SIZE, uploadedById: pmId });
      await seedDoc({ tenantId: tenant.id, projectId: p.id, projectWorkflowId: lPw.id, stageId: lStages[lStages.length - 1].id, originalName: 'LAQ Clearance - Saraswati.pdf', fileType: 'pdf', mimeType: 'application/pdf', filePath: PDF_URL, fileSize: PDF_SIZE, uploadedById: pmId });
      await seedDoc({ tenantId: tenant.id, projectId: p.id, projectWorkflowId: sPw.id, stageId: sStages[sStages.length - 1].id, originalName: 'Original Sanction Order.pdf', fileType: 'pdf', mimeType: 'application/pdf', filePath: PDF_URL, fileSize: PDF_SIZE, uploadedById: pmId });
      await seedDoc({ tenantId: tenant.id, projectId: p.id, projectWorkflowId: sPw.id, stageId: sStages[0].id, originalName: 'Structural Drawings - Approved.pdf', fileType: 'pdf', mimeType: 'application/pdf', filePath: PDF_URL, fileSize: BigInt(1_572_864), uploadedById: exec1Id });
      await seedDoc({ tenantId: tenant.id, projectId: p.id, projectWorkflowId: sPw.id, originalName: 'Existing Building Photos.jpg', fileType: 'jpg', mimeType: 'image/jpeg', filePath: imgUrl(5), fileSize: IMG_SIZE, uploadedById: exec1Id });

      if (revisedSanctionWf) {
        const { pw: rPw, stageRecords: rStages } = await attachWorkflow({ projectId: p.id, workflow: revisedSanctionWf, order: 4, mode: 'half_progress', projectDays: 15 });
        await seedDoc({ tenantId: tenant.id, projectId: p.id, projectWorkflowId: rPw.id, stageId: rStages[0].id, originalName: 'Revised Plan - 2 Extra Floors.pdf', fileType: 'pdf', mimeType: 'application/pdf', filePath: PDF_URL, fileSize: PDF_SIZE, uploadedById: exec1Id });
        await seedDoc({ tenantId: tenant.id, projectId: p.id, projectWorkflowId: rPw.id, originalName: 'Revised Plan Photo.jpg', fileType: 'jpg', mimeType: 'image/jpeg', filePath: imgUrl(6), fileSize: IMG_SIZE, uploadedById: exec1Id });

        await seedHistory(rStages[0].id, exec1Id, 'pending', 'in_progress', 'Revised drawings submitted to authority');
        for (let i = 1; i < Math.floor(rStages.length / 2); i++) {
          await seedHistory(rStages[i].id, pmId, 'in_progress', 'completed', 'Cleared');
        }
      }

      for (const s of [...zStages, ...lStages, ...sStages]) {
        await seedHistory(s.id, pmId, 'in_progress', 'completed', 'Approved');
      }

      await prisma.followUp.create({ data: { tenantId: tenant.id, projectId: p.id, ownerId: followupId!, createdById: adminId, notes: 'Follow up with BMC Dadar ward office on revised sanction acknowledgement letter', nextFollowUp: daysFromNow(3), status: 'pending' } });
      await prisma.followUp.create({ data: { tenantId: tenant.id, projectId: p.id, ownerId: pmId, createdById: adminId, notes: 'Collect society consent letters from all 48 members — 6 still pending', nextFollowUp: daysFromNow(1), status: 'pending' } });

      await prisma.notification.create({ data: { tenantId: tenant.id, userId: pmId, type: 'stage_updated', title: 'Revised Sanction Progressing', message: 'Saraswati CHS: Revised sanction workflow is 50% done. Awaiting authority review.', isRead: false, data: { projectId: p.id } } });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PROJECT 7 — Technopark IT Hub Tower 3
    // State: active | Zoning ✓ + LAQ ✓ + Sanction 75% (nearly approved)
    // ─────────────────────────────────────────────────────────────────────────
    {
      const p = await prisma.project.create({
        data: {
          tenantId:        tenant.id,
          workflowId:      sanctionWf!.id,
          projectNumber:   'VD-2025-007',
          name:            'Technopark IT Hub - Tower 3',
          clientName:      'TechCorp Infra Ltd',
          description:     'G+12 IT park tower, Whitefield. Final-stage sanction approval pending from authority — all pre-clearances done.',
          location:        'Whitefield, Bengaluru',
          status:          'active',
          priority:        'medium',
          ownerId:         exec1Id,
          followUpOwnerId: followupId,
          startDate:       daysAgo(75),
          dueDate:         daysFromNow(14),
          currentStage:    'in_progress',
          createdAt:       daysAgo(75),
        },
      });
      summaryProjects.push(p.projectNumber);

      const { pw: zPw, stageRecords: zStages } = await attachWorkflow({ projectId: p.id, workflow: zoningWf!,   order: 1, mode: 'completed', projectDays: 70 });
      const { pw: lPw, stageRecords: lStages } = await attachWorkflow({ projectId: p.id, workflow: laqWf!,      order: 2, mode: 'completed', projectDays: 55 });
      const { pw: sPw, stageRecords: sStages } = await attachWorkflow({ projectId: p.id, workflow: sanctionWf!, order: 3, mode: 'three_quarters', projectDays: 30 });

      await seedDoc({ tenantId: tenant.id, projectId: p.id, projectWorkflowId: zPw.id, stageId: zStages[zStages.length - 1].id, originalName: 'Zoning Clearance - Technopark.pdf', fileType: 'pdf', mimeType: 'application/pdf', filePath: PDF_URL, fileSize: PDF_SIZE, uploadedById: pmId });
      await seedDoc({ tenantId: tenant.id, projectId: p.id, projectWorkflowId: lPw.id, stageId: lStages[lStages.length - 1].id, originalName: 'LAQ Certificate - Technopark.pdf', fileType: 'pdf', mimeType: 'application/pdf', filePath: PDF_URL, fileSize: PDF_SIZE, uploadedById: pmId });
      await seedDoc({ tenantId: tenant.id, projectId: p.id, projectWorkflowId: sPw.id, stageId: sStages[0].id, originalName: 'IT Park Architectural Plan.pdf', fileType: 'pdf', mimeType: 'application/pdf', filePath: PDF_URL, fileSize: BigInt(2_621_440), uploadedById: exec1Id });
      await seedDoc({ tenantId: tenant.id, projectId: p.id, projectWorkflowId: sPw.id, originalName: 'Site Layout Photograph.jpg', fileType: 'jpg', mimeType: 'image/jpeg', filePath: imgUrl(7), fileSize: IMG_SIZE, uploadedById: exec1Id });

      for (const s of [...zStages, ...lStages]) {
        await seedHistory(s.id, exec1Id, 'in_progress', 'completed', 'Cleared');
      }
      for (const s of sStages.filter((st) => st.status === 'completed')) {
        await seedHistory(s.id, pmId, 'in_progress', 'completed', 'Approved by authority');
      }

      await prisma.followUp.create({ data: { tenantId: tenant.id, projectId: p.id, ownerId: followupId!, createdById: pmId, notes: 'Collect final sanction order from BBMP office — approval expected this week', nextFollowUp: daysFromNow(5), status: 'pending' } });

      await prisma.notification.create({ data: { tenantId: tenant.id, userId: exec1Id, type: 'stage_updated', title: 'Sanction Nearly Approved', message: 'Technopark IT Hub Tower 3 sanction is 75% done — final approval pending.', isRead: false, data: { projectId: p.id } } });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PROJECT 8 — Hillview Residences
    // State: active | Just started — Zoning early stage only
    // ─────────────────────────────────────────────────────────────────────────
    {
      const p = await prisma.project.create({
        data: {
          tenantId:        tenant.id,
          workflowId:      zoningWf!.id,
          projectNumber:   'VD-2025-008',
          name:            'Hillview Residences',
          clientName:      'Hillview Properties Pvt Ltd',
          description:     '24 bungalow plotted development, Lonavala. Fresh project — zoning application just filed.',
          location:        'Lonavala, Maharashtra',
          status:          'active',
          priority:        'low',
          ownerId:         exec1Id,
          followUpOwnerId: followupId,
          startDate:       daysAgo(5),
          dueDate:         daysFromNow(120),
          currentStage:    'in_progress',
          createdAt:       daysAgo(5),
        },
      });
      summaryProjects.push(p.projectNumber);

      const { pw: zPw, stageRecords: zStages } = await attachWorkflow({ projectId: p.id, workflow: zoningWf!, order: 1, mode: 'in_progress_1', projectDays: 4 });
      await attachWorkflow({ projectId: p.id, workflow: laqWf!, order: 2, mode: 'pending', projectDays: 0 });
      await attachWorkflow({ projectId: p.id, workflow: sanctionWf!, order: 3, mode: 'pending', projectDays: 0 });

      await seedDoc({ tenantId: tenant.id, projectId: p.id, projectWorkflowId: zPw.id, stageId: zStages[0].id, originalName: 'Zoning Application - Hillview.pdf', fileType: 'pdf', mimeType: 'application/pdf', filePath: PDF_URL, fileSize: PDF_SIZE, uploadedById: exec1Id });

      await seedHistory(zStages[0].id, exec1Id, 'pending', 'in_progress', 'Application filed — acknowledgement received');
    }

    // ── Final response ────────────────────────────────────────────────────────
    res.json({
      success: true,
      message: '8 demo projects seeded successfully',
      projects: summaryProjects,
      data: {
        total: summaryProjects.length,
        states: {
          active:    6,
          completed: 1,
          on_hold:   1,
        },
        workflows_used: [
          'Zoning', 'LAQ', 'Sanction',
          ...(revisedSanctionWf ? ['Revised Sanction'] : []),
        ],
        credentials: { password: 'Admin@123' },
      },
    });
  } catch (err) {
    console.error('Seed-projects error:', err);
    res.status(500).json({ success: false, error: String(err) });
  } finally {
    await prisma.$disconnect();
  }
});
