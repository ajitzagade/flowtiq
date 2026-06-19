import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, formatDistanceToNow, isPast, isToday, isTomorrow } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date | null | undefined, fmt = 'dd MMM yyyy'): string {
  if (!date) return '-';
  return format(new Date(date), fmt);
}

export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '-';
  return format(new Date(date), 'dd MMM yyyy, hh:mm a');
}

export function formatRelative(date: string | Date | null | undefined): string {
  if (!date) return '-';
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

export function formatFollowUpDate(date: string | Date): string {
  const d = new Date(date);
  if (isToday(d)) return 'Today';
  if (isTomorrow(d)) return 'Tomorrow';
  if (isPast(d)) return `Overdue (${formatDate(d)})`;
  return formatDate(d);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatStorageSize(bytes: number): string {
  return formatFileSize(bytes);
}

export function getInitials(firstName: string, lastName: string): string {
  return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase();
}

export function getAvatarColor(name: string): string {
  const colors = [
    'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-red-500',
    'bg-slate-500', 'bg-blue-700', 'bg-emerald-700', 'bg-amber-700',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export function getStatusBadgeClass(status: string): string {
  const map: Record<string, string> = {
    active: 'badge-green',
    completed: 'badge-blue',
    on_hold: 'badge-yellow',
    cancelled: 'badge-red',
    pending: 'badge-yellow',
    in_progress: 'badge-blue',
    overdue: 'badge-red',
    skipped: 'badge-gray',
  };
  return map[status] || 'badge-gray';
}

export function getPriorityBadgeClass(priority: string): string {
  const map: Record<string, string> = {
    low: 'badge-gray',
    medium: 'badge-blue',
    high: 'badge-orange',
    urgent: 'badge-red',
  };
  return map[priority] || 'badge-gray';
}

export function getStatusLabel(status: string): string {
  const map: Record<string, string> = {
    active: 'Active',
    completed: 'Completed',
    on_hold: 'On Hold',
    cancelled: 'Cancelled',
    pending: 'Pending',
    in_progress: 'In Progress',
    overdue: 'Overdue',
    skipped: 'Skipped',
  };
  return map[status] || status;
}

export function getPriorityLabel(priority: string): string {
  const map: Record<string, string> = {
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    urgent: 'Urgent',
  };
  return map[priority] || priority;
}

export function truncate(str: string, len = 50): string {
  if (!str) return '';
  return str.length > len ? `${str.slice(0, len)}...` : str;
}

// ── Stage / Progress Utilities ────────────────────────────────────────────────

export const DEFAULT_WORKFLOW_STAGES: Array<{ key: string; name: string; order: number }> = [
  { key: 'file_creation', name: 'File Creation', order: 1 },
  { key: 'inward', name: 'Inward', order: 2 },
  { key: 'scrutiny', name: 'Scrutiny', order: 3 },
  { key: 'report_generation', name: 'Report Generation', order: 4 },
  { key: 'approval', name: 'Approval', order: 5 },
  { key: 'completed_stage', name: 'Completed', order: 6 },
];

/** Ordered colors for lifecycle stages (index-based, not key-based) */
const STAGE_PALETTE = [
  '#94a3b8', // slate   – File Creation / New
  '#38bdf8', // sky     – Inward / Gathering
  '#3b82f6', // blue    – Scrutiny / Analysis
  '#8b5cf6', // violet  – Report / Design
  '#f59e0b', // amber   – Approval / UAT
  '#14b8a6', // teal    – Deployment
  '#10b981', // emerald – Completed
];

export function getStageColor(stageIndex: number, totalStages: number): string {
  if (stageIndex >= totalStages - 1) return '#10b981';
  return STAGE_PALETTE[Math.min(stageIndex, STAGE_PALETTE.length - 2)];
}

export interface StageProgress {
  percent: number;
  stageIndex: number;
  stageName: string;
  color: string;
}

export function getProjectProgress(
  currentStage: string | undefined,
  status: string,
  stages: Array<{ key: string; name: string; order: number }>
): StageProgress {
  if (status === 'completed') {
    return { percent: 100, stageIndex: stages.length - 1, stageName: 'Completed', color: '#10b981' };
  }
  if (status === 'cancelled') {
    return { percent: 0, stageIndex: -1, stageName: 'Cancelled', color: '#ef4444' };
  }
  if (!currentStage) {
    return { percent: 0, stageIndex: -1, stageName: 'Not Started', color: '#94a3b8' };
  }

  const sorted = [...stages].sort((a, b) => a.order - b.order);
  const idx = sorted.findIndex((s) => s.key === currentStage);

  if (idx === -1) {
    // Unknown stage key – show as partial
    return { percent: 10, stageIndex: 0, stageName: currentStage.replace(/_/g, ' '), color: '#94a3b8' };
  }

  const percent = Math.round(((idx + 1) / sorted.length) * 100);
  return { percent, stageIndex: idx, stageName: sorted[idx].name, color: getStageColor(idx, sorted.length) };
}

export function debounce<T extends (...args: unknown[]) => unknown>(fn: T, ms: number): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return function (...args: Parameters<T>) {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export function getErrorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const e = error as Record<string, unknown>;
    if (e.response && typeof e.response === 'object') {
      const resp = e.response as Record<string, unknown>;
      const d = resp.data as Record<string, unknown> | undefined;
      if (d?.error) return String(d.error);
      if (d?.message) return String(d.message);
    }
    if (typeof e.message === 'string') return e.message;
  }
  return 'An unexpected error occurred';
}
