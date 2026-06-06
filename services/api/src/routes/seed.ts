import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

export const seedRouter = Router();
const prisma = new PrismaClient();

// POST /api/seed — protected one-time seed endpoint
// curl -X POST https://your-api.railway.app/api/seed -H "x-seed-secret: <SEED_SECRET>"
seedRouter.post('/', async (req, res) => {
  const secret = process.env.SEED_SECRET;
  if (!secret || req.headers['x-seed-secret'] !== secret) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  try {
    // Already seeded?
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

    // Assign roles
    await Promise.all([
      prisma.userRole.create({ data: { userId: admin.id, roleId: adminRole.id } }),
      prisma.userRole.create({ data: { userId: pm.id, roleId: pmRole.id } }),
      prisma.userRole.create({ data: { userId: exec1.id, roleId: execRole.id } }),
      prisma.userRole.create({ data: { userId: followupExec.id, roleId: followupRole.id } }),
    ]);

    // ── Workflow (stages stored as JSON) ──────────────────────────────────────
    const workflow = await prisma.workflowTemplate.create({
      data: {
        tenantId: tenant.id,
        name: 'Standard File Workflow',
        description: 'Default 6-stage property file workflow',
        isDefault: true,
        stages: [
          { stageName: 'File Creation',    stageKey: 'file_creation',    order: 1, color: '#6366f1', requiresApproval: false },
          { stageName: 'Inward',           stageKey: 'inward',           order: 2, color: '#3b82f6', requiresApproval: false },
          { stageName: 'Scrutiny',         stageKey: 'scrutiny',         order: 3, color: '#0ea5e9', requiresApproval: true },
          { stageName: 'Report Generation',stageKey: 'report_generation',order: 4, color: '#10b981', requiresApproval: false },
          { stageName: 'Approval',         stageKey: 'approval',         order: 5, color: '#f59e0b', requiresApproval: true },
          { stageName: 'Completed',        stageKey: 'completed_stage',  order: 6, color: '#22c55e', requiresApproval: false },
        ],
      },
    });

    // ── Projects ───────────────────────────────────────────────────────────────
    const daysAgo = (n: number) => new Date(Date.now() - n * 86400000);
    const daysFromNow = (n: number) => new Date(Date.now() + n * 86400000);

    const projectsData = [
      { name: 'Sharma Residence - Survey No. 142',    client: 'Arvind Sharma',    num: 'VD-2024-001', stage: 'approval',         status: 'active',    owner: pm,    days: 45, due: 15 },
      { name: 'Mehta Commercial Complex - Plot 78',   client: 'Suresh Mehta',     num: 'VD-2024-002', stage: 'report_generation', status: 'active',    owner: exec1, days: 30, due: 30 },
      { name: 'Patel Bungalow - CTS No. 2341',        client: 'Kiran Patel',      num: 'VD-2024-003', stage: 'completed_stage',   status: 'completed', owner: pm,    days: 90, due: -5 },
      { name: 'Redevelopment - Old Town Block C',     client: 'City Corp Ltd',    num: 'VD-2024-004', stage: 'scrutiny',          status: 'active',    owner: exec1, days: 20, due: 45 },
      { name: 'Industrial Land Survey - Zone 4',      client: 'Bharat Industries', num: 'VD-2024-005', stage: 'inward',           status: 'active',    owner: pm,    days: 10, due: 60 },
      { name: 'Gokhale Estate Valuation',             client: 'Prakash Gokhale',  num: 'VD-2024-006', stage: 'file_creation',     status: 'active',    owner: exec1, days: 5,  due: 90 },
      { name: 'City Centre Mall - Floor Plan Review', client: 'Mall Corp Pvt Ltd', num: 'VD-2024-007', stage: 'approval',         status: 'on_hold',   owner: pm,    days: 60, due: -10 },
      { name: 'Riverside Township - Phase 2',         client: 'Township Builders', num: 'VD-2024-008', stage: 'scrutiny',         status: 'active',    owner: exec1, days: 25, due: 20 },
    ];

    const projects = await Promise.all(
      projectsData.map((p) =>
        prisma.project.create({
          data: {
            tenantId: tenant.id,
            workflowId: workflow.id,
            name: p.name,
            projectNumber: p.num,
            clientName: p.client,
            description: `Property valuation file for ${p.client}`,
            status: p.status,
            currentStage: p.stage,
            ownerId: p.owner.id,
            followUpOwnerId: followupExec.id,
            createdAt: daysAgo(p.days),
            dueDate: daysFromNow(p.due),
          },
        })
      )
    );

    // ── Follow-ups ─────────────────────────────────────────────────────────────
    await Promise.all([
      prisma.followUp.create({
        data: {
          tenantId: tenant.id,
          projectId: projects[0].id,
          ownerId: followupExec.id,
          createdById: pm.id,
          notes: 'Chase approval from municipal office for NOC',
          nextFollowUp: daysFromNow(3),
          status: 'pending',
        },
      }),
      prisma.followUp.create({
        data: {
          tenantId: tenant.id,
          projectId: projects[1].id,
          ownerId: exec1.id,
          createdById: pm.id,
          notes: 'Site visit required for updated photographs',
          nextFollowUp: daysFromNow(7),
          status: 'pending',
        },
      }),
      prisma.followUp.create({
        data: {
          tenantId: tenant.id,
          projectId: projects[3].id,
          ownerId: followupExec.id,
          createdById: admin.id,
          notes: 'All documents to be submitted for scrutiny review',
          nextFollowUp: daysFromNow(2),
          status: 'pending',
        },
      }),
    ]);

    // ── Notifications ──────────────────────────────────────────────────────────
    await Promise.all([
      prisma.notification.create({
        data: {
          tenantId: tenant.id,
          userId: pm.id,
          type: 'overdue',
          title: 'Project Overdue',
          message: `${projects[6].name} is past its due date`,
          isRead: false,
          data: { projectId: projects[6].id },
        },
      }),
      prisma.notification.create({
        data: {
          tenantId: tenant.id,
          userId: admin.id,
          type: 'status_changed',
          title: 'Project Completed',
          message: `${projects[2].name} has been marked as completed`,
          isRead: false,
          data: { projectId: projects[2].id },
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
      },
    });
  } catch (err) {
    console.error('Seed error:', err);
    res.status(500).json({ success: false, error: String(err) });
  } finally {
    await prisma.$disconnect();
  }
});
