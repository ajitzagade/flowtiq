'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { get, patch, post, uploadFile } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import { useParams, useSearchParams } from 'next/navigation';
import {
  ArrowLeft, CheckCircle2, Clock, AlertCircle, Circle,
  FileText, Upload, History, ChevronDown, ChevronUp, X,
  User, Calendar, GitBranch, AlertTriangle, Plus, Paperclip,
  ChevronRight, ListChecks, Eye, Download, RefreshCw,
  Lock, Unlock, ArrowUp, ArrowDown,
} from 'lucide-react';
import Link from 'next/link';
import {
  formatDate, formatDateTime, getStatusBadgeClass, getPriorityBadgeClass, cn, getErrorMessage,
} from '@/lib/utils';
import { useState, useRef, useMemo } from 'react';
import toast from 'react-hot-toast';
import type { Project, ProjectWorkflow, ProjectStage, FollowUp, StageSubTask } from '@flowtiq/shared-types';

type ProjectDetail = Project & { followUps?: FollowUp[]; projectWorkflows?: ProjectWorkflow[] };

const STAGE_STATUSES = ['pending', 'in_progress', 'completed', 'on_hold', 'skipped'] as const;

// =============================================
// HELPERS
// =============================================

function StageStatusIcon({ status, size = 18 }: { status: string; size?: number }) {
  if (status === 'completed') return <CheckCircle2 size={size} className="text-emerald-500 flex-shrink-0" />;
  if (status === 'in_progress') return <Clock size={size} className="text-blue-500 animate-pulse flex-shrink-0" />;
  if (status === 'on_hold') return <AlertCircle size={size} className="text-amber-500 flex-shrink-0" />;
  if (status === 'skipped') return <RefreshCw size={size} className="text-slate-300 flex-shrink-0" />;
  return <Circle size={size} className="text-slate-300 flex-shrink-0" />;
}

function WorkflowStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    not_started: 'bg-slate-100 text-slate-500',
    in_progress: 'bg-blue-100 text-blue-700',
    completed: 'bg-emerald-100 text-emerald-700',
    blocked: 'bg-red-100 text-red-700',
  };
  const labels: Record<string, string> = {
    not_started: 'Not Started',
    in_progress: 'In Progress',
    completed: 'Completed',
    blocked: 'Blocked',
  };
  return (
    <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', map[status] || 'bg-slate-100 text-slate-500')}>
      {labels[status] || status}
    </span>
  );
}

