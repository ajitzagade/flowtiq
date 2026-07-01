'use client';

import { useState, useRef, useCallback, useEffect, useMemo, Suspense } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { get, post, patch, del } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import {
  Plus, Search, FolderKanban, Edit, Eye, Trash2, X,
  ChevronLeft, ChevronRight, LayoutList, Kanban, ChevronDown, GitBranch,
  ArrowUp, ArrowDown, GripVertical,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { ProjectProgress } from '@/components/ProjectProgress';
import { useRouter, useSearchParams } from 'next/navigation';
import { formatDate, getStatusBadgeClass, getPriorityBadgeClass, cn, truncate, getErrorMessage } from '@/lib/utils';
import { ConfirmModal } from '@/components/ConfirmModal';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { SkeletonCard, SkeletonTable } from '@/components/Skeleton';
import Link from 'next/link';
import type { Project, User, WorkflowTemplate } from '@flowtiq/shared-types';

// ── Types ─────────────────────────────────────────────────────────────────────
interface StageColumn {
  key: string;
  name: string;
  order: number;
  color: string;
  isNoStage?: boolean;
  isCompleted?: boolean;
}

const PALETTE = [
  '#3b82f6', '#0ea5e9', '#10b981', '#f59e0b',
  '#ef4444', '#64748b', '#1d4ed8', '#0ea5e9', '#f97316', '#94a3b8',
];

// ── KanbanCard ─────────────────────────────────────────────────────────────────
function KanbanCard({
  project,
  isDragging,
  onDragStart,
  onDragEnd,
  onEdit,
}: {
  project: Project;
  isDragging: boolean;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onEdit: (p: Project) => void;
}) {
  const router = useRouter();

  // Priority-based card theming
  const cardTheme: Record<string, { bg: string; border: string; titleColor: string; clientColor: string; numColor: string; dueColor: string; editHover: string }> = {
    urgent: {
      bg: 'bg-rose-50',
      border: 'border-rose-200',
      titleColor: 'text-rose-950',
      clientColor: 'text-rose-700',
      numColor: 'text-rose-400',
      dueColor: 'text-rose-600',
      editHover: 'hover:text-rose-700',
    },
    high: {
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      titleColor: 'text-amber-950',
      clientColor: 'text-amber-700',
      numColor: 'text-amber-500',
      dueColor: 'text-amber-600',
      editHover: 'hover:text-amber-700',
    },
    medium: {
      bg: 'bg-sky-50',
      border: 'border-sky-200',
      titleColor: 'text-sky-950',
      clientColor: 'text-sky-700',
      numColor: 'text-sky-500',
      dueColor: 'text-sky-600',
      editHover: 'hover:text-sky-700',
    },
    low: {
      bg: 'bg-slate-50',
      border: 'border-slate-200',
      titleColor: 'text-slate-800',
      clientColor: 'text-slate-600',
      numColor: 'text-slate-500',
      dueColor: 'text-slate-600',
      editHover: 'hover:text-slate-700',
    },
  };

  const theme = cardTheme[project.priority] ?? cardTheme.low;

  return (
    <div
      draggable
      data-project-id={project.id}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', project.id);
        e.dataTransfer.setData('application/workflow-id', project.workflowId ?? '');
        onDragStart(project.id);
      }}
      onDragEnd={onDragEnd}
      onClick={() => router.push(`/projects/${project.id}`)}
      className={cn(
        'border rounded-xl p-3 cursor-grab active:cursor-grabbing select-none group transition-all duration-150',
        theme.bg,
        isDragging
          ? `opacity-40 rotate-1 shadow-lg border-blue-300`
          : `${theme.border} hover:shadow-md shadow-sm hover:brightness-95`,
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <p className={cn('text-sm font-semibold leading-snug line-clamp-2 flex-1', theme.titleColor)}>{project.name}</p>
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(project); }}
          aria-label={`Edit ${project.name}`}
          className={cn('p-1 rounded opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity text-slate-400', theme.editHover)}
        >
          <Edit size={13} />
        </button>
      </div>
      <p className={cn('text-xs font-medium mb-2.5 truncate', theme.clientColor)}>{project.clientName}</p>
      <div className="flex items-center gap-1 flex-wrap mb-2.5">
        <span className={cn('text-[10px] font-mono font-semibold flex-1 truncate', theme.numColor)}>{project.projectNumber}</span>
        <span className={cn('badge text-[10px] px-1.5 py-0', getPriorityBadgeClass(project.priority))}>
          {project.priority}
        </span>
        <span className={cn('badge text-[10px] px-1.5 py-0', getStatusBadgeClass(project.status))}>
          {project.status.replace('_', ' ')}
        </span>
      </div>
      <ProjectProgress
        currentStage={project.currentStage}
        status={project.status}
        progressPct={project.overallProgressPct}
        completedStages={project.completedStages}
        totalStages={project.totalStages}
        compact
      />
      {project.dueDate && (
        <p className={cn('text-[10px] font-medium mt-2', theme.dueColor)}>Due {formatDate(project.dueDate)}</p>
      )}
    </div>
  );
}

