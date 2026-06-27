'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { get, post, patch, del } from '@/lib/api';
import { useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import {
  DollarSign, Plus, Edit2, Trash2, X, TrendingUp,
  CreditCard, FileCheck, AlertCircle, CheckCircle2,
  ChevronDown, ChevronUp, Receipt, Banknote, Clock,
} from 'lucide-react';
import { cn, formatDate, getErrorMessage } from '@/lib/utils';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import type {
  ProjectFinancial, PaymentMilestone, Invoice, InvoicePayment,
  ContractSummary, BillingType, MilestoneStatus, InvoiceStatus,
  ProjectStage,
} from '@flowtiq/shared-types';

// ── Types ────────────────────────────────────────────────────────────

interface FinanceData {
  financial: ProjectFinancial | null;
  milestones: PaymentMilestone[];
  invoices: (Invoice & { totalPaid: number; outstanding: number })[];
  summary: ContractSummary;
}

// ── Helpers ──────────────────────────────────────────────────────────

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD'];
const BILLING_TYPES: { value: BillingType; label: string }[] = [
  { value: 'milestone', label: 'Milestone Based' },
  { value: 'time_material', label: 'Time & Material' },
  { value: 'fixed', label: 'Fixed Price' },
];
const PAYMENT_MODES = [
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'other', label: 'Other' },
];
const MILESTONE_STATUS_MAP: Record<MilestoneStatus, { label: string; cls: string }> = {
  pending: { label: 'Pending', cls: 'bg-slate-100 text-slate-600' },
  due: { label: 'Due', cls: 'bg-amber-100 text-amber-700' },
  invoiced: { label: 'Invoiced', cls: 'bg-blue-100 text-blue-700' },
  paid: { label: 'Paid', cls: 'bg-emerald-100 text-emerald-700' },
};
const INVOICE_STATUS_MAP: Record<InvoiceStatus, { label: string; cls: string }> = {
  draft: { label: 'Draft', cls: 'bg-slate-100 text-slate-600' },
  sent: { label: 'Sent', cls: 'bg-blue-100 text-blue-700' },
  partial: { label: 'Partial', cls: 'bg-amber-100 text-amber-700' },
  paid: { label: 'Paid', cls: 'bg-emerald-100 text-emerald-700' },
  cancelled: { label: 'Cancelled', cls: 'bg-red-100 text-red-600' },
};

function fmt(amount: number, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
}

// ── Summary Card ─────────────────────────────────────────────────────

