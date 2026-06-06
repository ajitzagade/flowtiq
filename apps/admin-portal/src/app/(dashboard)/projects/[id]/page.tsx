'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { get, patch } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import { useParams } from 'next/navigation';
import {
  ArrowLeft, CheckCircle2, Clock, AlertCircle, Circle,
  FileText, Upload, History, ChevronDown, ChevronUp, X,
} from 'lucide-react';
import Link from 'next/link';
import { formatDate, formatDateTime, getStatusBadgeClass, getPriorityBadgeClass, cn, getErrorMessage } from '@/lib/utils';
import { useState } from 'react';
import toast from 'react-hot-toast';
import type { Project, ProjectStage, FollowUp } from '@flowtiq/shared-types';

type ProjectDetail = Project & { followUps?: FollowUp[] };

const STAGE_STATUSES = ['pending', 'in_progress', 'completed', 'on_hold', 'skipped'] as const;

function StageStatusIcon({ status }: { status: string }) {
  if (status === 'completed') return <CheckCircle2 size={20} className="text-emerald-500" />;
  if (status === 'in_progress') return <Clock size={20} className="text-blue-500 animate-pulse" />;
  if (status === 'on_hold') return <AlertCircle size={20} className="text-amber-500" />;
  return <Circle size={20} className="text-slate-300" />;
}

