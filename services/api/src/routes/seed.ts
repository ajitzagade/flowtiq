import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

export const seedRouter = Router();
const prisma = new PrismaClient();

// POST /api/seed  — one-time seed endpoint, protected by SEED_SECRET env var
// Call with: curl -X POST https://your-api.railway.app/api/seed -H "x-seed-secret: <SEED_SECRET>"
seedRouter.post('/', async (req, res) => {
  const secret = process.env.SEED_SECRET;
  if (!secret || req.headers['x-seed-secret'] !== secret) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  try {
    // ── Check if already seeded ──────────────────────────────────────────────
    const existingTenant = await prisma.tenant.findFirst({ where: { slug: 'vastudeep' } });
    if (existingTenant) {
      res.json({ success: true, message: 'Database already seeded', tenantId: existingTenant.id });
      return;
    }

    const hash = async (pw: string) => bcrypt.hash(pw, 12);
    const DEFAULT_PASSWORD = 'Admin@123';

    // ── Tenant ───────────────────────────────────────────────────────────────
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Vastudeep Associates',
        slug: 'vastudeep',
        subscriptionPlan: 'professional',
        maxUsers: 50,
        branding: {
          primaryColor: '#1e3a5f',
          secondaryColor: '#c9a84c',
          theme: 'light',
        },
        settings: {
          features: { workflows: true, documents: true, followUps: true, auditLogs: true, notifications: true },
          notificationSettings: { emailEnabled: true, inAppEnabled: true },
          timezone: 'Asia/Kolkata',
          dateFormat: 'DD/MM/YYYY',
        },
      },
    });

    // ── Super Admin (no tenant) ───────────────────────────────────────────────
    const superAdmin = await prisma.user.create({
      data: {
        email: 'superadmin@flowtiq.com',
        passwordHash: await hash(DEFAULT_PASSWORD),
        firstName: 'Super',
        lastName: 'Admin',
        isSuperAdmin: true,
        isActive: true,
      },
    });

    // ── Tenant Users ──────────────────────────────────────────────────────────
    const [admin, pm, exec1, followupExec] = await Promise.all([
      prisma.user.create({
        data: {
          tenantId: tenant.id,
          email: 'admin@vastudeep.com',
          passwordHash: await hash(DEFAULT_PASSWORD),
          firstName: 'Rajesh',
          lastName: 'Sharma',
          phone: '+91 98765 43210',
          isActive: true,
        },
      }),
      prisma.user.create({
        data: {
          tenantId: tenant.id,
          email: 'pm@vastudeep.com',
          passwordHash: await hash(DEFAULT_PASSWORD),
          firstName: 'Priya',
          lastName: 'Mehta',
          phone: '+91 87654 32109',
          isActive: true,
        },
      }),
      prisma.user.create({
        data: {
          tenantId: tenant.id,
          email: 'exec1@vastudeep.com',
          passwordHash: await hash(DEFAULT_PASSWORD),
          firstName: 'Amit',
          lastName: 'Patel',
          phone: '+91 76543 21098',
          isActive: true,
        },
      }),
      prisma.user.create({
        data: {
          tenantId: tenant.id,
          email: 'followup@vastudeep.com',
          passwordHash: await hash(DEFAULT_PASSWORD),
          firstName: 'Sneha',
          lastName: 'Joshi',
          phone: '+91 65432 10987',
          isActive: true,
        },
      }),
    ]);

    // ── Roles & Permissions ───────────────────────────────────────────────────
    const permissions = await Promise.all([
      'projects:view', 'projects:view_all', 'projects:create', 'projects:edit', 'projects:delete',
      'documents:upload', 'documents:download', 'documents:delete',
      'follow_ups:view', 'follow_ups:create', 'follow_ups:edit',
      'users:view', 'users:create', 'users:edit',
      'roles:view', 'roles:manage',
      'workflows:view', 'workflows:manage',
      'reports:view',
    ].map((name) => prisma.permission.create({ data: { name, description: name.replace(/_/g, ' ') } })));

    const permMap = Object.fromEntries(permissions.map((p) => [p.name, p.id]));

    const adminRole = await prisma.role.create({
      data: {
        tenantId: tenant.id,
        name: 'Admin',
        description: 'Full access',
        color: '#ef4444',
        permissions: {
          create: permissions.map((p) => ({ permissionId: p.id })),
        },
      },
    });

    const pmRole = await prisma.role.create({
      data: {
        tenantId: tenant.id,
        name: 'Project Manager',
        description: 'Manage projects and team',
        color: '#3b82f6',
        permissions: {
          create: [
            'projects:view', 'projects:view_all', 'projects:create', 'projects:edit',
            'documents:upload', 'documents:download',
            'follow_ups:view', 'follow_ups:create', 'follow_ups:edit',
            'reports:view',
          ].map((n) => ({ permissionId: permMap[n] })),
        },
      },
    });

    const execRole = await prisma.role.create({
      data: {
        tenantId: tenant.id,
        name: 'File Executive',
        description: 'Handle files and documents',
        color: '#10b981',
        permissions: {
          create: [
            'projects:view', 'projects:create', 'projects:edit',
            'documents:upload', 'documents:download',
            'follow_ups:view', 'follow_ups:create',
          ].map((n) => ({ permissionId: permMap[n] })),
        },
      },
    });

    const followupRole = await prisma.role.create({
      data: {
        tenantId: tenant.id,
        name: 'Follow-up Executive',
        description: 'Manage follow-ups',
        color: '#f59e0b',
        permissions: {
          create: [
            'projects:view',
            'follow_ups:view', 'follow_ups:create', 'follow_ups:edit',
          ].map((n) => ({ permissionId: permMap[n] })),
        },
      },
    });

    // Assign roles to users
    await Promise.all([
      prisma.userRole.create({ data: { userId: admin.id, roleId: adminRole.id } }),
      prisma.userRole.create({ data: { userId: pm.id, roleId: pmRole.id } }),
      prisma.userRole.create({ data: { userId: exec1.id, roleId: execRole.id } }),
      prisma.userRole.create({ data: { userId: followupExec.id, roleId: followupRole.id } }),
    ]);

    // ── Workflow ───────────────────────────────────────────────────────────────
    const workflow = await prisma.workflowTemplate.create({
      data: {
        tenantId: tenant.id,
        name: 'Standard File Workflow',
        description: 'Default 6-stage property file workflow',
        isDefault: true,
        createdById: admin.id,
        stages: {
          create: [
            { stageName: 'File Creation', stageKey: 'file_creation', order: 1, color: '#6366f1', requiresApproval: false },
            { stageName: 'Inward', stageKey: 'inward', order: 2, color: '#3b82f6', requiresApproval: false },
            { stageName: 'Scrutiny', stageKey: 'scrutiny', order: 3, color: '#0ea5e9', requiresApproval: true },
            { stageName: 'Report Generation', stageKey: 'report_generation', order: 4, color: '#10b981', requiresApproval: false },
            { stageName: 'Approval', stageKey: 'approval', order: 5, color: '#f59e0b', requiresApproval: true },
            { stageName: 'Completed', stageKey: 'completed_stage', order: 6, color: '#22c55e', requiresApproval: false },
          ],
        },
      },
    });

    // ── Projects ───────────────────────────────────────────────────────────────
    const now = new Date();
    const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000);
    const daysFromNow = (n: number) => new Date(now.getTime() + n * 86400000);

    const projectsData = [
      { title: 'Sharma Residence - Survey No. 142', number: 'VD-2024-001', stage: 'approval', status: 'active', owner: pm, days: 45, due: 15 },
      { title: 'Mehta Commercial Complex - Plot 78', number: 'VD-2024-002', stage: 'report_generation', status: 'active', owner: exec1, days: 30, due: 30 },
      { title: 'Patel Bungalow - CTS No. 2341', number: 'VD-2024-003', stage: 'completed_stage', status: 'completed', owner: pm, days: 90, due: -5 },
      { title: 'Redevelopment - Old Town Block C', number: 'VD-2024-004', stage: 'scrutiny', status: 'active', owner: exec1, days: 20, due: 45 },
      { title: 'Industrial Land Survey - Zone 4', number: 'VD-2024-005', stage: 'inward', status: 'active', owner: pm, days: 10, due: 60 },
      { title: 'Gokhale Estate Valuation', number: 'VD-2024-006', stage: 'file_creation', status: 'active', owner: exec1, days: 5, due: 90 },
      { title: 'City Centre Mall - Floor Plan Review', number: 'VD-2024-007', stage: 'approval', status: 'on_hold', owner: pm, days: 60, due: -10 },
      { title: 'Riverside Township - Phase 2', number: 'VD-2024-008', stage: 'scrutiny', status: 'active', owner: exec1, days: 25, due: 20 },
    ];

    const projects = await Promise.all(
      projectsData.map((p) =>
        prisma.project.create({
          data: {
            tenantId: tenant.id,
            workflowId: workflow.id,
            name: p.title,
            title: p.title,
            projectNumber: p.number,
            description: `Property file for ${p.title}`,
            status: p.status as 'active' | 'completed' | 'on_hold' | 'cancelled',
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
          title: 'Chase approval from municipal office',
          description: 'Need to follow up with municipal office for NOC',
          dueDate: daysFromNow(3),
          priority: 'high',
          status: 'pending',
          assignedToId: followupExec.id,
          createdById: pm.id,
        },
      }),
      prisma.followUp.create({
        data: {
          tenantId: tenant.id,
          projectId: projects[1].id,
          title: 'Collect site photographs',
          description: 'Site visit required for updated photographs',
          dueDate: daysFromNow(7),
          priority: 'medium',
          status: 'in_progress',
          assignedToId: exec1.id,
          createdById: pm.id,
        },
      }),
      prisma.followUp.create({
        data: {
          tenantId: tenant.id,
          projectId: projects[3].id,
          title: 'Submit scrutiny documents',
          description: 'All documents to be submitted for scrutiny review',
          dueDate: daysFromNow(2),
          priority: 'high',
          status: 'pending',
          assignedToId: followupExec.id,
          createdById: admin.id,
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
          message: `${projects[6].title} is past its due date`,
          isRead: false,
          metadata: { projectId: projects[6].id },
        },
      }),
      prisma.notification.create({
        data: {
          tenantId: tenant.id,
          userId: admin.id,
          type: 'status_changed',
          title: 'Project Completed',
          message: `${projects[2].title} has been marked as completed`,
          isRead: false,
          metadata: { projectId: projects[2].id },
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
