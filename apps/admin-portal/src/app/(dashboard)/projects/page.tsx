'use client';

import { useState, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { get, post, patch, del } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Plus, Search, FolderKanban, Edit, Eye, Trash2, X, ChevronLeft, ChevronRight, LayoutList, Kanban } from 'lucide-react';
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
}

// ── KanbanCard ────────────────────────────────────────────────────────────────
function KanbanCard({
  project,
  onDragStart,
  onDragEnd,
  onEdit,
}: {
  project: Project;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onEdit: (p: Project) => void;
}) {
  const router = useRouter();

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', project.id);
        onDragStart(project.id);
      }}
      onDragEnd={onDragEnd}
      onClick={() => router.push(`/projects/${project.id}`)}
      className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm cursor-pointer hover:shadow-md hover:border-blue-200 transition-all select-none group"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-sm font-semibold text-slate-800 leading-tight line-clamp-2">{project.name}</p>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(project); }}
            className="p-1 text-slate-400 hover:text-slate-700 rounded"
            title="Edit"
          >
            <Edit size={13} />
          </button>
        </div>
      </div>
      <p className="text-xs text-slate-500 mb-2">{project.clientName}</p>
      <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
        <span className="text-[10px] font-mono text-slate-300">{project.projectNumber}</span>
        <div className="flex items-center gap-1.5">
          <span className={cn('badge text-[10px] px-1.5 py-0.5', getPriorityBadgeClass(project.priority))}>
            {project.priority}
          </span>
          <span className={cn('badge text-[10px] px-1.5 py-0.5', getStatusBadgeClass(project.status))}>
            {project.status.replace('_', ' ')}
          </span>
        </div>
      </div>
      <ProjectProgress currentStage={project.currentStage} status={project.status} compact />
      {project.dueDate && (
        <p className="text-[10px] text-slate-400 mt-1.5">Due {formatDate(project.dueDate)}</p>
      )}
    </div>
  );
}