function StageCard({ stage, projectId }: { stage: ProjectStage; projectId: string }) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(stage.status === 'in_progress');
  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const [newStatus, setNewStatus] = useState(stage.status);
  const [comment, setComment] = useState('');
  const [notes, setNotes] = useState(stage.notes || '');

  const updateMutation = useMutation({
    mutationFn: (data: object) => patch(`/stages/${stage.id}`, data),
    onSuccess: () => {
      toast.success('Stage updated');
      qc.invalidateQueries({ queryKey: ['project', projectId] });
      setShowUpdateForm(false);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const stageColorMap: Record<string, string> = {
    completed: 'border-l-emerald-500',
    in_progress: 'border-l-blue-500',
    on_hold: 'border-l-amber-500',
    skipped: 'border-l-slate-300',
    pending: 'border-l-slate-200',
  };

  return (
    <div className={cn('card border-l-4 overflow-hidden', stageColorMap[stage.status] || 'border-l-slate-200')}>
      <div
        className="px-5 py-4 flex items-center gap-3 cursor-pointer hover:bg-slate-50"
        onClick={() => setExpanded(!expanded)}
      >
        <StageStatusIcon status={stage.status} />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-400">Stage {stage.stageOrder}</span>
          </div>
          <p className="font-semibold text-slate-900">{stage.stageName}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={getStatusBadgeClass(stage.status)}>{stage.status.replace('_', ' ')}</span>
          {stage.completionDate && (
            <span className="text-xs text-slate-400">{formatDate(stage.completionDate)}</span>
          )}
          {expanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
        </div>
      </div>

      {expanded && (
        <div className="px-5 pb-5 border-t border-slate-100 pt-4 space-y-4">
          {/* Dates */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-xs text-slate-400 mb-0.5">Started</p>
              <p className="text-slate-700">{formatDate(stage.startDate)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-0.5">Completed</p>
              <p className="text-slate-700">{formatDate(stage.completionDate)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-0.5">Last Updated</p>
              <p className="text-slate-700">{formatDate(stage.updatedAt)}</p>
            </div>
          </div>

          {stage.notes && (
            <div>
              <p className="text-xs font-medium text-slate-500 mb-1">Notes</p>
              <p className="text-sm text-slate-700 bg-slate-50 rounded-lg p-3">{stage.notes}</p>
            </div>
          )}

          {/* History */}
          {stage.history && stage.history.length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-500 mb-2">History</p>
              <div className="space-y-2">
                {stage.history.slice(0, 3).map((h) => (
                  <div key={h.id} className="flex gap-3 text-sm">
                    <div className="w-2 h-2 rounded-full bg-slate-300 mt-1.5 flex-shrink-0" />
                    <div>
                      <span className="font-medium text-slate-700">
                        {h.changedBy?.firstName} {h.changedBy?.lastName}
                      </span>{' '}
                      <span className="text-slate-500">
                        changed status from{' '}
                        <span className="font-medium">{h.previousStatus?.replace('_', ' ')}</span> to{' '}
                        <span className="font-medium">{h.newStatus?.replace('_', ' ')}</span>
                      </span>
                      {h.comment && <p className="text-slate-400 mt-0.5">{h.comment}</p>}
                      <p className="text-xs text-slate-400">{formatDateTime(h.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Update form */}
          {!showUpdateForm ? (
            <button onClick={() => setShowUpdateForm(true)} className="btn-secondary text-xs py-1.5">
              Update Stage
            </button>
          ) : (
            <div className="bg-slate-50 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-700">Update Stage</p>
                <button onClick={() => setShowUpdateForm(false)}><X size={16} className="text-slate-400" /></button>
              </div>
              <div>
                <label className="form-label text-xs">Status</label>
                <select
                  className="form-select"
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as typeof stage.status)}
                >
                  {STAGE_STATUSES.map((s) => (
                    <option key={s} value={s}>{s.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label text-xs">Notes</label>
                <textarea
                  rows={2}
                  className="form-input resize-none text-xs"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add notes about this stage..."
                />
              </div>
              <div>
                <label className="form-label text-xs">Comment</label>
                <input
                  className="form-input text-xs"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Reason for status change..."
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => updateMutation.mutate({ status: newStatus, notes, comment })}
                  disabled={updateMutation.isPending}
                  className="btn-primary text-xs py-1.5"
                >
                  {updateMutation.isPending ? 'Saving...' : 'Save'}
                </button>
                <button onClick={() => setShowUpdateForm(false)} className="btn-ghost text-xs py-1.5">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<'stages' | 'documents' | 'followups' | 'activity'>('stages');

  const { data: project, isLoading } = useQuery<ProjectDetail>({
    queryKey: ['project', id],
    queryFn: () => get<ProjectDetail>(`/projects/${id}`),
  });

  const { data: docsData } = useQuery({
    queryKey: ['documents', id],
    queryFn: () => get<{ items: unknown[] }>('/documents', { projectId: id }),
    enabled: activeTab === 'documents',
  });

  if (isLoading) {
    return (
      <>
        <Header title="Project Details" />
        <div className="p-6 flex justify-center py-20">
          <svg className="animate-spin w-8 h-8 text-blue-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      </>
    );
  }

  if (!project) {
    return (
      <>
        <Header title="Project Not Found" />
        <div className="p-6"><p className="text-slate-500">Project not found.</p></div>
      </>
    );
  }

  return (
    <>
      <Header title={project.name} subtitle={`${project.projectNumber} • ${project.clientName}`} />
      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 animate-slide-in">
        {/* Back + Meta */}
        <div className="flex items-start justify-between">
          <Link href="/projects" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
            <ArrowLeft size={16} /> Back to Projects
          </Link>
          <div className="flex items-center gap-2">
            <span className={getStatusBadgeClass(project.status)}>{project.status.replace('_', ' ')}</span>
            <span className={getPriorityBadgeClass(project.priority)}>{project.priority}</span>
          </div>
        </div>

        {/* Project Info Card */}
        <div className="card p-6">
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
            <div>
              <p className="text-xs font-medium text-slate-400 mb-1">Client</p>
              <p className="font-semibold text-slate-900">{project.clientName}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400 mb-1">Location</p>
              <p className="font-semibold text-slate-900">{project.location || '—'}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400 mb-1">Start Date</p>
              <p className="font-semibold text-slate-900">{formatDate(project.startDate)}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400 mb-1">Due Date</p>
              <p className="font-semibold text-slate-900">{formatDate(project.dueDate)}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400 mb-1">Owner</p>
              <p className="font-semibold text-slate-900">
                {project.owner ? `${project.owner.firstName} ${project.owner.lastName}` : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400 mb-1">Current Stage</p>
              <p className="font-semibold text-slate-900 capitalize">{project.currentStage?.replace('_', ' ') || '—'}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400 mb-1">Workflow</p>
              <p className="font-semibold text-slate-900">{project.workflow?.name || '—'}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400 mb-1">Documents</p>
              <p className="font-semibold text-slate-900">{project.documentsCount || 0}</p>
            </div>
          </div>
          {project.description && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <p className="text-xs font-medium text-slate-400 mb-1">Description</p>
              <p className="text-slate-700">{project.description}</p>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="border-b border-slate-200">
          <div className="flex gap-1 overflow-x-auto scrollbar-none">
            {[
              { key: 'stages', label: 'Stages', icon: Clock },
              { key: 'documents', label: 'Documents', icon: FileText },
              { key: 'followups', label: 'Follow-ups', icon: History },
            ].map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key as typeof activeTab)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
                  activeTab === key
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                )}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        {activeTab === 'stages' && (
          <div className="space-y-3">
            {project.stages?.length === 0 && (
              <div className="empty-state card py-16">
                <Clock size={40} className="text-slate-200 mb-3" />
                <p className="text-slate-500">No stages defined for this project</p>
                <p className="text-slate-400 text-sm">Assign a workflow to track project stages</p>
              </div>
            )}
            {project.stages?.map((stage) => (
              <StageCard key={stage.id} stage={stage} projectId={project.id} />
            ))}
          </div>
        )}

        {activeTab === 'documents' && (
          <div className="card">
            <div className="card-header">
              <h3>Project Documents</h3>
              <Link href={`/documents?projectId=${project.id}&upload=true`} className="btn-secondary text-xs py-1.5">
                <Upload size={14} /> Upload Document
              </Link>
            </div>
            <div className="divide-y divide-slate-100">
              {(!docsData?.items || docsData.items.length === 0) && (
                <div className="empty-state py-10">
                  <FileText size={32} className="text-slate-200 mb-2" />
                  <p className="text-slate-400 text-sm">No documents uploaded yet</p>
                </div>
              )}
              {(docsData?.items as Array<{ id: string; originalName: string; fileType: string; fileSize: number; version: number; createdAt: string; uploadedBy?: { firstName: string; lastName: string } }>)?.map((doc) => (
                <div key={doc.id} className="px-6 py-3 flex items-center gap-4">
                  <FileText size={18} className="text-slate-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-800 truncate">{doc.originalName}</p>
                    <p className="text-xs text-slate-400">
                      {doc.fileType} • v{doc.version} • {formatDate(doc.createdAt)}
                    </p>
                  </div>
                  <a
                    href={`${process.env.NEXT_PUBLIC_API_URL}/api/documents/${doc.id}/download`}
                    className="btn-secondary text-xs py-1 px-2.5"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Download
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'followups' && (
          <div className="space-y-3">
            {project.followUps?.map((fu) => (
              <div key={fu.id} className="card p-4 flex items-center gap-4">
                <Clock size={18} className={cn(
                  fu.status === 'overdue' ? 'text-red-500' : 'text-amber-500'
                )} />
                <div className="flex-1">
                  <p className="font-medium text-slate-800">{fu.notes || 'No notes'}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Due: {formatDate(fu.nextFollowUp)} •{' '}
                    {(fu.owner as { firstName: string; lastName: string } | undefined)?.firstName} {(fu.owner as { firstName: string; lastName: string } | undefined)?.lastName}
                  </p>
                </div>
                <span className={getStatusBadgeClass(fu.status)}>{fu.status}</span>
              </div>
            ))}
            {(!project.followUps || project.followUps.length === 0) && (
              <div className="empty-state card py-12">
                <Clock size={32} className="text-slate-200 mb-2" />
                <p className="text-slate-400 text-sm">No follow-ups for this project</p>
                <Link href="/follow-ups" className="btn-primary mt-4 text-sm">
                  <Plus size={14} /> Add Follow-up
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function Plus({ size, className }: { size: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