// ── WorkflowKanban — stage columns + drag-drop for ONE workflow's projects ─────
function WorkflowKanban({
  stages,
  projects,
  searchTerm,
  onEdit,
  sectionWorkflowId,
  highlightStageKey,
}: {
  stages: StageColumn[];
  projects: Project[];
  searchTerm: string;
  onEdit: (p: Project) => void;
  sectionWorkflowId: string | null;
  highlightStageKey?: string | null;
}) {
  const qc = useQueryClient();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const draggingIdRef = useRef<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const dragCounters = useRef<Record<string, number>>({});

  const searchLower = searchTerm.toLowerCase();
  const filtered = searchTerm
    ? projects.filter((p) =>
        p.name.toLowerCase().includes(searchLower) ||
        p.projectNumber.toLowerCase().includes(searchLower) ||
        p.clientName.toLowerCase().includes(searchLower)
      )
    : projects;

  const allStageKeys = new Set(stages.map((s) => s.key));
  const buckets: Record<string, Project[]> = { __no_stage__: [], __completed__: [] };
  for (const s of stages) buckets[s.key] = [];
  for (const p of filtered) {
    // For multi-workflow projects: find the active stage key within THIS workflow section
    const pws = p.projectWorkflows as Array<{ workflowTemplateId: string; currentStageKey?: string | null; status?: string }> | undefined;
    const pw = pws?.find((w) => w.workflowTemplateId === sectionWorkflowId);
    // Prefer per-workflow active stage; fall back to Project.currentStage for legacy single-workflow projects
    const key = pw?.currentStageKey ?? (pws && pws.length > 0 ? null : (p.currentStage ?? '')) ?? '';
    if (key && allStageKeys.has(key)) {
      buckets[key].push(p);
    } else if (pw?.status === 'completed') {
      buckets['__completed__'].push(p);
    } else {
      buckets['__no_stage__'].push(p);
    }
  }

  const moveMutation = useMutation({
    mutationFn: ({ id, stageKey }: { id: string; stageKey: string }) =>
      patch(`/projects/${id}`, {
        currentStage: stageKey === '__no_stage__' ? null : stageKey,
        workflowTemplateId: sectionWorkflowId ?? undefined,
      }),
    onSuccess: (_, vars) => {
      const stageName = vars.stageKey === '__no_stage__'
        ? 'No Stage'
        : (stages.find((s) => s.key === vars.stageKey)?.name ?? vars.stageKey);
      toast.success(`Moved to ${stageName}`);
      qc.invalidateQueries({ queryKey: ['projects', 'kanban'] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent, stageKey: string) => {
    e.preventDefault();
    dragCounters.current[stageKey] = (dragCounters.current[stageKey] ?? 0) + 1;
    setDragOverStage(stageKey);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent, stageKey: string) => {
    dragCounters.current[stageKey] = Math.max(0, (dragCounters.current[stageKey] ?? 1) - 1);
    if (dragCounters.current[stageKey] === 0) {
      setDragOverStage((prev) => (prev === stageKey ? null : prev));
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, stageKey: string) => {
    e.preventDefault();
    dragCounters.current[stageKey] = 0;

    const draggedWorkflowId = e.dataTransfer.getData('application/workflow-id');
    const expected = sectionWorkflowId ?? '';
    // Allow drop when draggedWorkflowId is empty (programmatic DragEvents used in tests
    // can't set dataTransfer data); in that case fall through to the draggingId ref fallback.
    if (draggedWorkflowId && draggedWorkflowId !== expected) {
      draggingIdRef.current = null;
      setDraggingId(null);
      setDragOverStage(null);
      return;
    }

    // Use ref as fallback — avoids stale useCallback closure when the drop fires
    // before React re-renders with updated draggingId state (e.g. programmatic DragEvents).
    const projectId = e.dataTransfer.getData('text/plain') || draggingIdRef.current;
    if (projectId) {
      const project = filtered.find((p) => p.id === projectId);
      const pws = project?.projectWorkflows as Array<{ workflowTemplateId: string; currentStageKey?: string | null }> | undefined;
      const pw = pws?.find((w) => w.workflowTemplateId === sectionWorkflowId);
      const currentKey = (sectionWorkflowId ? (pw?.currentStageKey ?? null) : project?.currentStage) ?? '__no_stage__';
      if (currentKey !== stageKey) {
        moveMutation.mutate({ id: projectId, stageKey });
      }
    }
    draggingIdRef.current = null;
    setDraggingId(null);
    setDragOverStage(null);
  }, [filtered, moveMutation, sectionWorkflowId]);

  const handleDragEnd = useCallback(() => {
    draggingIdRef.current = null;
    setDraggingId(null);
    setDragOverStage(null);
    dragCounters.current = {};
  }, []);

  const noStageProjects = buckets['__no_stage__'] ?? [];
  const completedWfProjects = buckets['__completed__'] ?? [];
  const columns: StageColumn[] = [
    ...(noStageProjects.length > 0
      ? [{ key: '__no_stage__', name: 'No Stage', order: 0, color: '#94a3b8', isNoStage: true }]
      : []),
    ...stages,
    ...(completedWfProjects.length > 0
      ? [{ key: '__completed__', name: 'Workflow Done', order: 998, color: '#10b981', isCompleted: true }]
      : []),
  ];

  if (filtered.length === 0 && searchTerm) {
    return <p className="text-sm text-slate-400 py-4 text-center">No matching projects</p>;
  }

  if (columns.length === 0) {
    return <p className="text-sm text-slate-400 py-4 text-center">No stages configured for this workflow</p>;
  }

  return (
    <div className="overflow-x-auto pb-2 -mx-1 px-1">
      <div className="flex gap-3 items-start" style={{ minWidth: `${columns.length * 272}px` }}>
        {columns.map((col) => {
          const colProjects = buckets[col.key] ?? [];
          const isOver = dragOverStage === col.key && draggingId !== null;
          const isMoving = moveMutation.isPending && moveMutation.variables?.stageKey === col.key;
          const isHighlighted = highlightStageKey === col.key;

          return (
            <div
              key={col.key}
              data-stage-key={col.key}
              className={cn(
                'flex flex-col w-64 flex-shrink-0 rounded-xl border bg-white transition-all duration-150 overflow-hidden',
                isOver ? 'border-blue-300 shadow-lg' : isHighlighted ? 'border-blue-400 shadow-xl ring-2 ring-blue-300 ring-offset-1' : 'border-slate-200 shadow-sm',
                col.isNoStage && 'opacity-75',
                col.isCompleted && 'bg-emerald-50/30',
                isHighlighted && 'bg-blue-50/40',
              )}
              style={{ borderTopColor: col.color, borderTopWidth: isHighlighted ? 4 : 3 }}
              onDragOver={col.isCompleted ? undefined : handleDragOver}
              onDragEnter={col.isCompleted ? undefined : (e) => handleDragEnter(e, col.key)}
              onDragLeave={col.isCompleted ? undefined : (e) => handleDragLeave(e, col.key)}
              onDrop={col.isCompleted ? undefined : (e) => handleDrop(e, col.key)}
            >
              {/* Column header */}
              <div className="flex items-center justify-between px-3 py-2.5 flex-shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: col.color }}
                  />
                  <span className={cn(
                    'text-[11px] font-bold uppercase tracking-wider truncate',
                    col.isCompleted ? 'text-emerald-700' : 'text-slate-600',
                  )}>
                    {col.name}
                  </span>
                </div>
                <span className={cn(
                  'text-[11px] font-semibold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5 flex-shrink-0 ml-2',
                  isMoving ? 'bg-blue-100 text-blue-600' : col.isCompleted ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500',
                )}>
                  {colProjects.length}
                </span>
              </div>

              {/* Drop highlight bar */}
              <div className={cn(
                'mx-3 h-0.5 rounded-full transition-all duration-150 -mt-1 mb-1',
                isOver ? 'bg-blue-400' : 'bg-transparent',
              )} />

              {/* Cards */}
              <div className="overflow-y-auto px-3 pb-3 space-y-2 min-h-[120px] max-h-[440px]">
                {colProjects.length === 0 && (
                  <div className={cn(
                    'h-20 rounded-xl border-2 border-dashed flex items-center justify-center text-xs transition-colors',
                    isOver
                      ? 'border-blue-300 text-blue-400 bg-blue-50'
                      : 'border-slate-100 text-slate-300',
                  )}>
                    {isOver ? 'Drop here' : 'No projects'}
                  </div>
                )}
                {colProjects.map((project) => (
                  <KanbanCard
                    key={project.id}
                    project={project}
                    isDragging={draggingId === project.id}
                    onDragStart={(id) => { draggingIdRef.current = id; setDraggingId(id); }}
                    onDragEnd={handleDragEnd}
                    onEdit={onEdit}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── WorkflowSection — accordion wrapper ────────────────────────────────────────
function WorkflowSection({
  workflow,
  projects,
  searchTerm,
  onEdit,
  defaultExpanded,
  onMoveUp,
  onMoveDown,
  isHighlighted,
  highlightStageKey,
  sectionRef,
  draggable,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
  isDragOver,
}: {
  workflow: WorkflowTemplate | null;
  projects: Project[];
  searchTerm: string;
  onEdit: (p: Project) => void;
  defaultExpanded: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  isHighlighted?: boolean;
  highlightStageKey?: string | null;
  sectionRef?: React.RefObject<HTMLDivElement>;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  isDragOver?: boolean;
}) {
  const [manualExpanded, setManualExpanded] = useState(defaultExpanded || !!isHighlighted);
  // If highlighted from outside, force expand
  const expanded = searchTerm.length > 0 || isHighlighted ? true : manualExpanded;

  // Build stages from workflow template stages (with their colors)
  // Handle both { key, name } (new workflows) and { stageKey, stageName } (legacy) formats
  const stages: StageColumn[] = workflow?.stages
    ? (workflow.stages as Array<{ key?: string; stageKey?: string; name?: string; stageName?: string; order: number; color?: string; requiresApproval?: boolean }>)
        .sort((a, b) => a.order - b.order)
        .map((s, idx) => ({
          key: (s.key ?? s.stageKey ?? '').trim(),
          name: (s.name ?? s.stageName ?? '').trim(),
          order: s.order,
          color: s.color || PALETTE[idx % PALETTE.length],
        }))
        .filter((s) => s.key)
    : []; // null workflow → no stages → all land in __no_stage__

  return (
    <div
      ref={sectionRef}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDrop={onDrop}
      className={cn(
        'overflow-hidden transition-all duration-200 rounded-xl border bg-white',
        isHighlighted ? 'ring-2 ring-blue-400 ring-offset-1' : '',
        isDragOver ? 'ring-2 ring-blue-300 ring-offset-1 scale-[1.01]' : '',
      )}
      style={{ borderColor: isDragOver ? '#93c5fd' : '#dde3f8', boxShadow: '0 4px 16px rgba(59,130,246,0.08), 0 1px 4px rgba(0,0,0,0.06)' }}
    >
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setManualExpanded(!manualExpanded)}
        className={cn('w-full px-5 py-4 flex items-center justify-between transition-colors text-left', isHighlighted ? 'bg-blue-50/60' : 'bg-gradient-to-r from-slate-50 to-white hover:from-indigo-50/60 hover:to-white')}
      >
        <div className="flex items-center gap-3">
          {draggable && (
            <div
              className="text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing flex-shrink-0 transition-colors"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              title="Drag to reorder"
            >
              <GripVertical size={16} />
            </div>
          )}
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg,#3b82f6,#1d4ed8)' }}>
            <GitBranch size={15} className="text-white" />
          </div>
          <span className="font-semibold text-slate-800 text-sm">
            {workflow?.name ?? 'No Workflow Assigned'}
          </span>
          {workflow?.isDefault && (
            <span className="badge badge-blue text-[10px] py-0">Default</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-bold rounded-full px-3 py-1 flex-shrink-0"
            style={projects.length > 0
              ? { background: 'linear-gradient(135deg,#3b82f6,#1d4ed8)', color: '#fff', boxShadow: '0 2px 8px rgba(59,130,246,0.25)' }
              : { background: '#f1f5f9', color: '#94a3b8' }}
          >
            {projects.length} project{projects.length !== 1 ? 's' : ''}
          </span>
          {(onMoveUp || onMoveDown) && (
            <div className="flex flex-col gap-0.5" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={onMoveUp}
                disabled={!onMoveUp}
                className="p-0.5 text-slate-300 hover:text-slate-600 disabled:opacity-0 disabled:pointer-events-none transition-colors rounded"
                title="Move up"
              >
                <ArrowUp size={13} />
              </button>
              <button
                type="button"
                onClick={onMoveDown}
                disabled={!onMoveDown}
                className="p-0.5 text-slate-300 hover:text-slate-600 disabled:opacity-0 disabled:pointer-events-none transition-colors rounded"
                title="Move down"
              >
                <ArrowDown size={13} />
              </button>
            </div>
          )}
          <ChevronDown
            size={16}
            aria-hidden="true"
            className={cn('text-slate-400 transition-transform duration-200 flex-shrink-0', expanded ? 'rotate-0' : '-rotate-90')}
          />
        </div>
      </button>

      {expanded && (
        <div className="p-4" style={{ borderTop: '1px solid #eef0f8' }}>
          <WorkflowKanban
            stages={stages}
            projects={projects}
            searchTerm={searchTerm}
            onEdit={onEdit}
            sectionWorkflowId={workflow?.id ?? null}
            highlightStageKey={isHighlighted ? highlightStageKey : null}
          />
        </div>
      )}
    </div>
  );
}

// ── KanbanBoard — groups projects by workflowId, renders accordion sections ────
function KanbanBoard({ onEdit, highlightWorkflowId, highlightStageKey, boardSearch }: {
  onEdit: (p: Project) => void;
  highlightWorkflowId?: string | null;
  highlightStageKey?: string | null;
  boardSearch: string;
}) {
  const highlightRef = useRef<HTMLDivElement>(null);
  const draggedId = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [sectionOrder, setSectionOrder] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = localStorage.getItem('kanban-section-order');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  const { data: allProjectsData, isLoading } = useQuery({
    queryKey: ['projects', 'kanban'],
    queryFn: () => get<{ items: Project[] }>('/projects', { pageSize: 500 }),
    refetchInterval: 30000,
  });

  const { data: allWorkflows } = useQuery({
    queryKey: ['workflows'],
    queryFn: () => get<WorkflowTemplate[]>('/workflows'),
  });

  const workflows = allWorkflows ?? [];

  // Default workflow first, then others alphabetically — then apply user-preferred order
  const defaultSorted: WorkflowTemplate[] = [
    ...workflows.filter((w) => w.isDefault),
    ...workflows.filter((w) => !w.isDefault).sort((a, b) => a.name.localeCompare(b.name)),
  ];

  // Must be before any early returns to satisfy Rules of Hooks
  const orderedWorkflows = useMemo(() => {
    if (sectionOrder.length === 0) return defaultSorted;
    const orderMap = new Map(sectionOrder.map((wid, i) => [wid, i]));
    return [...defaultSorted].sort((a, b) => {
      const ai = orderMap.has(a.id) ? orderMap.get(a.id)! : 999;
      const bi = orderMap.has(b.id) ? orderMap.get(b.id)! : 999;
      return ai - bi;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflows, sectionOrder]);

  // Auto-scroll to highlighted workflow section after data loads
  useEffect(() => {
    if (!highlightWorkflowId || !highlightRef.current) return;
    const timer = setTimeout(() => {
      highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 300);
    return () => clearTimeout(timer);
  }, [highlightWorkflowId, highlightRef.current]);

  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        {[1, 2, 3].map((i) => <SkeletonCard key={i} rows={3} />)}
      </div>
    );
  }

  // Exclude completed projects from kanban — they live on the Completed Projects page
  const projects = (allProjectsData?.items ?? []).filter((p) => p.status !== 'completed');

  // Group projects under EACH workflow they belong to via projectWorkflows
  const byWorkflow = new Map<string | null, Project[]>();
  for (const p of projects) {
    const pws = p.projectWorkflows as Array<{ workflowTemplateId: string; currentStageKey?: string | null }> | undefined;
    if (pws && pws.length > 0) {
      // Project appears in every workflow section it's attached to
      for (const pw of pws) {
        const key = pw.workflowTemplateId;
        if (!byWorkflow.has(key)) byWorkflow.set(key, []);
        byWorkflow.get(key)!.push(p);
      }
    } else {
      // Legacy: single workflowId or no workflow
      const key = p.workflowId ?? null;
      if (!byWorkflow.has(key)) byWorkflow.set(key, []);
      byWorkflow.get(key)!.push(p);
    }
  }

  const moveSection = (wfId: string, direction: 'up' | 'down') => {
    const current = orderedWorkflows.map((w) => w.id);
    const idx = current.indexOf(wfId);
    if (direction === 'up' && idx <= 0) return;
    if (direction === 'down' && idx >= current.length - 1) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    const newOrder = [...current];
    [newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]];
    setSectionOrder(newOrder);
    localStorage.setItem('kanban-section-order', JSON.stringify(newOrder));
  };

  const handleDragStart = (e: React.DragEvent, wfId: string) => {
    draggedId.current = wfId;
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, wfId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedId.current && draggedId.current !== wfId) setDragOverId(wfId);
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const srcId = draggedId.current;
    if (!srcId || srcId === targetId) { setDragOverId(null); return; }
    const current = orderedWorkflows.map((w) => w.id);
    const fromIdx = current.indexOf(srcId);
    const toIdx = current.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) { setDragOverId(null); return; }
    const newOrder = [...current];
    newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, srcId);
    setSectionOrder(newOrder);
    localStorage.setItem('kanban-section-order', JSON.stringify(newOrder));
    draggedId.current = null;
    setDragOverId(null);
  };

  const handleDragEnd = () => {
    draggedId.current = null;
    setDragOverId(null);
  };

  const noWorkflowProjects = byWorkflow.get(null) ?? [];

  return (
    <div className="space-y-3">
      {/* One accordion section per workflow — each with its OWN stage columns */}
      {orderedWorkflows.map((workflow, idx) => {
        const workflowProjects = byWorkflow.get(workflow.id) ?? [];
        const isHighlighted = highlightWorkflowId === workflow.id;
        return (
          <WorkflowSection
            key={workflow.id}
            workflow={workflow}
            projects={workflowProjects}
            searchTerm={boardSearch}
            onEdit={onEdit}
            defaultExpanded={false}
            onMoveUp={idx > 0 ? () => moveSection(workflow.id, 'up') : undefined}
            onMoveDown={idx < orderedWorkflows.length - 1 ? () => moveSection(workflow.id, 'down') : undefined}
            isHighlighted={isHighlighted}
            highlightStageKey={highlightStageKey}
            sectionRef={isHighlighted ? highlightRef : undefined}
            draggable
            onDragStart={(e) => handleDragStart(e, workflow.id)}
            onDragOver={(e) => handleDragOver(e, workflow.id)}
            onDrop={(e) => handleDrop(e, workflow.id)}
            onDragEnd={handleDragEnd}
            isDragOver={dragOverId === workflow.id}
          />
        );
      })}

      {/* Projects with no workflow assigned */}
      {noWorkflowProjects.length > 0 && (
        <WorkflowSection
          key="__no_workflow__"
          workflow={null}
          projects={noWorkflowProjects}
          searchTerm={boardSearch}
          onEdit={onEdit}
          defaultExpanded={false}
        />
      )}

      {projects.length === 0 && (
        <div className="card">
          <div className="empty-state">
            <FolderKanban size={48} className="text-slate-200 mb-3" />
            <p className="font-medium text-slate-500">No projects yet</p>
            <p className="text-slate-400 text-sm mt-1">Create your first project to get started</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── ProjectModal ───────────────────────────────────────────────────────────────
const projectSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  description: z.string().optional(),
  clientName: z.string().min(1, 'Client name is required'),
  location: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  startDate: z.string().optional(),
  dueDate: z.string().optional(),
  ownerId: z.string().min(1, 'Owner is required'),
  followUpOwnerId: z.string().optional(),
});

type ProjectForm = z.infer<typeof projectSchema>;

function ProjectModal({
  project,
  onClose,
}: {
  project?: Project | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const modalRef = useRef<HTMLDivElement>(null);
  useFocusTrap(modalRef, true);
  const [selectedWorkflowIds, setSelectedWorkflowIds] = useState<string[]>([]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const { data: users } = useQuery<User[]>({
    queryKey: ['users', 'members'],
    queryFn: () => get<User[]>('/users/members'),
  });

  const { data: workflows } = useQuery<WorkflowTemplate[]>({
    queryKey: ['workflows'],
    queryFn: () => get<WorkflowTemplate[]>('/workflows'),
  });

  // Pre-select workflows when editing — only run when the project changes, not on every workflows refetch
  useEffect(() => {
    if (!project) return;
    const existingIds = (project.projectWorkflows as Array<{ workflowTemplateId: string }> | undefined)
      ?.map((pw) => pw.workflowTemplateId) ?? [];
    if (existingIds.length > 0) {
      setSelectedWorkflowIds(existingIds);
    } else if (project.workflowId) {
      setSelectedWorkflowIds([project.workflowId]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProjectForm>({
    resolver: zodResolver(projectSchema),
    defaultValues: project
      ? {
          name: project.name,
          description: project.description,
          clientName: project.clientName,
          location: project.location,
          priority: project.priority,
          startDate: project.startDate?.split('T')[0],
          dueDate: project.dueDate?.split('T')[0],
          ownerId: project.ownerId,
          followUpOwnerId: project.followUpOwnerId || '',
        }
      : { priority: 'medium' },
  });

  const toggleWorkflow = (id: string) => {
    setSelectedWorkflowIds((prev) =>
      prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id],
    );
  };

  const onSubmit = async (data: ProjectForm) => {
    try {
      const payload = { ...data, workflowIds: selectedWorkflowIds };
      if (project) {
        await patch(`/projects/${project.id}`, payload);
        toast.success('Project updated');
      } else {
        await post('/projects', payload);
        toast.success('Project created');
      }
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const userList = users || [];
  const workflowList = workflows || [];

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={modalRef} className="modal-content max-w-2xl w-full" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="card-header">
          <h3 id="modal-title">{project ? 'Edit Project' : 'New Project'}</h3>
          <button onClick={onClose} aria-label="Close" className="btn-ghost p-1.5 rounded-lg">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="card-body">
          <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="form-label">Project Name *</label>
              <input className={cn('form-input', errors.name && 'border-red-400')} placeholder="e.g. Sunrise Residency - Building Plan" {...register('name')} />
              {errors.name && <p className="form-error">{errors.name.message}</p>}
            </div>

            <div className="col-span-2">
              <label className="form-label">Project Description</label>
              <textarea
                rows={3}
                className={cn('form-input resize-none', errors.description && 'border-red-400')}
                placeholder="Describe the project scope, objectives, and key details..."
                {...register('description')}
              />
            </div>

            <div>
              <label className="form-label">Client Name *</label>
              <input className={cn('form-input', errors.clientName && 'border-red-400')} placeholder="Client or company name" {...register('clientName')} />
              {errors.clientName && <p className="form-error">{errors.clientName.message}</p>}
            </div>

            <div>
              <label className="form-label">Location</label>
              <input className="form-input" placeholder="e.g. Andheri West, Mumbai" {...register('location')} />
            </div>

            <div>
              <label className="form-label">Priority</label>
              <select className="form-select" {...register('priority')}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>

            <div>
              <label className="form-label">Start Date</label>
              <input type="date" className="form-input" {...register('startDate')} />
            </div>

            <div>
              <label className="form-label">Due Date</label>
              <input type="date" className="form-input" {...register('dueDate')} />
            </div>

            <div className="col-span-2">
              <label className="form-label">Workflows</label>
              {workflowList.length === 0 ? (
                <p className="text-sm text-slate-400">No workflows available</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                  {workflowList.map((w) => {
                    const checked = selectedWorkflowIds.includes(w.id);
                    return (
                      <label
                        key={w.id}
                        className={cn(
                          'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors select-none',
                          checked
                            ? 'border-blue-300 bg-blue-50 text-blue-800'
                            : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleWorkflow(w.id)}
                          className="accent-blue-600 w-4 h-4 flex-shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{w.name}</p>
                          {w.isDefault && (
                            <p className="text-[10px] text-blue-500 font-medium">Default</p>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
              {selectedWorkflowIds.length > 0 && (
                <p className="text-xs text-slate-500 mt-1.5">
                  {selectedWorkflowIds.length} workflow{selectedWorkflowIds.length !== 1 ? 's' : ''} selected
                </p>
              )}
            </div>

            <div>
              <label className="form-label">Project Owner *</label>
              <select className={cn('form-select', errors.ownerId && 'border-red-400')} {...register('ownerId')}>
                <option value="">Select owner</option>
                {userList.map((u) => (
                  <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                ))}
              </select>
              {errors.ownerId && <p className="form-error">{errors.ownerId.message}</p>}
            </div>

            <div>
              <label className="form-label">Follow-up Owner</label>
              <select className="form-select" {...register('followUpOwnerId')}>
                <option value="">Select follow-up owner</option>
                {userList.map((u) => (
                  <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                ))}
              </select>
            </div>

            <div className="col-span-2 flex justify-end gap-3 pt-2">
              <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={isSubmitting} className="btn-primary">
                {isSubmitting ? 'Saving...' : project ? 'Save Changes' : 'Create Project'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ── ProjectsPage ───────────────────────────────────────────────────────────────
function ProjectsPageInner() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const userPermissions = (user?.permissions as string[] | undefined) ?? [];
  const canCreateProject = user?.isSuperAdmin || userPermissions.includes('projects:create');
  const canEditProject = user?.isSuperAdmin || userPermissions.includes('projects:edit');
  const canDeleteProject = user?.isSuperAdmin || userPermissions.includes('projects:delete');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [workflowFilter, setWorkflowFilter] = useState('');
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [boardSearch, setBoardSearch] = useState('');
  const router = useRouter();
  const searchParams = useSearchParams();
  const [view, setView] = useState<'list' | 'kanban'>(() =>
    searchParams.get('view') === 'list' ? 'list' : 'kanban'
  );

  // Auto-open create modal when navigated to with ?new=1
  useEffect(() => {
    if (searchParams.get('new') === '1') setShowModal(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [highlightWorkflowId] = useState<string | null>(() => searchParams.get('workflowId'));
  const [highlightStageKey, setHighlightStageKey] = useState<string | null>(() => searchParams.get('stage'));

  // Clear highlight after 3 seconds
  useEffect(() => {
    if (!highlightStageKey) return;
    const timer = setTimeout(() => setHighlightStageKey(null), 3000);
    return () => clearTimeout(timer);
  }, [highlightStageKey]);

  const { data: workflows } = useQuery<WorkflowTemplate[]>({
    queryKey: ['workflows'],
    queryFn: () => get<WorkflowTemplate[]>('/workflows'),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['projects', page, search, status, priority, workflowFilter],
    queryFn: () =>
      get<{ items: Project[]; total: number; totalPages: number }>('/projects', {
        page,
        pageSize: 15,
        search: search || undefined,
        status: status || undefined,
        priority: priority || undefined,
        workflowId: workflowFilter || undefined,
      }),
    placeholderData: (prev) => prev,
    refetchInterval: 30000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => del(`/projects/${id}`),
    onSuccess: () => {
      toast.success('Project cancelled');
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const projects = data?.items || [];
  const totalPages = data?.totalPages || 1;

  return (
    <>
      <Header title="Projects" subtitle="Manage and track all your projects" />
      <ConfirmModal
        isOpen={!!deleteTarget}
        title={`Delete project "${deleteTarget?.name}"?`}
        description={`The project "${deleteTarget?.name}" and all its stages, follow-ups, and documents will be permanently removed. This cannot be undone.`}
        confirmLabel="Delete Project"
        onConfirm={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget.id); setDeleteTarget(null); }}
        onCancel={() => setDeleteTarget(null)}
      />
      {(showModal || editProject) && (
        <ProjectModal
          project={editProject}
          onClose={() => { setShowModal(false); setEditProject(null); }}
        />
      )}

      <div className="p-4 sm:p-6 space-y-4 animate-slide-in">
        {/* Toolbar */}
        <div className="card p-4">
          <div className="flex flex-wrap gap-3">
            {view === 'list' && (
              <>
                <div className="relative flex-1 min-w-48">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    className="form-input pl-9"
                    placeholder="Search by name, client, or location..."
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  />
                </div>
                <select
                  className="form-select w-full sm:w-40"
                  value={workflowFilter}
                  onChange={(e) => { setWorkflowFilter(e.target.value); setPage(1); }}
                >
                  <option value="">All Workflows</option>
                  {(workflows ?? []).map((w) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
                <select
                  className="form-select w-full sm:w-36"
                  value={status}
                  onChange={(e) => { setStatus(e.target.value); setPage(1); }}
                >
                  <option value="">All Status</option>
                  <option value="active">Active</option>
                  <option value="on_hold">On Hold</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                <select
                  className="form-select w-full sm:w-36"
                  value={priority}
                  onChange={(e) => { setPriority(e.target.value); setPage(1); }}
                >
                  <option value="">All Priority</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </>
            )}
            {view === 'kanban' && (
              <>
                <div className="relative flex-1 min-w-48">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    className="form-input pl-9"
                    placeholder="Search projects or clients..."
                    value={boardSearch}
                    onChange={(e) => setBoardSearch(e.target.value)}
                  />
                </div>
                {data?.total != null && !search && !status && !priority && !workflowFilter && (
                  <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 flex-shrink-0">
                    <FolderKanban size={14} className="text-slate-400" />
                    <span className="text-sm text-slate-500">
                      <span className="font-semibold text-slate-700">{data.total}</span> project{data.total !== 1 ? 's' : ''}
                    </span>
                  </div>
                )}
              </>
            )}

            {/* View toggle */}
            <div className="flex items-center rounded-lg border border-slate-200 p-0.5 bg-slate-50 gap-0.5">
              <button
                onClick={() => setView('list')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                  view === 'list' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700',
                )}
              >
                <LayoutList size={15} /> List
              </button>
              <button
                onClick={() => setView('kanban')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                  view === 'kanban' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700',
                )}
              >
                <Kanban size={15} /> Board
              </button>
            </div>

            {canCreateProject && (
              <button onClick={() => setShowModal(true)} className="btn-primary">
                <Plus size={16} /> New Project
              </button>
            )}
          </div>
        </div>

        {/* Kanban View */}
        {view === 'kanban' && (
          <KanbanBoard
            onEdit={(p) => setEditProject(p)}
            highlightWorkflowId={highlightWorkflowId}
            highlightStageKey={highlightStageKey}
            boardSearch={boardSearch}
          />
        )}

        {/* List View */}
        {view === 'list' && (
          <>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Client</th>
                    <th>Workflow</th>
                    <th>Status</th>
                    <th>Priority</th>
                    <th className="min-w-[160px]">Progress</th>
                    <th>Due Date</th>
                    <th>Owner</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && <SkeletonTable rows={8} cols={9} />}
                  {!isLoading && projects.length === 0 && (
                    <tr>
                      <td colSpan={9}>
                        <div className="empty-state">
                          <FolderKanban size={48} className="text-slate-200 mb-3" />
                          <p className="font-medium text-slate-500">No projects found</p>
                          <p className="text-slate-400 text-sm mt-1">Create your first project to get started</p>
                          {canCreateProject && (
                            <button onClick={() => setShowModal(true)} className="btn-primary mt-4">
                              <Plus size={16} /> New Project
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                  {projects.map((project) => (
                    <tr
                      key={project.id}
                      className="row-clickable group"
                      onClick={() => router.push(`/projects/${project.id}`)}
                    >
                      <td>
                        <div>
                          <p className="font-medium text-slate-900">{truncate(project.name, 40)}</p>
                          <p className="text-xs font-mono text-slate-400">{project.projectNumber}</p>
                        </div>
                      </td>
                      <td className="text-slate-600">{project.clientName}</td>
                      <td>
                        {(() => {
                          const pws = project.projectWorkflows as Array<{ name: string; status: string }> | undefined;
                          if (pws && pws.length > 0) {
                            return (
                              <div className="flex flex-wrap gap-1">
                                {pws.slice(0, 2).map((pw, i) => (
                                  <span key={i} className="badge badge-blue text-[10px]">{pw.name}</span>
                                ))}
                                {pws.length > 2 && (
                                  <span className="badge text-[10px] bg-slate-100 text-slate-500">+{pws.length - 2}</span>
                                )}
                              </div>
                            );
                          }
                          const wfName = (project.workflow as { name: string } | undefined)?.name;
                          return wfName
                            ? <span className="badge badge-blue text-[10px]">{wfName}</span>
                            : <span className="text-slate-300 text-xs">—</span>;
                        })()}
                      </td>
                      <td>
                        <span className={getStatusBadgeClass(project.status)}>
                          {project.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td>
                        <span className={getPriorityBadgeClass(project.priority)}>
                          {project.priority}
                        </span>
                      </td>
                      <td className="min-w-[160px]">
                        <ProjectProgress
                          currentStage={project.currentStage}
                          status={project.status}
                          progressPct={project.overallProgressPct}
                          completedStages={project.completedStages}
                          totalStages={project.totalStages}
                        />
                      </td>
                      <td>{project.dueDate ? formatDate(project.dueDate) : <span className="text-slate-300">—</span>}</td>
                      <td>
                        {project.owner ? (
                          <span className="text-slate-700">{project.owner.firstName} {project.owner.lastName}</span>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <ChevronRight size={15} className="text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity mr-1 flex-shrink-0" />
                          <Link href={`/projects/${project.id}`}>
                            <button
                              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              aria-label={`View ${project.name}`}
                              title="View"
                            >
                              <Eye size={16} />
                            </button>
                          </Link>
                          {canEditProject && (
                            <button
                              onClick={() => setEditProject(project)}
                              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                              aria-label={`Edit ${project.name}`}
                              title="Edit"
                            >
                              <Edit size={16} />
                            </button>
                          )}
                          {canDeleteProject && (
                            <button
                              onClick={() => setDeleteTarget(project)}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              aria-label={`Delete ${project.name}`}
                              title="Delete"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500">
                  Showing {((page - 1) * 15) + 1}–{Math.min(page * 15, data?.total || 0)} of {data?.total} projects
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(page - 1)}
                    disabled={page === 1}
                    className="btn-secondary py-1.5 px-3 disabled:opacity-40"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="text-sm text-slate-600">Page {page} of {totalPages}</span>
                  <button
                    onClick={() => setPage(page + 1)}
                    disabled={page === totalPages}
                    className="btn-secondary py-1.5 px-3 disabled:opacity-40"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

export default function ProjectsPage() {
  return (
    <Suspense fallback={null}>
      <ProjectsPageInner />
    </Suspense>
  );
}
