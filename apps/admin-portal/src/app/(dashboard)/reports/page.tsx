'use client';

import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  BarChart2, Download, Filter, Calendar, TrendingUp, CheckCircle,
  Clock, AlertTriangle, FolderOpen, XCircle, RefreshCw,
} from 'lucide-react';
import { cn, formatDate } from '@/lib/utils';
import toast from 'react-hot-toast';

// ── Types ──────────────────────────────────────────────────────────────────────

interface KPI {
  totalProjects: number;
  completedProjects: number;
  activeProjects: number;
  onHoldProjects: number;
  cancelledProjects: number;
  overdueProjects: number;
  startedInPeriod: number;
  completedInPeriod: number;
}

interface StageDist {
  stage: string;
  name: string;
  count: number;
}

interface StatusDist {
  status: string;
  name: string;
  count: number;
  color: string;
}

interface TrendPoint {
  label: string;
  created: number;
  completed: number;
}

interface ProjectRow {
  id: string;
  title: string;
  status: string;
  currentStage?: string;
  createdAt: string;
  dueDate?: string;
  owner?: { firstName: string; lastName: string; email: string } | null;
}

interface ReportData {
  period: { start: string; end: string; granularity: string };
  kpi: KPI;
  stageDistribution: StageDist[];
  statusDistribution: StatusDist[];
  trends: TrendPoint[];
  projects: ProjectRow[];
}

interface StageOption {
  key: string;
  name: string;
  count: number;
}

// ── Presets ────────────────────────────────────────────────────────────────────

type Preset = 'today' | 'week' | 'month' | 'quarter' | 'year' | 'custom';

function getPresetRange(preset: Preset): { start: string; end: string } {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().split('T')[0];

  switch (preset) {
    case 'today': {
      const s = fmt(now);
      return { start: s, end: s };
    }
    case 'week': {
      const d = new Date(now);
      d.setDate(d.getDate() - 6);
      return { start: fmt(d), end: fmt(now) };
    }
    case 'month': {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 1);
      return { start: fmt(d), end: fmt(now) };
    }
    case 'quarter': {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 3);
      return { start: fmt(d), end: fmt(now) };
    }
    case 'year': {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() - 1);
      return { start: fmt(d), end: fmt(now) };
    }
    default:
      return { start: '', end: '' };
  }
}

