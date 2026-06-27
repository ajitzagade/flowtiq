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
    col.width = Math.min(40, Math.max(12, maxLen + 2));
  });
}

const MONEY_FMT = '#,##0.00';

function applyMoneyFmt(worksheet: ExcelJS.Worksheet, colKeys: string[]): void {
  worksheet.columns.forEach((col) => {
    if (col.key && colKeys.includes(col.key)) {
      col.numFmt = MONEY_FMT;
    }
  });
}

// ── GET /api/export/excel ─────────────────────────────────────────────────────

exportRouter.get('/excel', requirePermission('reports:view'), async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const isSuperAdmin = authReq.user.isSuperAdmin;
    const tenantId = authReq.user.tenantId as string | null;
    const tenantFilter = isSuperAdmin ? {} : { tenantId: tenantId! };

    // ── Fetch all data in parallel ──────────────────────────────────────────

    const [projects, financials, milestones, invoices, followUps, users, allTenants] =
      await Promise.all([
        prisma.project.findMany({
          where: { ...tenantFilter, deletedAt: null, status: { not: 'cancelled' } },
          include: { financial: true },
          orderBy: { createdAt: 'asc' },
        }),
        prisma.projectFinancial.findMany({
          where: tenantFilter,
          include: { project: { select: { projectNumber: true, name: true } } },
          orderBy: { createdAt: 'asc' },
        }),
        prisma.paymentMilestone.findMany({
          where: tenantFilter,
          include: {
            project: { select: { projectNumber: true, name: true } },
            linkedStage: { select: { stageName: true, stageKey: true } },
          },
          orderBy: { createdAt: 'asc' },
        }),
        prisma.invoice.findMany({
          where: tenantFilter,
          include: {
            project: { select: { projectNumber: true, name: true } },
            payments: true,
          },
          orderBy: { createdAt: 'asc' },
        }),
        prisma.followUp.findMany({
          where: tenantFilter,
          include: {
            project: { select: { projectNumber: true, name: true } },
            owner: { select: { firstName: true, lastName: true } },
          },
          orderBy: { createdAt: 'asc' },
        }),
        prisma.user.findMany({
          where: { ...tenantFilter, isActive: true },
          include: { userRoles: { include: { role: { select: { name: true } } } } },
          orderBy: { createdAt: 'asc' },
        }),
        isSuperAdmin
          ? prisma.tenant.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } })
          : Promise.resolve([]),
      ]);

    // Collect all invoice payment records (no tenantId on model — filter via invoice tenantId)
    const invoiceIds = invoices.map((inv) => inv.id);
    const payments = await prisma.invoicePayment.findMany({
      where: { invoiceId: { in: invoiceIds } },
      include: { invoice: { select: { invoiceNumber: true, project: { select: { projectNumber: true } } } } },
      orderBy: { paymentDate: 'asc' },
    });

    const tenantNameMap = new Map(allTenants.map((t) => [t.id, t.name]));
    const tCol = (tid: string) =>
      isSuperAdmin ? { tenant: tenantNameMap.get(tid) ?? tid } : {};

    const today = new Date().toISOString().slice(0, 10);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Flowtiq';
    workbook.created = new Date();

    // ── Sheet 1: Projects ──────────────────────────────────────────────────

    const projSheet = workbook.addWorksheet('Projects');
    projSheet.columns = [
      ...(isSuperAdmin ? [{ header: 'Tenant', key: 'tenant' }] : []),
      { header: 'Project Number', key: 'projectNumber' },
      { header: 'Project Name', key: 'name' },
      { header: 'Status', key: 'status' },
      { header: 'Priority', key: 'priority' },
      { header: 'Client Name', key: 'clientName' },
      { header: 'Start Date', key: 'startDate' },
      { header: 'Due Date', key: 'dueDate' },
      { header: 'Contract Value', key: 'contractValue' },
      { header: 'Currency', key: 'currency' },
      { header: 'Billing Type', key: 'billingType' },
      { header: 'Created At', key: 'createdAt' },
    ];

    for (const p of projects) {
      projSheet.addRow({
        ...tCol(p.tenantId),
        projectNumber: p.projectNumber,
        name: p.name,
        status: p.status,
        priority: p.priority,
        clientName: p.clientName,
        startDate: fmtDate(p.startDate),
        dueDate: fmtDate(p.dueDate),
        contractValue: toNum(p.financial?.contractValue),
        currency: p.financial?.currency ?? 'INR',
        billingType: p.financial?.billingType ?? '',
        createdAt: fmtDate(p.createdAt),
      });
    }

    applyMoneyFmt(projSheet, ['contractValue']);
    styleHeader(projSheet);
    autoWidth(projSheet);

    // ── Sheet 2: Project Financials ────────────────────────────────────────

    const finSheet = workbook.addWorksheet('Project Financials');
    finSheet.columns = [
      ...(isSuperAdmin ? [{ header: 'Tenant', key: 'tenant' }] : []),
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
        projectNumber: f.project.projectNumber,
        projectName: f.project.name,
        contractValue: toNum(f.contractValue),
        currency: f.currency,
        billingType: f.billingType,
        notes: f.notes ?? '',
        createdAt: fmtDate(f.createdAt),
      });
    }

    applyMoneyFmt(finSheet, ['contractValue']);
    styleHeader(finSheet);
    autoWidth(finSheet);

    // ── Sheet 3: Payment Milestones ────────────────────────────────────────

    const milSheet = workbook.addWorksheet('Payment Milestones');
    milSheet.columns = [
      ...(isSuperAdmin ? [{ header: 'Tenant', key: 'tenant' }] : []),
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
        projectNumber: m.project.projectNumber,
        projectName: m.project.name,
        name: m.name,
        amount: toNum(m.amount),
        status: m.status,
        dueDate: fmtDate(m.dueDate),
        linkedStage: m.linkedStage?.stageName ?? m.linkedStage?.stageKey ?? '',
        notes: m.notes ?? '',
        createdAt: fmtDate(m.createdAt),
      });
    }

    applyMoneyFmt(milSheet, ['amount']);
    styleHeader(milSheet);
    autoWidth(milSheet);

    // ── Sheet 4: Invoices ──────────────────────────────────────────────────

    const invSheet = workbook.addWorksheet('Invoices');
    invSheet.columns = [
      ...(isSuperAdmin ? [{ header: 'Tenant', key: 'tenant' }] : []),
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
        invoiceNumber: inv.invoiceNumber,
        projectNumber: inv.project.projectNumber,
        projectName: inv.project.name,
        title: inv.title,
        status: inv.status,
        issuedAt: fmtDate(inv.issuedAt),
        dueDate: fmtDate(inv.dueDate),
        amount: toNum(inv.amount),
        taxAmount: toNum(inv.taxAmount),
        totalAmount,
        amountPaid,
        outstanding: Math.max(0, totalAmount - amountPaid),
        notes: inv.notes ?? '',
        createdAt: fmtDate(inv.createdAt),
      });
    }

    applyMoneyFmt(invSheet, ['amount', 'taxAmount', 'totalAmount', 'amountPaid', 'outstanding']);
    styleHeader(invSheet);
    autoWidth(invSheet);

    // ── Sheet 5: Invoice Payments ──────────────────────────────────────────

    const paySheet = workbook.addWorksheet('Invoice Payments');
    paySheet.columns = [
      ...(isSuperAdmin ? [{ header: 'Tenant', key: 'tenant' }] : []),
      { header: 'Invoice Number', key: 'invoiceNumber' },
      { header: 'Project Number', key: 'projectNumber' },
      { header: 'Amount', key: 'amount' },
      { header: 'Payment Mode', key: 'mode' },
      { header: 'Payment Date', key: 'paymentDate' },
      { header: 'Reference', key: 'reference' },
      { header: 'Notes', key: 'notes' },
      { header: 'Created At', key: 'createdAt' },
    ];

    // tenantId for super-admin display: derive from invoice via the already-fetched invoice map
    const invoiceTenantMap = new Map(invoices.map((inv) => [inv.id, inv.tenantId]));

    for (const p of payments) {
      const ptid = invoiceTenantMap.get(p.invoiceId) ?? '';
      paySheet.addRow({
        ...(isSuperAdmin ? { tenant: tenantNameMap.get(ptid) ?? ptid } : {}),
        invoiceNumber: p.invoice.invoiceNumber,
        projectNumber: p.invoice.project.projectNumber,
        amount: toNum(p.amount),
        mode: p.mode,
        paymentDate: fmtDate(p.paymentDate),
        reference: p.reference ?? '',
        notes: p.notes ?? '',
        createdAt: fmtDate(p.createdAt),
      });
    }

    applyMoneyFmt(paySheet, ['amount']);
    styleHeader(paySheet);
    autoWidth(paySheet);

    // ── Sheet 6: Follow-ups ────────────────────────────────────────────────

    const fuSheet = workbook.addWorksheet('Follow-ups');
    fuSheet.columns = [
      ...(isSuperAdmin ? [{ header: 'Tenant', key: 'tenant' }] : []),
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
        projectNumber: fu.project?.projectNumber ?? '',
        projectName: fu.project?.name ?? '',
        status: fu.status,
        nextFollowUp: fmtDate(fu.nextFollowUp),
        lastFollowUp: fmtDate(fu.lastFollowUp),
        assignedTo: `${fu.owner.firstName} ${fu.owner.lastName}`.trim(),
        notes: fu.notes ?? '',
        createdAt: fmtDate(fu.createdAt),
      });
    }

    styleHeader(fuSheet);
    autoWidth(fuSheet);

    // ── Sheet 7: Users ─────────────────────────────────────────────────────

    const userSheet = workbook.addWorksheet('Users');
    userSheet.columns = [
      ...(isSuperAdmin ? [{ header: 'Tenant', key: 'tenant' }] : []),
      { header: 'First Name', key: 'firstName' },
      { header: 'Last Name', key: 'lastName' },
      { header: 'Email', key: 'email' },
      { header: 'Roles', key: 'roles' },
      { header: 'Is Active', key: 'isActive' },
      { header: 'Created At', key: 'createdAt' },
    ];

    for (const u of users) {
      userSheet.addRow({
        ...(isSuperAdmin ? { tenant: tenantNameMap.get(u.tenantId ?? '') ?? u.tenantId ?? '' } : {}),
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        roles: u.userRoles.map((ur) => ur.role.name).join(', '),
        isActive: u.isActive ? 'Yes' : 'No',
        createdAt: fmtDate(u.createdAt),
      });
    }

    styleHeader(userSheet);
    autoWidth(userSheet);

    // ── Stream response ────────────────────────────────────────────────────

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

    // Audit log — fire-and-forget after response
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

