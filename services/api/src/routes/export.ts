import { Router } from 'express';
import ExcelJS from 'exceljs';
import { google } from 'googleapis';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { createAuditLog } from '../lib/audit';

export const exportRouter = Router();
exportRouter.use(authenticate);

// ── Helpers ───────────────────────────────────────────────────────────────────

function toNum(d: { toNumber(): number } | null | undefined): number {
  return d?.toNumber() ?? 0;
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return '';
  const dt = typeof d === 'string' ? new Date(d) : d;
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function styleHeader(worksheet: ExcelJS.Worksheet): void {
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFEEEEEE' },
  };
  headerRow.commit();
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];
}

function autoWidth(worksheet: ExcelJS.Worksheet): void {
  worksheet.columns.forEach((col) => {
    let maxLen = 10;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const len = String(cell.value ?? '').length;
      if (len > maxLen) maxLen = len;
    });
    col.width = Math.min(50, Math.max(12, maxLen + 2));
  });
}

const MONEY_FMT = '#,##0.00';

function applyMoneyFmt(worksheet: ExcelJS.Worksheet, colKeys: string[]): void {
  worksheet.columns.forEach((col) => {
    if (col.key && colKeys.includes(col.key)) col.numFmt = MONEY_FMT;
  });
}

// ── Shared: fetch all export data ─────────────────────────────────────────────

