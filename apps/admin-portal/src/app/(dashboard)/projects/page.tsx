'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
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
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { ProjectProgress } from '@/components/ProjectProgress';
import { useRouter } from 'next/navigation';
import { formatDate, getStatusBadgeClass, getPriorityBadgeClass, cn, truncate, getErrorMessage } from '@/lib/utils';
import Link from 'next/link';
import type { Project, User, WorkflowTemplate } from '@flowtiq/shared-types';

// ── Types ─────────────────────────────────────────────────────────────────────
interface StageColumn {
  key: string;
  name: string;
  order: number;
  color: string;
  isNoStage?: boolean;
}

const PALETTE = [
  '#6366f1', '#0ea5e9', '#8b5cf6', '#f59e0b',
  '#10b981', '#ef4444', '#ec4899', '#14b8a6', '#f97316', '#94a3b8',
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
        'bg-white border rounded-xl p-3 cursor-grab active:cursor-grabbing select-none group transition-all duration-150',
        isDragging
          ? 'opacity-40 rotate-1 shadow-lg border-blue-300'
          : 'border-slate-200 hover:border-blue-200 hover:shadow-md shadow-sm',
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <p className="text-sm font-semibold text-slate-800 leading-snug line-clamp-2 flex-1">{project.name}</p>
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(project); }}
          aria-label={`Edit ${project.name}`}
          className="p-1 text-slate-300 hover:text-slate-600 rounded opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity"
        >
          <Edit size={13} />
        </button>
      </div>
      <p className="text-xs text-slate-400 mb-2.5 truncate">{project.clientName}</p>
      <div className="flex items-center gap-1 flex-wrap mb-2.5">
        <span className="text-[10px] font-mono text-slate-300 flex-1 truncate">{project.projectNumber}</span>
        <span className={cn('badge text-[10px] px-1.5 py-0', getPriorityBadgeClass(project.priority))}>
          {project.priority}
        </span>
        <span className={cn('badge text-[10px] px-1.5 py-0', getStatusBadgeClass(project.status))}>
          {project.status.replace('_', ' ')}
        </span>
      </div>
      <ProjectProgress currentStage={project.currentStage} status={project.status} compact />
      {project.dueDate && (
        <p className="text-[10px] text-slate-400 mt-2">Due {formatDate(project.dueDate)}</p>
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
}: {
  stages: StageColumn[];
  projects: Project[];
  searchTerm: string;
  onEdit: (p: Project) => void;
  sectionWorkflowId: string | null;
}) {
  const qc = useQueryClient();
  const [draggingId, setDraggingId] = useState<string | null>(null);
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
  const buckets: Record<string, Project[]> = { __no_stage__: [] };
  for (const s of stages) buckets[s.key] = [];
  for (const p of filtered) {
    const key = p.currentStage ?? '';
    if (key && allStageKeys.has(key)) {
      buckets[key].push(p);
    } else {
      buckets['__no_stage__'].push(p);
    }
  }

  const moveMutation = useMutation({
    mutationFn: ({ id, stageKey }: { id: string; stageKey: string }) =>
      patch(`/projects/${id}`, { currentStage: stageKey === '__no_stage__' ? null : stageKey }),
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
    if (draggedWorkflowId !== expected) {
      setDraggingId(null);
      setDragOverStage(null);
      return;
    }

    const projectId = e.dataTransfer.getData('text/plain') || draggingId;
    if (projectId) {
      const project = filtered.find((p) => p.id === projectId);
      const currentKey = project?.currentStage ?? '__no_stage__';
      if (currentKey !== stageKey) {
        moveMutation.mutate({ id: projectId, stageKey });
      }
    }
    setDraggingId(null);
    setDragOverStage(null);
  }, [draggingId, filtered, moveMutation, sectionWorkflowId]);

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
    setDragOverStage(null);
    dragCounters.current = {};
  }, []);

  const noStageProjects = buckets['__no_stage__'] ?? [];
  const columns: StageColumn[] = [
    ...stages,
    ...(noStageProjects.length > 0
      ? [{ key: '__no_stage__', name: 'No Stage', order: 999, color: '#94a3b8', isNoStage: true }]
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

          return (
            <div
              key={col.key}
              data-stage-key={col.key}
              className={cn(
                'flex flex-col w-64 flex-shrink-0 rounded-xl border bg-white transition-all duration-150 overflow-hidden',
                isOver ? 'border-blue-300 shadow-lg' : 'border-slate-200 shadow-sm',
                col.isNoStage && 'opacity-75',
              )}
              style={{ borderTopColor: col.color, borderTopWidth: 3 }}
              onDragOver={handleDragOver}
              onDragEnter={(e) => handleDragEnter(e, col.key)}
              onDragLeave={(e) => handleDragLeave(e, col.key)}
              onDrop={(e) => handleDrop(e, col.key)}
            >
              {/* Column header */}
              <div className="flex items-center justify-between px-3 py-2.5 flex-shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: col.color }}
                  />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 truncate">
                    {col.name}
                  </span>
                </div>
                <span className={cn(
                  'text-[11px] font-semibold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5 flex-shrink-0 ml-2',
                  isMoving ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500',
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
                    onDragStart={setDraggingId}
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
}: {
  workflow: WorkflowTemplate | null;
  projects: Project[];
  searchTerm: string;
  onEdit: (p: Project) => void;
  defaultExpanded: boolean;
}) {
  const [manualExpanded, setManualExpanded] = useState(defaultExpanded);
  const expanded = searchTerm.length > 0 ? true : manualExpanded;

  // Build stages from workflow template stages (with their colors)
  const stages: StageColumn[] = workflow?.stages
    ? (workflow.stages as Array<{ key: string; name: string; order: number; color?: string; requiresApproval?: boolean }>)
        .sort((a, b) => a.order - b.order)
        .map((s, idx) => ({
          key: s.key,
          name: s.name,
          order: s.order,
          color: s.color || PALETTE[idx % PALETTE.length],
        }))
    : []; // null workflow → no stages → all land in __no_stage__

  return (
    <div className="card overflow-hidden">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setManualExpanded(!manualExpanded)}
        className="w-full px-5 py-3.5 flex items-center justify-between hover:bg-slate-50/80 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
            <GitBranch size={14} className="text-blue-500" />
          </div>
          <span className="font-semibold text-slate-800 text-sm">
            {workflow?.name ?? 'No Workflow Assigned'}
          </span>
          {workflow?.isDefault && (
            <span className="badge badge-blue text-[10px] py-0">Default</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-slate-500 bg-slate-100 rounded-full px-2.5 py-1">
            {projects.length} project{projects.length !== 1 ? 's' : ''}
          </span>
          <ChevronDown
            size={16}
            aria-hidden="true"
            className={cn('text-slate-400 transition-transform duration-200 flex-shrink-0', expanded ? 'rotate-0' : '-rotate-90')}
          />
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 p-4">
          <WorkflowKanban
            stages={stages}
            projects={projects}
            searchTerm={searchTerm}
            onEdit={onEdit}
            sectionWorkflowId={workflow?.id ?? null}
          />
        </div>
      )}
    </div>
  );
}

// ── KanbanBoard — groups projects by workflowId, renders accordion sections ────
function KanbanBoard({ onEdit }: { onEdit: (p: Project) => void }) {
  const [boardSearch, setBoardSearch] = useState('');

  const { data: allProjectsData, isLoading } = useQuery({
    queryKey: ['projects', 'kanban'],
    queryFn: () => get<{ items: Project[] }>('/projects', { pageSize: 500 }),
  });

  const { data: allWorkflows } = useQuery({
    queryKey: ['workflows'],
    queryFn: () => get<WorkflowTemplate[]>('/workflows'),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <svg className="animate-spin w-8 h-8 text-blue-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  const projects = allProjectsData?.items ?? [];
  const workflows = allWorkflows ?? [];

  // Group projects by their workflowId (null = no workflow assigned)
  const byWorkflow = new Map<string | null, Project[]>();
  for (const p of projects) {
    const key = p.workflowId ?? null;
    if (!byWorkflow.has(key)) byWorkflow.set(key, []);
    byWorkflow.get(key)!.push(p);
  }

  // Default workflow first, then others alphabetically
  const orderedWorkflows: WorkflowTemplate[] = [
    ...workflows.filter((w) => w.isDefault),
    ...workflows.filter((w) => !w.isDefault).sort((a, b) => a.name.localeCompare(b.name)),
  ];

  const noWorkflowProjects = byWorkflow.get(null) ?? [];

  return (
    <div className="space-y-3">
      {/* Board search */}
      <div className="relative max-w-xs">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          className="form-input pl-8 py-2 text-sm"
          placeholder="Search board..."
          value={boardSearch}
          onChange={(e) => setBoardSearch(e.target.value)}
        />
      </div>

      {/* One accordion section per workflow — each with its OWN stage columns */}
      {orderedWorkflows.map((workflow, idx) => {
        const workflowProjects = byWorkflow.get(workflow.id) ?? [];
        return (
          <WorkflowSection
            key={workflow.id}
            workflow={workflow}
            projects={workflowProjects}
            searchTerm={boardSearch}
            onEdit={onEdit}
            defaultExpanded={idx === 0}
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
          defaultExpanded={orderedWorkflows.length === 0}
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
  workflowId: z.string().optional(),
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
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const { data: users } = useQuery<{ items: User[] }>({
    queryKey: ['users', 'all'],
    queryFn: () => get<{ items: User[] }>('/users?pageSize=100'),
  });

  const { data: workflows } = useQuery<WorkflowTemplate[]>({
    queryKey: ['workflows'],
    queryFn: () => get<WorkflowTemplate[]>('/workflows'),
  });

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
          workflowId: project.workflowId || '',
          ownerId: project.ownerId,
          followUpOwnerId: project.followUpOwnerId || '',
        }
      : { priority: 'medium' },
  });

  const onSubmit = async (data: ProjectForm) => {
    try {
      if (project) {
        await patch(`/projects/${project.id}`, data);
        toast.success('Project updated');
      } else {
        await post('/projects', data);
        toast.success('Project created');
      }
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const userList = users?.items || [];
  const workflowList = workflows || [];

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content max-w-2xl w-full" role="dialog" aria-modal="true" aria-labelledby="modal-title">
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
              <label className="form-label">Workflow</label>
              <select className="form-select" {...register('workflowId')}>
                <option value="">No workflow</option>
                {workflowList.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}{w.isDefault ? ' (Default)' : ''}</option>
                ))}
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
export default function ProjectsPage() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const isAdmin = user?.isSuperAdmin || (user?.roles as Array<{ name: string }> | undefined)?.some((r) => r.name === 'Admin');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [workflowFilter, setWorkflowFilter] = useState('');
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [view, setView] = useState<'list' | 'kanban'>('kanban');

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
                    placeholder="Search projects, clients..."
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
            {view === 'kanban' && <div className="flex-1" />}

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

            <button onClick={() => setShowModal(true)} className="btn-primary">
              <Plus size={16} /> New Project
            </button>
          </div>
        </div>

        {/* Kanban View */}
        {view === 'kanban' && (
          <KanbanBoard onEdit={(p) => setEditProject(p)} />
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
                  {isLoading && (
                    <tr>
                      <td colSpan={9} className="text-center py-10 text-slate-400">
                        <svg className="animate-spin w-6 h-6 mx-auto" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      </td>
                    </tr>
                  )}
                  {!isLoading && projects.length === 0 && (
                    <tr>
                      <td colSpan={9}>
                        <div className="empty-state">
                          <FolderKanban size={48} className="text-slate-200 mb-3" />
                          <p className="font-medium text-slate-500">No projects found</p>
                          <p className="text-slate-400 text-sm mt-1">Create your first project to get started</p>
                          <button onClick={() => setShowModal(true)} className="btn-primary mt-4">
                            <Plus size={16} /> New Project
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                  {projects.map((project) => (
                    <tr key={project.id}>
                      <td>
                        <div>
                          <p className="font-medium text-slate-900">{truncate(project.name, 40)}</p>
                          <p className="text-xs font-mono text-slate-400">{project.projectNumber}</p>
                        </div>
                      </td>
                      <td className="text-slate-600">{project.clientName}</td>
                      <td>
                        {(project.workflow as { name: string } | undefined)?.name ? (
                          <span className="badge badge-blue text-[10px]">
                            {(project.workflow as { name: string }).name}
                          </span>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
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
                        />
                      </td>
                      <td>{project.dueDate ? formatDate(project.dueDate) : <span className="text-slate-300">—</span>}</td>
                      <td>
                        {project.owner ? (
                          <span className="text-slate-700">{project.owner.firstName} {project.owner.lastName}</span>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-1">
                          <Link href={`/projects/${project.id}`}>
                            <button
                              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              aria-label={`View ${project.name}`}
                              title="View"
                            >
                              <Eye size={16} />
                            </button>
                          </Link>
                          <button
                            onClick={() => setEditProject(project)}
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                            aria-label={`Edit ${project.name}`}
                            title="Edit"
                          >
                            <Edit size={16} />
                          </button>
                          {isAdmin && (
                            <button
                              onClick={() => {
                                if (confirm('Cancel this project?')) {
                                  deleteMutation.mutate(project.id);
                                }
                              }}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              aria-label={`Delete ${project.name}`}
                              title="Cancel"
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
