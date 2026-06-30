'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import { useAuthStore } from '@/store/auth';
import {
  FolderKanban, Clock, FileText, CheckCircle2, AlertTriangle,
  TrendingUp, Users, Building2, ArrowRight, GitBranch, ChevronDown, Plus,
  DollarSign, Search, X, Banknote,
} from 'lucide-react';
import { formatDate, formatRelative, getStatusBadgeClass, getPriorityBadgeClass, cn, getErrorMessage } from '@/lib/utils';
import { ProjectProgress } from '@/components/ProjectProgress';
import { SkeletonCard, SkeletonTable } from '@/components/Skeleton';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';

interface DashboardStats {
  totalProjects: number;
  activeProjects: number;
  completedProjects: number;
  onHoldProjects: number;
  totalFollowUps: number;
  pendingFollowUps: number;
  overdueFollowUps: number | { id: string; project: { name: string; projectNumber: string; clientName: string }; owner: { firstName: string; lastName: string }; nextFollowUp: string }[];
  totalDocuments: number;
  totalTenants?: number;
  activeTenants?: number;
  totalUsers?: number;
  activeUsers?: number;
  recentProjects?: Array<{
    id: string;
    name: string;
    projectNumber: string;
    clientName: string;
    status: string;
    priority: string;
    currentStage?: string;
    dueDate?: string;
    owner?: { firstName: string; lastName: string };
    overallProgressPct?: number | null;
    completedStages?: number;
    totalStages?: number;
  }>;
  upcomingFollowUps?: Array<{
    id: string;
    nextFollowUp: string;
    notes?: string;
    project: { id: string; name: string; projectNumber: string; clientName: string };
    owner: { firstName: string; lastName: string };
  }>;
  recentActivity?: Array<{
    id: string;
    action: string;
    module: string;
    entityId?: string;
    entityType?: string;
    entityName?: string;
    userEmail?: string;
    metadata?: Record<string, string> | null;
    createdAt: string;
  }>;
  recentTenants?: Array<{
    id: string;
    name: string;
    slug: string;
    subscriptionPlan: string;
    isActive: boolean;
    userCount: number;
    projectCount: number;
    createdAt: string;
  }>;
  workflowPipeline?: Array<{
    id: string;
    name: string;
    isDefault: boolean;
    totalProjects: number;
    stages: Array<{
      key: string;
      name: string;
      order: number;
      color?: string;
      count: number;
    }>;
  }>;
  overdueList?: Array<{
    id: string;
    nextFollowUp: string;
    project: { id: string; name: string; projectNumber: string; clientName: string };
    owner: { firstName: string; lastName: string };
  }>;
}

function StatCard({
  label, value, icon: Icon, color, href,
}: {
  label: string; value: number | string; icon: React.ElementType; color: string; href?: string;
}) {
  const content = (
    <div className="stat-card group">
      <div className={cn('stat-icon', color)}>
        <Icon size={22} className="text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-2xl font-bold text-slate-900">{value}</p>
        <p className="text-sm text-slate-500 mt-0.5">{label}</p>
      </div>
      {href && (
        <ArrowRight size={16} className="text-slate-300 group-hover:text-blue-500 transition-colors" />
      )}
    </div>
  );

  return href ? <Link href={href}>{content}</Link> : content;
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'bg-red-500',
  high: 'bg-orange-400',
  medium: 'bg-amber-400',
  low: 'bg-slate-400',
};