// ── KanbanBoard ───────────────────────────────────────────────────────────────
function KanbanBoard({
  onEdit,
}: {
  onEdit: (p: Project) => void;
}) {
  const qc = useQueryClient();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [boardSearch, setBoardSearch] = useState('');
  const dragCounters = useRef<Record<string, number>>({});

  const { data: allProjects, isLoading: loadingProjects } = useQuery({
    queryKey: ['projects-kanban'],
    queryFn: () => get<{ items: Project[] }>('/projects', { pageSize: 500 }),
  });

  const { data: workflows } = useQuery({
    queryKey: ['workflows'],
    queryFn: () => get<WorkflowTemplate[]>('/workflows'),
  });

  // Build stage columns from default workflow, fallback to seeded stages
  const defaultWorkflow = workflows?.find((w) => w.isDefault) || workflows?.[0];
  const rawStages: StageColumn[] = defaultWorkflow?.stages
    ? (defaultWorkflow.stages as Array<{ key: string; name: string; order: number }>).map((s) => ({
        key: s.key,
        name: s.name,
        order: s.order,
      }))
    : [
        { key: 'file_creation', name: 'File Creation', order: 1 },
        { key: 'inward', name: 'Inward', order: 2 },
        { key: 'scrutiny', name: 'Scrutiny', order: 3 },
        { key: 'report_generation', name: 'Report Generation', order: 4 },
        { key: 'approval', name: 'Approval', order: 5 },
        { key: 'completed', name: 'Completed', order: 6 },
      ];

  const stages: StageColumn[] = [
    { key: '__no_stage__', name: 'No Stage', order: 0 },
    ...rawStages.sort((a, b) => a.order - b.order),
  ];

  const allProjectItems = allProjects?.items || [];
  const searchLower = boardSearch.toLowerCase();
  const projects = boardSearch
    ? allProjectItems.filter(
        (p) =>
          p.name.toLowerCase().includes(searchLower) ||
          p.projectNumber.toLowerCase().includes(searchLower) ||
          p.clientName.toLowerCase().includes(searchLower) ||
          (p.currentStage || '').toLowerCase().includes(searchLower) ||
          p.status.toLowerCase().includes(searchLower)
      )
    : allProjectItems;

  // Bucket projects into columns
  const buckets: Record<string, Project[]> = {};
  for (const col of stages) buckets[col.key] = [];
  for (const p of projects) {
    const key = p.currentStage || '__no_stage__';
    if (buckets[key]) {
      buckets[key].push(p);
    } else {
      buckets['__no_stage__'].push(p);
    }
  }

  const moveMutation = useMutation({
    mutationFn: ({ id, stageKey }: { id: string; stageKey: string }) =>
      patch(`/projects/${id}`, { currentStage: stageKey === '__no_stage__' ? null : stageKey }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects-kanban'] });
      qc.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const handleDragOver = useCallback((e: React.DragEvent, stageKey: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverStage(stageKey);
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent, stageKey: string) => {
    e.preventDefault();
    dragCounters.current[stageKey] = (dragCounters.current[stageKey] || 0) + 1;
    setDragOverStage(stageKey);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent, stageKey: string) => {
    dragCounters.current[stageKey] = (dragCounters.current[stageKey] || 1) - 1;
    if (dragCounters.current[stageKey] <= 0) {
      dragCounters.current[stageKey] = 0;
      setDragOverStage((prev) => (prev === stageKey ? null : prev));
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, stageKey: string) => {
    e.preventDefault();
    dragCounters.current[stageKey] = 0;
    const projectId = e.dataTransfer.getData('text/plain') || draggingId;
    if (projectId) {
      // Check the project isn't already in this column
      const project = projects.find((p) => p.id === projectId);
      const currentKey = project?.currentStage || '__no_stage__';
      if (currentKey !== stageKey) {
        moveMutation.mutate({ id: projectId, stageKey });
      }
    }
    setDraggingId(null);
    setDragOverStage(null);
  }, [draggingId, projects, moveMutation]);

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
    setDragOverStage(null);
    dragCounters.current = {};
  }, []);

  if (loadingProjects) {
    return (
      <div className="flex items-center justify-center h-64">
        <svg className="animate-spin w-8 h-8 text-blue-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  return (
    <div>
      {/* Board search */}
      <div className="mb-3 relative max-w-xs">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          className="form-input pl-8 py-2 text-sm"
          placeholder="Search board..."
          value={boardSearch}
          onChange={(e) => setBoardSearch(e.target.value)}
        />
      </div>
    <div className="overflow-x-auto pb-4">
      <div className="flex gap-3 min-w-max">
        {stages.map((col) => {
          const colProjects = buckets[col.key] || [];
          const isOver = dragOverStage === col.key && draggingId !== null;

          return (
            <div
              key={col.key}
              className={cn(
                'flex flex-col w-64 flex-shrink-0 rounded-2xl border-2 transition-colors',
                isOver
                  ? 'border-blue-400 bg-blue-50/60'
                  : 'border-transparent bg-slate-100/80'
              )}
              onDragOver={(e) => handleDragOver(e, col.key)}
              onDragEnter={(e) => handleDragEnter(e, col.key)}
              onDragLeave={(e) => handleDragLeave(e, col.key)}
              onDrop={(e) => handleDrop(e, col.key)}
            >
              {/* Column header */}
              <div className="flex items-center justify-between px-3 py-2.5 flex-shrink-0">
                <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide truncate">
                  {col.name}
                </span>
                <span className="text-xs font-bold text-slate-400 bg-white rounded-full w-6 h-6 flex items-center justify-center border border-slate-200 flex-shrink-0">
                  {colProjects.length}
                </span>
              </div>

              {/* Drop zone indicator */}
              {isOver && (
                <div className="mx-3 mb-2 h-1 rounded-full bg-blue-400 animate-pulse" />
              )}

              {/* Cards */}
              <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2 min-h-[120px] max-h-[calc(100vh-280px)]">
                {colProjects.length === 0 && (
                  <div className={cn(
                    'h-16 rounded-xl border-2 border-dashed flex items-center justify-center text-xs text-slate-300 transition-colors',
                    isOver ? 'border-blue-300 text-blue-400' : 'border-slate-200'
                  )}>
                    Drop here
                  </div>
                )}
                {colProjects.map((project) => (
                  <KanbanCard
                    key={project.id}
                    project={project}
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
    </div>
  );
}

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
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const userList = users?.items || [];
  const workflowList = workflows || [];

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content max-w-2xl w-full">
        <div className="card-header">
          <h3>{project ? 'Edit Project' : 'New Project'}</h3>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg">
            <X size={18} />
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

export default function ProjectsPage() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const isAdmin = user?.isSuperAdmin || (user?.roles as Array<{ name: string }> | undefined)?.some((r) => r.name === 'Admin');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [view, setView] = useState<'list' | 'kanban'>('kanban');

  const { data, isLoading } = useQuery({
    queryKey: ['projects', page, search, status, priority],
    queryFn: () =>
      get<{ items: Project[]; total: number; totalPages: number }>('/projects', {
        page, pageSize: 15, search: search || undefined, status: status || undefined, priority: priority || undefined,
      }),
    placeholderData: (prev) => prev,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => del(`/projects/${id}`),
    onSuccess: () => {
      toast.success('Project cancelled');
      qc.invalidateQueries({ queryKey: ['projects'] });
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
                  className="form-select w-full sm:w-40"
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
                  view === 'list' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'
                )}
              >
                <LayoutList size={15} /> List
              </button>
              <button
                onClick={() => setView('kanban')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                  view === 'kanban' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'
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
                      <td colSpan={8} className="text-center py-10 text-slate-400">
                        <svg className="animate-spin w-6 h-6 mx-auto" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      </td>
                    </tr>
                  )}
                  {!isLoading && projects.length === 0 && (
                    <tr>
                      <td colSpan={8}>
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
                          <p className="font-medium text-slate-900">{truncate(project.name, 45)}</p>
                          <p className="text-xs font-mono text-slate-400">{project.projectNumber}</p>
                        </div>
                      </td>
                      <td className="text-slate-600">{project.clientName}</td>
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
                            <button className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="View">
                              <Eye size={16} />
                            </button>
                          </Link>
                          <button
                            onClick={() => setEditProject(project)}
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
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

            {/* Pagination */}
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
