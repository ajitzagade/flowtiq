import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { createAuditLog } from '../lib/audit';

export const financeRouter = Router();
financeRouter.use(authenticate);

// ── Helpers ─────────────────────────────────────

function toNum(d: unknown): number {
  return parseFloat(String(d ?? 0));
}

function tenantScope(req: AuthRequest) {
  return req.user.tenantId as string;
}

async function computeSummary(projectId: string, tenantId: string) {
  const [financial, invoices] = await Promise.all([
    prisma.projectFinancial.findUnique({ where: { projectId } }),
    prisma.invoice.findMany({
      where: { projectId, tenantId, status: { not: 'cancelled' } },
      include: { payments: true },
    }),
  ]);

  const contractValue = toNum(financial?.contractValue);
  const currency = financial?.currency ?? 'INR';
  const totalInvoiced = invoices.reduce((s, inv) => s + toNum(inv.totalAmount), 0);
  const totalReceived = invoices.reduce(
    (s, inv) => s + inv.payments.reduce((ps, p) => ps + toNum(p.amount), 0),
    0,
  );
  return {
    totalContractValue: contractValue,
    totalInvoiced,
    totalReceived,
    outstanding: totalInvoiced - totalReceived,
    currency,
  };
}

// ── GET /api/finance/:projectId ──────────────────
// Full finance snapshot for a project
financeRouter.get('/:projectId', requirePermission('projects:view'), async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const tenantId = tenantScope(authReq);
    const { projectId } = req.params;

    const project = await prisma.project.findFirst({ where: { id: projectId, tenantId } });
    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }

    const [financial, milestones, invoicesRaw, summary] = await Promise.all([
      prisma.projectFinancial.findUnique({ where: { projectId } }),
      prisma.paymentMilestone.findMany({
        where: { projectId, tenantId },
        orderBy: { createdAt: 'asc' },
        include: { linkedStage: { select: { id: true, stageName: true, stageKey: true, status: true } } },
      }),
      prisma.invoice.findMany({
        where: { projectId, tenantId },
        orderBy: { createdAt: 'desc' },
        include: { payments: { orderBy: { paymentDate: 'asc' } } },
      }),
      computeSummary(projectId, tenantId),
    ]);

    const invoices = invoicesRaw.map((inv) => {
      const totalPaid = inv.payments.reduce((s, p) => s + toNum(p.amount), 0);
      return { ...inv, totalPaid, outstanding: toNum(inv.totalAmount) - totalPaid };
    });

    res.json({ success: true, data: { financial, milestones, invoices, summary } });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/finance/:projectId/contract ───────
// Upsert project financial (contract setup)
const contractSchema = z.object({
  contractValue: z.number().min(0),
  currency: z.string().default('INR'),
  billingType: z.enum(['milestone', 'time_material', 'fixed']).default('milestone'),
  notes: z.string().optional(),
});

financeRouter.post('/:projectId/contract', requirePermission('projects:edit'), async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const tenantId = tenantScope(authReq);
    const { projectId } = req.params;
    const data = contractSchema.parse(req.body);

    const project = await prisma.project.findFirst({ where: { id: projectId, tenantId } });
    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }

    const financial = await prisma.projectFinancial.upsert({
      where: { projectId },
      create: { projectId, tenantId, ...data },
      update: data,
    });

    await createAuditLog({
      req: authReq,
      action: 'UPDATED',
      module: 'finance',
      entityId: projectId,
      entityType: 'project_financial',
      entityName: project.name,
      metadata: { contractValue: data.contractValue, currency: data.currency },
    });

    res.json({ success: true, data: financial });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/finance/:projectId/milestones ──────
const milestoneSchema = z.object({
  name: z.string().min(1),
  amount: z.number().min(0),
  percentage: z.number().min(0).max(100).optional(),
  linkedStageId: z.string().optional().nullable(),
  dueDate: z.string().optional(),
  notes: z.string().optional(),
});

financeRouter.post('/:projectId/milestones', requirePermission('projects:edit'), async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const tenantId = tenantScope(authReq);
    const { projectId } = req.params;
    const data = milestoneSchema.parse(req.body);

    const project = await prisma.project.findFirst({ where: { id: projectId, tenantId } });
    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }

    const milestone = await prisma.paymentMilestone.create({
      data: {
        projectId,
        tenantId,
        name: data.name,
        amount: data.amount,
        ...(data.percentage !== undefined && { percentage: data.percentage }),
        ...(data.linkedStageId && { linkedStageId: data.linkedStageId }),
        ...(data.dueDate && { dueDate: new Date(data.dueDate) }),
        ...(data.notes && { notes: data.notes }),
      },
      include: { linkedStage: { select: { id: true, stageName: true, stageKey: true, status: true } } },
    });

    await createAuditLog({
      req: authReq,
      action: 'CREATED',
      module: 'finance',
      entityId: milestone.id,
      entityType: 'payment_milestone',
      entityName: milestone.name,
      metadata: { projectId, projectName: project.name },
    });

    res.status(201).json({ success: true, data: milestone });
  } catch (err) {
    next(err);
  }
});