function SummaryCard({ summary }: { summary: ContractSummary }) {
  const pctInvoiced = summary.totalContractValue > 0
    ? Math.min(100, (summary.totalInvoiced / summary.totalContractValue) * 100)
    : 0;
  const pctReceived = summary.totalContractValue > 0
    ? Math.min(100, (summary.totalReceived / summary.totalContractValue) * 100)
    : 0;

  return (
    <div className="card p-6">
      <div className="flex items-center gap-2 mb-5">
        <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
          <TrendingUp size={16} className="text-blue-600" />
        </div>
        <h3 className="font-semibold text-slate-800">Contract Summary</h3>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Contract Value</p>
          <p className="text-xl font-bold text-slate-900">{fmt(summary.totalContractValue, summary.currency)}</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Total Invoiced</p>
          <p className="text-xl font-bold text-blue-600">{fmt(summary.totalInvoiced, summary.currency)}</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Total Received</p>
          <p className="text-xl font-bold text-emerald-600">{fmt(summary.totalReceived, summary.currency)}</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Outstanding</p>
          <p className="text-xl font-bold text-amber-600">{fmt(summary.outstanding, summary.currency)}</p>
        </div>
      </div>
      <div className="space-y-2.5">
        <div>
          <div className="flex justify-between text-xs text-slate-500 mb-1">
            <span>Invoiced</span>
            <span>{pctInvoiced.toFixed(0)}%</span>
          </div>
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-blue-500 transition-all duration-700" style={{ width: `${pctInvoiced}%` }} />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-xs text-slate-500 mb-1">
            <span>Received</span>
            <span>{pctReceived.toFixed(0)}%</span>
          </div>
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-emerald-500 transition-all duration-700" style={{ width: `${pctReceived}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Contract Setup Modal ─────────────────────────────────────────────

const contractSchema = z.object({
  contractValue: z.coerce.number().min(0, 'Must be ≥ 0'),
  currency: z.string().default('INR'),
  billingType: z.enum(['milestone', 'time_material', 'fixed']).default('milestone'),
  notes: z.string().optional(),
});
type ContractForm = z.infer<typeof contractSchema>;

function ContractModal({
  projectId, existing, onClose,
}: {
  projectId: string;
  existing: ProjectFinancial | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, true);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<ContractForm>({
    resolver: zodResolver(contractSchema),
    defaultValues: {
      contractValue: existing?.contractValue ?? 0,
      currency: existing?.currency ?? 'INR',
      billingType: (existing?.billingType as BillingType) ?? 'milestone',
      notes: existing?.notes ?? '',
    },
  });

  const onSubmit = async (values: ContractForm) => {
    try {
      await post(`/finance/${projectId}/contract`, values);
      qc.invalidateQueries({ queryKey: ['finance', projectId] });
      toast.success('Contract details saved');
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="modal-content max-w-md w-full" role="dialog" aria-modal="true" aria-labelledby="contract-modal-title">
        <div className="card-header">
          <h3 id="contract-modal-title" className="font-semibold text-slate-900">
            {existing ? 'Edit Contract Details' : 'Set Up Contract'}
          </h3>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Contract Value *</label>
              <input {...register('contractValue')} type="number" step="0.01" className="form-input" placeholder="0" />
              {errors.contractValue && <p className="form-error">{errors.contractValue.message}</p>}
            </div>
            <div>
              <label className="form-label">Currency</label>
              <select {...register('currency')} className="form-input">
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="form-label">Billing Type</label>
            <select {...register('billingType')} className="form-input">
              {BILLING_TYPES.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Notes</label>
            <textarea {...register('notes')} className="form-input" rows={2} placeholder="Optional notes..." />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="btn-primary">
              {isSubmitting ? 'Saving...' : 'Save Contract'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Milestone Modal ───────────────────────────────────────────────────

const milestoneSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  amount: z.coerce.number().min(0, 'Must be ≥ 0'),
  percentage: z.coerce.number().min(0).max(100).optional().or(z.literal('')),
  linkedStageId: z.string().optional(),
  dueDate: z.string().optional(),
  notes: z.string().optional(),
});
type MilestoneForm = z.infer<typeof milestoneSchema>;

function MilestoneModal({
  projectId, existing, stages, onClose,
}: {
  projectId: string;
  existing?: PaymentMilestone | null;
  stages: ProjectStage[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, true);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<MilestoneForm>({
    resolver: zodResolver(milestoneSchema),
    defaultValues: {
      name: existing?.name ?? '',
      amount: existing?.amount ?? 0,
      percentage: existing?.percentage ?? '',
      linkedStageId: existing?.linkedStageId ?? '',
      dueDate: existing?.dueDate ? existing.dueDate.slice(0, 10) : '',
      notes: existing?.notes ?? '',
    },
  });

  const onSubmit = async (values: MilestoneForm) => {
    try {
      const payload = {
        name: values.name,
        amount: Number(values.amount),
        ...(values.percentage !== '' && values.percentage !== undefined && { percentage: Number(values.percentage) }),
        ...(values.linkedStageId && { linkedStageId: values.linkedStageId }),
        ...(values.dueDate && { dueDate: values.dueDate }),
        ...(values.notes && { notes: values.notes }),
      };
      if (existing) {
        await patch(`/finance/milestones/${existing.id}`, payload);
        toast.success('Milestone updated');
      } else {
        await post(`/finance/${projectId}/milestones`, payload);
        toast.success('Milestone added');
      }
      qc.invalidateQueries({ queryKey: ['finance', projectId] });
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="modal-content max-w-md w-full" role="dialog" aria-modal="true" aria-labelledby="milestone-modal-title">
        <div className="card-header">
          <h3 id="milestone-modal-title" className="font-semibold text-slate-900">
            {existing ? 'Edit Milestone' : 'Add Payment Milestone'}
          </h3>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
          <div>
            <label className="form-label">Milestone Name *</label>
            <input {...register('name')} className="form-input" placeholder="e.g. Advance Payment, Stage 1 Completion..." />
            {errors.name && <p className="form-error">{errors.name.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Amount *</label>
              <input {...register('amount')} type="number" step="0.01" className="form-input" placeholder="0" />
              {errors.amount && <p className="form-error">{errors.amount.message}</p>}
            </div>
            <div>
              <label className="form-label">% of Contract</label>
              <input {...register('percentage')} type="number" step="0.01" className="form-input" placeholder="0" />
            </div>
          </div>
          <div>
            <label className="form-label">Linked Stage (auto-triggers when completed)</label>
            <select {...register('linkedStageId')} className="form-input">
              <option value="">— Not linked —</option>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>{s.stageName}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">Due Date</label>
            <input {...register('dueDate')} type="date" className="form-input" />
          </div>
          <div>
            <label className="form-label">Notes</label>
            <textarea {...register('notes')} className="form-input" rows={2} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="btn-primary">
              {isSubmitting ? 'Saving...' : existing ? 'Update' : 'Add Milestone'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Invoice Modal ─────────────────────────────────────────────────────

const invoiceSchema = z.object({
  invoiceNumber: z.string().min(1, 'Required'),
  title: z.string().min(1, 'Required'),
  amount: z.coerce.number().min(0),
  taxAmount: z.coerce.number().min(0).default(0),
  dueDate: z.string().optional(),
  notes: z.string().optional(),
});
type InvoiceForm = z.infer<typeof invoiceSchema>;

function InvoiceModal({
  projectId, onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, true);

  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<InvoiceForm>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: { amount: 0, taxAmount: 0 },
  });

  const amount = watch('amount') || 0;
  const taxAmount = watch('taxAmount') || 0;

  const onSubmit = async (values: InvoiceForm) => {
    try {
      await post(`/finance/${projectId}/invoices`, {
        ...values,
        amount: Number(values.amount),
        taxAmount: Number(values.taxAmount ?? 0),
      });
      qc.invalidateQueries({ queryKey: ['finance', projectId] });
      toast.success('Invoice created');
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="modal-content max-w-md w-full" role="dialog" aria-modal="true" aria-labelledby="invoice-modal-title">
        <div className="card-header">
          <h3 id="invoice-modal-title" className="font-semibold text-slate-900">Create Invoice</h3>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Invoice Number *</label>
              <input {...register('invoiceNumber')} className="form-input" placeholder="INV-001" />
              {errors.invoiceNumber && <p className="form-error">{errors.invoiceNumber.message}</p>}
            </div>
            <div>
              <label className="form-label">Due Date</label>
              <input {...register('dueDate')} type="date" className="form-input" />
            </div>
          </div>
          <div>
            <label className="form-label">Title *</label>
            <input {...register('title')} className="form-input" placeholder="e.g. First Installment — Site Survey" />
            {errors.title && <p className="form-error">{errors.title.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Amount *</label>
              <input {...register('amount')} type="number" step="0.01" className="form-input" placeholder="0" />
            </div>
            <div>
              <label className="form-label">Tax Amount</label>
              <input {...register('taxAmount')} type="number" step="0.01" className="form-input" placeholder="0" />
            </div>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg flex justify-between items-center">
            <span className="text-sm text-slate-600">Total (incl. tax)</span>
            <span className="font-bold text-slate-900">{fmt(Number(amount) + Number(taxAmount))}</span>
          </div>
          <div>
            <label className="form-label">Notes</label>
            <textarea {...register('notes')} className="form-input" rows={2} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="btn-primary">
              {isSubmitting ? 'Creating...' : 'Create Invoice'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Record Payment Modal ──────────────────────────────────────────────

const paymentSchema = z.object({
  amount: z.coerce.number().positive('Must be > 0'),
  paymentDate: z.string().min(1, 'Required'),
  mode: z.enum(['bank_transfer', 'cheque', 'cash', 'upi', 'other']).default('bank_transfer'),
  reference: z.string().optional(),
  notes: z.string().optional(),
});
type PaymentForm = z.infer<typeof paymentSchema>;

function RecordPaymentModal({
  invoice, projectId, onClose,
}: {
  invoice: Invoice & { totalPaid: number; outstanding: number };
  projectId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, true);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<PaymentForm>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      paymentDate: new Date().toISOString().slice(0, 10),
      mode: 'bank_transfer',
      amount: invoice.outstanding,
    },
  });

  const onSubmit = async (values: PaymentForm) => {
    try {
      await post(`/finance/invoices/${invoice.id}/payments`, {
        ...values,
        amount: Number(values.amount),
      });
      qc.invalidateQueries({ queryKey: ['finance', projectId] });
      toast.success('Payment recorded');
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="modal-content max-w-md w-full" role="dialog" aria-modal="true" aria-labelledby="payment-modal-title">
        <div className="card-header">
          <div>
            <h3 id="payment-modal-title" className="font-semibold text-slate-900">Record Payment</h3>
            <p className="text-xs text-slate-400 mt-0.5">{invoice.invoiceNumber} — {invoice.title}</p>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
          <div className="p-3 bg-amber-50 rounded-lg border border-amber-100 flex justify-between items-center">
            <span className="text-sm text-amber-800">Outstanding</span>
            <span className="font-bold text-amber-800">{fmt(invoice.outstanding)}</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Amount *</label>
              <input {...register('amount')} type="number" step="0.01" className="form-input" />
              {errors.amount && <p className="form-error">{errors.amount.message}</p>}
            </div>
            <div>
              <label className="form-label">Payment Date *</label>
              <input {...register('paymentDate')} type="date" className="form-input" />
              {errors.paymentDate && <p className="form-error">{errors.paymentDate.message}</p>}
            </div>
          </div>
          <div>
            <label className="form-label">Payment Mode</label>
            <select {...register('mode')} className="form-input">
              {PAYMENT_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Reference / Transaction ID</label>
            <input {...register('reference')} className="form-input" placeholder="Optional" />
          </div>
          <div>
            <label className="form-label">Notes</label>
            <textarea {...register('notes')} className="form-input" rows={2} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="btn-primary">
              {isSubmitting ? 'Saving...' : 'Record Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Invoice Row (expandable) ──────────────────────────────────────────

function InvoiceRow({
  invoice, projectId, currency,
}: {
  invoice: Invoice & { totalPaid: number; outstanding: number };
  projectId: string;
  currency: string;
}) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const statusInfo = INVOICE_STATUS_MAP[invoice.status as InvoiceStatus] ?? INVOICE_STATUS_MAP.draft;

  const deletePayment = async (paymentId: string) => {
    if (!confirm('Remove this payment record?')) return;
    try {
      await del(`/finance/payments/${paymentId}`);
      qc.invalidateQueries({ queryKey: ['finance', projectId] });
      toast.success('Payment removed');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const updateStatus = async (status: InvoiceStatus) => {
    try {
      await patch(`/finance/invoices/${invoice.id}`, { status });
      qc.invalidateQueries({ queryKey: ['finance', projectId] });
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const deleteInvoice = async () => {
    if (!confirm(`Delete invoice ${invoice.invoiceNumber}? This cannot be undone.`)) return;
    try {
      await del(`/finance/invoices/${invoice.id}`);
      qc.invalidateQueries({ queryKey: ['finance', projectId] });
      toast.success('Invoice deleted');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const paidPct = invoice.totalAmount > 0 ? Math.min(100, (invoice.totalPaid / invoice.totalAmount) * 100) : 0;

  return (
    <>
      {showPaymentModal && (
        <RecordPaymentModal
          invoice={invoice}
          projectId={projectId}
          onClose={() => setShowPaymentModal(false)}
        />
      )}
      <div className="border border-slate-200 rounded-xl overflow-hidden transition-shadow hover:shadow-sm">
        {/* Main row */}
        <div className="p-4 bg-white">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="flex-1 flex items-center gap-3 text-left min-w-0"
            >
              <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                <Receipt size={16} className="text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-slate-900 text-sm">{invoice.invoiceNumber}</span>
                  <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', statusInfo.cls)}>{statusInfo.label}</span>
                </div>
                <p className="text-xs text-slate-500 truncate mt-0.5">{invoice.title}</p>
              </div>
              <div className="text-right flex-shrink-0 hidden sm:block">
                <p className="font-bold text-slate-900 text-sm">{fmt(invoice.totalAmount, currency)}</p>
                {invoice.dueDate && (
                  <p className="text-xs text-slate-400">Due {formatDate(invoice.dueDate)}</p>
                )}
              </div>
              {expanded ? <ChevronUp size={16} className="text-slate-400 flex-shrink-0" /> : <ChevronDown size={16} className="text-slate-400 flex-shrink-0" />}
            </button>
            <div className="flex items-center gap-1 flex-shrink-0">
              {invoice.status !== 'paid' && invoice.status !== 'cancelled' && (
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(true)}
                  className="btn-primary text-xs py-1.5 px-2.5"
                >
                  <Banknote size={13} /> Record Payment
                </button>
              )}
              <button
                type="button"
                onClick={deleteInvoice}
                className="btn-ghost p-1.5 text-red-400 hover:text-red-600"
                title="Delete invoice"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
          {/* Progress bar */}
          {paidPct > 0 && (
            <div className="mt-3 ml-12">
              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-emerald-500 transition-all duration-700" style={{ width: `${paidPct}%` }} />
              </div>
              <p className="text-xs text-slate-400 mt-0.5">{fmt(invoice.totalPaid, currency)} received</p>
            </div>
          )}
        </div>

        {/* Expanded: payment history + status controls */}
        {expanded && (
          <div className="border-t border-slate-100 bg-slate-50 p-4 space-y-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Payment History</p>
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-500">Status:</label>
                <select
                  value={invoice.status}
                  onChange={(e) => updateStatus(e.target.value as InvoiceStatus)}
                  className="text-xs border border-slate-200 rounded px-2 py-1 bg-white"
                >
                  {Object.entries(INVOICE_STATUS_MAP).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </div>
            </div>
            {(!invoice.payments || invoice.payments.length === 0) ? (
              <p className="text-sm text-slate-400 text-center py-3">No payments recorded yet</p>
            ) : (
              <div className="space-y-2">
                {invoice.payments?.map((pmt: InvoicePayment) => (
                  <div key={pmt.id} className="flex items-center gap-3 bg-white rounded-lg p-3 border border-slate-100">
                    <Banknote size={15} className="text-emerald-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800">{fmt(pmt.amount, currency)}</p>
                      <p className="text-xs text-slate-400">
                        {formatDate(pmt.paymentDate)} · {PAYMENT_MODES.find((m) => m.value === pmt.mode)?.label ?? pmt.mode}
                        {pmt.reference && ` · Ref: ${pmt.reference}`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => deletePayment(pmt.id)}
                      className="btn-ghost p-1 text-red-400 hover:text-red-600 flex-shrink-0"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ── Main Finance Tab ──────────────────────────────────────────────────

export function FinanceTab({
  projectId,
  stages,
}: {
  projectId: string;
  stages: ProjectStage[];
}) {
  const qc = useQueryClient();
  const [showContractModal, setShowContractModal] = useState(false);
  const [showMilestoneModal, setShowMilestoneModal] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [editMilestone, setEditMilestone] = useState<PaymentMilestone | null>(null);

  const { data, isLoading } = useQuery<FinanceData>({
    queryKey: ['finance', projectId],
    queryFn: () => get<FinanceData>(`/finance/${projectId}`),
  });

  const deleteMilestone = async (id: string) => {
    if (!confirm('Delete this milestone?')) return;
    try {
      await del(`/finance/milestones/${id}`);
      qc.invalidateQueries({ queryKey: ['finance', projectId] });
      toast.success('Milestone deleted');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const updateMilestoneStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: MilestoneStatus }) =>
      patch(`/finance/milestones/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finance', projectId] }),
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="card p-6 animate-pulse">
            <div className="h-4 bg-slate-100 rounded w-1/3 mb-3" />
            <div className="h-8 bg-slate-100 rounded w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  const financial = data?.financial ?? null;
  const milestones = data?.milestones ?? [];
  const invoices = data?.invoices ?? [];
  const summary = data?.summary ?? { totalContractValue: 0, totalInvoiced: 0, totalReceived: 0, outstanding: 0, currency: 'INR' };

  return (
    <>
      {/* Modals */}
      {showContractModal && (
        <ContractModal
          projectId={projectId}
          existing={financial}
          onClose={() => setShowContractModal(false)}
        />
      )}
      {(showMilestoneModal || editMilestone) && (
        <MilestoneModal
          projectId={projectId}
          existing={editMilestone}
          stages={stages}
          onClose={() => { setShowMilestoneModal(false); setEditMilestone(null); }}
        />
      )}
      {showInvoiceModal && (
        <InvoiceModal
          projectId={projectId}
          onClose={() => setShowInvoiceModal(false)}
        />
      )}

      <div className="space-y-5">
        {/* Contract Setup Card */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center">
                <FileCheck size={16} className="text-violet-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800">Contract Setup</h3>
                {financial && (
                  <p className="text-xs text-slate-400 mt-0.5">
                    {BILLING_TYPES.find((b) => b.value === financial.billingType)?.label ?? financial.billingType}
                    {' · '}{financial.currency}
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowContractModal(true)}
              className="btn-secondary text-sm"
            >
              <Edit2 size={13} /> {financial ? 'Edit' : 'Set Up'}
            </button>
          </div>
          {financial ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-slate-400 mb-0.5">Contract Value</p>
                <p className="text-2xl font-bold text-slate-900">{fmt(financial.contractValue, financial.currency)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-0.5">Billing Type</p>
                <p className="font-semibold text-slate-700">{BILLING_TYPES.find((b) => b.value === financial.billingType)?.label}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-0.5">Currency</p>
                <p className="font-semibold text-slate-700">{financial.currency}</p>
              </div>
              {financial.notes && (
                <div className="col-span-2 sm:col-span-3">
                  <p className="text-xs text-slate-400 mb-0.5">Notes</p>
                  <p className="text-sm text-slate-600">{financial.notes}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-6 text-slate-400">
              <DollarSign size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No contract details set up yet</p>
              <button
                type="button"
                onClick={() => setShowContractModal(true)}
                className="btn-primary mt-3 text-sm"
              >
                <Plus size={14} /> Set Up Contract
              </button>
            </div>
          )}
        </div>

        {/* Contract Summary */}
        {financial && <SummaryCard summary={summary} />}

        {/* Payment Milestones */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
                <CreditCard size={16} className="text-amber-600" />
              </div>
              <h3 className="font-semibold text-slate-800">Payment Milestones</h3>
              <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{milestones.length}</span>
            </div>
            <button
              type="button"
              onClick={() => setShowMilestoneModal(true)}
              className="btn-secondary text-sm"
            >
              <Plus size={13} /> Add
            </button>
          </div>
          {milestones.length === 0 ? (
            <div className="text-center py-6 text-slate-400">
              <CreditCard size={28} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No payment milestones defined</p>
            </div>
          ) : (
            <div className="space-y-2">
              {milestones.map((m) => {
                const info = MILESTONE_STATUS_MAP[m.status as MilestoneStatus] ?? MILESTONE_STATUS_MAP.pending;
                return (
                  <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:border-slate-200 transition-colors bg-white">
                    <div className={cn('w-2 h-2 rounded-full flex-shrink-0', {
                      'bg-slate-300': m.status === 'pending',
                      'bg-amber-400': m.status === 'due',
                      'bg-blue-500': m.status === 'invoiced',
                      'bg-emerald-500': m.status === 'paid',
                    })} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-slate-800 truncate">{m.name}</p>
                        <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium', info.cls)}>{info.label}</span>
                        {m.linkedStage && (
                          <span className="text-xs text-slate-400">
                            → {(m.linkedStage as unknown as { stageName: string }).stageName}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-400">
                        <span className="font-semibold text-slate-700">{fmt(m.amount, summary.currency)}</span>
                        {m.percentage && <span>{m.percentage}%</span>}
                        {m.dueDate && <span><Clock size={11} className="inline mr-0.5" />Due {formatDate(m.dueDate)}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <select
                        value={m.status}
                        onChange={(e) => updateMilestoneStatus.mutate({ id: m.id, status: e.target.value as MilestoneStatus })}
                        className="text-xs border border-slate-200 rounded px-1.5 py-1 bg-white"
                        title="Update status"
                      >
                        {Object.entries(MILESTONE_STATUS_MAP).map(([k, v]) => (
                          <option key={k} value={k}>{v.label}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setEditMilestone(m)}
                        className="btn-ghost p-1.5"
                        title="Edit"
                      >
                        <Edit2 size={13} className="text-slate-400" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteMilestone(m.id)}
                        className="btn-ghost p-1.5"
                        title="Delete"
                      >
                        <Trash2 size={13} className="text-red-400 hover:text-red-600" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Invoices */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                <Receipt size={16} className="text-emerald-600" />
              </div>
              <h3 className="font-semibold text-slate-800">Invoices</h3>
              <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{invoices.length}</span>
            </div>
            <button
              type="button"
              onClick={() => setShowInvoiceModal(true)}
              className="btn-secondary text-sm"
            >
              <Plus size={13} /> Create Invoice
            </button>
          </div>
          {invoices.length === 0 ? (
            <div className="text-center py-6 text-slate-400">
              <Receipt size={28} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No invoices raised yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {invoices.map((inv) => (
                <InvoiceRow
                  key={inv.id}
                  invoice={inv}
                  projectId={projectId}
                  currency={summary.currency}
                />
              ))}
            </div>
          )}
        </div>

        {/* Invoice health snapshot */}
        {invoices.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Unpaid', count: invoices.filter(i => i.status === 'draft' || i.status === 'sent').length, icon: AlertCircle, color: 'text-amber-600 bg-amber-50' },
              { label: 'Partial', count: invoices.filter(i => i.status === 'partial').length, icon: Clock, color: 'text-blue-600 bg-blue-50' },
              { label: 'Paid', count: invoices.filter(i => i.status === 'paid').length, icon: CheckCircle2, color: 'text-emerald-600 bg-emerald-50' },
            ].map(({ label, count, icon: Icon, color }) => (
              <div key={label} className="card p-4 flex items-center gap-3">
                <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0', color)}>
                  <Icon size={16} />
                </div>
                <div>
                  <p className="text-xl font-bold text-slate-900">{count}</p>
                  <p className="text-xs text-slate-400">{label}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