function WorkflowCard({ workflow, onStageClick }: {
  workflow: NonNullable<DashboardStats['workflowPipeline']>[number];
  onStageClick: (workflowId: string, stageKey: string, count: number) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="break-inside-avoid mb-4 last:mb-0 border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      {/* Workflow header — clickable to expand/collapse */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gradient-to-r from-slate-50 to-white border-b border-slate-200 hover:from-slate-100 transition-colors text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <ChevronDown
            size={15}
            className={cn('text-slate-400 flex-shrink-0 transition-transform duration-200', !open && '-rotate-90')}
          />
          <span className="font-semibold text-slate-800 truncate text-sm">{workflow.name}</span>
          {workflow.isDefault && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600 flex-shrink-0">
              Default
            </span>
          )}
        </div>
        {/* Project count pill */}
        <div className="flex items-center gap-1.5 flex-shrink-0 ml-3">
          <span className={cn(
            'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold shadow-sm',
            workflow.totalProjects > 0
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 text-slate-400',
          )}>
            <span className="text-sm leading-none">{workflow.totalProjects}</span>
            <span className="font-normal opacity-90">{workflow.totalProjects !== 1 ? 'projects' : 'project'}</span>
          </span>
        </div>
      </button>

      {/* Stages list */}
      {open && (
        <div className="divide-y divide-slate-100 bg-white">
          {workflow.stages.map((stage, idx) => {
            const max = Math.max(...workflow.stages.map((s) => s.count), 1);
            const pct = Math.round((stage.count / max) * 100);
            const stageColor = stage.color || '#94a3b8';
            const isClickable = stage.count > 0;
            const isEven = idx % 2 === 1;
            return (
              <div
                key={stage.key}
                onClick={() => onStageClick(workflow.id, stage.key, stage.count)}
                className={cn(
                  'flex items-center gap-3 px-4 py-2.5 transition-colors group',
                  isClickable ? 'cursor-pointer hover:bg-blue-50/60' : 'cursor-default',
                  isEven && !isClickable && 'bg-slate-50/60',
                  isEven && isClickable && 'bg-slate-50/40',
                )}
                title={isClickable ? `View ${stage.count} project${stage.count !== 1 ? 's' : ''} in ${stage.name}` : undefined}
              >
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: stageColor }} />
                <span className={cn('text-sm flex-1 min-w-0 truncate', isClickable ? 'text-slate-800 font-medium' : 'text-slate-500')}>
                  {stage.name}
                </span>
                {/* Progress bar */}
                <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden flex-shrink-0">
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: stageColor }} />
                </div>
                {/* Count badge */}
                {stage.count > 0 ? (
                  <span
                    className="flex-shrink-0 min-w-[28px] h-6 px-2 rounded-full text-xs font-bold text-white flex items-center justify-center shadow-sm"
                    style={{ backgroundColor: stageColor }}
                  >
                    {stage.count}
                  </span>
                ) : (
                  <span className="flex-shrink-0 min-w-[28px] h-6 px-2 rounded-full text-xs font-medium text-slate-300 bg-slate-100 flex items-center justify-center">
                    0
                  </span>
                )}
                <ArrowRight size={13} className={cn('flex-shrink-0 transition-opacity', isClickable ? 'text-blue-400 opacity-0 group-hover:opacity-100' : 'opacity-0')} />
              </div>
            );
          })}
          {workflow.stages.length === 0 && (
            <div className="px-4 py-3 text-sm text-slate-400 text-center">No stages configured</div>
          )}
        </div>
      )}
    </div>
  );
}