// ── PATCH /api/finance/milestones/:id ───────────
const milestoneUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  amount: z.number().min(0).optional(),
  percentage: z.number().min(0).max(100).optional().nullable(),
  linkedStageId: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  status: z.enum(['pending', 'due', 'invoiced', 'paid']).optional(),
  notes: z.string().optional().nullable(),
});

financeRouter.patch('/milestones/:id', requirePermission('projects:edit'), async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const tenantId = tenantScope(authReq);
    const data = milestoneUpdateSchema.parse(req.body);

    const existing = await prisma.paymentMilestone.findFirst({
      where: { id: req.params.id, tenantId },
    });
    if (!existing) {
      res.status(404).json({ success: false, error: 'Milestone not found' });
      return;
    }

    const updated = await prisma.paymentMilestone.update({
      where: { id: req.params.id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.amount !== undefined && { amount: data.amount }),
        ...(data.percentage !== undefined && { percentage: data.percentage }),
        ...(data.linkedStageId !== undefined && { linkedStageId: data.linkedStageId }),
        ...(data.dueDate !== undefined && { dueDate: data.dueDate ? new Date(data.dueDate) : null }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.notes !== undefined && { notes: data.notes }),
      },
      include: { linkedStage: { select: { id: true, stageName: true, stageKey: true, status: true } } },
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/finance/milestones/:id ──────────
financeRouter.delete('/milestones/:id', requirePermission('projects:edit'), async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const tenantId = tenantScope(authReq);

    const existing = await prisma.paymentMilestone.findFirst({
      where: { id: req.params.id, tenantId },
    });
    if (!existing) {
      res.status(404).json({ success: false, error: 'Milestone not found' });
      return;
    }

    await prisma.paymentMilestone.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: 'Milestone deleted' });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/finance/:projectId/invoices ────────
const invoiceSchema = z.object({
  invoiceNumber: z.string().min(1),
  title: z.string().min(1),
  amount: z.number().min(0),
  taxAmount: z.number().min(0).default(0),
  dueDate: z.string().optional(),
  notes: z.string().optional(),
});

financeRouter.post('/:projectId/invoices', requirePermission('projects:edit'), async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const tenantId = tenantScope(authReq);
    const { projectId } = req.params;
    const data = invoiceSchema.parse(req.body);

    const project = await prisma.project.findFirst({ where: { id: projectId, tenantId } });
    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }

    // Check unique invoice number within tenant
    const existing = await prisma.invoice.findUnique({
      where: { tenantId_invoiceNumber: { tenantId, invoiceNumber: data.invoiceNumber } },
    });
    if (existing) {
      res.status(409).json({ success: false, error: 'Invoice number already exists' });
      return;
    }

    const totalAmount = data.amount + data.taxAmount;
    const invoice = await prisma.invoice.create({
      data: {
        projectId,
        tenantId,
        invoiceNumber: data.invoiceNumber,
        title: data.title,
        amount: data.amount,
        taxAmount: data.taxAmount,
        totalAmount,
        ...(data.dueDate && { dueDate: new Date(data.dueDate) }),
        ...(data.notes && { notes: data.notes }),
      },
      include: { payments: true },
    });

    await createAuditLog({
      req: authReq,
      action: 'CREATED',
      module: 'finance',
      entityId: invoice.id,
      entityType: 'invoice',
      entityName: invoice.invoiceNumber,
      metadata: { projectId, projectName: project.name, amount: totalAmount },
    });

    res.status(201).json({ success: true, data: { ...invoice, totalPaid: 0, outstanding: totalAmount } });
  } catch (err) {
    next(err);
  }
});

// ── PATCH /api/finance/invoices/:id ─────────────
const invoiceUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  amount: z.number().min(0).optional(),
  taxAmount: z.number().min(0).optional(),
  dueDate: z.string().optional().nullable(),
  status: z.enum(['draft', 'sent', 'partial', 'paid', 'cancelled']).optional(),
  notes: z.string().optional().nullable(),
  issuedAt: z.string().optional().nullable(),
});

financeRouter.patch('/invoices/:id', requirePermission('projects:edit'), async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const tenantId = tenantScope(authReq);
    const data = invoiceUpdateSchema.parse(req.body);

    const existing = await prisma.invoice.findFirst({
      where: { id: req.params.id, tenantId },
      include: { payments: true },
    });
    if (!existing) {
      res.status(404).json({ success: false, error: 'Invoice not found' });
      return;
    }

    const newAmount = data.amount ?? toNum(existing.amount);
    const newTax = data.taxAmount ?? toNum(existing.taxAmount);
    const totalAmount = (data.amount !== undefined || data.taxAmount !== undefined)
      ? newAmount + newTax
      : undefined;

    const updated = await prisma.invoice.update({
      where: { id: req.params.id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.amount !== undefined && { amount: data.amount }),
        ...(data.taxAmount !== undefined && { taxAmount: data.taxAmount }),
        ...(totalAmount !== undefined && { totalAmount }),
        ...(data.dueDate !== undefined && { dueDate: data.dueDate ? new Date(data.dueDate) : null }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.notes !== undefined && { notes: data.notes }),
        ...(data.issuedAt !== undefined && { issuedAt: data.issuedAt ? new Date(data.issuedAt) : null }),
      },
      include: { payments: { orderBy: { paymentDate: 'asc' } } },
    });

    const totalPaid = updated.payments.reduce((s, p) => s + toNum(p.amount), 0);
    res.json({ success: true, data: { ...updated, totalPaid, outstanding: toNum(updated.totalAmount) - totalPaid } });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/finance/invoices/:id ────────────
