'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  TrendingUp, DollarSign, AlertTriangle, CheckCircle2,
  Clock, FileText, ArrowUpDown, ChevronUp, ChevronDown,
} from 'lucide-react';
import { cn, formatDate } from '@/lib/utils';
import { SkeletonCard } from '@/components/Skeleton';

// ── Types ─────────────────────────────────────────────────────────────────────

interface KPI {
  totalContractValue: number;
  totalInvoiced: number;
  totalReceived: number;
  outstanding: number;
  overdueCount: number;
}
interface MonthPoint { label: string; received: number; invoiced: number }
interface ModeEntry { mode: string; amount: number }
interface StatusEntry { status: string; count: number }
interface ProjectRow {
  id: string; name: string; projectNumber: string; status: string;
  contractValue: number; currency: string; invoiced: number;
  received: number; outstanding: number; invoiceCount: number;
}
interface MilestonePipeline { pending: number; due: number; invoiced: number; paid: number }
interface OverdueEntry {
  id: string; invoiceNumber: string; title: string;
  projectName: string; projectNumber: string; dueDate: string;
  outstanding: number; status: string; currency: string;
}
interface ReportData {
  period: { start: string; end: string };
  currency: string;
  kpi: KPI;
  monthlyTrend: MonthPoint[];
  paymentModes: ModeEntry[];
  invoiceStatusDist: StatusEntry[];
  projectSummary: ProjectRow[];
  milestonePipeline: MilestonePipeline;
  overdueDetails: OverdueEntry[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(amount: number, currency = 'INR') {
  if (amount >= 10000000) return `${currency} ${(amount / 10000000).toFixed(1)}Cr`;
  if (amount >= 100000) return `${currency} ${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `${currency} ${(amount / 1000).toFixed(1)}K`;
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
}

const MODE_LABELS: Record<string, string> = {
  bank_transfer: 'Bank Transfer', cheque: 'Cheque', cash: 'Cash', upi: 'UPI', other: 'Other',
};
const MODE_COLORS: Record<string, string> = {
  bank_transfer: '#3b82f6', cheque: '#8b5cf6', cash: '#10b981', upi: '#f59e0b', other: '#94a3b8',
};
const STATUS_COLORS: Record<string, string> = {
  draft: '#94a3b8', sent: '#3b82f6', partial: '#f59e0b', paid: '#10b981', cancelled: '#ef4444',
};
const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft', sent: 'Sent', partial: 'Partial', paid: 'Paid', cancelled: 'Cancelled',
};
const STATUS_BADGE: Record<string, string> = {
  active: 'bg-blue-100 text-blue-700', completed: 'bg-emerald-100 text-emerald-700',
  on_hold: 'bg-amber-100 text-amber-700', cancelled: 'bg-red-100 text-red-600',
};

// ── Date presets ───────────────────────────────────────────────────────────────

type Preset = 'this_month' | 'last_3' | 'last_6' | 'this_year' | 'last_12' | 'custom';

function getDateRange(preset: Preset, customStart: string, customEnd: string) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  if (preset === 'this_month') return { start: new Date(y, m, 1).toISOString().slice(0, 10), end: new Date(y, m + 1, 0).toISOString().slice(0, 10) };
  if (preset === 'last_3') return { start: new Date(y, m - 2, 1).toISOString().slice(0, 10), end: new Date(y, m + 1, 0).toISOString().slice(0, 10) };
  if (preset === 'last_6') return { start: new Date(y, m - 5, 1).toISOString().slice(0, 10), end: new Date(y, m + 1, 0).toISOString().slice(0, 10) };
  if (preset === 'this_year') return { start: new Date(y, 0, 1).toISOString().slice(0, 10), end: new Date(y, 11, 31).toISOString().slice(0, 10) };
  if (preset === 'custom') return { start: customStart, end: customEnd };
  return { start: new Date(y - 1, m + 1, 1).toISOString().slice(0, 10), end: new Date(y, m + 1, 0).toISOString().slice(0, 10) };
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, icon: Icon, color, bg }: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; color: string; bg: string;
}) {
  return (
    <div className="card p-4 flex items-start gap-3">
      <div className={cn('w-9 h-9 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center flex-shrink-0', bg)}>
        <Icon size={18} className={color} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] sm:text-xs font-medium text-slate-400 uppercase tracking-wide mb-0.5 leading-tight">{label}</p>
        <p className="text-base sm:text-xl font-bold text-slate-900 leading-tight break-all">{value}</p>
        {sub && <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5 leading-tight">{sub}</p>}
      </div>
    </div>
  );
}

// ── Custom chart tooltip ───────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label, currency }: {
  active?: boolean; payload?: Array<{ color: string; name: string; value: number }>;
  label?: string; currency: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-sm max-w-[200px]">
      <p className="font-semibold text-slate-700 mb-1.5 text-xs">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
          <span className="text-slate-500 text-xs">{p.name}:</span>
          <span className="font-semibold text-slate-900 text-xs">{fmt(p.value, currency)}</span>
        </div>
      ))}
    </div>
  );
}

// ── Sort helper ───────────────────────────────────────────────────────────────

type SortKey = 'name' | 'contractValue' | 'invoiced' | 'received' | 'outstanding';

function useSortedTable(rows: ProjectRow[]) {
  const [sortKey, setSortKey] = useState<SortKey>('contractValue');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const toggle = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  };
  const sorted = [...rows].sort((a, b) => {
    const va = a[sortKey]; const vb = b[sortKey];
    if (typeof va === 'number' && typeof vb === 'number') return sortDir === 'asc' ? va - vb : vb - va;
    return sortDir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
  });
  return { sorted, sortKey, sortDir, toggle };
}

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: 'asc' | 'desc' }) {
  if (col !== sortKey) return <ArrowUpDown size={11} className="text-slate-300" />;
  return sortDir === 'asc' ? <ChevronUp size={11} className="text-blue-500" /> : <ChevronDown size={11} className="text-blue-500" />;
}

// ── Mobile project card ───────────────────────────────────────────────────────

function ProjectCard({ row }: { row: ProjectRow }) {
  const collectedPct = row.invoiced > 0 ? (row.received / row.invoiced) * 100 : 0;
  return (
    <div className="p-4 border-b border-slate-50 last:border-0">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900 text-sm leading-tight">{row.name}</p>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-xs text-slate-400">{row.projectNumber}</span>
            <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', STATUS_BADGE[row.status] ?? 'bg-slate-100 text-slate-500')}>
              {row.status.replace('_', ' ')}
            </span>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-xs text-slate-400">Contract</p>
          <p className="font-bold text-slate-800 text-sm">{row.contractValue > 0 ? fmt(row.contractValue, row.currency) : '—'}</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center mb-3">
        <div className="bg-blue-50 rounded-lg p-2">
          <p className="text-[10px] text-blue-500 font-medium">Invoiced</p>
          <p className="text-xs font-bold text-blue-700 mt-0.5">{row.invoiced > 0 ? fmt(row.invoiced, row.currency) : '—'}</p>
        </div>
        <div className="bg-emerald-50 rounded-lg p-2">
          <p className="text-[10px] text-emerald-500 font-medium">Received</p>
          <p className="text-xs font-bold text-emerald-700 mt-0.5">{row.received > 0 ? fmt(row.received, row.currency) : '—'}</p>
        </div>
        <div className={cn('rounded-lg p-2', row.outstanding > 0.5 ? 'bg-amber-50' : 'bg-slate-50')}>
          <p className={cn('text-[10px] font-medium', row.outstanding > 0.5 ? 'text-amber-500' : 'text-slate-400')}>Outstanding</p>
          <p className={cn('text-xs font-bold mt-0.5', row.outstanding > 0.5 ? 'text-amber-700' : 'text-emerald-600')}>
            {row.outstanding > 0.5 ? fmt(row.outstanding, row.currency) : 'Paid'}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, collectedPct)}%` }} />
        </div>
        <span className="text-[10px] text-slate-400 flex-shrink-0">{collectedPct.toFixed(0)}% collected · {row.invoiceCount} inv</span>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function FinanceReportsPage() {
  const [preset, setPreset] = useState<Preset>('last_12');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const range = getDateRange(preset, customStart, customEnd);
  const { data, isLoading } = useQuery<ReportData>({
    queryKey: ['finance-report', range.start, range.end],
    queryFn: () => get<ReportData>('/finance/report', { startDate: range.start, endDate: range.end }),
    enabled: !!(range.start && range.end),
  });

  const { sorted, sortKey, sortDir, toggle } = useSortedTable(data?.projectSummary ?? []);

  const PRESETS: { key: Preset; label: string }[] = [
    { key: 'this_month', label: 'This Month' },
    { key: 'last_3', label: '3 Months' },
    { key: 'last_6', label: '6 Months' },
    { key: 'this_year', label: 'This Year' },
    { key: 'last_12', label: '12 Months' },
    { key: 'custom', label: 'Custom' },
  ];

  const currency = data?.currency ?? 'INR';
  const kpi = data?.kpi;
  const milestones = data?.milestonePipeline;

  const modeData = (data?.paymentModes ?? []).map((m) => ({
    name: MODE_LABELS[m.mode] ?? m.mode, value: m.amount, color: MODE_COLORS[m.mode] ?? '#94a3b8',
  }));
  const statusData = (data?.invoiceStatusDist ?? []).map((s) => ({
    name: STATUS_LABELS[s.status] ?? s.status, value: s.count, color: STATUS_COLORS[s.status] ?? '#94a3b8',
  }));

  return (
    <>
      <Header title="Finance Reports" subtitle="Cashflow & revenue analytics" />

      <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 animate-slide-in">

        {/* ── Filter bar ── */}
        <div className="card p-3 sm:p-4 space-y-3">
          {/* Horizontal scroll preset strip */}
          <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPreset(p.key)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap flex-shrink-0',
                  preset === p.key
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300',
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          {preset === 'custom' && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
              <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="form-input text-xs py-1.5 w-full sm:w-auto" />
              <span className="text-slate-400 text-xs hidden sm:block">to</span>
              <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="form-input text-xs py-1.5 w-full sm:w-auto" />
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 gap-3">
            {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : (
          <>
            {/* ── KPI Cards ── */}
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <KpiCard
                label="Contract Value"
                value={fmt(kpi?.totalContractValue ?? 0, currency)}
                sub={`${(data?.projectSummary ?? []).filter(p => p.contractValue > 0).length} projects`}
                icon={DollarSign} color="text-violet-600" bg="bg-violet-50"
              />
              <KpiCard
                label="Invoiced"
                value={fmt(kpi?.totalInvoiced ?? 0, currency)}
                sub={kpi && kpi.totalContractValue > 0 ? `${((kpi.totalInvoiced / kpi.totalContractValue) * 100).toFixed(0)}% of contract` : undefined}
                icon={FileText} color="text-blue-600" bg="bg-blue-50"
              />
              <KpiCard
                label="Received"
                value={fmt(kpi?.totalReceived ?? 0, currency)}
                sub={kpi && kpi.totalInvoiced > 0 ? `${((kpi.totalReceived / kpi.totalInvoiced) * 100).toFixed(0)}% collected` : undefined}
                icon={CheckCircle2} color="text-emerald-600" bg="bg-emerald-50"
              />
              <KpiCard
                label="Outstanding"
                value={fmt(kpi?.outstanding ?? 0, currency)}
                sub={kpi?.overdueCount ? `${kpi.overdueCount} overdue` : 'None overdue'}
                icon={kpi?.overdueCount ? AlertTriangle : TrendingUp}
                color={kpi?.overdueCount ? 'text-amber-600' : 'text-slate-500'}
                bg={kpi?.overdueCount ? 'bg-amber-50' : 'bg-slate-50'}
              />
            </div>

            {/* ── Milestone Pipeline ── */}
            {milestones && (
              <div className="card p-4 sm:p-5">
                <div className="flex items-center gap-2 mb-3 sm:mb-4">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
                    <Clock size={15} className="text-amber-600" />
                  </div>
                  <h3 className="font-semibold text-slate-800 text-sm sm:text-base">Milestone Pipeline</h3>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
                  {[
                    { label: 'Pending', value: milestones.pending, color: 'bg-slate-100 text-slate-600' },
                    { label: 'Due', value: milestones.due, color: 'bg-amber-100 text-amber-700' },
                    { label: 'Invoiced', value: milestones.invoiced, color: 'bg-blue-100 text-blue-700' },
                    { label: 'Paid', value: milestones.paid, color: 'bg-emerald-100 text-emerald-700' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className={cn('rounded-xl p-3 sm:p-4 text-center', color)}>
                      <p className="text-base sm:text-xl font-bold leading-tight">{fmt(value, currency)}</p>
                      <p className="text-[10px] sm:text-xs font-medium mt-0.5 opacity-70">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Charts Row ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Monthly cashflow bar chart */}
              <div className="card p-4 sm:p-5 lg:col-span-2">
                <div className="flex items-center gap-2 mb-3 sm:mb-4">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                    <TrendingUp size={15} className="text-blue-600" />
                  </div>
                  <h3 className="font-semibold text-slate-800 text-sm sm:text-base">Monthly Cashflow</h3>
                </div>
                {(data?.monthlyTrend ?? []).length === 0 ? (
                  <div className="h-40 flex items-center justify-center text-slate-300 text-sm">No data</div>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={data?.monthlyTrend} barSize={10} barGap={2} margin={{ left: 0, right: 4, top: 4, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 9, fill: '#94a3b8' }}
                        tickLine={false}
                        axisLine={false}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tick={{ fontSize: 9, fill: '#94a3b8' }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => fmt(v, currency)}
                        width={60}
                      />
                      <Tooltip content={<ChartTooltip currency={currency} />} />
                      <Legend iconType="circle" iconSize={7} formatter={(v) => <span className="text-[10px] text-slate-500">{v}</span>} />
                      <Bar dataKey="invoiced" name="Invoiced" fill="#bfdbfe" radius={[2, 2, 0, 0]} />
                      <Bar dataKey="received" name="Received" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Invoice status donut */}
              <div className="card p-4 sm:p-5">
                <div className="flex items-center gap-2 mb-3 sm:mb-4">
                  <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center">
                    <FileText size={15} className="text-violet-600" />
                  </div>
                  <h3 className="font-semibold text-slate-800 text-sm sm:text-base">Invoice Status</h3>
                </div>
                {statusData.length === 0 ? (
                  <div className="h-40 flex items-center justify-center text-slate-300 text-sm">No invoices</div>
                ) : (
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="45%" outerRadius={60} innerRadius={35} paddingAngle={3}>
                        {statusData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => [`${v}`, '']} />
                      <Legend iconType="circle" iconSize={7} formatter={(v) => <span className="text-[10px] text-slate-500">{v}</span>} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* ── Payment Mode Breakdown ── */}
            {modeData.length > 0 && (
              <div className="card p-4 sm:p-5">
                <div className="flex items-center gap-2 mb-3 sm:mb-4">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                    <CheckCircle2 size={15} className="text-emerald-600" />
                  </div>
                  <h3 className="font-semibold text-slate-800 text-sm sm:text-base">Payment Mode Breakdown</h3>
                </div>
                <div className="space-y-3">
                  {modeData.sort((a, b) => b.value - a.value).map(({ name, value, color }) => {
                    const total = modeData.reduce((s, m) => s + m.value, 0);
                    const pct = total > 0 ? (value / total) * 100 : 0;
                    return (
                      <div key={name}>
                        {/* Label row */}
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                            <span className="text-xs font-medium text-slate-700">{name}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-semibold text-slate-800">{fmt(value, currency)}</span>
                            <span className="text-[10px] text-slate-400 ml-1">({pct.toFixed(0)}%)</span>
                          </div>
                        </div>
                        {/* Bar */}
                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: color }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Per-Project Cashflow ── */}
            <div className="card overflow-hidden">
              <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center">
                  <DollarSign size={15} className="text-slate-500" />
                </div>
                <h3 className="font-semibold text-slate-800 text-sm sm:text-base">Per-Project Cashflow</h3>
                <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{sorted.length}</span>
              </div>

              {/* Mobile: card list */}
              <div className="sm:hidden divide-y divide-slate-50">
                {sorted.length === 0 && (
                  <p className="text-center py-10 text-slate-400 text-sm">No projects with finance data yet</p>
                )}
                {sorted.map((row) => <ProjectCard key={row.id} row={row} />)}
              </div>

              {/* Desktop: table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      {([
                        { key: 'name', label: 'Project' },
                        { key: 'contractValue', label: 'Contract' },
                        { key: 'invoiced', label: 'Invoiced' },
                        { key: 'received', label: 'Received' },
                        { key: 'outstanding', label: 'Outstanding' },
                      ] as { key: SortKey; label: string }[]).map(({ key, label }) => (
                        <th
                          key={key}
                          onClick={() => toggle(key)}
                          className="text-left text-xs font-medium text-slate-400 px-4 py-3 cursor-pointer hover:text-slate-600 select-none whitespace-nowrap"
                        >
                          <div className="flex items-center gap-1.5">{label}<SortIcon col={key} sortKey={sortKey} sortDir={sortDir} /></div>
                        </th>
                      ))}
                      <th className="text-left text-xs font-medium text-slate-400 px-4 py-3 whitespace-nowrap">Inv.</th>
                      <th className="text-left text-xs font-medium text-slate-400 px-4 py-3 whitespace-nowrap">Collected</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {sorted.length === 0 && (
                      <tr><td colSpan={7} className="text-center py-10 text-slate-400 text-sm">No projects with finance data yet</td></tr>
                    )}
                    {sorted.map((row) => {
                      const collectedPct = row.invoiced > 0 ? (row.received / row.invoiced) * 100 : 0;
                      return (
                        <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3">
                            <p className="font-medium text-slate-900 text-sm">{row.name}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-xs text-slate-400">{row.projectNumber}</span>
                              <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', STATUS_BADGE[row.status] ?? 'bg-slate-100 text-slate-500')}>
                                {row.status.replace('_', ' ')}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-800 text-sm">
                            {row.contractValue > 0 ? fmt(row.contractValue, row.currency) : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-4 py-3 text-blue-700 font-medium text-sm">
                            {row.invoiced > 0 ? fmt(row.invoiced, row.currency) : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-4 py-3 text-emerald-700 font-medium text-sm">
                            {row.received > 0 ? fmt(row.received, row.currency) : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-4 py-3 text-amber-700 font-medium text-sm">
                            {row.outstanding > 0.5 ? fmt(row.outstanding, row.currency) : <span className="text-emerald-500 text-xs font-semibold">Fully Paid</span>}
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-sm">{row.invoiceCount}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-14 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, collectedPct)}%` }} />
                              </div>
                              <span className="text-xs text-slate-500">{collectedPct.toFixed(0)}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Overdue Invoices ── */}
            {(data?.overdueDetails ?? []).length > 0 && (
              <div className="card p-4 sm:p-5">
                <div className="flex items-center gap-2 mb-3 sm:mb-4">
                  <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
                    <AlertTriangle size={15} className="text-red-500" />
                  </div>
                  <h3 className="font-semibold text-slate-800 text-sm sm:text-base">Overdue Invoices</h3>
                  <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">{data?.overdueDetails.length}</span>
                </div>
                <div className="space-y-2">
                  {data?.overdueDetails.map((ov) => {
                    const daysOverdue = Math.floor((Date.now() - new Date(ov.dueDate).getTime()) / 86400000);
                    return (
                      <div key={ov.id} className="p-3 rounded-xl border border-red-100 bg-red-50/50">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-semibold text-slate-900 text-sm">{ov.invoiceNumber}</span>
                              <span className="text-slate-400 text-xs hidden sm:inline">·</span>
                              <span className="text-sm text-slate-700 truncate">{ov.projectName}</span>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5 truncate">{ov.title}</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="font-bold text-red-700 text-sm">{fmt(ov.outstanding, ov.currency)}</p>
                            <p className="text-[10px] text-red-400 mt-0.5">{daysOverdue}d overdue</p>
                          </div>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1">Due {formatDate(ov.dueDate)} · {ov.projectNumber}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