function WorkflowPipelineSection({ pipeline }: {
  pipeline: NonNullable<DashboardStats['workflowPipeline']>;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const router = useRouter();
  if (!pipeline || pipeline.length === 0) return null;

  const handleStageClick = (workflowId: string, stageKey: string, count: number) => {
    if (count === 0) return;
    router.push(`/projects?view=kanban&workflowId=${workflowId}&stage=${stageKey}`);
  };

  return (
    <div className="card">
      <div
        className="card-header cursor-pointer select-none"
        onClick={() => setCollapsed((c) => !c)}
      >
        <div className="flex items-center gap-2">
          <GitBranch size={18} className="text-slate-500" />
          <h3 className="font-semibold text-slate-900">Workflow Pipeline</h3>
          <span className="text-xs text-slate-400 hidden sm:inline">— active projects per stage</span>
          <ChevronDown
            size={16}
            className={cn('text-slate-400 transition-transform duration-200 ml-1', collapsed && '-rotate-90')}
          />
        </div>
        <Link
          href="/projects"
          className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          View all <ArrowRight size={14} />
        </Link>
      </div>
      {!collapsed && (
        <div className="p-4 columns-1 lg:columns-2 gap-x-4">
          {pipeline.map((workflow) => (
            <WorkflowCard key={workflow.id} workflow={workflow} onStageClick={handleStageClick} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Quick Finance Widget ──────────────────────────────────────────────────────

const QUICK_PAYMENT_MODES = [
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'other', label: 'Other' },
];

function fmtAmt(amount: number, currency = 'INR') {
  if (amount >= 10000000) return `${currency} ${(amount / 10000000).toFixed(1)}Cr`;
  if (amount >= 100000) return `${currency} ${(amount / 100000).toFixed(1)}L`;
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
}

const quickPaymentSchema = z.object({
  amount: z.coerce.number().positive('Must be > 0'),
  paymentDate: z.string().min(1, 'Required'),
  mode: z.enum(['bank_transfer', 'cheque', 'cash', 'upi', 'other']).default('bank_transfer'),
  reference: z.string().optional(),
  notes: z.string().optional(),
});
type QuickPaymentForm = z.infer<typeof quickPaymentSchema>;

interface FinanceQuickData {
  financial: { contractValue: number; currency: string; billingType: string } | null;
  invoices: Array<{
    id: string; invoiceNumber: string; title: string;
    totalAmount: number; status: string; outstanding: number; totalPaid: number; dueDate?: string;
  }>;
  summary: { totalContractValue: number; totalReceived: number; outstanding: number; currency: string };
}

function QuickPaymentModal({
  project, onClose,
}: {
  project: { id: string; name: string; projectNumber: string; clientName: string };
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const ref = useRef<HTMLDivElement>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const { data, isLoading } = useQuery<FinanceQuickData>({
    queryKey: ['finance', project.id],
    queryFn: () => get<FinanceQuickData>(`/finance/${project.id}`),
  });

  const openInvoices = data?.invoices.filter(
    (inv) => inv.status !== 'paid' && inv.status !== 'cancelled' && inv.outstanding > 0
  ) ?? [];
  const selectedInvoice = openInvoices.find((inv) => inv.id === selectedInvoiceId) ?? openInvoices[0] ?? null;

  const currency = data?.summary.currency ?? 'INR';

  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<QuickPaymentForm>({
    resolver: zodResolver(quickPaymentSchema),
    defaultValues: { paymentDate: new Date().toISOString().slice(0, 10), mode: 'bank_transfer', amount: 0 },
  });

  useEffect(() => {
    if (selectedInvoice) setValue('amount', selectedInvoice.outstanding);
  }, [selectedInvoice?.id, setValue]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const watchedAmount = watch('amount');
  const watchedMode = watch('mode');
  const watchedDate = watch('paymentDate');

  const onSubmit = async (values: QuickPaymentForm) => {
    if (!selectedInvoice) return;
    if (!confirming) { setConfirming(true); return; }
    try {
      await post(`/finance/invoices/${selectedInvoice.id}/payments`, { ...values, amount: Number(values.amount) });
      qc.invalidateQueries({ queryKey: ['finance', project.id] });
      toast.success(`Payment of ${fmtAmt(Number(values.amount), currency)} recorded for ${project.name}`);
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
      setConfirming(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="modal-content max-w-lg w-full" role="dialog" aria-modal="true" aria-labelledby="qp-title">
        <div className="card-header">
          <div>
            <h3 id="qp-title" className="font-semibold text-slate-900">Record Payment</h3>
            <p className="text-xs text-slate-400 mt-0.5">{project.projectNumber} · {project.name} · {project.clientName}</p>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={18} /></button>
        </div>

        {isLoading && (
          <div className="p-8 text-center text-sm text-slate-400">Loading finance data...</div>
        )}

        {!isLoading && !data?.financial && (
          <div className="p-8 text-center">
            <DollarSign size={32} className="mx-auto mb-2 text-slate-200" />
            <p className="text-sm text-slate-500 mb-3">No contract set up for this project.</p>
            <Link href={`/projects/${project.id}`} onClick={onClose} className="btn-secondary text-sm">
              Open Project
            </Link>
          </div>
        )}

        {!isLoading && data?.financial && openInvoices.length === 0 && (
          <div className="p-8 text-center">
            <CheckCircle2 size={32} className="mx-auto mb-2 text-emerald-300" />
            <p className="text-sm text-slate-500 mb-3">No open invoices — all paid or no invoices raised yet.</p>
            <Link href={`/projects/${project.id}`} onClick={onClose} className="btn-secondary text-sm">
              Open Finance Tab
            </Link>
          </div>
        )}

        {!isLoading && data?.financial && openInvoices.length > 0 && (
          <>
            {/* Summary strip */}
            <div className="px-5 pt-4 grid grid-cols-3 gap-2">
              {[
                { label: 'Contract', value: fmtAmt(data.summary.totalContractValue, currency), cls: 'bg-slate-50' },
                { label: 'Received', value: fmtAmt(data.summary.totalReceived, currency), cls: 'bg-emerald-50' },
                { label: 'Outstanding', value: fmtAmt(data.summary.outstanding, currency), cls: 'bg-amber-50' },
              ].map(({ label, value, cls }) => (
                <div key={label} className={`${cls} rounded-lg p-3`}>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">{label}</p>
                  <p className="text-sm font-bold text-slate-800 break-all">{value}</p>
                </div>
              ))}
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
              {/* Invoice selector */}
              {openInvoices.length > 1 ? (
                <div>
                  <label className="form-label">Invoice to Pay</label>
                  <select
                    className="form-input"
                    value={selectedInvoice?.id ?? ''}
                    onChange={(e) => { setSelectedInvoiceId(e.target.value); setConfirming(false); }}
                  >
                    {openInvoices.map((inv) => (
                      <option key={inv.id} value={inv.id}>
                        {inv.invoiceNumber} — {inv.title} ({fmtAmt(inv.outstanding, currency)} due)
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                  <p className="text-xs font-medium text-blue-700">{selectedInvoice?.invoiceNumber} — {selectedInvoice?.title}</p>
                  <p className="text-xs text-blue-500 mt-0.5">Outstanding: {fmtAmt(selectedInvoice?.outstanding ?? 0, currency)}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Amount *</label>
                  <input
                    {...register('amount')}
                    type="number" step="0.01" className="form-input"
                    onChange={(e) => { register('amount').onChange(e); setConfirming(false); }}
                  />
                  {errors.amount && <p className="form-error">{errors.amount.message}</p>}
                </div>
                <div>
                  <label className="form-label">Payment Date *</label>
                  <input
                    {...register('paymentDate')}
                    type="date" className="form-input"
                    onChange={(e) => { register('paymentDate').onChange(e); setConfirming(false); }}
                  />
                  {errors.paymentDate && <p className="form-error">{errors.paymentDate.message}</p>}
                </div>
              </div>

              <div>
                <label className="form-label">Payment Mode</label>
                <select
                  {...register('mode')}
                  className="form-input"
                  onChange={(e) => { register('mode').onChange(e); setConfirming(false); }}
                >
                  {QUICK_PAYMENT_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
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

              {/* Confirmation panel */}
              {confirming && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-1">
                  <p className="text-sm font-semibold text-amber-800">Confirm this payment?</p>
                  <p className="text-sm text-amber-700">
                    <span className="font-bold">{fmtAmt(Number(watchedAmount), currency)}</span>
                    {' '}via {QUICK_PAYMENT_MODES.find((m) => m.value === watchedMode)?.label} on {watchedDate}
                  </p>
                  <p className="text-xs text-amber-600">
                    Invoice: {selectedInvoice?.invoiceNumber} · Project: {project.name}
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                {confirming ? (
                  <>
                    <button type="button" onClick={() => setConfirming(false)} className="btn-secondary">Back</button>
                    <button type="submit" disabled={isSubmitting} className="btn-primary !bg-emerald-600 hover:!bg-emerald-700">
                      <Banknote size={14} /> {isSubmitting ? 'Saving...' : 'Confirm & Record'}
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
                    <button type="submit" className="btn-primary">
                      Review & Confirm
                    </button>
                  </>
                )}
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

function QuickFinanceWidget() {
  const [search, setSearch] = useState('');
  const [selectedProject, setSelectedProject] = useState<{
    id: string; name: string; projectNumber: string; clientName: string;
  } | null>(null);

  const { data: searchData, isLoading: searching } = useQuery({
    queryKey: ['projects', 'quick-finance-search', search],
    queryFn: () => get<{ items: Array<{ id: string; name: string; projectNumber: string; clientName: string; status: string }> }>(
      `/projects?search=${encodeURIComponent(search)}&pageSize=6`
    ),
    enabled: search.trim().length >= 2,
  });

  return (
    <>
      {selectedProject && (
        <QuickPaymentModal
          project={selectedProject}
          onClose={() => { setSelectedProject(null); setSearch(''); }}
        />
      )}
      <div className="card">
        <div className="card-header">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center">
              <DollarSign size={15} className="text-emerald-600" />
            </div>
            <h3 className="font-semibold text-slate-900">Quick Payment Update</h3>
          </div>
          <Link href="/finance-reports" className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 font-medium">
            Finance Reports <ArrowRight size={12} />
          </Link>
        </div>
        <div className="p-4">
          <div className="relative mb-3">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="form-input pl-9"
              placeholder="Search project by name or client..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {search.trim().length < 2 && (
            <p className="text-sm text-slate-400 text-center py-4">
              Type at least 2 characters to search projects
            </p>
          )}

          {search.trim().length >= 2 && searching && (
            <p className="text-sm text-slate-400 text-center py-4">Searching...</p>
          )}

          {search.trim().length >= 2 && !searching && (searchData?.items?.length ?? 0) === 0 && (
            <p className="text-sm text-slate-400 text-center py-4">No projects found</p>
          )}

          {search.trim().length >= 2 && !searching && (searchData?.items?.length ?? 0) > 0 && (
            <div className="space-y-1.5">
              {searchData!.items.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => setSelectedProject(project)}
                  className="w-full text-left p-3 rounded-xl border border-slate-100 hover:border-emerald-200 hover:bg-emerald-50/40 transition-colors group"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{project.name}</p>
                      <p className="text-xs text-slate-500">{project.clientName} · {project.projectNumber}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={getStatusBadgeClass(project.status)}>{project.status}</span>
                      <Banknote size={14} className="text-slate-300 group-hover:text-emerald-500 transition-colors" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Action label helper ───────────────────────────────────────────────────────

function getActionLabel(action: string): string {
  const map: Record<string, string> = {
    CREATED: 'created',
    UPDATED: 'updated',
    DELETED: 'deleted',
    UPLOADED: 'uploaded',
    DOWNLOADED: 'downloaded',
    LOGGED_IN: 'logged in',
    STATUS_CHANGED: 'changed status of',
    REPLACED: 'replaced',
  };
  return map[action] || action.toLowerCase();
}

export default function DashboardPage() {
  const { user } = useAuthStore();

  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ['dashboard', 'stats'],
    queryFn: () => get<DashboardStats>('/dashboard/stats'),
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <>
        <Header title="Dashboard" subtitle={`Welcome back, ${user?.firstName}`} />
        <div className="p-4 sm:p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => <SkeletonCard key={i} rows={2} />)}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 card overflow-hidden">
              <table className="table">
                <thead><tr><th>Project</th><th>Stage</th><th>Status</th><th>Priority</th><th>Progress</th></tr></thead>
                <tbody><SkeletonTable rows={5} cols={5} /></tbody>
              </table>
            </div>
            <SkeletonCard rows={4} />
          </div>
        </div>
      </>
    );
  }

  const isSuperAdmin = user?.isSuperAdmin;
  const userPermissions = (user?.permissions as string[] | undefined) ?? [];
  const canCreateProject = isSuperAdmin || userPermissions.includes('projects:create');
  const canViewFinance = isSuperAdmin || userPermissions.includes('reports:view') || userPermissions.includes('reports:read');

  return (
    <>
      <Header title="Dashboard" subtitle={`Welcome back, ${user?.firstName}. Here is what is happening.`} />
      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 animate-slide-in">

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {isSuperAdmin ? (
            <>
              <StatCard label="Total Tenants" value={stats?.totalTenants || 0} icon={Building2} color="bg-blue-500" href="/tenants" />
              <StatCard label="Active Users" value={stats?.activeUsers || 0} icon={Users} color="bg-violet-500" href="/users" />
              <StatCard label="Total Projects" value={stats?.totalProjects || 0} icon={FolderKanban} color="bg-emerald-500" href="/projects" />
              <StatCard label="Total Documents" value={stats?.totalDocuments || 0} icon={FileText} color="bg-amber-500" href="/documents" />
            </>
          ) : (
            <>
              <StatCard label="Active Projects" value={stats?.activeProjects || 0} icon={FolderKanban} color="bg-blue-500" href="/projects?status=active" />
              <StatCard label="Pending Follow-ups" value={stats?.pendingFollowUps || 0} icon={Clock} color="bg-amber-500" href="/follow-ups?status=pending" />
              <StatCard label="Overdue" value={typeof stats?.overdueFollowUps === 'number' ? stats.overdueFollowUps : (Array.isArray(stats?.overdueFollowUps) ? stats.overdueFollowUps.length : 0)} icon={AlertTriangle} color="bg-red-500" href="/follow-ups?overdue=true" />
              <StatCard label="Documents" value={stats?.totalDocuments || 0} icon={FileText} color="bg-emerald-500" href="/documents" />
            </>
          )}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-6 xl:items-stretch">
          {/* Recent / Active Projects */}
          <div className="xl:col-span-2 card flex flex-col min-h-0">
            <div className="card-header flex-shrink-0">
              <div>
                <h3 className="font-semibold text-slate-900">Active Projects</h3>
                <p className="text-xs text-slate-500 mt-0.5">Sorted by priority — urgent first</p>
              </div>
              <div className="flex items-center gap-2">
                {canCreateProject && (
                  <Link
                    href="/projects?new=1"
                    className="inline-flex items-center gap-1.5 btn-primary py-1.5 px-3 text-xs"
                  >
                    <Plus size={13} /> New Project
                  </Link>
                )}
                <Link href="/projects" className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                  View all <ArrowRight size={14} />
                </Link>
              </div>
            </div>
            <div className="divide-y flex-1 overflow-y-auto" style={{ borderColor: '#eef0f8' }}>
              {stats?.recentProjects?.length === 0 && (
                <div className="empty-state py-10">
                  <FolderKanban size={40} className="text-slate-200 mb-3" />
                  <p className="text-slate-500">No projects yet</p>
                </div>
              )}
              {stats?.recentProjects?.map((project, idx) => (
                <Link key={project.id} href={`/projects/${project.id}`}>
                  <div
                    className="px-6 py-4 transition-colors cursor-pointer hover:bg-[#e6edff]"
                    style={{ backgroundColor: idx % 2 === 1 ? '#f2f5ff' : '#ffffff' }}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2.5">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <div
                            className={cn('w-2 h-2 rounded-full flex-shrink-0', PRIORITY_COLORS[project.priority] || 'bg-slate-300')}
                            title={`${project.priority} priority`}
                          />
                          <span className="text-xs font-mono text-slate-400">{project.projectNumber}</span>
                          <span className={getStatusBadgeClass(project.status)}>
                            {project.status.replace('_', ' ')}
                          </span>
                          <span className={getPriorityBadgeClass(project.priority)}>
                            {project.priority}
                          </span>
                        </div>
                        <p className="font-medium text-slate-900 truncate">{project.name}</p>
                        <p className="text-sm text-slate-500 mt-0.5">{project.clientName}</p>
                      </div>
                      {project.dueDate && (
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs text-slate-400">Due</p>
                          <p className="text-sm font-medium text-slate-700">{formatDate(project.dueDate)}</p>
                        </div>
                      )}
                    </div>
                    <ProjectProgress
                      currentStage={project.currentStage}
                      status={project.status}
                      progressPct={project.overallProgressPct}
                      completedStages={project.completedStages}
                      totalStages={project.totalStages}
                    />
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Right column */}
          <div className="flex flex-col gap-4">
            {/* Upcoming follow-ups */}
            <div className="card">
              <div className="card-header">
                <h3 className="font-semibold text-slate-900">Upcoming Follow-ups</h3>
                <Link href="/follow-ups" className="text-xs text-blue-600 hover:text-blue-700">View all</Link>
              </div>
              <div className="divide-y divide-slate-100">
                {(!stats?.upcomingFollowUps || stats.upcomingFollowUps.length === 0) && (
                  <div className="px-6 py-6 text-center">
                    <CheckCircle2 size={28} className="text-emerald-200 mx-auto mb-2" />
                    <p className="text-sm text-slate-400">No upcoming follow-ups</p>
                  </div>
                )}
                {stats?.upcomingFollowUps?.map((fu) => (
                  <Link key={fu.id} href={`/follow-ups?id=${fu.id}`} className="block px-4 py-3 hover:bg-slate-50 cursor-pointer transition-colors">
                    <p className="text-sm font-medium text-slate-800 truncate">{fu.project.name}</p>
                    <p className="text-xs text-slate-500">{fu.project.clientName}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-slate-400">{fu.owner.firstName} {fu.owner.lastName}</span>
                      <span className="text-xs font-medium text-blue-600">{formatDate(fu.nextFollowUp)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            {/* Recent activity */}
            <div className="card flex flex-col">
              <div className="card-header flex-shrink-0">
                <h3 className="font-semibold text-slate-900">Recent Activity</h3>
              </div>
              <div className="divide-y divide-slate-100 overflow-y-auto max-h-[280px]">
                {stats?.recentActivity?.slice(0, 8).map((log) => {
                  const projectName = log.metadata?.projectName as string | undefined;
                  const projectId = log.metadata?.projectId as string | undefined;
                  return (
                    <div key={log.id} className="px-4 py-3">
                      <p className="text-sm text-slate-700">
                        <span className="font-medium">
                          {(log.metadata?.userName as string) || log.userEmail?.split('@')[0]}
                        </span>{' '}
                        {getActionLabel(log.action)}{' '}
                        {log.entityName && <span className="text-slate-500">"{log.entityName}"</span>}
                      </p>
                      {projectName && (
                        <p className="text-xs text-slate-400 mt-0.5">
                          <span className="text-slate-500">Project: </span>
                          {projectId ? (
                            <Link href={`/projects/${projectId}`} className="text-blue-500 hover:underline">
                              {projectName}
                            </Link>
                          ) : (
                            <span>{projectName}</span>
                          )}
                        </p>
                      )}
                      <p className="text-xs text-slate-400 mt-0.5">{formatRelative(log.createdAt)}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Workflow Pipeline */}
        {!isSuperAdmin && stats?.workflowPipeline && stats.workflowPipeline.length > 0 && (
          <WorkflowPipelineSection pipeline={stats.workflowPipeline} />
        )}

        {/* Quick Finance Update — admin only */}
        {canViewFinance && <QuickFinanceWidget />}

        {/* Actionable summary row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Link href="/follow-ups?status=overdue" className="card p-5 flex items-center gap-4 group hover:shadow-md transition-shadow">
            <div className="stat-icon bg-red-50">
              <AlertTriangle size={22} className="text-red-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xl font-bold text-slate-900">
                {/* TODO: wire backend — overdueFollowUpsCount not yet returned by /dashboard/stats */}
                {typeof stats?.overdueFollowUps === 'number'
                  ? stats.overdueFollowUps
                  : Array.isArray(stats?.overdueFollowUps)
                  ? stats.overdueFollowUps.length
                  : 0}
              </p>
              <p className="text-sm text-slate-500">Overdue Follow-ups</p>
            </div>
            <ArrowRight size={16} className="text-slate-300 group-hover:text-red-500 transition-colors" />
          </Link>
          <Link href="/projects" className="card p-5 flex items-center gap-4 group hover:shadow-md transition-shadow">
            <div className="stat-icon bg-amber-50">
              <TrendingUp size={22} className="text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xl font-bold text-slate-900">
                {/* TODO: wire backend — stagesOverdueCount not yet returned by /dashboard/stats */}
                0
              </p>
              <p className="text-sm text-slate-500">Stages Overdue</p>
            </div>
            <ArrowRight size={16} className="text-slate-300 group-hover:text-amber-500 transition-colors" />
          </Link>
          <Link href="/documents" className="card p-5 flex items-center gap-4 group hover:shadow-md transition-shadow">
            <div className="stat-icon bg-emerald-50">
              <FileText size={22} className="text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xl font-bold text-slate-900">
                {/* TODO: wire backend — documentsThisWeekCount not yet returned by /dashboard/stats */}
                0
              </p>
              <p className="text-sm text-slate-500">Documents This Week</p>
            </div>
            <ArrowRight size={16} className="text-slate-300 group-hover:text-emerald-500 transition-colors" />
          </Link>
        </div>
      </div>
    </>
  );
}