export async function fetchExportData(tenantId: string | null, isSuperAdmin: boolean) {
  const tenantFilter = isSuperAdmin ? {} : { tenantId: tenantId! };
  // For models without their own tenantId, filter via the parent project
  const viaProject = isSuperAdmin ? {} : { project: { tenantId: tenantId! } };

  const [
    projects,
    financials,
    milestones,
    invoices,
    followUps,
    users,
    allTenants,
    workflowTemplates,
    projectStages,
    stageSubTasks,
    documents,
  ] = await Promise.all([
    // 1. Projects (include owner name + financial for contract value)
    prisma.project.findMany({
      where: { ...tenantFilter, deletedAt: null, status: { not: 'cancelled' } },
      include: {
        financial: true,
        owner: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),

    // 2. Project Financials
    prisma.projectFinancial.findMany({
      where: tenantFilter,
      include: { project: { select: { projectNumber: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    }),

    // 3. Payment Milestones
    prisma.paymentMilestone.findMany({
      where: tenantFilter,
      include: {
        project: { select: { projectNumber: true, name: true } },
        linkedStage: { select: { stageName: true, stageKey: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),

    // 4. Invoices
    prisma.invoice.findMany({
      where: tenantFilter,
      include: {
        project: { select: { projectNumber: true, name: true } },
        payments: true,
      },
      orderBy: { createdAt: 'asc' },
    }),

    // 5. Follow-ups
    prisma.followUp.findMany({
      where: tenantFilter,
      include: {
        project: { select: { projectNumber: true, name: true } },
        owner: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),

    // 6. Users
    prisma.user.findMany({
      where: { ...tenantFilter, isActive: true },
      include: { userRoles: { include: { role: { select: { name: true } } } } },
      orderBy: { createdAt: 'asc' },
    }),

    // 7. All tenants (super admin only, for tenant name lookup)
    isSuperAdmin
      ? prisma.tenant.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } })
      : Promise.resolve([]),

    // 8. Workflow Templates
    prisma.workflowTemplate.findMany({
      where: { ...tenantFilter, isActive: true },
      orderBy: { createdAt: 'asc' },
    }),

    // 9. Project Stages
    prisma.projectStage.findMany({
      where: viaProject,
      include: {
        project: { select: { projectNumber: true, name: true, tenantId: true } },
        projectWorkflow: { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),

    // 10. Stage Sub-tasks
    prisma.stageSubTask.findMany({
      where: { stage: viaProject },
      include: {
        stage: {
          select: {
            stageName: true,
            stageKey: true,
            project: { select: { projectNumber: true, name: true, tenantId: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    }),

    // 11. Documents (metadata only — not the files themselves)
    prisma.document.findMany({
      where: { ...tenantFilter, isActive: true },
      include: {
        project: { select: { projectNumber: true, name: true } },
        uploadedBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  // Invoice Payments: no tenantId on model — filter via invoice scope above
  const invoiceIds = invoices.map((inv) => inv.id);
  const payments = await prisma.invoicePayment.findMany({
    where: { invoiceId: { in: invoiceIds } },
    include: { invoice: { select: { invoiceNumber: true, project: { select: { projectNumber: true } } } } },
    orderBy: { paymentDate: 'asc' },
  });

  return {
    projects, financials, milestones, invoices, payments,
    followUps, users, allTenants,
    workflowTemplates, projectStages, stageSubTasks, documents,
  };
}

export type ExportData = Awaited<ReturnType<typeof fetchExportData>>;

// ── Shared: build 2D rows for each sheet ─────────────────────────────────────

export function buildSheetRows(
  sheetName: string,
  data: ExportData,
  isSuperAdmin: boolean,
): { headers: string[]; rows: (string | number)[][] } {
  const {
    projects, financials, milestones, invoices, payments,
    followUps, users, allTenants,
    workflowTemplates, projectStages, stageSubTasks, documents,
  } = data;

  const tenantNameMap = new Map(allTenants.map((t) => [t.id, t.name]));
  const invoiceTenantMap = new Map(invoices.map((inv) => [inv.id, inv.tenantId]));
  const userNameMap = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));
  const sa = isSuperAdmin;
  const tName = (tid: string) => (sa ? [tenantNameMap.get(tid) ?? tid] : []);

  if (sheetName === 'Projects') {
    const headers = [
      ...(sa ? ['Tenant'] : []),
      'Project Number', 'Project Name', 'Status', 'Priority', 'Client Name', 'Location',
      'Start Date', 'Due Date', 'Completion Date', 'Contract Value', 'Currency', 'Billing Type',
      'Owner', 'Team Members', 'Created At',
    ];
    const rows = projects.map((p) => [
      ...tName(p.tenantId),
      p.projectNumber, p.name, p.status, p.priority, p.clientName, p.location ?? '',
      fmtDate(p.startDate), fmtDate(p.dueDate), fmtDate(p.completionDate),
      toNum(p.financial?.contractValue), p.financial?.currency ?? 'INR', p.financial?.billingType ?? '',
      `${p.owner.firstName} ${p.owner.lastName}`.trim(),
      p.teamMembers.length,
      fmtDate(p.createdAt),
    ]);
    return { headers, rows };
  }

  if (sheetName === 'Workflow Templates') {
    const headers = [
      ...(sa ? ['Tenant'] : []),
      'Template Name', 'Description', 'Is Default', 'Is Active', 'Stage Count', 'Stage Names', 'Created At',
    ];
    const rows = workflowTemplates.map((wf) => {
      const stages = Array.isArray(wf.stages)
        ? (wf.stages as Array<Record<string, unknown>>)
        : [];
      const stageNames = stages
        .map((s) => (s['name'] ?? s['stageName'] ?? s['key'] ?? s['stageKey'] ?? '') as string)
        .filter(Boolean)
        .join(', ');
      return [
        ...tName(wf.tenantId),
        wf.name, wf.description ?? '', wf.isDefault ? 'Yes' : 'No', wf.isActive ? 'Yes' : 'No',
        stages.length, stageNames, fmtDate(wf.createdAt),
      ];
    });
    return { headers, rows };
  }

  if (sheetName === 'Project Stages') {
    const headers = [
      ...(sa ? ['Tenant'] : []),
      'Project Number', 'Project Name', 'Workflow', 'Stage Name', 'Stage Key', 'Order',
      'Status', 'Is Required', 'Assigned To', 'Start Date', 'Completion Date', 'Notes', 'Created At',
    ];
    const rows = projectStages.map((s) => [
      ...tName(s.project.tenantId),
      s.project.projectNumber, s.project.name,
      s.projectWorkflow?.name ?? '',
      s.stageName, s.stageKey, s.stageOrder, s.status,
      s.isRequired ? 'Yes' : 'No',
      // Resolve assignedToIds to names where possible
      s.assignedToIds.map((id) => userNameMap.get(id) ?? id).join(', '),
      fmtDate(s.startDate), fmtDate(s.completionDate), s.notes ?? '',
      fmtDate(s.createdAt),
    ]);
    return { headers, rows };
  }

  if (sheetName === 'Stage Sub-tasks') {
    const headers = [
      ...(sa ? ['Tenant'] : []),
      'Project Number', 'Project Name', 'Stage Name', 'Sub-task Name', 'Description',
      'Status', 'Is Required', 'Order', 'Notes', 'Completed At', 'Created At',
    ];
    const rows = stageSubTasks.map((st) => [
      ...tName(st.stage.project.tenantId),
      st.stage.project.projectNumber, st.stage.project.name, st.stage.stageName,
      st.name, st.description ?? '', st.status,
      st.isRequired ? 'Yes' : 'No', st.order, st.notes ?? '',
      fmtDate(st.completedAt), fmtDate(st.createdAt),
    ]);
    return { headers, rows };
  }

  if (sheetName === 'Project Financials') {
    const headers = [
      ...(sa ? ['Tenant'] : []),
      'Project Number', 'Project Name', 'Contract Value', 'Currency', 'Billing Type', 'Notes', 'Created At',
    ];
    const rows = financials.map((f) => [
      ...tName(f.tenantId),
      f.project.projectNumber, f.project.name,
      toNum(f.contractValue), f.currency, f.billingType, f.notes ?? '', fmtDate(f.createdAt),
    ]);
    return { headers, rows };
  }

  if (sheetName === 'Payment Milestones') {
    const headers = [
      ...(sa ? ['Tenant'] : []),
      'Project Number', 'Project Name', 'Milestone Name', 'Amount', 'Status',
      'Due Date', 'Linked Stage', 'Notes', 'Created At',
    ];
    const rows = milestones.map((m) => [
      ...tName(m.tenantId),
      m.project.projectNumber, m.project.name, m.name,
      toNum(m.amount), m.status, fmtDate(m.dueDate),
      m.linkedStage?.stageName ?? m.linkedStage?.stageKey ?? '',
      m.notes ?? '', fmtDate(m.createdAt),
    ]);
    return { headers, rows };
  }

  if (sheetName === 'Invoices') {
    const headers = [
      ...(sa ? ['Tenant'] : []),
      'Invoice Number', 'Project Number', 'Project Name', 'Title', 'Status',
      'Issued At', 'Due Date', 'Amount', 'Tax Amount', 'Total Amount', 'Amount Paid', 'Outstanding',
      'Notes', 'Created At',
    ];
    const rows = invoices.map((inv) => {
      const totalAmount = toNum(inv.totalAmount);
      const amountPaid = inv.payments.reduce((s, p) => s + toNum(p.amount), 0);
      return [
        ...tName(inv.tenantId),
        inv.invoiceNumber, inv.project.projectNumber, inv.project.name, inv.title, inv.status,
        fmtDate(inv.issuedAt), fmtDate(inv.dueDate),
        toNum(inv.amount), toNum(inv.taxAmount), totalAmount, amountPaid,
        Math.max(0, totalAmount - amountPaid),
        inv.notes ?? '', fmtDate(inv.createdAt),
      ];
    });
    return { headers, rows };
  }

  if (sheetName === 'Invoice Payments') {
    const headers = [
      ...(sa ? ['Tenant'] : []),
      'Invoice Number', 'Project Number', 'Amount', 'Payment Mode', 'Payment Date',
      'Reference', 'Notes', 'Created At',
    ];
    const rows = payments.map((p) => {
      const ptid = invoiceTenantMap.get(p.invoiceId) ?? '';
      return [
        ...(sa ? [tenantNameMap.get(ptid) ?? ptid] : []),
        p.invoice.invoiceNumber, p.invoice.project.projectNumber,
        toNum(p.amount), p.mode, fmtDate(p.paymentDate),
        p.reference ?? '', p.notes ?? '', fmtDate(p.createdAt),
      ];
    });
    return { headers, rows };
  }

  if (sheetName === 'Follow-ups') {
    const headers = [
      ...(sa ? ['Tenant'] : []),
      'Project Number', 'Project Name', 'Status', 'Next Follow-up',
      'Last Follow-up', 'Assigned To', 'Notes', 'Created At',
    ];
    const rows = followUps.map((fu) => [
      ...tName(fu.tenantId),
      fu.project?.projectNumber ?? '', fu.project?.name ?? '', fu.status,
      fmtDate(fu.nextFollowUp), fmtDate(fu.lastFollowUp),
      `${fu.owner.firstName} ${fu.owner.lastName}`.trim(),
      fu.notes ?? '', fmtDate(fu.createdAt),
    ]);
    return { headers, rows };
  }

  if (sheetName === 'Documents') {
    const headers = [
      ...(sa ? ['Tenant'] : []),
      'Project Number', 'Project Name', 'File Name', 'File Type', 'File Size (KB)',
      'Version', 'Tags', 'Uploaded By', 'Created At',
    ];
    const rows = documents.map((doc) => [
      ...tName(doc.tenantId),
      doc.project.projectNumber, doc.project.name, doc.originalName, doc.fileType,
      Math.round(Number(doc.fileSize) / 1024),
      doc.version,
      doc.tags.join(', '),
      `${doc.uploadedBy.firstName} ${doc.uploadedBy.lastName}`.trim(),
      fmtDate(doc.createdAt),
    ]);
    return { headers, rows };
  }

  if (sheetName === 'Users') {
    const headers = [
      ...(sa ? ['Tenant'] : []),
      'First Name', 'Last Name', 'Email', 'Phone', 'Roles', 'Is Active', 'Last Login', 'Created At',
    ];
    const rows = users.map((u) => [
      ...(sa ? [tenantNameMap.get(u.tenantId ?? '') ?? u.tenantId ?? ''] : []),
      u.firstName, u.lastName, u.email, u.phone ?? '',
      u.userRoles.map((ur) => ur.role.name).join(', '),
      u.isActive ? 'Yes' : 'No',
      fmtDate(u.lastLoginAt),
      fmtDate(u.createdAt),
    ]);
    return { headers, rows };
  }

  return { headers: [], rows: [] };
}

export const SHEET_NAMES = [
  'Projects',
  'Workflow Templates',
  'Project Stages',
  'Stage Sub-tasks',
  'Project Financials',
  'Payment Milestones',
  'Invoices',
  'Invoice Payments',
  'Follow-ups',
  'Documents',
  'Users',
];

// Build a complete ExcelJS workbook from pre-fetched export data
export function buildExcelWorkbook(data: ExportData, isSuperAdmin: boolean): ExcelJS.Workbook {
  const {
    projects, financials, milestones, invoices, payments,
    followUps, users, allTenants,
    workflowTemplates, projectStages, stageSubTasks, documents,
  } = data;

  const tenantNameMap = new Map(allTenants.map((t) => [t.id, t.name]));
  const invoiceTenantMap = new Map(invoices.map((inv) => [inv.id, inv.tenantId]));
  const userNameMap = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));
  const sa = isSuperAdmin;
  const tCol = (tid: string) => sa ? { tenant: tenantNameMap.get(tid) ?? tid } : {};

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Flowtiq';
  workbook.created = new Date();

  // ── Sheet 1: Projects ────────────────────────────────────────────────────────

  const projSheet = workbook.addWorksheet('Projects');
  projSheet.columns = [
    ...(sa ? [{ header: 'Tenant', key: 'tenant' }] : []),
    { header: 'Project Number', key: 'projectNumber' },
    { header: 'Project Name', key: 'name' },
    { header: 'Status', key: 'status' },
    { header: 'Priority', key: 'priority' },
    { header: 'Client Name', key: 'clientName' },
    { header: 'Location', key: 'location' },
    { header: 'Start Date', key: 'startDate' },
    { header: 'Due Date', key: 'dueDate' },
    { header: 'Completion Date', key: 'completionDate' },
    { header: 'Contract Value', key: 'contractValue' },
    { header: 'Currency', key: 'currency' },
    { header: 'Billing Type', key: 'billingType' },
    { header: 'Owner', key: 'owner' },
    { header: 'Team Members', key: 'teamMembers' },
    { header: 'Created At', key: 'createdAt' },
  ];
  for (const p of projects) {
    projSheet.addRow({
      ...tCol(p.tenantId),
      projectNumber: p.projectNumber, name: p.name, status: p.status, priority: p.priority,
      clientName: p.clientName, location: p.location ?? '',
      startDate: fmtDate(p.startDate), dueDate: fmtDate(p.dueDate), completionDate: fmtDate(p.completionDate),
      contractValue: toNum(p.financial?.contractValue),
      currency: p.financial?.currency ?? 'INR', billingType: p.financial?.billingType ?? '',
      owner: `${p.owner.firstName} ${p.owner.lastName}`.trim(),
      teamMembers: p.teamMembers.length,
      createdAt: fmtDate(p.createdAt),
    });
  }
  applyMoneyFmt(projSheet, ['contractValue']);
  styleHeader(projSheet); autoWidth(projSheet);

  // ── Sheet 2: Workflow Templates ──────────────────────────────────────────────

  const wfSheet = workbook.addWorksheet('Workflow Templates');
  wfSheet.columns = [
    ...(sa ? [{ header: 'Tenant', key: 'tenant' }] : []),
    { header: 'Template Name', key: 'name' },
    { header: 'Description', key: 'description' },
    { header: 'Is Default', key: 'isDefault' },
    { header: 'Is Active', key: 'isActive' },
    { header: 'Stage Count', key: 'stageCount' },
    { header: 'Stage Names', key: 'stageNames' },
    { header: 'Created At', key: 'createdAt' },
  ];
  for (const wf of workflowTemplates) {
    const stages = Array.isArray(wf.stages) ? (wf.stages as Array<Record<string, unknown>>) : [];
    const stageNames = stages
      .map((s) => (s['name'] ?? s['stageName'] ?? s['key'] ?? s['stageKey'] ?? '') as string)
      .filter(Boolean)
      .join(', ');
    wfSheet.addRow({
      ...tCol(wf.tenantId),
      name: wf.name, description: wf.description ?? '',
      isDefault: wf.isDefault ? 'Yes' : 'No', isActive: wf.isActive ? 'Yes' : 'No',
      stageCount: stages.length, stageNames, createdAt: fmtDate(wf.createdAt),
    });
  }
  styleHeader(wfSheet); autoWidth(wfSheet);

  // ── Sheet 3: Project Stages ──────────────────────────────────────────────────

  const stageSheet = workbook.addWorksheet('Project Stages');
  stageSheet.columns = [
    ...(sa ? [{ header: 'Tenant', key: 'tenant' }] : []),
    { header: 'Project Number', key: 'projectNumber' },
    { header: 'Project Name', key: 'projectName' },
    { header: 'Workflow', key: 'workflow' },
    { header: 'Stage Name', key: 'stageName' },
    { header: 'Stage Key', key: 'stageKey' },
    { header: 'Order', key: 'stageOrder' },
    { header: 'Status', key: 'status' },
    { header: 'Is Required', key: 'isRequired' },
    { header: 'Assigned To', key: 'assignedTo' },
    { header: 'Start Date', key: 'startDate' },
    { header: 'Completion Date', key: 'completionDate' },
    { header: 'Notes', key: 'notes' },
    { header: 'Created At', key: 'createdAt' },
  ];
  for (const s of projectStages) {
    stageSheet.addRow({
      ...tCol(s.project.tenantId),
      projectNumber: s.project.projectNumber, projectName: s.project.name,
      workflow: s.projectWorkflow?.name ?? '',
      stageName: s.stageName, stageKey: s.stageKey, stageOrder: s.stageOrder, status: s.status,
      isRequired: s.isRequired ? 'Yes' : 'No',
      assignedTo: s.assignedToIds.map((id) => userNameMap.get(id) ?? id).join(', '),
      startDate: fmtDate(s.startDate), completionDate: fmtDate(s.completionDate),
      notes: s.notes ?? '', createdAt: fmtDate(s.createdAt),
    });
  }
  styleHeader(stageSheet); autoWidth(stageSheet);

  // ── Sheet 4: Stage Sub-tasks ─────────────────────────────────────────────────

  const subTaskSheet = workbook.addWorksheet('Stage Sub-tasks');
  subTaskSheet.columns = [
    ...(sa ? [{ header: 'Tenant', key: 'tenant' }] : []),
    { header: 'Project Number', key: 'projectNumber' },
    { header: 'Project Name', key: 'projectName' },
    { header: 'Stage Name', key: 'stageName' },
    { header: 'Sub-task Name', key: 'name' },
    { header: 'Description', key: 'description' },
    { header: 'Status', key: 'status' },
    { header: 'Is Required', key: 'isRequired' },
    { header: 'Order', key: 'order' },
    { header: 'Notes', key: 'notes' },
    { header: 'Completed At', key: 'completedAt' },
    { header: 'Created At', key: 'createdAt' },
  ];
  for (const st of stageSubTasks) {
    subTaskSheet.addRow({
      ...tCol(st.stage.project.tenantId),
      projectNumber: st.stage.project.projectNumber, projectName: st.stage.project.name,
      stageName: st.stage.stageName, name: st.name, description: st.description ?? '',
      status: st.status, isRequired: st.isRequired ? 'Yes' : 'No', order: st.order,
      notes: st.notes ?? '', completedAt: fmtDate(st.completedAt), createdAt: fmtDate(st.createdAt),
    });
  }
  styleHeader(subTaskSheet); autoWidth(subTaskSheet);

  // ── Sheet 5: Project Financials ──────────────────────────────────────────────

  const finSheet = workbook.addWorksheet('Project Financials');
  finSheet.columns = [
    ...(sa ? [{ header: 'Tenant', key: 'tenant' }] : []),
    { header: 'Project Number', key: 'projectNumber' },
    { header: 'Project Name', key: 'projectName' },
    { header: 'Contract Value', key: 'contractValue' },
    { header: 'Currency', key: 'currency' },
    { header: 'Billing Type', key: 'billingType' },
    { header: 'Notes', key: 'notes' },
    { header: 'Created At', key: 'createdAt' },
  ];
  for (const f of financials) {
    finSheet.addRow({
      ...tCol(f.tenantId),
      projectNumber: f.project.projectNumber, projectName: f.project.name,
      contractValue: toNum(f.contractValue), currency: f.currency,
      billingType: f.billingType, notes: f.notes ?? '', createdAt: fmtDate(f.createdAt),
    });
  }
  applyMoneyFmt(finSheet, ['contractValue']);
  styleHeader(finSheet); autoWidth(finSheet);

  // ── Sheet 6: Payment Milestones ──────────────────────────────────────────────

  const milSheet = workbook.addWorksheet('Payment Milestones');
  milSheet.columns = [
    ...(sa ? [{ header: 'Tenant', key: 'tenant' }] : []),
    { header: 'Project Number', key: 'projectNumber' },
    { header: 'Project Name', key: 'projectName' },
    { header: 'Milestone Name', key: 'name' },
    { header: 'Amount', key: 'amount' },
    { header: 'Status', key: 'status' },
    { header: 'Due Date', key: 'dueDate' },
    { header: 'Linked Stage', key: 'linkedStage' },
    { header: 'Notes', key: 'notes' },
    { header: 'Created At', key: 'createdAt' },
  ];
  for (const m of milestones) {
    milSheet.addRow({
      ...tCol(m.tenantId),
      projectNumber: m.project.projectNumber, projectName: m.project.name,
      name: m.name, amount: toNum(m.amount), status: m.status, dueDate: fmtDate(m.dueDate),
      linkedStage: m.linkedStage?.stageName ?? m.linkedStage?.stageKey ?? '',
      notes: m.notes ?? '', createdAt: fmtDate(m.createdAt),
    });
  }
  applyMoneyFmt(milSheet, ['amount']);
  styleHeader(milSheet); autoWidth(milSheet);

  // ── Sheet 7: Invoices ────────────────────────────────────────────────────────

  const invSheet = workbook.addWorksheet('Invoices');
  invSheet.columns = [
    ...(sa ? [{ header: 'Tenant', key: 'tenant' }] : []),
    { header: 'Invoice Number', key: 'invoiceNumber' },
    { header: 'Project Number', key: 'projectNumber' },
    { header: 'Project Name', key: 'projectName' },
    { header: 'Title', key: 'title' },
    { header: 'Status', key: 'status' },
    { header: 'Issued At', key: 'issuedAt' },
    { header: 'Due Date', key: 'dueDate' },
    { header: 'Amount', key: 'amount' },
    { header: 'Tax Amount', key: 'taxAmount' },
    { header: 'Total Amount', key: 'totalAmount' },
    { header: 'Amount Paid', key: 'amountPaid' },
    { header: 'Outstanding', key: 'outstanding' },
    { header: 'Notes', key: 'notes' },
    { header: 'Created At', key: 'createdAt' },
  ];
  for (const inv of invoices) {
    const totalAmount = toNum(inv.totalAmount);
    const amountPaid = inv.payments.reduce((s, p) => s + toNum(p.amount), 0);
    invSheet.addRow({
      ...tCol(inv.tenantId),
      invoiceNumber: inv.invoiceNumber, projectNumber: inv.project.projectNumber,
      projectName: inv.project.name, title: inv.title, status: inv.status,
      issuedAt: fmtDate(inv.issuedAt), dueDate: fmtDate(inv.dueDate),
      amount: toNum(inv.amount), taxAmount: toNum(inv.taxAmount), totalAmount, amountPaid,
      outstanding: Math.max(0, totalAmount - amountPaid),
      notes: inv.notes ?? '', createdAt: fmtDate(inv.createdAt),
    });
  }
  applyMoneyFmt(invSheet, ['amount', 'taxAmount', 'totalAmount', 'amountPaid', 'outstanding']);
  styleHeader(invSheet); autoWidth(invSheet);

  // ── Sheet 8: Invoice Payments ────────────────────────────────────────────────

  const paySheet = workbook.addWorksheet('Invoice Payments');
  paySheet.columns = [
    ...(sa ? [{ header: 'Tenant', key: 'tenant' }] : []),
    { header: 'Invoice Number', key: 'invoiceNumber' },
    { header: 'Project Number', key: 'projectNumber' },
    { header: 'Amount', key: 'amount' },
    { header: 'Payment Mode', key: 'mode' },
    { header: 'Payment Date', key: 'paymentDate' },
    { header: 'Reference', key: 'reference' },
    { header: 'Notes', key: 'notes' },
    { header: 'Created At', key: 'createdAt' },
  ];
  for (const p of payments) {
    const ptid = invoiceTenantMap.get(p.invoiceId) ?? '';
    paySheet.addRow({
      ...(sa ? { tenant: tenantNameMap.get(ptid) ?? ptid } : {}),
      invoiceNumber: p.invoice.invoiceNumber, projectNumber: p.invoice.project.projectNumber,
      amount: toNum(p.amount), mode: p.mode, paymentDate: fmtDate(p.paymentDate),
      reference: p.reference ?? '', notes: p.notes ?? '', createdAt: fmtDate(p.createdAt),
    });
  }
  applyMoneyFmt(paySheet, ['amount']);
  styleHeader(paySheet); autoWidth(paySheet);

  // ── Sheet 9: Follow-ups ──────────────────────────────────────────────────────

  const fuSheet = workbook.addWorksheet('Follow-ups');
  fuSheet.columns = [
    ...(sa ? [{ header: 'Tenant', key: 'tenant' }] : []),
    { header: 'Project Number', key: 'projectNumber' },
    { header: 'Project Name', key: 'projectName' },
    { header: 'Status', key: 'status' },
    { header: 'Next Follow-up', key: 'nextFollowUp' },
    { header: 'Last Follow-up', key: 'lastFollowUp' },
    { header: 'Assigned To', key: 'assignedTo' },
    { header: 'Notes', key: 'notes' },
    { header: 'Created At', key: 'createdAt' },
  ];
  for (const fu of followUps) {
    fuSheet.addRow({
      ...tCol(fu.tenantId),
      projectNumber: fu.project?.projectNumber ?? '', projectName: fu.project?.name ?? '',
      status: fu.status, nextFollowUp: fmtDate(fu.nextFollowUp), lastFollowUp: fmtDate(fu.lastFollowUp),
      assignedTo: `${fu.owner.firstName} ${fu.owner.lastName}`.trim(),
      notes: fu.notes ?? '', createdAt: fmtDate(fu.createdAt),
    });
  }
  styleHeader(fuSheet); autoWidth(fuSheet);

  // ── Sheet 10: Documents ──────────────────────────────────────────────────────

  const docSheet = workbook.addWorksheet('Documents');
  docSheet.columns = [
    ...(sa ? [{ header: 'Tenant', key: 'tenant' }] : []),
    { header: 'Project Number', key: 'projectNumber' },
    { header: 'Project Name', key: 'projectName' },
    { header: 'File Name', key: 'originalName' },
    { header: 'File Type', key: 'fileType' },
    { header: 'File Size (KB)', key: 'fileSizeKb' },
    { header: 'Version', key: 'version' },
    { header: 'Tags', key: 'tags' },
    { header: 'Uploaded By', key: 'uploadedBy' },
    { header: 'Created At', key: 'createdAt' },
  ];
  for (const doc of documents) {
    docSheet.addRow({
      ...tCol(doc.tenantId),
      projectNumber: doc.project.projectNumber, projectName: doc.project.name,
      originalName: doc.originalName, fileType: doc.fileType,
      fileSizeKb: Math.round(Number(doc.fileSize) / 1024),
      version: doc.version, tags: doc.tags.join(', '),
      uploadedBy: `${doc.uploadedBy.firstName} ${doc.uploadedBy.lastName}`.trim(),
      createdAt: fmtDate(doc.createdAt),
    });
  }
  styleHeader(docSheet); autoWidth(docSheet);

  // ── Sheet 11: Users ──────────────────────────────────────────────────────────

  const userSheet = workbook.addWorksheet('Users');
  userSheet.columns = [
    ...(sa ? [{ header: 'Tenant', key: 'tenant' }] : []),
    { header: 'First Name', key: 'firstName' },
    { header: 'Last Name', key: 'lastName' },
    { header: 'Email', key: 'email' },
    { header: 'Phone', key: 'phone' },
    { header: 'Roles', key: 'roles' },
    { header: 'Is Active', key: 'isActive' },
    { header: 'Last Login', key: 'lastLoginAt' },
    { header: 'Created At', key: 'createdAt' },
  ];
  for (const u of users) {
    userSheet.addRow({
      ...(sa ? { tenant: tenantNameMap.get(u.tenantId ?? '') ?? u.tenantId ?? '' } : {}),
      firstName: u.firstName, lastName: u.lastName, email: u.email, phone: u.phone ?? '',
      roles: u.userRoles.map((ur) => ur.role.name).join(', '),
      isActive: u.isActive ? 'Yes' : 'No',
      lastLoginAt: fmtDate(u.lastLoginAt),
      createdAt: fmtDate(u.createdAt),
    });
  }
  styleHeader(userSheet); autoWidth(userSheet);

  return workbook;
}

// ── GET /api/export/excel ─────────────────────────────────────────────────────

exportRouter.get('/excel', requirePermission('reports:view'), async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const isSuperAdmin = authReq.user.isSuperAdmin;
    const tenantId = authReq.user.tenantId as string | null;
    const today = new Date().toISOString().slice(0, 10);

    const exportData = await fetchExportData(isSuperAdmin ? null : tenantId, isSuperAdmin);
    const workbook = buildExcelWorkbook(exportData, isSuperAdmin);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="flowtiq-export-${today}.xlsx"`,
    );

    await workbook.xlsx.write(res);
    res.end();

    createAuditLog({
      req,
      action: 'EXPORTED',
      module: 'export',
      entityType: 'excel',
      entityName: `flowtiq-export-${today}.xlsx`,
    }).catch(() => {});
  } catch (err) {
    next(err);
  }
});

// ── GET /api/export/google-sheets/config ─────────────────────────────────────

exportRouter.get(
  '/google-sheets/config',
  requirePermission('reports:view'),
  async (req, res, next) => {
    try {
      const authReq = req as AuthRequest;
      const tenantId = authReq.user.tenantId as string;

      const config = await prisma.tenantExportConfig.findUnique({ where: { tenantId } });

      res.json({
        success: true,
        data: {
          googleSpreadsheetId: config?.googleSpreadsheetId ?? null,
          googleSyncEnabled: config?.googleSyncEnabled ?? false,
          hasServiceAccount: !!config?.googleServiceAccountJson,
          lastSyncedAt: config?.lastSyncedAt?.toISOString() ?? null,
          lastSyncStatus: config?.lastSyncStatus ?? null,
          lastSyncError: config?.lastSyncError ?? null,
          backupSchedule: config?.backupSchedule ?? 'off',
          backupScheduleDay: config?.backupScheduleDay ?? null,
          backupScheduleHour: config?.backupScheduleHour ?? 2,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ── PUT /api/export/google-sheets/config ─────────────────────────────────────

exportRouter.put(
  '/google-sheets/config',
  requirePermission('roles:manage'),
  async (req, res, next) => {
    try {
      const authReq = req as AuthRequest;
      const tenantId = authReq.user.tenantId as string;
      const {
        googleServiceAccountJson,
        googleSpreadsheetId,
        googleSyncEnabled,
        backupSchedule,
        backupScheduleDay,
        backupScheduleHour,
      } = req.body as {
        googleServiceAccountJson?: string;
        googleSpreadsheetId?: string;
        googleSyncEnabled?: boolean;
        backupSchedule?: string;
        backupScheduleDay?: number | null;
        backupScheduleHour?: number;
      };

      // Validate service account JSON if provided
      if (googleServiceAccountJson !== undefined) {
        let parsedSA: Record<string, unknown>;
        try {
          parsedSA = JSON.parse(googleServiceAccountJson) as Record<string, unknown>;
        } catch {
          return res.status(400).json({ success: false, error: 'Invalid service account JSON' });
        }
        const required = ['type', 'project_id', 'private_key', 'client_email'];
        const missing = required.filter((k) => !parsedSA[k]);
        if (missing.length > 0) {
          return res.status(400).json({ success: false, error: 'Service account JSON missing required fields' });
        }
      }

      // Validate schedule
      if (backupSchedule === 'weekly' && backupScheduleDay !== undefined && backupScheduleDay !== null) {
        if (backupScheduleDay < 0 || backupScheduleDay > 6) {
          return res.status(400).json({
            success: false,
            error: 'backupScheduleDay must be 0–6 for weekly schedule',
          });
        }
      }

      const existing = await prisma.tenantExportConfig.findUnique({ where: { tenantId } });

      const data: Record<string, unknown> = {};
      if (googleServiceAccountJson !== undefined) data.googleServiceAccountJson = googleServiceAccountJson;
      if (googleSpreadsheetId !== undefined) data.googleSpreadsheetId = googleSpreadsheetId;
      if (googleSyncEnabled !== undefined) data.googleSyncEnabled = googleSyncEnabled;
      if (backupSchedule !== undefined) data.backupSchedule = backupSchedule;
      if (backupScheduleDay !== undefined) data.backupScheduleDay = backupScheduleDay;
      if (backupScheduleHour !== undefined) data.backupScheduleHour = backupScheduleHour;
      if (backupSchedule === 'daily') data.backupScheduleDay = null;

      const config = existing
        ? await prisma.tenantExportConfig.update({ where: { tenantId }, data })
        : await prisma.tenantExportConfig.create({ data: { tenantId, ...data } });

      res.json({
        success: true,
        data: {
          googleSpreadsheetId: config.googleSpreadsheetId ?? null,
          googleSyncEnabled: config.googleSyncEnabled,
          hasServiceAccount: !!config.googleServiceAccountJson,
          lastSyncedAt: config.lastSyncedAt?.toISOString() ?? null,
          lastSyncStatus: config.lastSyncStatus ?? null,
          lastSyncError: config.lastSyncError ?? null,
          backupSchedule: config.backupSchedule,
          backupScheduleDay: config.backupScheduleDay ?? null,
          backupScheduleHour: config.backupScheduleHour,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /api/export/google-sheets/sync ──────────────────────────────────────

exportRouter.post(
  '/google-sheets/sync',
  requirePermission('reports:view'),
  async (req, res, next) => {
    try {
      const authReq = req as AuthRequest;
      const tenantId = authReq.user.tenantId as string;
      const isSuperAdmin = authReq.user.isSuperAdmin;

      const config = await prisma.tenantExportConfig.findUnique({ where: { tenantId } });

      if (!config?.googleServiceAccountJson || !config?.googleSpreadsheetId) {
        return res.status(400).json({
          success: false,
          error: 'Google Sheets not configured. Please add a service account and spreadsheet ID in Settings.',
        });
      }

      let clientEmail = '';
      try {
        const creds = JSON.parse(config.googleServiceAccountJson) as { client_email: string; private_key: string };
        clientEmail = creds.client_email;

        const auth = new google.auth.JWT({
          email: creds.client_email,
          key: creds.private_key,
          scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        const sheets = google.sheets({ version: 'v4', auth });
        const spreadsheetId = config.googleSpreadsheetId;

        const exportData = await fetchExportData(isSuperAdmin ? null : tenantId, isSuperAdmin);

        // Get existing sheet names
        const meta = await sheets.spreadsheets.get({ spreadsheetId });
        const existingTitles = new Set(
          (meta.data.sheets ?? []).map((s) => s.properties?.title ?? ''),
        );

        // Create missing sheets
        const sheetsToCreate = SHEET_NAMES.filter((name) => !existingTitles.has(name));
        if (sheetsToCreate.length > 0) {
          await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: {
              requests: sheetsToCreate.map((title) => ({
                addSheet: { properties: { title } },
              })),
            },
          });
        }

        // Clear + write each sheet
        for (const sheetName of SHEET_NAMES) {
          await sheets.spreadsheets.values.clear({ spreadsheetId, range: sheetName });
          const { headers, rows } = buildSheetRows(sheetName, exportData, isSuperAdmin);
          await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `${sheetName}!A1`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [headers, ...rows] },
          });
        }

        await prisma.tenantExportConfig.update({
          where: { tenantId },
          data: { lastSyncedAt: new Date(), lastSyncStatus: 'success', lastSyncError: null },
        });

        await prisma.tenantBackupRun.create({
          data: {
            tenantId,
            type: 'google_sheets',
            status: 'success',
            sheetsUpdated: SHEET_NAMES.length,
            triggeredBy: 'manual',
          },
        });

        createAuditLog({
          req,
          action: 'EXPORTED',
          module: 'export',
          entityType: 'google_sheets',
          entityName: spreadsheetId,
          metadata: { status: 'success', sheetsUpdated: SHEET_NAMES.length },
        }).catch(() => {});

        return res.json({
          success: true,
          data: { syncedAt: new Date().toISOString(), sheetsUpdated: SHEET_NAMES.length },
        });
      } catch (syncErr) {
        const raw = syncErr instanceof Error ? syncErr.message : String(syncErr);
        const errorMessage = raw.includes('403') || raw.toLowerCase().includes('permission')
          ? `Permission denied. Share the spreadsheet with ${clientEmail} as Editor.`
          : raw;

        await prisma.tenantExportConfig.update({
          where: { tenantId },
          data: { lastSyncedAt: new Date(), lastSyncStatus: 'error', lastSyncError: errorMessage },
        }).catch(() => {});

        await prisma.tenantBackupRun.create({
          data: { tenantId, type: 'google_sheets', status: 'error', errorMessage, triggeredBy: 'manual' },
        }).catch(() => {});

        createAuditLog({
          req,
          action: 'EXPORTED',
          module: 'export',
          entityType: 'google_sheets',
          metadata: { status: 'error' },
        }).catch(() => {});

        return res.status(502).json({
          success: false,
          error: `Google Sheets sync failed: ${errorMessage}`,
        });
      }
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /api/export/backup-runs ───────────────────────────────────────────────

exportRouter.get('/backup-runs', requirePermission('reports:view'), async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const tenantId = authReq.user.tenantId as string;
    const limit = Math.min(50, parseInt((req.query.limit as string) ?? '10', 10));

    const [items, total] = await Promise.all([
      prisma.tenantBackupRun.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      prisma.tenantBackupRun.count({ where: { tenantId } }),
    ]);

    res.json({ success: true, data: { items, total } });
  } catch (err) {
    next(err);
  }
});