function granularityFor(preset: Preset): string {
  if (preset === 'today' || preset === 'week') return 'daily';
  if (preset === 'month') return 'weekly';
  return 'monthly';
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, icon: Icon, color, sub,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  color: string;
  sub?: string;
}) {
  return (
    <div className="card p-4 flex items-start gap-3">
      <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', color)}>
        <Icon size={18} className="text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-slate-900 tabular-nums">{value.toLocaleString()}</p>
        <p className="text-xs text-slate-500 mt-0.5 leading-tight">{label}</p>
        {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Stage color palette (matches backend stage names) ─────────────────────────

const STAGE_COLORS = [
  '#6366f1', '#3b82f6', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
];

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const today = new Date().toISOString().split('T')[0];
  const oneMonthAgo = (() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().split('T')[0]; })();

  const [preset, setPreset] = useState<Preset>('month');
  const [startDate, setStartDate] = useState(oneMonthAgo);
  const [endDate, setEndDate] = useState(today);
  const [granularity, setGranularity] = useState('weekly');
  const [stageFilter, setStageFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const applyPreset = useCallback((p: Preset) => {
    setPreset(p);
    if (p !== 'custom') {
      const range = getPresetRange(p);
      setStartDate(range.start);
      setEndDate(range.end);
      setGranularity(granularityFor(p));
    }
  }, []);

  const { data: reportData, isLoading, refetch } = useQuery<ReportData>({
    queryKey: ['reports', startDate, endDate, granularity, stageFilter, statusFilter],
    queryFn: () =>
      get<ReportData>('/reports/summary', {
        startDate,
        endDate,
        granularity,
        stage: stageFilter !== 'all' ? stageFilter : undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
      }),
    enabled: !!(startDate && endDate),
    staleTime: 30_000,
  });

  const { data: stageOptions } = useQuery<StageOption[]>({
    queryKey: ['report-stages'],
    queryFn: () => get<StageOption[]>('/reports/stages'),
  });

  const data = reportData;

  // ── CSV Export ───────────────────────────────────────────────────────────────

  const exportCSV = () => {
    if (!data?.projects?.length) { toast.error('No data to export'); return; }

    const headers = ['Title', 'Status', 'Stage', 'Owner', 'Created', 'Due Date'];
    const rows = data.projects.map((p) => [
      `"${p.title.replace(/"/g, '""')}"`,
      p.status,
      p.currentStage || '',
      p.owner ? `${p.owner.firstName} ${p.owner.lastName}` : '',
      formatDate(p.createdAt),
      p.dueDate ? formatDate(p.dueDate) : '',
    ]);

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `flowtiq-report-${startDate}-to-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exported');
  };

  // ── PDF Export (print) ───────────────────────────────────────────────────────

  const exportPDF = () => {
    window.print();
  };

  const kpi = data?.kpi;

  const PRESETS: { key: Preset; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'week', label: 'Last 7 Days' },
    { key: 'month', label: 'Last Month' },
    { key: 'quarter', label: 'Last Quarter' },
    { key: 'year', label: 'Last Year' },
    { key: 'custom', label: 'Custom' },
  ];

  return (
    <>
      <Header title="Reports" subtitle="Analytics and insights" />

      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 animate-slide-in print:p-0">

        {/* ── Filter bar ─────────────────────────────────────────────────────── */}
        <div className="card p-4 print:hidden">
          <div className="flex flex-wrap gap-3 items-end">
            {/* Preset tabs */}
            <div className="flex gap-1 overflow-x-auto scrollbar-none flex-shrink-0">
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => applyPreset(p.key)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors',
                    preset === p.key
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-600 hover:bg-slate-100',
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Custom date inputs */}
            {preset === 'custom' && (
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <Calendar size={14} className="text-slate-400 flex-shrink-0" />
                  <input
                    type="date"
                    className="form-input py-1.5 text-sm w-36"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <span className="text-slate-400 text-sm">to</span>
                <input
                  type="date"
                  className="form-input py-1.5 text-sm w-36"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            )}

            {/* Granularity */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500 whitespace-nowrap">Group by</label>
              <select
                className="form-select py-1.5 text-sm w-28"
                value={granularity}
                onChange={(e) => setGranularity(e.target.value)}
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>

            {/* Stage filter */}
            <div className="flex items-center gap-2">
              <Filter size={14} className="text-slate-400 flex-shrink-0" />
              <select
                className="form-select py-1.5 text-sm w-36"
                value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value)}
              >
                <option value="all">All Stages</option>
                {(stageOptions || []).map((s) => (
                  <option key={s.key} value={s.key}>{s.name}</option>
                ))}
              </select>
            </div>

            {/* Status filter */}
            <select
              className="form-select py-1.5 text-sm w-36"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="on_hold">On Hold</option>
              <option value="cancelled">Cancelled</option>
            </select>

            {/* Actions */}
            <div className="flex gap-2 ml-auto">
              <button
                onClick={() => refetch()}
                className="btn-secondary py-1.5 px-3 text-sm"
                title="Refresh"
              >
                <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
              </button>
              <button onClick={exportCSV} className="btn-secondary py-1.5 px-3 text-sm">
                <Download size={14} /> CSV
              </button>
              <button onClick={exportPDF} className="btn-secondary py-1.5 px-3 text-sm">
                <Download size={14} /> PDF
              </button>
            </div>
          </div>
        </div>

        {isLoading && (
          <div className="flex justify-center py-16">
            <svg className="animate-spin w-8 h-8 text-blue-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        )}

        {!isLoading && data && (
          <>
            {/* ── KPI Cards ─────────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <KpiCard label="Total Projects" value={kpi!.totalProjects} icon={FolderOpen} color="bg-blue-500" />
              <KpiCard label="Completed" value={kpi!.completedProjects} icon={CheckCircle} color="bg-emerald-500" />
              <KpiCard label="Active" value={kpi!.activeProjects} icon={TrendingUp} color="bg-violet-500" />
              <KpiCard label="Overdue" value={kpi!.overdueProjects} icon={AlertTriangle} color="bg-red-500" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <KpiCard
                label="Started in Period"
                value={kpi!.startedInPeriod}
                icon={Calendar}
                color="bg-sky-500"
                sub={`${formatDate(data.period.start)} – ${formatDate(data.period.end)}`}
              />
              <KpiCard
                label="Completed in Period"
                value={kpi!.completedInPeriod}
                icon={CheckCircle}
                color="bg-teal-500"
                sub={`${formatDate(data.period.start)} – ${formatDate(data.period.end)}`}
              />
              <KpiCard label="On Hold" value={kpi!.onHoldProjects} icon={Clock} color="bg-amber-500" />
              <KpiCard label="Cancelled" value={kpi!.cancelledProjects} icon={XCircle} color="bg-slate-400" />
            </div>

            {/* ── Charts row ────────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">

              {/* Trend line chart */}
              <div className="card p-4">
                <div className="flex items-center gap-2 mb-4">
                  <BarChart2 size={16} className="text-blue-500" />
                  <h3 className="font-semibold text-slate-800 text-sm">Project Trends</h3>
                </div>
                {data.trends.length === 0 ? (
                  <div className="h-48 flex items-center justify-center text-slate-400 text-sm">No data for this period</div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={data.trends} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                      <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                        labelStyle={{ fontWeight: 600, color: '#1e293b' }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Line type="monotone" dataKey="created" name="Created" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                      <Line type="monotone" dataKey="completed" name="Completed" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Status pie chart */}
              <div className="card p-4">
                <div className="flex items-center gap-2 mb-4">
                  <BarChart2 size={16} className="text-violet-500" />
                  <h3 className="font-semibold text-slate-800 text-sm">Status Breakdown</h3>
                </div>
                {data.statusDistribution.length === 0 ? (
                  <div className="h-48 flex items-center justify-center text-slate-400 text-sm">No data for this period</div>
                ) : (
                  <div className="flex items-center gap-4">
                    <ResponsiveContainer width="60%" height={200}>
                      <PieChart>
                        <Pie
                          data={data.statusDistribution}
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={85}
                          dataKey="count"
                          nameKey="name"
                          paddingAngle={2}
                        >
                          {data.statusDistribution.map((entry, i) => (
                            <Cell key={entry.status} fill={entry.color || STAGE_COLORS[i % STAGE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                          formatter={(val: number) => [val, 'Projects']}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex flex-col gap-2">
                      {data.statusDistribution.map((s) => (
                        <div key={s.status} className="flex items-center gap-2 text-xs">
                          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                          <span className="text-slate-600">{s.name}</span>
                          <span className="font-semibold text-slate-800 ml-auto pl-2">{s.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Stage distribution bar chart */}
            <div className="card p-4">
              <div className="flex items-center gap-2 mb-4">
                <BarChart2 size={16} className="text-indigo-500" />
                <h3 className="font-semibold text-slate-800 text-sm">Stage Distribution</h3>
              </div>
              {data.stageDistribution.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-slate-400 text-sm">No data for this period</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={data.stageDistribution}
                    margin={{ top: 5, right: 10, left: -20, bottom: 20 }}
                    barSize={32}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11, fill: '#94a3b8' }}
                      angle={-20}
                      textAnchor="end"
                      interval={0}
                    />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                      cursor={{ fill: '#f8fafc' }}
                    />
                    <Bar dataKey="count" name="Projects" radius={[4, 4, 0, 0]}>
                      {data.stageDistribution.map((entry, i) => (
                        <Cell key={entry.stage} fill={STAGE_COLORS[i % STAGE_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* ── Projects table ────────────────────────────────────────────── */}
            {data.projects.length > 0 && (
              <div className="card">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="font-semibold text-slate-800 text-sm">
                    Projects in Period
                    <span className="ml-2 text-slate-400 font-normal text-xs">({data.projects.length})</span>
                  </h3>
                  <button onClick={exportCSV} className="btn-secondary py-1 px-2.5 text-xs print:hidden">
                    <Download size={12} /> Export
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Title</th>
                        <th>Status</th>
                        <th>Stage</th>
                        <th>Owner</th>
                        <th>Created</th>
                        <th>Due Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.projects.map((p) => (
                        <tr key={p.id}>
                          <td className="font-medium text-slate-800 max-w-[200px] truncate">{p.title}</td>
                          <td>
                            <span className={cn(
                              'badge text-[11px]',
                              p.status === 'active' && 'badge-blue',
                              p.status === 'completed' && 'badge-green',
                              p.status === 'on_hold' && 'badge-yellow',
                              p.status === 'cancelled' && 'badge-red',
                            )}>
                              {p.status.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="text-sm text-slate-600 capitalize">
                            {p.currentStage?.replace(/_/g, ' ') || '—'}
                          </td>
                          <td className="text-sm text-slate-600">
                            {p.owner ? `${p.owner.firstName} ${p.owner.lastName}` : '—'}
                          </td>
                          <td className="text-sm text-slate-500">{formatDate(p.createdAt)}</td>
                          <td className="text-sm text-slate-500">{p.dueDate ? formatDate(p.dueDate) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {!isLoading && !data && (
          <div className="card p-12 text-center">
            <BarChart2 size={48} className="text-slate-200 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">Select a date range to generate report</p>
          </div>
        )}
      </div>
    </>
  );
}