financeRouter.delete('/invoices/:id', requirePermission('projects:edit'), async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const tenantId = tenantScope(authReq);

    const existing = await prisma.invoice.findFirst({
      where: { id: req.params.id, tenantId },
    });
    if (!existing) {
      res.status(404).json({ success: false, error: 'Invoice not found' });
      return;
    }

    await prisma.invoice.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: 'Invoice deleted' });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/finance/invoices/:id/payments ──────
const paymentSchema = z.object({
  amount: z.number().positive(),
  paymentDate: z.string(),
  mode: z.enum(['bank_transfer', 'cheque', 'cash', 'upi', 'other']).default('bank_transfer'),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

financeRouter.post('/invoices/:id/payments', requirePermission('projects:edit'), async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const tenantId = tenantScope(authReq);
    const data = paymentSchema.parse(req.body);

    const invoice = await prisma.invoice.findFirst({
      where: { id: req.params.id, tenantId },
      include: { payments: true },
    });
    if (!invoice) {
      res.status(404).json({ success: false, error: 'Invoice not found' });
      return;
    }
    if (invoice.status === 'cancelled') {
      res.status(400).json({ success: false, error: 'Cannot record payment on a cancelled invoice' });
      return;
    }

    const currentPaid = invoice.payments.reduce((s, p) => s + toNum(p.amount), 0);
    const invoiceTotal = toNum(invoice.totalAmount);

    if (data.amount + currentPaid > invoiceTotal * 1.001) {
      res.status(400).json({ success: false, error: 'Payment amount exceeds invoice total' });
      return;
    }

    const payment = await prisma.invoicePayment.create({
      data: {
        invoiceId: invoice.id,
        amount: data.amount,
        paymentDate: new Date(data.paymentDate),
        mode: data.mode,
        ...(data.reference && { reference: data.reference }),
        ...(data.notes && { notes: data.notes }),
      },
    });

    // Auto-update invoice status
    const newTotalPaid = currentPaid + data.amount;
    let newStatus = invoice.status;
    if (invoice.status === 'draft' || invoice.status === 'sent') {
      newStatus = newTotalPaid >= invoiceTotal * 0.999 ? 'paid' : 'partial';
    } else if (invoice.status === 'partial') {
      newStatus = newTotalPaid >= invoiceTotal * 0.999 ? 'paid' : 'partial';
    }

    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: newStatus,
        ...(newStatus === 'paid' && { paidAt: new Date() }),
      },
    });

    await createAuditLog({
      req: authReq,
      action: 'CREATED',
      module: 'finance',
      entityId: payment.id,
      entityType: 'invoice_payment',
      entityName: `Payment for ${invoice.invoiceNumber}`,
      metadata: { invoiceId: invoice.id, amount: data.amount, newStatus },
    });

    res.status(201).json({ success: true, data: payment });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/finance/payments/:id ────────────
financeRouter.delete('/payments/:id', requirePermission('projects:edit'), async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const tenantId = tenantScope(authReq);

    const payment = await prisma.invoicePayment.findUnique({
      where: { id: req.params.id },
    });
    if (!payment) {
      res.status(404).json({ success: false, error: 'Payment not found' });
      return;
    }

    // Verify tenant scope via invoice
    const invoice = await prisma.invoice.findFirst({
      where: { id: payment.invoiceId, tenantId },
      include: { payments: true },
    });
    if (!invoice) {
      res.status(404).json({ success: false, error: 'Payment not found' });
      return;
    }

    await prisma.invoicePayment.delete({ where: { id: req.params.id } });

    // Recalculate invoice status
    const remainingPaid = invoice.payments
      .filter((p) => p.id !== req.params.id)
      .reduce((s, p) => s + toNum(p.amount), 0);
    const invoiceTotal = toNum(invoice.totalAmount);
    let newStatus = 'sent';
    if (remainingPaid <= 0) newStatus = invoice.issuedAt ? 'sent' : 'draft';
    else if (remainingPaid >= invoiceTotal * 0.999) newStatus = 'paid';
    else newStatus = 'partial';

    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: newStatus, ...(newStatus !== 'paid' && { paidAt: null }) },
    });

    res.json({ success: true, message: 'Payment deleted' });
  } catch (err) {
    next(err);
  }
});