function ProgressBar({ pct, color = '#3b82f6' }: { pct: number; color?: string }) {
  return (
    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${Math.min(100, pct)}%`, backgroundColor: color }}
      />
    </div>
  );
}

// =============================================
// DOCUMENT THUMBNAIL
// =============================================

type DocType = { id: string; originalName: string; fileType: string; mimeType?: string; filePath: string; createdAt: string; stageId?: string; projectWorkflowId?: string };

function getFileIcon(fileType: string, mimeType?: string) {
  const ft = (fileType || '').toLowerCase();
  const mt = (mimeType || '').toLowerCase();
  if (mt.startsWith('image/') || ['jpg','jpeg','png','gif','webp','svg','bmp'].includes(ft)) return 'image';
  if (ft === 'pdf' || mt === 'application/pdf') return 'pdf';
  if (['doc','docx'].includes(ft) || mt.includes('word')) return 'word';
  if (['xls','xlsx','csv'].includes(ft) || mt.includes('excel') || mt.includes('spreadsheet')) return 'excel';
  return 'file';
}

function DocThumbnail({ doc, onClick }: { doc: DocType; onClick: (doc: DocType) => void }) {
  const kind = getFileIcon(doc.fileType, doc.mimeType);
  const colorMap: Record<string, string> = {
    image: 'bg-purple-50 text-purple-600',
    pdf: 'bg-red-50 text-red-600',
    word: 'bg-blue-50 text-blue-700',
    excel: 'bg-emerald-50 text-emerald-700',
    file: 'bg-slate-50 text-slate-500',
  };
  const label = doc.originalName.split('.').pop()?.toUpperCase() || 'FILE';

  if (kind === 'image') {
    return (
      <button
        type="button"
        onClick={() => onClick(doc)}
        className="w-14 h-14 rounded-lg overflow-hidden border border-slate-200 flex-shrink-0 hover:border-blue-400 transition-colors"
        title={doc.originalName}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={doc.filePath} alt={doc.originalName} className="w-full h-full object-cover" />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onClick(doc)}
      className={cn('w-14 h-14 rounded-lg border border-slate-200 flex flex-col items-center justify-center gap-1 flex-shrink-0 hover:border-blue-400 transition-colors', colorMap[kind])}
      title={doc.originalName}
    >
      <FileText size={20} />
      <span className="text-[9px] font-bold leading-none">{label}</span>
    </button>
  );
}

// =============================================
// DOCUMENT PREVIEW MODAL
// =============================================

function DocPreviewModal({ doc, onClose }: { doc: DocType; onClose: () => void }) {
  const kind = getFileIcon(doc.fileType, doc.mimeType);
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content max-w-4xl w-full max-h-[90vh] flex flex-col" role="dialog" aria-modal="true">
        <div className="card-header flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <FileText size={16} className="text-slate-400 flex-shrink-0" />
            <span className="font-medium text-slate-900 truncate">{doc.originalName}</span>
          </div>
          <div className="flex items-center gap-2">
            <a href={doc.filePath} target="_blank" rel="noreferrer" className="btn-secondary text-xs py-1.5">
              <Download size={13} /> Open
            </a>
            <button onClick={onClose} className="btn-ghost p-1.5"><X size={18} /></button>
          </div>
        </div>
        <div className="flex-1 overflow-hidden p-4 min-h-0">
          {kind === 'image' && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={doc.filePath} alt={doc.originalName} className="max-w-full max-h-full object-contain mx-auto rounded-lg" />
          )}
          {kind === 'pdf' && (
            <iframe src={doc.filePath} className="w-full h-full rounded-lg border border-slate-200" title={doc.originalName} />
          )}
          {(kind === 'word' || kind === 'excel' || kind === 'file') && (
            <div className="h-full flex flex-col items-center justify-center text-center gap-4">
              <div className="w-20 h-20 rounded-2xl bg-slate-100 flex items-center justify-center">
                <FileText size={36} className="text-slate-400" />
              </div>
              <div>
                <p className="font-medium text-slate-800">{doc.originalName}</p>
                <p className="text-sm text-slate-500 mt-1">
                  {kind === 'word' ? 'Word Document' : kind === 'excel' ? 'Spreadsheet' : 'File'} — preview not available
                </p>
              </div>
              <a href={doc.filePath} target="_blank" rel="noreferrer" className="btn-primary">
                <Download size={16} /> Download File
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================
// STAGE DOCUMENTS INLINE
// =============================================

function StageDocuments({
  stageId, projectId, projectWorkflowId, documents, onRefresh,
}: {
  stageId: string;
  projectId: string;
  projectWorkflowId?: string;
  documents: DocType[];
  onRefresh: () => void;
}) {
  const [previewDoc, setPreviewDoc] = useState<DocType | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const MAX_SHOWN = 3;
  const shown = documents.slice(0, MAX_SHOWN);
  const extra = documents.length - MAX_SHOWN;

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('projectId', projectId);
      form.append('stageId', stageId);
      if (projectWorkflowId) form.append('projectWorkflowId', projectWorkflowId);
      await uploadFile('/documents/upload', form);
      toast.success('Document uploaded');
      onRefresh();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <>
      {previewDoc && <DocPreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />}
      <div className="flex items-center gap-2 flex-wrap">
        {shown.map((doc) => (
          <DocThumbnail key={doc.id} doc={doc} onClick={setPreviewDoc} />
        ))}
        {extra > 0 && (
          <Link
            href={`/projects/${projectId}?tab=documents`}
            className="w-14 h-14 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center text-sm font-semibold text-slate-500 hover:border-blue-400 hover:text-blue-600 transition-colors flex-shrink-0"
            title="View all documents"
          >
            +{extra}
          </Link>
        )}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="w-14 h-14 rounded-lg border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 hover:border-blue-400 hover:text-blue-500 transition-colors flex-shrink-0"
          title="Upload document"
        >
          {uploading ? <RefreshCw size={16} className="animate-spin" /> : <Plus size={18} />}
          <span className="text-[9px] mt-0.5">Upload</span>
        </button>
        <input ref={fileRef} type="file" className="hidden" onChange={handleUpload} />
      </div>
    </>
  );
}

// =============================================
// STAGE CARD
// =============================================

function StageCard({
  stage, projectId, projectWorkflowId, users, onRefresh,
}: {
  stage: ProjectStage & { history?: unknown[]; documents?: DocType[]; subTasks?: StageSubTask[] };
  projectId: string;
  projectWorkflowId: string;
  users: Array<{ id: string; firstName: string; lastName: string }>;
  onRefresh: () => void;
}) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(stage.status === 'in_progress');
  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const [showSubTaskForm, setShowSubTaskForm] = useState(false);
  const [newStatus, setNewStatus] = useState(stage.status);
  const [comment, setComment] = useState('');
  const [notes, setNotes] = useState(stage.notes || '');
  const [assignedTo, setAssignedTo] = useState(stage.assignedTo || '');
  const [subTaskName, setSubTaskName] = useState('');
  const [subTaskRequired, setSubTaskRequired] = useState(false);

  const updateMutation = useMutation({
    mutationFn: (data: object) => patch(`/stages/${stage.id}`, data),
    onSuccess: () => {
      toast.success('Stage updated');
      qc.invalidateQueries({ queryKey: ['project', projectId] });
      setShowUpdateForm(false);
      setComment('');
      onRefresh();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const addSubTaskMutation = useMutation({
    mutationFn: (data: object) => post(`/stages/${stage.id}/sub-tasks`, data),
    onSuccess: () => {
      toast.success('Sub-task added');
      setSubTaskName('');
      setShowSubTaskForm(false);
      qc.invalidateQueries({ queryKey: ['project', projectId] });
      onRefresh();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const updateSubTaskMutation = useMutation({
    mutationFn: ({ subTaskId, data }: { subTaskId: string; data: object }) =>
      patch(`/stages/${stage.id}/sub-tasks/${subTaskId}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', projectId] });
      onRefresh();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const assignedUser = users.find((u) => u.id === stage.assignedTo);

  const borderColor: Record<string, string> = {
    completed: 'border-l-emerald-500',
    in_progress: 'border-l-blue-500',
    on_hold: 'border-l-amber-500',
    skipped: 'border-l-slate-300',
    pending: 'border-l-slate-200',
  };

  const history = stage.history as Array<{
    id: string;
    changeType?: string;
    fieldChanged?: string;
    previousStatus?: string;
    newStatus: string;
    previousValue?: string;
    newValue?: string;
    comment?: string;
    createdAt: string;
    changedBy?: { firstName: string; lastName: string };
  }> | undefined;

  return (
    <div className={cn('card border-l-4 overflow-hidden', borderColor[stage.status] || 'border-l-slate-200')}>
      {/* Header row */}
      <button
        type="button"
        aria-expanded={expanded}
        className="w-full px-5 py-4 flex items-center gap-3 cursor-pointer hover:bg-slate-50 text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <StageStatusIcon status={stage.status} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-slate-400">Stage {stage.stageOrder}</span>
            {stage.isRequired
              ? <span className="flex items-center gap-0.5 text-[10px] font-medium text-red-600 bg-red-50 px-1.5 py-0.5 rounded"><Lock size={9} /> Required</span>
              : <span className="flex items-center gap-0.5 text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded"><Unlock size={9} /> Optional</span>
            }
          </div>
          <p className="font-semibold text-slate-900 truncate">{stage.stageName}</p>
          {assignedUser && (
            <div className="flex items-center gap-1 mt-0.5">
              <User size={11} className="text-slate-400" />
              <span className="text-xs text-slate-500">{assignedUser.firstName} {assignedUser.lastName}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {stage.documents && stage.documents.length > 0 && (
            <div className="flex items-center gap-1 text-xs text-slate-400">
              <Paperclip size={12} />
              {stage.documents.length}
            </div>
          )}
          <span className={getStatusBadgeClass(stage.status)}>{stage.status.replace('_', ' ')}</span>
          {expanded
            ? <ChevronUp size={16} className="text-slate-400" />
            : <ChevronDown size={16} className="text-slate-400" />}
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 border-t border-slate-100 pt-4 space-y-4">
          {/* Dates */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-xs text-slate-400 mb-0.5">Started</p>
              <p className="text-slate-700">{formatDate(stage.startDate) || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-0.5">Completed</p>
              <p className="text-slate-700">{formatDate(stage.completionDate) || '—'}</p>
            </div>
            {stage.assignedAt && (
              <div>
                <p className="text-xs text-slate-400 mb-0.5">Assigned On</p>
                <p className="text-slate-700">{formatDate(stage.assignedAt)}</p>
              </div>
            )}
          </div>

          {stage.notes && (
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-xs font-medium text-slate-500 mb-1">Notes</p>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{stage.notes}</p>
            </div>
          )}

          {/* Sub-tasks */}
          {((stage.subTasks && stage.subTasks.length > 0) || showSubTaskForm) && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                  <ListChecks size={13} /> Sub-tasks
                </p>
                <button
                  onClick={() => setShowSubTaskForm(!showSubTaskForm)}
                  className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                >
                  <Plus size={12} /> Add
                </button>
              </div>
              {showSubTaskForm && (
                <div className="flex gap-2 mb-2">
                  <input
                    className="form-input text-xs py-1 flex-1"
                    value={subTaskName}
                    onChange={(e) => setSubTaskName(e.target.value)}
                    placeholder="Sub-task name..."
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && subTaskName.trim()) {
                        addSubTaskMutation.mutate({ name: subTaskName.trim(), isRequired: subTaskRequired });
                      }
                    }}
                  />
                  <label className="flex items-center gap-1 text-xs text-slate-500 flex-shrink-0">
                    <input type="checkbox" checked={subTaskRequired} onChange={(e) => setSubTaskRequired(e.target.checked)} className="rounded" />
                    Required
                  </label>
                  <button
                    onClick={() => addSubTaskMutation.mutate({ name: subTaskName.trim(), isRequired: subTaskRequired })}
                    disabled={!subTaskName.trim() || addSubTaskMutation.isPending}
                    className="btn-primary text-xs py-1 px-2"
                  >Add</button>
                  <button onClick={() => setShowSubTaskForm(false)} className="btn-ghost text-xs py-1"><X size={14} /></button>
                </div>
              )}
              <div className="space-y-1">
                {stage.subTasks?.map((st) => (
                  <div key={st.id} className="flex items-center gap-2 py-1">
                    <input
                      type="checkbox"
                      checked={st.status === 'completed'}
                      onChange={() => updateSubTaskMutation.mutate({
                        subTaskId: st.id,
                        data: { status: st.status === 'completed' ? 'pending' : 'completed' },
                      })}
                      className="rounded flex-shrink-0"
                    />
                    <span className={cn('text-sm flex-1', st.status === 'completed' && 'line-through text-slate-400')}>
                      {st.name}
                    </span>
                    {!st.isRequired && (
                      <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded flex-shrink-0">optional</span>
                    )}
                    {st.status === 'completed' && (
                      <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {(!stage.subTasks || stage.subTasks.length === 0) && !showSubTaskForm && (
            <button
              onClick={() => setShowSubTaskForm(true)}
              className="text-xs text-slate-400 hover:text-blue-600 flex items-center gap-1 transition-colors"
            >
              <Plus size={12} /> Add sub-tasks
            </button>
          )}

          {/* Documents */}
          <div>
            <p className="text-xs font-medium text-slate-500 mb-2 flex items-center gap-1.5">
              <Paperclip size={13} /> Documents
            </p>
            <StageDocuments
              stageId={stage.id}
              projectId={projectId}
              projectWorkflowId={projectWorkflowId}
              documents={stage.documents || []}
              onRefresh={onRefresh}
            />
          </div>

          {/* History */}
          {history && history.length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-500 mb-2 flex items-center gap-1.5">
                <History size={13} /> History
              </p>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {history.map((h) => {
                  const changeLabel = h.changeType === 'status'
                    ? `changed status from "${h.previousStatus?.replace('_', ' ')}" to "${h.newStatus?.replace('_', ' ')}"`
                    : h.changeType === 'assignment'
                      ? `updated assignment`
                      : h.changeType === 'notes'
                        ? 'updated notes'
                        : h.changeType === 'sub_task'
                          ? h.comment
                          : h.changeType === 'checklist'
                            ? 'updated checklist'
                            : `updated ${h.fieldChanged || 'stage'}`;
                  return (
                    <div key={h.id} className="flex gap-2.5 text-sm">
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-300 mt-1.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-slate-700">
                          {h.changedBy?.firstName} {h.changedBy?.lastName}
                        </span>{' '}
                        <span className="text-slate-500">{changeLabel}</span>
                        {h.comment && h.changeType !== 'sub_task' && (
                          <p className="text-slate-400 text-xs mt-0.5 italic">{h.comment}</p>
                        )}
                        <p className="text-xs text-slate-400 mt-0.5">{formatDateTime(h.createdAt)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Update form */}
          {!showUpdateForm ? (
            <div className="flex gap-2">
              <button onClick={() => setShowUpdateForm(true)} className="btn-secondary text-xs py-1.5">
                Update Stage
              </button>
            </div>
          ) : (
            <div className="bg-slate-50 rounded-xl p-4 space-y-3 border border-slate-200">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-700">Update Stage</p>
                <button onClick={() => setShowUpdateForm(false)}><X size={16} className="text-slate-400" /></button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  <label className="form-label text-xs">Assign To</label>
                  <select
                    className="form-select"
                    value={assignedTo}
                    onChange={(e) => setAssignedTo(e.target.value)}
                  >
                    <option value="">— Unassigned —</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                    ))}
                  </select>
                </div>
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
                <label className="form-label text-xs">Comment / Reason</label>
                <input
                  className="form-input text-xs"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Reason for this update..."
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() =>
                    updateMutation.mutate({
                      status: newStatus,
                      notes,
                      assignedTo: assignedTo || null,
                      comment,
                    })
                  }
                  disabled={updateMutation.isPending}
                  className="btn-primary text-xs py-1.5"
                >
                  {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
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

// =============================================
// WORKFLOW CARD
// =============================================

function WorkflowCard({
  workflow, projectId, users, onRefresh, onMoveUp, onMoveDown,
}: {
  workflow: ProjectWorkflow & { stages?: (ProjectStage & { history?: unknown[]; documents?: DocType[]; subTasks?: StageSubTask[] })[] };
  projectId: string;
  users: Array<{ id: string; firstName: string; lastName: string }>;
  onRefresh: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  const stages = workflow.stages || [];
  const completed = stages.filter((s) => s.status === 'completed').length;
  const inProgress = stages.filter((s) => s.status === 'in_progress').length;
  const total = stages.length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  const WORKFLOW_COLORS: Record<string, string> = {
    Zoning: '#6366f1',
    'Gardening NOC': '#16a34a',
    LAQ: '#b45309',
  };
  const accentColor = WORKFLOW_COLORS[workflow.name] || '#3b82f6';

  return (
    <div className="card overflow-hidden">
      {/* Workflow header */}
      <div
        className="px-5 py-4 flex items-center gap-4 cursor-pointer hover:bg-slate-50 transition-colors"
        onClick={() => setCollapsed(!collapsed)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setCollapsed(!collapsed)}
      >
        {/* Icon */}
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-white flex-shrink-0"
          style={{ backgroundColor: accentColor }}
        >
          <GitBranch size={18} />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h4 className="font-semibold text-slate-900">{workflow.name}</h4>
            <WorkflowStatusBadge status={workflow.status} />
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span>{completed}/{total} stages complete</span>
            {inProgress > 0 && (
              <span className="text-blue-600 font-medium">{inProgress} in progress</span>
            )}
            {workflow.completedAt && (
              <span className="text-emerald-600">Completed {formatDate(workflow.completedAt)}</span>
            )}
          </div>
        </div>

        {/* Progress */}
        <div className="flex-shrink-0 w-32 space-y-1 hidden sm:block">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">Progress</span>
            <span className="text-xs font-bold" style={{ color: accentColor }}>{pct}%</span>
          </div>
          <ProgressBar pct={pct} color={accentColor} />
        </div>

        {(onMoveUp || onMoveDown) && (
          <div className="flex flex-col gap-0.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
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
        {collapsed
          ? <ChevronUp size={16} className="text-slate-400 flex-shrink-0" />
          : <ChevronDown size={16} className="text-slate-400 flex-shrink-0" />}
      </div>

      {/* Mobile progress */}
      {!collapsed && (
        <div className="sm:hidden px-5 pb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-slate-500">Progress</span>
            <span className="text-xs font-bold" style={{ color: accentColor }}>{pct}%</span>
          </div>
          <ProgressBar pct={pct} color={accentColor} />
        </div>
      )}

      {/* Stages */}
      {!collapsed && (
        <div className="border-t border-slate-100">
          {stages.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <Clock size={32} className="text-slate-200 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No stages in this workflow</p>
            </div>
          ) : (
            <div className="p-4 space-y-2">
              {stages.map((stage) => (
                <StageCard
                  key={stage.id}
                  stage={stage}
                  projectId={projectId}
                  projectWorkflowId={workflow.id}
                  users={users}
                  onRefresh={onRefresh}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================
// ADD WORKFLOW MODAL
// =============================================

function AddWorkflowModal({
  projectId, onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: workflows } = useQuery<Array<{ id: string; name: string; stages: unknown[]; isDefault: boolean }>>({
    queryKey: ['workflows'],
    queryFn: () => get('/workflows'),
  });

  const handleAdd = async () => {
    if (!selectedId) { toast.error('Select a workflow'); return; }
    setSaving(true);
    try {
      await post(`/project-workflows/project/${projectId}`, { workflowTemplateId: selectedId });
      toast.success('Workflow added to project');
      qc.invalidateQueries({ queryKey: ['project', projectId] });
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content max-w-md w-full" role="dialog" aria-modal="true">
        <div className="card-header">
          <h3>Add Workflow to Project</h3>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={18} /></button>
        </div>
        <div className="card-body space-y-4">
          <div>
            <label className="form-label">Select Workflow Template</label>
            <select className="form-select" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
              <option value="">— Choose workflow —</option>
              {workflows?.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.stages.length} stages){w.isDefault ? ' — Default' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={handleAdd} disabled={saving || !selectedId} className="btn-primary">
            {saving ? 'Adding...' : 'Add Workflow'}
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================
// DOCUMENTS TAB (grouped by workflow → stage)
// =============================================

function DocumentsTab({ project }: { project: ProjectDetail }) {
  const [previewDoc, setPreviewDoc] = useState<DocType | null>(null);
  const { data: docsData } = useQuery({
    queryKey: ['documents', project.id],
    queryFn: () => get<{ items: DocType[] }>('/documents', { projectId: project.id }),
  });

  const docs = docsData?.items || [];

  // Group by workflow → stage
  const ungrouped = docs.filter((d) => !d.stageId && !d.projectWorkflowId);

  const byWorkflow = (project.projectWorkflows || []).map((pw) => {
    const pwDocs = docs.filter((d) => d.projectWorkflowId === pw.id && !d.stageId);
    const stages = pw.stages || [];
    const byStage = stages.map((s) => ({
      stage: s,
      docs: docs.filter((d) => d.stageId === s.id),
    })).filter((g) => g.docs.length > 0);
    return { workflow: pw, docs: pwDocs, stages: byStage };
  }).filter((g) => g.docs.length > 0 || g.stages.length > 0);

  return (
    <>
      {previewDoc && <DocPreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />}
      <div className="space-y-4">
        {/* Workflow-grouped documents */}
        {byWorkflow.map(({ workflow, docs: wfDocs, stages: stageDocs }) => (
          <div key={workflow.id} className="card overflow-hidden">
            <div className="card-header bg-slate-50">
              <div className="flex items-center gap-2">
                <GitBranch size={16} className="text-slate-500" />
                <h4 className="font-medium text-slate-700">{workflow.name}</h4>
                <span className="text-xs text-slate-400">{wfDocs.length + stageDocs.reduce((s, sg) => s + sg.docs.length, 0)} files</span>
              </div>
            </div>
            <div className="divide-y divide-slate-100">
              {wfDocs.map((doc) => <DocRow key={doc.id} doc={doc} onPreview={setPreviewDoc} />)}
              {stageDocs.map(({ stage, docs: sDocs }) => (
                <div key={stage.id}>
                  <div className="px-5 py-2 bg-slate-50/50 flex items-center gap-2">
                    <ChevronRight size={12} className="text-slate-400" />
                    <span className="text-xs font-medium text-slate-600">{stage.stageName}</span>
                    <span className="text-xs text-slate-400">{sDocs.length} file{sDocs.length !== 1 ? 's' : ''}</span>
                  </div>
                  {sDocs.map((doc) => <DocRow key={doc.id} doc={doc} onPreview={setPreviewDoc} />)}
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Ungrouped documents */}
        {ungrouped.length > 0 && (
          <div className="card overflow-hidden">
            <div className="card-header bg-slate-50">
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-slate-500" />
                <h4 className="font-medium text-slate-700">General Documents</h4>
                <span className="text-xs text-slate-400">{ungrouped.length} files</span>
              </div>
            </div>
            <div className="divide-y divide-slate-100">
              {ungrouped.map((doc) => <DocRow key={doc.id} doc={doc} onPreview={setPreviewDoc} />)}
            </div>
          </div>
        )}

        {docs.length === 0 && (
          <div className="empty-state card py-16">
            <FileText size={40} className="text-slate-200 mb-3" />
            <p className="text-slate-500">No documents uploaded yet</p>
            <Link href={`/documents?projectId=${project.id}&upload=true`} className="btn-primary mt-4">
              <Upload size={14} /> Upload Document
            </Link>
          </div>
        )}

        <div className="flex justify-end">
          <Link href={`/documents?projectId=${project.id}&upload=true`} className="btn-secondary text-sm">
            <Upload size={14} /> Upload Document
          </Link>
        </div>
      </div>
    </>
  );
}

function DocRow({ doc, onPreview }: { doc: DocType; onPreview: (doc: DocType) => void }) {
  const kind = getFileIcon(doc.fileType, doc.mimeType);
  const iconColor = kind === 'image' ? 'text-purple-400' : kind === 'pdf' ? 'text-red-400' : 'text-slate-400';
  return (
    <div className="px-5 py-3 flex items-center gap-4 hover:bg-slate-50 transition-colors">
      <FileText size={18} className={cn('flex-shrink-0', iconColor)} />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-slate-800 truncate text-sm">{doc.originalName}</p>
        <p className="text-xs text-slate-400">{doc.fileType} • {formatDate(doc.createdAt)}</p>
      </div>
      <div className="flex items-center gap-1">
        <button onClick={() => onPreview(doc)} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg" title="Preview">
          <Eye size={15} />
        </button>
        <a href={doc.filePath} target="_blank" rel="noreferrer" className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg" title="Download">
          <Download size={15} />
        </a>
      </div>
    </div>
  );
}

// =============================================
// MAIN PAGE
// =============================================

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const qc = useQueryClient();

  const initialTab = (() => {
    const t = searchParams.get('tab');
    if (t === 'documents' || t === 'followups') return t;
    return 'workflows';
  })();
  const [activeTab, setActiveTab] = useState<'workflows' | 'documents' | 'followups'>(initialTab);
  const [showAddWorkflow, setShowAddWorkflow] = useState(false);
  const [wfOrder, setWfOrder] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = localStorage.getItem(`wf-order-${id}`);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  const { data: project, isLoading } = useQuery<ProjectDetail>({
    queryKey: ['project', id],
    queryFn: () => get<ProjectDetail>(`/projects/${id}`),
  });

  const { data: usersData } = useQuery<{ items: Array<{ id: string; firstName: string; lastName: string; email: string }> }>({
    queryKey: ['users', 'all'],
    queryFn: () => get('/users', { pageSize: '200' }),
  });

  const users = usersData?.items || [];

  const handleRefresh = () => {
    qc.invalidateQueries({ queryKey: ['project', id] });
  };

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

  const projectWorkflows = project.projectWorkflows || [];

  const orderedWorkflows = useMemo(() => {
    if (wfOrder.length === 0) return projectWorkflows;
    const orderMap = new Map(wfOrder.map((wid, i) => [wid, i]));
    return [...projectWorkflows].sort((a, b) => {
      const ai = orderMap.has(a.id) ? orderMap.get(a.id)! : 999;
      const bi = orderMap.has(b.id) ? orderMap.get(b.id)! : 999;
      return ai - bi;
    });
  }, [projectWorkflows, wfOrder]);

  const moveWorkflow = (wfId: string, direction: 'up' | 'down') => {
    const current = orderedWorkflows.map((pw) => pw.id);
    const idx = current.indexOf(wfId);
    if (direction === 'up' && idx <= 0) return;
    if (direction === 'down' && idx >= current.length - 1) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    const newOrder = [...current];
    [newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]];
    setWfOrder(newOrder);
    localStorage.setItem(`wf-order-${id}`, JSON.stringify(newOrder));
  };

  const allWorkflowStages = projectWorkflows.flatMap((pw) => pw.stages || []);
  const totalStages = allWorkflowStages.length;
  const completedStages = allWorkflowStages.filter((s) => s.status === 'completed').length;
  const overallPct = totalStages > 0 ? Math.round((completedStages / totalStages) * 100) : 0;
  const completedWorkflows = projectWorkflows.filter((pw) => pw.status === 'completed').length;

  const TABS = [
    { key: 'workflows', label: `Workflows (${projectWorkflows.length})`, icon: GitBranch },
    { key: 'documents', label: 'Documents', icon: FileText },
    { key: 'followups', label: 'Follow-ups', icon: Clock },
  ] as const;

  return (
    <>
      <Header title={project.name} subtitle={`${project.projectNumber} • ${project.clientName}`} />
      {showAddWorkflow && <AddWorkflowModal projectId={project.id} onClose={() => setShowAddWorkflow(false)} />}

      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 animate-slide-in">
        {/* Back + badges */}
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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            <div>
              <p className="text-xs font-medium text-slate-400 mb-1">Client</p>
              <p className="font-semibold text-slate-900 truncate">{project.clientName}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400 mb-1">Location</p>
              <p className="font-semibold text-slate-900">{project.location || '—'}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400 mb-1">Owner</p>
              <p className="font-semibold text-slate-900">
                {project.owner ? `${project.owner.firstName} ${project.owner.lastName}` : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400 mb-1">Start Date</p>
              <p className="font-semibold text-slate-900">{formatDate(project.startDate) || '—'}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400 mb-1">Due Date</p>
              <p className={cn('font-semibold', project.dueDate && new Date(project.dueDate) < new Date() ? 'text-red-600' : 'text-slate-900')}>
                {formatDate(project.dueDate) || '—'}
              </p>
            </div>
          </div>
          {project.description && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <p className="text-xs font-medium text-slate-400 mb-1">Description</p>
              <p className="text-slate-700 text-sm">{project.description}</p>
            </div>
          )}
        </div>

        {/* Overall Progress Summary */}
        {projectWorkflows.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="card p-4">
              <p className="text-2xl font-bold text-slate-900">{projectWorkflows.length}</p>
              <p className="text-xs text-slate-500 mt-0.5">Total Workflows</p>
            </div>
            <div className="card p-4">
              <p className="text-2xl font-bold text-emerald-600">{completedWorkflows}</p>
              <p className="text-xs text-slate-500 mt-0.5">Workflows Completed</p>
            </div>
            <div className="card p-4">
              <p className="text-2xl font-bold text-blue-600">{completedStages}/{totalStages}</p>
              <p className="text-xs text-slate-500 mt-0.5">Stages Completed</p>
            </div>
            <div className="card p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs text-slate-500">Overall Progress</p>
                <p className="text-sm font-bold text-slate-900">{overallPct}%</p>
              </div>
              <ProgressBar pct={overallPct} color="#3b82f6" />
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="border-b border-slate-200">
          <div className="flex gap-1 overflow-x-auto scrollbar-none">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key as typeof activeTab)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
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
        {activeTab === 'workflows' && (
          <div className="space-y-3">
            {/* Add workflow button */}
            <div className="flex justify-between items-center">
              <p className="text-sm text-slate-500">
                {projectWorkflows.length === 0
                  ? 'No workflows attached to this project yet.'
                  : `${projectWorkflows.length} workflow${projectWorkflows.length !== 1 ? 's' : ''} attached`}
              </p>
              <button onClick={() => setShowAddWorkflow(true)} className="btn-secondary text-sm">
                <Plus size={14} /> Add Workflow
              </button>
            </div>

            {projectWorkflows.length === 0 && (
              <div className="empty-state card py-16">
                <GitBranch size={40} className="text-slate-200 mb-3" />
                <p className="text-slate-500">No workflows attached</p>
                <p className="text-slate-400 text-sm">Add the mandatory workflows (Zoning, Gardening NOC, LAQ) to track progress</p>
                <button onClick={() => setShowAddWorkflow(true)} className="btn-primary mt-4">
                  <Plus size={16} /> Add Workflow
                </button>
              </div>
            )}

            {orderedWorkflows.map((pw, idx) => (
              <WorkflowCard
                key={pw.id}
                workflow={pw as ProjectWorkflow & { stages?: (ProjectStage & { history?: unknown[]; documents?: DocType[]; subTasks?: StageSubTask[] })[] }}
                projectId={project.id}
                users={users}
                onRefresh={handleRefresh}
                onMoveUp={idx > 0 ? () => moveWorkflow(pw.id, 'up') : undefined}
                onMoveDown={idx < orderedWorkflows.length - 1 ? () => moveWorkflow(pw.id, 'down') : undefined}
              />
            ))}

            {/* Legacy stages (if any) */}
            {project.stages && project.stages.length > 0 && (
              <div className="card overflow-hidden">
                <div className="card-header bg-amber-50 border-b-amber-100">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={16} className="text-amber-500" />
                    <h4 className="font-medium text-amber-800">Legacy Workflow Stages</h4>
                    <span className="text-xs text-amber-600 bg-amber-100 px-2 py-0.5 rounded">Standard File Workflow</span>
                  </div>
                </div>
                <div className="p-4 space-y-2">
                  {project.stages.map((stage) => (
                    <StageCard
                      key={stage.id}
                      stage={stage as ProjectStage & { history?: unknown[]; documents?: DocType[]; subTasks?: StageSubTask[] }}
                      projectId={project.id}
                      projectWorkflowId=""
                      users={users}
                      onRefresh={handleRefresh}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'documents' && <DocumentsTab project={project} />}

        {activeTab === 'followups' && (
          <div className="space-y-3">
            {project.followUps?.map((fu) => (
              <div key={fu.id} className="card p-4 flex items-center gap-4">
                <Clock size={18} className={cn(fu.status === 'overdue' ? 'text-red-500' : 'text-amber-500')} />
                <div className="flex-1">
                  <p className="font-medium text-slate-800">{fu.notes || 'No notes'}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Due: {formatDate(fu.nextFollowUp)} •{' '}
                    {(fu.owner as { firstName: string; lastName: string } | undefined)?.firstName}{' '}
                    {(fu.owner as { firstName: string; lastName: string } | undefined)?.lastName}
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