// ── Shared: build sheet rows from DB data ─────────────────────────────────────

export async function fetchExportData(tenantId: string | null, isSuperAdmin: boolean) {
  const tenantFilter = isSuperAdmin ? {} : { tenantId: tenantId! };

  const [projects, financials, milestones, invoices, followUps, users, allTenants] =
    await Promise.all([
      prisma.project.findMany({
        where: { ...tenantFilter, deletedAt: null, status: { not: 'cancelled' } },
        include: { financial: true },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.projectFinancial.findMany({
        where: tenantFilter,
        include: { project: { select: { projectNumber: true, name: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.paymentMilestone.findMany({
        where: tenantFilter,
        include: {
          project: { select: { projectNumber: true, name: true } },
          linkedStage: { select: { stageName: true, stageKey: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.invoice.findMany({
        where: tenantFilter,
        include: {
          project: { select: { projectNumber: true, name: true } },
          payments: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.followUp.findMany({
        where: tenantFilter,
        include: {
          project: { select: { projectNumber: true, name: true } },
          owner: { select: { firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.user.findMany({
        where: { ...tenantFilter, isActive: true },
        include: { userRoles: { include: { role: { select: { name: true } } } } },
        orderBy: { createdAt: 'asc' },
      }),
      isSuperAdmin
        ? prisma.tenant.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } })
        : Promise.resolve([]),
    ]);

  const invoiceIds = invoices.map((inv) => inv.id);
  const payments = await prisma.invoicePayment.findMany({
    where: { invoiceId: { in: invoiceIds } },
    include: { invoice: { select: { invoiceNumber: true, project: { select: { projectNumber: true } } } } },
    orderBy: { paymentDate: 'asc' },
  });

  return { projects, financials, milestones, invoices, payments, followUps, users, allTenants };
}

// Build 2D array rows for a given sheet name
export type ExportData = Awaited<ReturnType<typeof fetchExportData>>;

export function buildSheetRows(
  sheetName: string,
  data: ExportData,
  isSuperAdmin: boolean,
): { headers: string[]; rows: (string | number)[][] } {
  const { projects, financials, milestones, invoices, payments, followUps, users, allTenants } = data;
  const tenantNameMap = new Map(allTenants.map((t) => [t.id, t.name]));
  const invoiceTenantMap = new Map(invoices.map((inv) => [inv.id, inv.tenantId]));
  const sa = isSuperAdmin;
  const tName = (tid: string) => (sa ? [tenantNameMap.get(tid) ?? tid] : []);

  if (sheetName === 'Projects') {
    const headers = [
      ...(sa ? ['Tenant'] : []),
      'Project Number', 'Project Name', 'Status', 'Priority', 'Client Name',
      'Start Date', 'Due Date', 'Contract Value', 'Currency', 'Billing Type', 'Created At',
    ];
    const rows = projects.map((p) => [
      ...tName(p.tenantId),
      p.projectNumber, p.name, p.status, p.priority, p.clientName,
      fmtDate(p.startDate), fmtDate(p.dueDate),
      toNum(p.financial?.contractValue),
      p.financial?.currency ?? 'INR',
      p.financial?.billingType ?? '',
      fmtDate(p.createdAt),
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

  if (sheetName === 'Users') {
    const headers = [
      ...(sa ? ['Tenant'] : []),
      'First Name', 'Last Name', 'Email', 'Roles', 'Is Active', 'Created At',
    ];
    const rows = users.map((u) => [
      ...(sa ? [tenantNameMap.get(u.tenantId ?? '') ?? u.tenantId ?? ''] : []),
      u.firstName, u.lastName, u.email,
      u.userRoles.map((ur) => ur.role.name).join(', '),
      u.isActive ? 'Yes' : 'No',
      fmtDate(u.createdAt),
    ]);
    return { headers, rows };
  }

  return { headers: [], rows: [] };
}

export const SHEET_NAMES = [
  'Projects', 'Project Financials', 'Payment Milestones',
  'Invoices', 'Invoice Payments', 'Follow-ups', 'Users',
];

// Build a complete ExcelJS workbook from pre-fetched export data (used by scheduled backup job)
export function buildExcelWorkbook(data: ExportData, isSuperAdmin: boolean): ExcelJS.Workbook {
  const { projects, financials, milestones, invoices, payments, followUps, users, allTenants } = data;
  const tenantNameMap = new Map(allTenants.map((t) => [t.id, t.name]));
  const tCol = (tid: string) => isSuperAdmin ? { tenant: tenantNameMap.get(tid) ?? tid } : {};
  const invoiceTenantMap = new Map(invoices.map((inv) => [inv.id, inv.tenantId]));

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Flowtiq';
  workbook.created = new Date();

  // Sheet 1: Projects
  const projSheet = workbook.addWorksheet('Projects');
  projSheet.columns = [
    ...(isSuperAdmin ? [{ header: 'Tenant', key: 'tenant' }] : []),
    { header: 'Project Number', key: 'projectNumber' }, { header: 'Project Name', key: 'name' },
    { header: 'Status', key: 'status' }, { header: 'Priority', key: 'priority' },
    { header: 'Client Name', key: 'clientName' }, { header: 'Start Date', key: 'startDate' },
    { header: 'Due Date', key: 'dueDate' }, { header: 'Contract Value', key: 'contractValue' },
    { header: 'Currency', key: 'currency' }, { header: 'Billing Type', key: 'billingType' },
    { header: 'Created At', key: 'createdAt' },
  ];
  for (const p of projects) {
    projSheet.addRow({
      ...tCol(p.tenantId), projectNumber: p.projectNumber, name: p.name, status: p.status,
      priority: p.priority, clientName: p.clientName, startDate: fmtDate(p.startDate),
      dueDate: fmtDate(p.dueDate), contractValue: toNum(p.financial?.contractValue),
      currency: p.financial?.currency ?? 'INR', billingType: p.financial?.billingType ?? '',
      createdAt: fmtDate(p.createdAt),
    });
  }
  applyMoneyFmt(projSheet, ['contractValue']); styleHeader(projSheet); autoWidth(projSheet);

  // Sheet 2: Project Financials
  const finSheet = workbook.addWorksheet('Project Financials');
  finSheet.columns = [
    ...(isSuperAdmin ? [{ header: 'Tenant', key: 'tenant' }] : []),
    { header: 'Project Number', key: 'projectNumber' }, { header: 'Project Name', key: 'projectName' },
    { header: 'Contract Value', key: 'contractValue' }, { header: 'Currency', key: 'currency' },
    { header: 'Billing Type', key: 'billingType' }, { header: 'Notes', key: 'notes' },
    { header: 'Created At', key: 'createdAt' },
  ];
  for (const f of financials) {
    finSheet.addRow({
      ...tCol(f.tenantId), projectNumber: f.project.projectNumber, projectName: f.project.name,
      contractValue: toNum(f.contractValue), currency: f.currency, billingType: f.billingType,
      notes: f.notes ?? '', createdAt: fmtDate(f.createdAt),
    });
  }
  applyMoneyFmt(finSheet, ['contractValue']); styleHeader(finSheet); autoWidth(finSheet);

  // Sheet 3: Payment Milestones
  const milSheet = workbook.addWorksheet('Payment Milestones');
  milSheet.columns = [
    ...(isSuperAdmin ? [{ header: 'Tenant', key: 'tenant' }] : []),
    { header: 'Project Number', key: 'projectNumber' }, { header: 'Project Name', key: 'projectName' },
    { header: 'Milestone Name', key: 'name' }, { header: 'Amount', key: 'amount' },
    { header: 'Status', key: 'status' }, { header: 'Due Date', key: 'dueDate' },
    { header: 'Linked Stage', key: 'linkedStage' }, { header: 'Notes', key: 'notes' },
    { header: 'Created At', key: 'createdAt' },
  ];
  for (const m of milestones) {
    milSheet.addRow({
      ...tCol(m.tenantId), projectNumber: m.project.projectNumber, projectName: m.project.name,
      name: m.name, amount: toNum(m.amount), status: m.status, dueDate: fmtDate(m.dueDate),
      linkedStage: m.linkedStage?.stageName ?? m.linkedStage?.stageKey ?? '',
      notes: m.notes ?? '', createdAt: fmtDate(m.createdAt),
    });
  }
  applyMoneyFmt(milSheet, ['amount']); styleHeader(milSheet); autoWidth(milSheet);

  // Sheet 4: Invoices
  const invSheet = workbook.addWorksheet('Invoices');
  invSheet.columns = [
    ...(isSuperAdmin ? [{ header: 'Tenant', key: 'tenant' }] : []),
    { header: 'Invoice Number', key: 'invoiceNumber' }, { header: 'Project Number', key: 'projectNumber' },
    { header: 'Project Name', key: 'projectName' }, { header: 'Title', key: 'title' },
    { header: 'Status', key: 'status' }, { header: 'Issued At', key: 'issuedAt' },
    { header: 'Due Date', key: 'dueDate' }, { header: 'Amount', key: 'amount' },
    { header: 'Tax Amount', key: 'taxAmount' }, { header: 'Total Amount', key: 'totalAmount' },
    { header: 'Amount Paid', key: 'amountPaid' }, { header: 'Outstanding', key: 'outstanding' },
    { header: 'Notes', key: 'notes' }, { header: 'Created At', key: 'createdAt' },
  ];
  for (const inv of invoices) {
    const totalAmount = toNum(inv.totalAmount);
    const amountPaid = inv.payments.reduce((s, p) => s + toNum(p.amount), 0);
    invSheet.addRow({
      ...tCol(inv.tenantId), invoiceNumber: inv.invoiceNumber, projectNumber: inv.project.projectNumber,
      projectName: inv.project.name, title: inv.title, status: inv.status,
      issuedAt: fmtDate(inv.issuedAt), dueDate: fmtDate(inv.dueDate),
      amount: toNum(inv.amount), taxAmount: toNum(inv.taxAmount), totalAmount, amountPaid,
      outstanding: Math.max(0, totalAmount - amountPaid), notes: inv.notes ?? '',
      createdAt: fmtDate(inv.createdAt),
    });
  }
  applyMoneyFmt(invSheet, ['amount', 'taxAmount', 'totalAmount', 'amountPaid', 'outstanding']);
  styleHeader(invSheet); autoWidth(invSheet);

  // Sheet 5: Invoice Payments
  const paySheet = workbook.addWorksheet('Invoice Payments');
  paySheet.columns = [
    ...(isSuperAdmin ? [{ header: 'Tenant', key: 'tenant' }] : []),
    { header: 'Invoice Number', key: 'invoiceNumber' }, { header: 'Project Number', key: 'projectNumber' },
    { header: 'Amount', key: 'amount' }, { header: 'Payment Mode', key: 'mode' },
    { header: 'Payment Date', key: 'paymentDate' }, { header: 'Reference', key: 'reference' },
    { header: 'Notes', key: 'notes' }, { header: 'Created At', key: 'createdAt' },
  ];
  for (const p of payments) {
    const ptid = invoiceTenantMap.get(p.invoiceId) ?? '';
    paySheet.addRow({
      ...(isSuperAdmin ? { tenant: tenantNameMap.get(ptid) ?? ptid } : {}),
      invoiceNumber: p.invoice.invoiceNumber, projectNumber: p.invoice.project.projectNumber,
      amount: toNum(p.amount), mode: p.mode, paymentDate: fmtDate(p.paymentDate),
      reference: p.reference ?? '', notes: p.notes ?? '', createdAt: fmtDate(p.createdAt),
    });
  }
  applyMoneyFmt(paySheet, ['amount']); styleHeader(paySheet); autoWidth(paySheet);

  // Sheet 6: Follow-ups
  const fuSheet = workbook.addWorksheet('Follow-ups');
  fuSheet.columns = [
    ...(isSuperAdmin ? [{ header: 'Tenant', key: 'tenant' }] : []),
    { header: 'Project Number', key: 'projectNumber' }, { header: 'Project Name', key: 'projectName' },
    { header: 'Status', key: 'status' }, { header: 'Next Follow-up', key: 'nextFollowUp' },
    { header: 'Last Follow-up', key: 'lastFollowUp' }, { header: 'Assigned To', key: 'assignedTo' },
    { header: 'Notes', key: 'notes' }, { header: 'Created At', key: 'createdAt' },
  ];
  for (const fu of followUps) {
    fuSheet.addRow({
      ...tCol(fu.tenantId), projectNumber: fu.project?.projectNumber ?? '',
      projectName: fu.project?.name ?? '', status: fu.status,
      nextFollowUp: fmtDate(fu.nextFollowUp), lastFollowUp: fmtDate(fu.lastFollowUp),
      assignedTo: `${fu.owner.firstName} ${fu.owner.lastName}`.trim(),
      notes: fu.notes ?? '', createdAt: fmtDate(fu.createdAt),
    });
  }
  styleHeader(fuSheet); autoWidth(fuSheet);

  // Sheet 7: Users
  const userSheet = workbook.addWorksheet('Users');
  userSheet.columns = [
    ...(isSuperAdmin ? [{ header: 'Tenant', key: 'tenant' }] : []),
    { header: 'First Name', key: 'firstName' }, { header: 'Last Name', key: 'lastName' },
    { header: 'Email', key: 'email' }, { header: 'Roles', key: 'roles' },
    { header: 'Is Active', key: 'isActive' }, { header: 'Created At', key: 'createdAt' },
  ];
  for (const u of users) {
    userSheet.addRow({
      ...(isSuperAdmin ? { tenant: tenantNameMap.get(u.tenantId ?? '') ?? u.tenantId ?? '' } : {}),
      firstName: u.firstName, lastName: u.lastName, email: u.email,
      roles: u.userRoles.map((ur) => ur.role.name).join(', '),
      isActive: u.isActive ? 'Yes' : 'No', createdAt: fmtDate(u.createdAt),
    });
  }
  styleHeader(userSheet); autoWidth(userSheet);

  return workbook;
}

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
      let parsedSA: Record<string, unknown> | null = null;
      if (googleServiceAccountJson !== undefined) {
        try {
          parsedSA = JSON.parse(googleServiceAccountJson) as Record<string, unknown>;
        } catch {
          return res.status(400).json({ success: false, error: 'Invalid service account JSON' });
        }
        const required = ['type', 'project_id', 'private_key', 'client_email'];
        const missing = required.filter((k) => !parsedSA![k]);
        if (missing.length > 0) {
          return res.status(400).json({
            success: false,
            error: 'Service account JSON missing required fields',
          });
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

        // Fetch data
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
          await sheets.spreadsheets.values.clear({
            spreadsheetId,
            range: sheetName,
          });

          const { headers, rows } = buildSheetRows(sheetName, exportData, isSuperAdmin);
          await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `${sheetName}!A1`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [headers, ...rows] },
          });
        }

        // Update sync status
        await prisma.tenantExportConfig.update({
          where: { tenantId },
          data: { lastSyncedAt: new Date(), lastSyncStatus: 'success', lastSyncError: null },
        });

        // Record backup run
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
        // Friendly permission error
        const errorMessage = raw.includes('403') || raw.toLowerCase().includes('permission')
          ? `Permission denied. Share the spreadsheet with ${clientEmail} as Editor.`
          : raw;

        await prisma.tenantExportConfig.update({
          where: { tenantId },
          data: { lastSyncedAt: new Date(), lastSyncStatus: 'error', lastSyncError: errorMessage },
        }).catch(() => {});

        await prisma.tenantBackupRun.create({
          data: {
            tenantId,
            type: 'google_sheets',
            status: 'error',
            errorMessage,
            triggeredBy: 'manual',
          },
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
    const limit = Math.min(50, parseInt(req.query.limit as string ?? '10', 10));

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
