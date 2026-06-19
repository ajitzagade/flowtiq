/**
 * Seed script for Flowtiq
 * Creates realistic demo data for Vastudeep Associates
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const VASTUDEEP_BRANDING = {
  primaryColor: '#3b82f6',
  secondaryColor: '#0f172a',
  accentColor: '#e8f0fe',
  fontFamily: 'Inter',
  theme: 'light',
  logo: null,
};

const VASTUDEEP_SETTINGS = {
  features: {
    workflows: true,
    documents: true,
    followUps: true,
    auditLogs: true,
    notifications: true,
    apiAccess: false,
    whiteLabel: false,
  },
  notificationSettings: {
    emailEnabled: true,
    inAppEnabled: true,
    whatsappEnabled: false,
  },
  timezone: 'Asia/Kolkata',
  dateFormat: 'DD/MM/YYYY',
};

const DEFAULT_WORKFLOW_STAGES = [
  {
    key: 'file_creation',
    name: 'File Creation',
    order: 1,
    description: 'Initial file creation and registration',
    color: '#6366f1',
    requiresApproval: false,
    canSkip: false,
    checklist: [
      { id: 'c1', label: 'Client details verified', required: true },
      { id: 'c2', label: 'Project scope documented', required: true },
      { id: 'c3', label: 'Initial documents collected', required: false },
    ],
    followUpRules: { autoCreate: true, defaultDaysAhead: 3, reminderDaysBefore: 1 },
  },
  {
    key: 'inward',
    name: 'Inward',
    order: 2,
    description: 'Document inward and receipt',
    color: '#f59e0b',
    requiresApproval: false,
    canSkip: false,
    checklist: [
      { id: 'c1', label: 'Documents received', required: true },
      { id: 'c2', label: 'Inward register updated', required: true },
    ],
    followUpRules: { autoCreate: true, defaultDaysAhead: 2, reminderDaysBefore: 1 },
  },
  {
    key: 'scrutiny',
    name: 'Scrutiny',
    order: 3,
    description: 'Document scrutiny and verification',
    color: '#8b5cf6',
    requiresApproval: false,
    canSkip: false,
    checklist: [
      { id: 'c1', label: 'Documents verified for completeness', required: true },
      { id: 'c2', label: 'Deficiencies noted', required: false },
      { id: 'c3', label: 'Scrutiny report prepared', required: true },
    ],
    followUpRules: { autoCreate: true, defaultDaysAhead: 5, reminderDaysBefore: 2 },
  },
  {
    key: 'report_generation',
    name: 'Report Generation',
    order: 4,
    description: 'Generate technical/compliance reports',
    color: '#06b6d4',
    requiresApproval: false,
    canSkip: false,
    checklist: [
      { id: 'c1', label: 'Technical report prepared', required: true },
      { id: 'c2', label: 'Compliance checked', required: true },
      { id: 'c3', label: 'Report reviewed internally', required: true },
    ],
    followUpRules: { autoCreate: true, defaultDaysAhead: 7, reminderDaysBefore: 2 },
  },
  {
    key: 'approval',
    name: 'Approval',
    order: 5,
    description: 'Final approval from authority',
    color: '#10b981',
    requiresApproval: true,
    canSkip: false,
    checklist: [
      { id: 'c1', label: 'Submitted to authority', required: true },
      { id: 'c2', label: 'Approval received', required: true },
      { id: 'c3', label: 'Approval order attached', required: true },
    ],
    followUpRules: { autoCreate: true, defaultDaysAhead: 10, reminderDaysBefore: 3 },
  },
  {
    key: 'completed',
    name: 'Completed',
    order: 6,
    description: 'File closure and delivery to client',
    color: '#64748b',
    requiresApproval: false,
    canSkip: false,
    checklist: [
      { id: 'c1', label: 'Final documents prepared', required: true },
      { id: 'c2', label: 'Client notified', required: true },
      { id: 'c3', label: 'Documents delivered', required: true },
      { id: 'c4', label: 'Payment received', required: false },
    ],
    followUpRules: { autoCreate: false, defaultDaysAhead: 0, reminderDaysBefore: 0 },
  },
];

const PERMISSIONS = [
  // Projects
  { code: 'projects:create', name: 'Create Projects', module: 'projects', action: 'create' },
  { code: 'projects:read', name: 'View Projects', module: 'projects', action: 'read' },
  { code: 'projects:update', name: 'Update Projects', module: 'projects', action: 'update' },
  { code: 'projects:delete', name: 'Delete Projects', module: 'projects', action: 'delete' },
  { code: 'projects:view_all', name: 'View All Projects', module: 'projects', action: 'view_all' },
  // Stages
  { code: 'stages:update', name: 'Update Stages', module: 'stages', action: 'update' },
  { code: 'stages:approve', name: 'Approve Stages', module: 'stages', action: 'approve' },
  // Documents
  { code: 'documents:upload', name: 'Upload Documents', module: 'documents', action: 'upload' },
  { code: 'documents:download', name: 'Download Documents', module: 'documents', action: 'download' },
  { code: 'documents:delete', name: 'Delete Documents', module: 'documents', action: 'delete' },
  // Follow-ups
  { code: 'followups:create', name: 'Create Follow-ups', module: 'followups', action: 'create' },
  { code: 'followups:update', name: 'Update Follow-ups', module: 'followups', action: 'update' },
  { code: 'followups:view_all', name: 'View All Follow-ups', module: 'followups', action: 'view_all' },
  // Users
  { code: 'users:create', name: 'Create Users', module: 'users', action: 'create' },
  { code: 'users:read', name: 'View Users', module: 'users', action: 'read' },
  { code: 'users:update', name: 'Update Users', module: 'users', action: 'update' },
  { code: 'users:delete', name: 'Delete Users', module: 'users', action: 'delete' },
  { code: 'users:manage', name: 'Manage Users', module: 'users', action: 'manage' },
  // Roles
  { code: 'roles:manage', name: 'Manage Roles', module: 'roles', action: 'manage' },
  // Workflows
  { code: 'workflows:manage', name: 'Manage Workflows', module: 'workflows', action: 'manage' },
  // Audit
  { code: 'audit:read', name: 'View Audit Logs', module: 'audit', action: 'read' },
  // Settings
  { code: 'settings:manage', name: 'Manage Settings', module: 'settings', action: 'manage' },
  // Reports
  { code: 'reports:read', name: 'View Reports', module: 'reports', action: 'read' },
  { code: 'reports:export', name: 'Export Reports', module: 'reports', action: 'export' },
];

async function main() {
  console.log('Starting seed...');

  // Upsert permissions
  console.log('Creating permissions...');
  for (const perm of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: perm.code },
      update: {},
      create: perm,
    });
  }

  const allPermissions = await prisma.permission.findMany();
  const getPermIds = (codes: string[]) =>
    allPermissions.filter((p) => codes.includes(p.code)).map((p) => ({ permissionId: p.id }));

  // Create Vastudeep tenant
  console.log('Creating Vastudeep Associates tenant...');
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'vastudeep' },
    update: {},
    create: {
      name: 'Vastudeep Associates',
      slug: 'vastudeep',
      domain: 'vastudeep.flowtiq.com',
      branding: VASTUDEEP_BRANDING,
      settings: VASTUDEEP_SETTINGS,
      subscriptionPlan: 'professional',
      subscriptionStatus: 'active',
      maxUsers: 25,
      maxStorageBytes: BigInt(53687091200), // 50GB
    },
  });

  // Create roles for Vastudeep
  console.log('Creating roles...');
  const adminRole = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'Tenant Admin' } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'Tenant Admin',
      description: 'Full access to all tenant features',
      isSystem: true,
      color: '#dc2626',
      rolePermissions: {
        create: getPermIds(PERMISSIONS.map((p) => p.code)),
      },
    },
  });

  const pmRole = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'Project Manager' } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'Project Manager',
      description: 'Manage projects, stages, and team assignments',
      isSystem: true,
      color: '#2563eb',
      rolePermissions: {
        create: getPermIds([
          'projects:create', 'projects:read', 'projects:update', 'projects:view_all',
          'stages:update', 'stages:approve',
          'documents:upload', 'documents:download',
          'followups:create', 'followups:update', 'followups:view_all',
          'users:read', 'reports:read', 'reports:export',
        ]),
      },
    },
  });

  const fileExecRole = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'File Executive' } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'File Executive',
      description: 'Handle file processing and document uploads',
      isSystem: true,
      color: '#7c3aed',
      rolePermissions: {
        create: getPermIds([
          'projects:read', 'projects:update',
          'stages:update',
          'documents:upload', 'documents:download',
          'followups:create', 'followups:update',
        ]),
      },
    },
  });

  const followUpRole = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'Follow-up Executive' } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'Follow-up Executive',
      description: 'Manage client follow-ups and reminders',
      isSystem: true,
      color: '#d97706',
      rolePermissions: {
        create: getPermIds([
          'projects:read', 'projects:view_all',
          'followups:create', 'followups:update', 'followups:view_all',
          'documents:download',
        ]),
      },
    },
  });

  const viewerRole = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'Viewer' } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'Viewer',
      description: 'Read-only access to projects and documents',
      isSystem: true,
      color: '#64748b',
      rolePermissions: {
        create: getPermIds([
          'projects:read',
          'documents:download',
          'reports:read',
        ]),
      },
    },
  });

  // Create users
  console.log('Creating users...');
  const hashedPassword = await bcrypt.hash('Admin@123', 10);

  // Super Admin (no tenantId, cannot use tenantId_email compound unique)
  const existingSuperAdmin = await prisma.user.findFirst({ where: { email: 'superadmin@flowtiq.com', isSuperAdmin: true } });
  if (!existingSuperAdmin) {
    await prisma.user.create({
      data: {
        email: 'superadmin@flowtiq.com',
        password: hashedPassword,
        firstName: 'Super',
        lastName: 'Admin',
        isSuperAdmin: true,
        isActive: true,
      },
    });
  }

  // Tenant Admin - Vastudeep
  const tenantAdmin = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'admin@vastudeep.com' } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'admin@vastudeep.com',
      password: hashedPassword,
      firstName: 'Rajesh',
      lastName: 'Sharma',
      phone: '+91 98765 43210',
      isActive: true,
      userRoles: {
        create: [{ roleId: adminRole.id }],
      },
    },
  });

  const pm1 = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'pm@vastudeep.com' } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'pm@vastudeep.com',
      password: hashedPassword,
      firstName: 'Priya',
      lastName: 'Mehta',
      phone: '+91 98765 43211',
      isActive: true,
      userRoles: {
        create: [{ roleId: pmRole.id }],
      },
    },
  });

  const fe1 = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'exec1@vastudeep.com' } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'exec1@vastudeep.com',
      password: hashedPassword,
      firstName: 'Arjun',
      lastName: 'Patel',
      phone: '+91 98765 43212',
      isActive: true,
      userRoles: {
        create: [{ roleId: fileExecRole.id }],
      },
    },
  });

  const fe2 = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'exec2@vastudeep.com' } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'exec2@vastudeep.com',
      password: hashedPassword,
      firstName: 'Sneha',
      lastName: 'Joshi',
      phone: '+91 98765 43213',
      isActive: true,
      userRoles: {
        create: [{ roleId: fileExecRole.id }],
      },
    },
  });

  const followUpExec = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'followup@vastudeep.com' } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'followup@vastudeep.com',
      password: hashedPassword,
      firstName: 'Kavya',
      lastName: 'Reddy',
      phone: '+91 98765 43214',
      isActive: true,
      userRoles: {
        create: [{ roleId: followUpRole.id }],
      },
    },
  });

  // Create workflow template
  console.log('Creating workflow template...');
  const workflow = await prisma.workflowTemplate.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'Standard Building Plan Approval' } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'Standard Building Plan Approval',
      description: 'Standard workflow for building plan approval through municipal corporation',
      isDefault: true,
      stages: DEFAULT_WORKFLOW_STAGES,
    },
  });

  // Create projects
  console.log('Creating projects...');

  const projectsData = [
    {
      projectNumber: 'VDA-2024-001',
      name: 'Sunrise Residency - Building Plan Approval',
      description: 'Residential complex with G+4 floors, 24 flats. Located in Borivali West. Seeking BMC building plan approval.',
      clientName: 'Suresh Kumar Builders',
      location: 'Borivali West, Mumbai',
      status: 'active' as const,
      priority: 'high' as const,
      currentStage: 'approval',
      currentStageIdx: 4,
      daysAgo: 45,
    },
    {
      projectNumber: 'VDA-2024-002',
      name: 'Green Valley Commercial Complex',
      description: 'Commercial complex with shops and offices. G+3 structure with parking. PCMC jurisdiction.',
      clientName: 'Green Valley Developers',
      location: 'Pimpri, Pune',
      status: 'active' as const,
      priority: 'medium' as const,
      currentStage: 'report_generation',
      currentStageIdx: 3,
      daysAgo: 30,
    },
    {
      projectNumber: 'VDA-2024-003',
      name: 'Lakeside Villas - Layout Approval',
      description: 'Residential layout with 35 plots. NA land conversion and layout approval from collector office.',
      clientName: 'Lakeside Properties',
      location: 'Lonavala',
      status: 'active' as const,
      priority: 'urgent' as const,
      currentStage: 'scrutiny',
      currentStageIdx: 2,
      daysAgo: 15,
    },
    {
      projectNumber: 'VDA-2024-004',
      name: 'Metro Heights - IOD & CC',
      description: 'High-rise residential tower G+20. Seeking IOD and Commencement Certificate from MCGM.',
      clientName: 'Metro Infra Pvt. Ltd.',
      location: 'Andheri East, Mumbai',
      status: 'active' as const,
      priority: 'high' as const,
      currentStage: 'inward',
      currentStageIdx: 1,
      daysAgo: 8,
    },
    {
      projectNumber: 'VDA-2024-005',
      name: 'Govind Industrial Shed - Factory License',
      description: 'Industrial shed construction for manufacturing unit. Seeking factory license and building permission.',
      clientName: 'Govind Industries',
      location: 'Bhosari, Pune',
      status: 'completed' as const,
      priority: 'medium' as const,
      currentStage: 'completed',
      currentStageIdx: 5,
      daysAgo: 90,
    },
    {
      projectNumber: 'VDA-2024-006',
      name: 'Shivaji Park Redevelopment',
      description: 'Cluster redevelopment project. SRA scheme approval and NOC from various departments.',
      clientName: 'Shivaji Nagar CHS',
      location: 'Dadar, Mumbai',
      status: 'on_hold' as const,
      priority: 'medium' as const,
      currentStage: 'file_creation',
      currentStageIdx: 0,
      daysAgo: 5,
    },
    {
      projectNumber: 'VDA-2024-007',
      name: 'Sapphire Mall - Fire NOC',
      description: 'Shopping mall fire safety compliance and NOC from fire department. 4 floors with food court.',
      clientName: 'Sapphire Retail Pvt. Ltd.',
      location: 'Thane West',
      status: 'active' as const,
      priority: 'high' as const,
      currentStage: 'report_generation',
      currentStageIdx: 3,
      daysAgo: 22,
    },
    {
      projectNumber: 'VDA-2023-008',
      name: 'Orchid Heights - OC Certificate',
      description: 'Occupancy Certificate for completed residential project. Post-construction compliance.',
      clientName: 'Orchid Developers',
      location: 'Wakad, Pune',
      status: 'completed' as const,
      priority: 'low' as const,
      currentStage: 'completed',
      currentStageIdx: 5,
      daysAgo: 120,
    },
  ];

  const now = new Date();
  const users = [tenantAdmin, pm1, fe1, fe2, followUpExec];

  for (const pd of projectsData) {
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - pd.daysAgo);

    const dueDate = new Date(startDate);
    dueDate.setDate(dueDate.getDate() + 90);

    const existing = await prisma.project.findFirst({
      where: { tenantId: tenant.id, projectNumber: pd.projectNumber },
    });

    if (existing) {
      console.log(`Project ${pd.projectNumber} already exists, skipping...`);
      continue;
    }

    const project = await prisma.project.create({
      data: {
        tenantId: tenant.id,
        projectNumber: pd.projectNumber,
        name: pd.name,
        description: pd.description,
        clientName: pd.clientName,
        location: pd.location,
        status: pd.status,
        priority: pd.priority,
        startDate,
        dueDate,
        completionDate: pd.status === 'completed' ? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) : null,
        workflowId: workflow.id,
        currentStage: pd.currentStage,
        ownerId: pm1.id,
        teamMembers: [fe1.id, fe2.id],
        followUpOwnerId: followUpExec.id,
        reportingOwnerId: tenantAdmin.id,
      },
    });

    // Create stages for this project
    for (let i = 0; i < DEFAULT_WORKFLOW_STAGES.length; i++) {
      const stageDef = DEFAULT_WORKFLOW_STAGES[i];
      let stageStatus: string;

      if (i < pd.currentStageIdx) {
        stageStatus = 'completed';
      } else if (i === pd.currentStageIdx) {
        stageStatus = pd.status === 'completed' ? 'completed' : 'in_progress';
      } else {
        stageStatus = 'pending';
      }

      const stageStartDate = new Date(startDate);
      stageStartDate.setDate(stageStartDate.getDate() + i * 12);

      const stageEndDate = new Date(stageStartDate);
      stageEndDate.setDate(stageEndDate.getDate() + 10);

      await prisma.projectStage.create({
        data: {
          projectId: project.id,
          stageName: stageDef.name,
          stageKey: stageDef.key,
          stageOrder: stageDef.order,
          status: stageStatus,
          assignedTo: users[i % users.length].id,
          startDate: stageStatus !== 'pending' ? stageStartDate : null,
          completionDate: stageStatus === 'completed' ? stageEndDate : null,
          checklist: stageDef.checklist,
          notes: stageStatus === 'completed' ? `${stageDef.name} completed successfully.` : null,
        },
      });
    }

    // Create follow-ups
    if (pd.status !== 'completed') {
      const nextFollowUp = new Date(now);
      nextFollowUp.setDate(nextFollowUp.getDate() + 3);

      const lastFollowUp = new Date(now);
      lastFollowUp.setDate(lastFollowUp.getDate() - 5);

      await prisma.followUp.create({
        data: {
          tenantId: tenant.id,
          projectId: project.id,
          ownerId: followUpExec.id,
          createdById: pm1.id,
          status: 'pending',
          lastFollowUp,
          nextFollowUp,
          notes: `Follow up with ${pd.clientName} regarding current stage status and required documents.`,
        },
      });

      // Overdue follow-up for some projects
      if (pd.priority === 'high' || pd.priority === 'urgent') {
        const overdueDate = new Date(now);
        overdueDate.setDate(overdueDate.getDate() - 2);

        await prisma.followUp.create({
          data: {
            tenantId: tenant.id,
            projectId: project.id,
            ownerId: followUpExec.id,
            createdById: pm1.id,
            status: 'overdue',
            nextFollowUp: overdueDate,
            notes: 'Urgent follow-up pending with municipal office regarding approval status.',
          },
        });
      }
    }
  }

  // Create notifications
  console.log('Creating notifications...');
  const notificationData = [
    {
      userId: pm1.id,
      type: 'follow_up_reminder',
      title: 'Follow-up Due Tomorrow',
      message: 'Sunrise Residency follow-up is scheduled for tomorrow. Please ensure all documents are ready.',
    },
    {
      userId: pm1.id,
      type: 'overdue',
      title: 'Overdue Follow-up Alert',
      message: 'Lakeside Villas follow-up is now overdue by 2 days. Immediate action required.',
    },
    {
      userId: fe1.id,
      type: 'assignment',
      title: 'New Stage Assigned',
      message: 'You have been assigned to the Scrutiny stage for Green Valley Commercial Complex.',
    },
    {
      userId: tenantAdmin.id,
      type: 'status_changed',
      title: 'Project Status Update',
      message: 'Govind Industrial Shed project has been marked as Completed.',
    },
  ];

  for (const notif of notificationData) {
    await prisma.notification.create({
      data: {
        tenantId: tenant.id,
        userId: notif.userId,
        type: notif.type,
        title: notif.title,
        message: notif.message,
        isRead: false,
      },
    });
  }

  // ── NEW: 2 Additional Workflows + 1 Multi-Workflow Project ──────────────────
  console.log('Creating additional workflows...');

  const zoningWorkflow = await prisma.workflowTemplate.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'Zoning & Land Use Approval' } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'Zoning & Land Use Approval',
      description: 'Workflow for obtaining zoning clearance and land-use approval from the planning authority',
      isDefault: false,
      stages: [
        { stageKey: 'zone_filing', stageName: 'Application Filing', order: 1, color: '#6366f1',
          description: 'Submit zoning application with property details', requiresApproval: false, canSkip: false },
        { stageKey: 'zone_inspection', stageName: 'Site Inspection', order: 2, color: '#f59e0b',
          description: 'Physical inspection of the site by planning authority', requiresApproval: false, canSkip: false },
        { stageKey: 'zone_report', stageName: 'Zoning Report', order: 3, color: '#8b5cf6',
          description: 'Preparation and submission of zoning compliance report', requiresApproval: false, canSkip: false },
        { stageKey: 'zone_review', stageName: 'Authority Review', order: 4, color: '#06b6d4',
          description: 'Review by planning committee', requiresApproval: true, canSkip: false },
        { stageKey: 'zone_certificate', stageName: 'Zoning Certificate', order: 5, color: '#10b981',
          description: 'Issuance of zoning clearance certificate', requiresApproval: false, canSkip: false },
      ],
    },
  });

  const envNocWorkflow = await prisma.workflowTemplate.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'Environmental NOC' } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'Environmental NOC',
      description: 'Workflow for obtaining Environmental No Objection Certificate from the State Pollution Control Board',
      isDefault: false,
      stages: [
        { stageKey: 'env_assessment', stageName: 'Environmental Assessment', order: 1, color: '#10b981',
          description: 'Initial environmental impact assessment', requiresApproval: false, canSkip: false },
        { stageKey: 'env_impact_study', stageName: 'Impact Study', order: 2, color: '#f59e0b',
          description: 'Detailed EIA study by certified agency', requiresApproval: false, canSkip: false },
        { stageKey: 'env_noc_application', stageName: 'NOC Application', order: 3, color: '#6366f1',
          description: 'Submit NOC application to SPCB with EIA report', requiresApproval: false, canSkip: false },
        { stageKey: 'env_dept_review', stageName: 'Department Review', order: 4, color: '#8b5cf6',
          description: 'Review and public hearing by SPCB', requiresApproval: true, canSkip: false },
        { stageKey: 'env_noc_issued', stageName: 'NOC Issued', order: 5, color: '#14b8a6',
          description: 'Final NOC issued by SPCB', requiresApproval: false, canSkip: false },
      ],
    },
  });

  // ── New project that uses BOTH new workflows ─────────────────────────────
  console.log('Creating multi-workflow test project...');
  const newProjectNumber = 'VDA-2024-009';
  const existingNewProject = await prisma.project.findFirst({
    where: { tenantId: tenant.id, projectNumber: newProjectNumber },
  });

  if (!existingNewProject) {
    const projStart = new Date(now);
    projStart.setDate(projStart.getDate() - 35);
    const projDue = new Date(projStart);
    projDue.setDate(projDue.getDate() + 120);

    const newProject = await prisma.project.create({
      data: {
        tenantId: tenant.id,
        projectNumber: newProjectNumber,
        name: 'Emerald Township - Zoning & Environment Clearance',
        description: 'Large-scale integrated township project requiring zoning clearance and environmental NOC before building plan submission. Site area: 12 acres, Navi Mumbai.',
        clientName: 'Emerald Realty Pvt. Ltd.',
        location: 'Kharghar, Navi Mumbai',
        status: 'active',
        priority: 'urgent',
        startDate: projStart,
        dueDate: projDue,
        workflowId: zoningWorkflow.id,
        currentStage: null,
        ownerId: pm1.id,
        teamMembers: [fe1.id, fe2.id, tenantAdmin.id],
        followUpOwnerId: followUpExec.id,
        reportingOwnerId: tenantAdmin.id,
      },
    });

    // ── ProjectWorkflow 1: Zoning (all stages completed) ──────────────────
    const zoningPW = await prisma.projectWorkflow.create({
      data: {
        projectId: newProject.id,
        workflowTemplateId: zoningWorkflow.id,
        name: 'Zoning & Land Use Approval',
        status: 'completed',
        order: 1,
        startedAt: projStart,
        completedAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
      },
    });

    const zoningStages = [
      { stageKey: 'zone_filing',      stageName: 'Application Filing', order: 1, status: 'completed', daysOffset: 0 },
      { stageKey: 'zone_inspection',  stageName: 'Site Inspection',    order: 2, status: 'completed', daysOffset: 6 },
      { stageKey: 'zone_report',      stageName: 'Zoning Report',      order: 3, status: 'completed', daysOffset: 13 },
      { stageKey: 'zone_review',      stageName: 'Authority Review',   order: 4, status: 'completed', daysOffset: 20 },
      { stageKey: 'zone_certificate', stageName: 'Zoning Certificate', order: 5, status: 'completed', daysOffset: 29 },
    ];

    for (const s of zoningStages) {
      const stageStart = new Date(projStart);
      stageStart.setDate(stageStart.getDate() + s.daysOffset);
      const stageEnd = new Date(stageStart);
      stageEnd.setDate(stageEnd.getDate() + 5);

      await prisma.projectStage.create({
        data: {
          projectId: newProject.id,
          projectWorkflowId: zoningPW.id,
          stageName: s.stageName,
          stageKey: s.stageKey,
          stageOrder: s.order,
          status: s.status,
          assignedTo: [fe1, fe2, pm1, tenantAdmin, fe1][s.order - 1].id,
          assignedToIds: [[fe1.id], [fe2.id], [pm1.id], [tenantAdmin.id], [fe1.id]][s.order - 1],
          startDate: stageStart,
          completionDate: stageEnd,
          notes: `${s.stageName} completed successfully.`,
        },
      });
    }

    // ── ProjectWorkflow 2: Environmental NOC (in progress at stage 3) ────
    const envPW = await prisma.projectWorkflow.create({
      data: {
        projectId: newProject.id,
        workflowTemplateId: envNocWorkflow.id,
        name: 'Environmental NOC',
        status: 'in_progress',
        order: 2,
        startedAt: new Date(projStart.getTime() + 10 * 24 * 60 * 60 * 1000),
      },
    });

    const envStages = [
      { stageKey: 'env_assessment',    stageName: 'Environmental Assessment', order: 1, status: 'completed',   daysOffset: 10 },
      { stageKey: 'env_impact_study',  stageName: 'Impact Study',             order: 2, status: 'completed',   daysOffset: 17 },
      { stageKey: 'env_noc_application', stageName: 'NOC Application',        order: 3, status: 'in_progress', daysOffset: 26 },
      { stageKey: 'env_dept_review',   stageName: 'Department Review',        order: 4, status: 'pending',     daysOffset: 0 },
      { stageKey: 'env_noc_issued',    stageName: 'NOC Issued',               order: 5, status: 'pending',     daysOffset: 0 },
    ];

    for (const s of envStages) {
      const isCompleted = s.status === 'completed';
      const isInProgress = s.status === 'in_progress';
      const stageStart = (isCompleted || isInProgress)
        ? new Date(projStart.getTime() + s.daysOffset * 24 * 60 * 60 * 1000)
        : null;
      const stageEnd = isCompleted
        ? new Date(stageStart!.getTime() + 6 * 24 * 60 * 60 * 1000)
        : null;

      await prisma.projectStage.create({
        data: {
          projectId: newProject.id,
          projectWorkflowId: envPW.id,
          stageName: s.stageName,
          stageKey: s.stageKey,
          stageOrder: s.order,
          status: s.status,
          assignedTo: [fe2, pm1, fe1, tenantAdmin, fe2][s.order - 1].id,
          assignedToIds: [[fe2.id], [pm1.id], [fe1.id], [tenantAdmin.id], [fe2.id]][s.order - 1],
          startDate: stageStart,
          completionDate: stageEnd,
          notes: isCompleted ? `${s.stageName} completed.` : isInProgress ? 'Under review by SPCB officer.' : null,
        },
      });
    }

    // Follow-up for the new project
    const fuDate = new Date(now);
    fuDate.setDate(fuDate.getDate() + 4);
    await prisma.followUp.create({
      data: {
        tenantId: tenant.id,
        projectId: newProject.id,
        ownerId: followUpExec.id,
        createdById: pm1.id,
        status: 'pending',
        lastFollowUp: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
        nextFollowUp: fuDate,
        notes: 'Follow up with SPCB office regarding Environmental NOC application status (stage 3 in progress).',
      },
    });

    console.log(`Created project ${newProjectNumber} with Zoning (completed) + Environmental NOC (in progress) workflows`);
  } else {
    console.log(`Project ${newProjectNumber} already exists, skipping...`);
  }

  console.log('\nSeed completed successfully!');
  console.log('================================');
  console.log('Demo credentials:');
  console.log('Super Admin: superadmin@flowtiq.com / Admin@123');
  console.log('Tenant Admin: admin@vastudeep.com / Admin@123');
  console.log('Project Manager: pm@vastudeep.com / Admin@123');
  console.log('File Executive: exec1@vastudeep.com / Admin@123');
  console.log('Follow-up Exec: followup@vastudeep.com / Admin@123');
  console.log('================================');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
