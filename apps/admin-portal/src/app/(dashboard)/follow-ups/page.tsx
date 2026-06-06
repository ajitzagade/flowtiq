'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { get, post, patch } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import {
  Plus, Search, Clock, AlertTriangle, CheckCircle2, X,
  ChevronLeft, ChevronRight, Edit,
} from 'lucide-react';
import { formatDate, formatFollowUpDate, getStatusBadgeClass, cn, getErrorMessage } from '@/lib/utils';
import type { FollowUp, Project, User } from '@flowtiq/shared-types';

// Re-export isPast-like logic inline
function isOverdue(date: string) {
  return new Date(date) < new Date();
}

const createSchema = z.object({
  projectId: z.string().min(1, 'Project is required'),
  ownerId: z.string().min(1, 'Owner is required'),
  nextFollowUp: z.string().min(1, 'Follow-up date is required'),
  notes: z.string().optional(),
});

const updateSchema = z.object({
  status: z.enum(['pending', 'completed', 'overdue', 'cancelled']).optional(),
  nextFollowUp: z.string().optional(),
  historyNote: z.string().optional(),
});

type CreateForm = z.infer<typeof createSchema>;
type UpdateForm = z.infer<typeof updateSchema>;

function CreateFollowUpModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);
  const { data: projectsData } = useQuery({
    queryKey: ['projects', 'all'],
    queryFn: () => get<{ items: Project[] }>('/projects?pageSize=100&status=active'),
  });
  const { data: usersData } = useQuery({
    queryKey: ['users', 'all'],
    queryFn: () => get<{ items: User[] }>('/users?pageSize=100'),
  });

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
  });

  const onSubmit = async (data: CreateForm) => {
    try {
      await post('/follow-ups', data);
      toast.success('Follow-up created');
      qc.invalidateQueries({ queryKey: ['followups'] });
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content max-w-lg w-full" role="dialog" aria-modal="true" aria-labelledby="modal-title-create">
        <div className="card-header">
          <h3 id="modal-title-create">New Follow-up</h3>
          <button onClick={onClose} aria-label="Close" className="btn-ghost p-1.5"><X size={18} aria-hidden="true" /></button>
        </div>
        <div className="card-body">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="form-label">Project *</label>
              <select className={cn('form-select', errors.projectId && 'border-red-400')} {...register('projectId')}>
                <option value="">Select project</option>
                {projectsData?.items?.map((p) => (
                  <option key={p.id} value={p.id}>{p.projectNumber} - {p.name}</option>
                ))}
              </select>
              {errors.projectId && <p className="form-error">{errors.projectId.message}</p>}
            </div>

            <div>
              <label className="form-label">Assigned To *</label>
              <select className={cn('form-select', errors.ownerId && 'border-red-400')} {...register('ownerId')}>
                <option value="">Select person</option>
                {usersData?.items?.map((u) => (
                  <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                ))}
              </select>
              {errors.ownerId && <p className="form-error">{errors.ownerId.message}</p>}
            </div>

            <div>
              <label className="form-label">Next Follow-up Date *</label>
              <input
                type="date"
                className={cn('form-input', errors.nextFollowUp && 'border-red-400')}
                min={new Date().toISOString().split('T')[0]}
                {...register('nextFollowUp')}
              />
              {errors.nextFollowUp && <p className="form-error">{errors.nextFollowUp.message}</p>}
            </div>

            <div>
              <label className="form-label">Notes</label>
              <textarea
                rows={3}
                className="form-input resize-none"
                placeholder="What needs to be followed up?"
                {...register('notes')}
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={isSubmitting} className="btn-primary">
                {isSubmitting ? 'Creating...' : 'Create Follow-up'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function UpdateFollowUpModal({ followUp, onClose }: { followUp: FollowUp; onClose: () => void }) {
  const qc = useQueryClient();
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);
  const { register, handleSubmit, formState: { isSubmitting } } = useForm<UpdateForm>({
    resolver: zodResolver(updateSchema),
    defaultValues: { status: followUp.status, nextFollowUp: followUp.nextFollowUp?.split('T')[0] },
  });

  const onSubmit = async (data: UpdateForm) => {
    try {
      await patch(`/follow-ups/${followUp.id}`, data);
      toast.success('Follow-up updated');
      qc.invalidateQueries({ queryKey: ['followups'] });
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content max-w-md w-full" role="dialog" aria-modal="true" aria-labelledby="modal-title-update">
        <div className="card-header">
          <h3 id="modal-title-update">Update Follow-up</h3>
          <button onClick={onClose} aria-label="Close" className="btn-ghost p-1.5"><X size={18} aria-hidden="true" /></button>
        </div>
        <div className="card-body">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <p className="text-sm text-slate-500 mb-3">
                Project: <span className="font-medium text-slate-800">{(followUp.project as { name: string } | undefined)?.name}</span>
              </p>
            </div>

            <div>
              <label className="form-label">Status</label>
              <select className="form-select" {...register('status')}>
                <option value="pending">Pending</option>
                <option value="completed">Completed</option>
                <option value="overdue">Overdue</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            <div>
              <label className="form-label">Next Follow-up Date</label>
              <input type="date" className="form-input" {...register('nextFollowUp')} />
            </div>

            <div>
              <label className="form-label">Notes / History Entry</label>
              <textarea
                rows={3}
                className="form-input resize-none"
                placeholder="Add a note about this update..."
                {...register('historyNote')}
              />
            </div>

            <div className="flex justify-end gap-3">
              <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={isSubmitting} className="btn-primary">
                {isSubmitting ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function FollowUpsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [editFollowUp, setEditFollowUp] = useState<FollowUp | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['followups', page, search, status],
    queryFn: () =>
      get<{ items: FollowUp[]; total: number; totalPages: number }>('/follow-ups', {
        page, pageSize: 15,
        search: search || undefined,
        status: status || undefined,
      }),
    placeholderData: (prev) => prev,
  });

  const completeMutation = useMutation({
    mutationFn: (id: string) => patch(`/follow-ups/${id}`, { status: 'completed', historyNote: 'Marked as completed' }),
    onSuccess: () => {
      toast.success('Follow-up completed');
      qc.invalidateQueries({ queryKey: ['followups'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const followUps = data?.items || [];
  const totalPages = data?.totalPages || 1;

  // Stats
  const total = data?.total || 0;

  return (
    <>
      <Header title="Follow-ups" subtitle="Track and manage all client follow-ups" />
      {showCreate && <CreateFollowUpModal onClose={() => setShowCreate(false)} />}
      {editFollowUp && <UpdateFollowUpModal followUp={editFollowUp} onClose={() => setEditFollowUp(null)} />}

      <div className="p-4 sm:p-6 space-y-4 animate-slide-in">
        {/* Filters */}
        <div className="card p-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-48">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="form-input pl-9"
                placeholder="Search follow-ups..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
            </div>
            <select
              className="form-select w-40"
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            >
              <option value="">All Status</option>
              <option value="pending">Pending</option>
              <option value="overdue">Overdue</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <button onClick={() => setShowCreate(true)} className="btn-primary ml-auto">
              <Plus size={16} /> New Follow-up
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Project</th>
                <th>Client</th>
                <th>Status</th>
                <th>Next Follow-up</th>
                <th>Last Follow-up</th>
                <th>Assigned To</th>
                <th>Notes</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={8} className="text-center py-10">
                  <svg className="animate-spin w-6 h-6 mx-auto text-blue-500" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                </td></tr>
              )}
              {!isLoading && followUps.length === 0 && (
                <tr><td colSpan={8}>
                  <div className="empty-state">
                    <Clock size={48} className="text-slate-200 mb-3" />
                    <p className="font-medium text-slate-500">No follow-ups found</p>
                    <button onClick={() => setShowCreate(true)} className="btn-primary mt-4">
                      <Plus size={16} /> New Follow-up
                    </button>
                  </div>
                </td></tr>
              )}
              {followUps.map((fu) => {
                const overdue = isOverdue(fu.nextFollowUp) && fu.status === 'pending';
                return (
                  <tr key={fu.id} className={cn(overdue && 'bg-red-50/30')}>
                    <td>
                      <div className="flex items-center gap-2">
                        {overdue ? (
                          <AlertTriangle size={14} className="text-red-500 flex-shrink-0" />
                        ) : fu.status === 'completed' ? (
                          <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0" />
                        ) : (
                          <Clock size={14} className="text-amber-500 flex-shrink-0" />
                        )}
                        <span className="font-medium text-slate-800 truncate max-w-48">
                          {(fu.project as { name: string } | undefined)?.name}
                        </span>
                      </div>
                    </td>
                    <td className="text-slate-600">{(fu.project as { clientName: string } | undefined)?.clientName}</td>
                    <td>
                      <span className={getStatusBadgeClass(overdue ? 'overdue' : fu.status)}>
                        {overdue ? 'overdue' : fu.status}
                      </span>
                    </td>
                    <td>
                      <span className={cn(
                        'font-medium text-sm',
                        overdue ? 'text-red-600' : 'text-slate-700'
                      )}>
                        {formatFollowUpDate(fu.nextFollowUp)}
                      </span>
                    </td>
                    <td>{fu.lastFollowUp ? formatDate(fu.lastFollowUp) : <span className="text-slate-300">—</span>}</td>
                    <td>
                      {(fu.owner as { firstName: string; lastName: string } | undefined)?.firstName}{' '}
                      {(fu.owner as { firstName: string; lastName: string } | undefined)?.lastName}
                    </td>
                    <td className="text-slate-500 max-w-48 truncate">{fu.notes || '—'}</td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        {fu.status !== 'completed' && (
                          <button
                            onClick={() => completeMutation.mutate(fu.id)}
                            className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                            title="Mark as completed"
                          >
                            <CheckCircle2 size={16} />
                          </button>
                        )}
                        <button
                          onClick={() => setEditFollowUp(fu)}
                          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Edit size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">Total: {total} follow-ups</p>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(page - 1)} disabled={page === 1} className="btn-secondary py-1.5 px-3 disabled:opacity-40">
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm text-slate-600">Page {page} of {totalPages}</span>
              <button onClick={() => setPage(page + 1)} disabled={page === totalPages} className="btn-secondary py-1.5 px-3 disabled:opacity-40">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
