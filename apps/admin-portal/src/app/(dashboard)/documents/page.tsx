'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { get } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import {
  Search, FileText, Upload, Download, Trash2, X, FolderOpen,
  ChevronDown, GitBranch, Layers,
} from 'lucide-react';
import { formatDate, formatFileSize, cn, getErrorMessage } from '@/lib/utils';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import type { Document, Project } from '@flowtiq/shared-types';

type EnrichedDocument = Document & {
  project?: { id: string; name: string; projectNumber: string };
  stage?: { id: string; stageName: string } | null;
  projectWorkflow?: { id: string; name: string } | null;
};

function UploadModal({ onClose, initialProjectId = '' }: { onClose: () => void; initialProjectId?: string }) {
  const qc = useQueryClient();
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);
  const [projectId, setProjectId] = useState(initialProjectId);
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState('');
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const { data: projectsData } = useQuery({
    queryKey: ['projects', 'all'],
    queryFn: () => get<{ items: Project[] }>('/projects?pageSize=100&status=active'),
  });

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  }, []);

  const handleUpload = async () => {
    if (!file || !projectId) {
      toast.error('Please select a project and file');
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('projectId', projectId);
      if (notes) formData.append('notes', notes);

      await api.post('/documents/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('Document uploaded successfully');
      qc.invalidateQueries({ queryKey: ['documents'] });
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content max-w-md w-full" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="card-header">
          <h3 id="modal-title">Upload Document</h3>
          <button onClick={onClose} aria-label="Close" className="btn-ghost p-1.5"><X size={18} aria-hidden="true" /></button>
        </div>
        <div className="card-body space-y-4">
          <div>
            <label className="form-label">Project *</label>
            <select className="form-select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Select project</option>
              {projectsData?.items?.map((p) => (
                <option key={p.id} value={p.id}>{p.projectNumber} - {p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label">File *</label>
            <div
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              className={cn(
                'border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer',
                dragOver ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-slate-300'
              )}
              onClick={() => document.getElementById('file-input')?.click()}
            >
              <Upload size={24} className={cn('mx-auto mb-2', dragOver ? 'text-blue-500' : 'text-slate-300')} />
              {file ? (
                <div>
                  <p className="font-medium text-slate-800">{file.name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{formatFileSize(file.size)}</p>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-slate-500">Drag & drop or click to browse</p>
                  <p className="text-xs text-slate-400 mt-1">Max file size: 50MB</p>
                </div>
              )}
              <input
                id="file-input"
                type="file"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </div>
          </div>

          <div>
            <label className="form-label">Notes</label>
            <textarea
              rows={2}
              className="form-input resize-none"
              placeholder="Optional notes about this document..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-3">
            <button onClick={onClose} className="btn-secondary">Cancel</button>
            <button onClick={handleUpload} disabled={uploading || !file || !projectId} className="btn-primary">
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const FILE_TYPE_ICONS: Record<string, string> = {
  PDF: 'text-red-500',
  DOC: 'text-blue-500',
  DOCX: 'text-blue-500',
  XLS: 'text-emerald-500',
  XLSX: 'text-emerald-500',
  JPG: 'text-amber-500',
  PNG: 'text-amber-500',
};

function CountBadge({ count }: { count: number }) {
  return (
    <span className="ml-2 inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-500 tabular-nums">
      {count}
    </span>
  );
}

function DocRow({ doc, onDelete }: { doc: EnrichedDocument; onDelete: (id: string) => void }) {
  const uploader = doc.uploadedBy as { firstName: string; lastName: string } | undefined;
  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-b-0">
      <FileText size={16} className={cn('flex-shrink-0', FILE_TYPE_ICONS[doc.fileType] || 'text-slate-400')} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800 truncate">{doc.originalName}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="badge badge-blue text-[10px] px-1.5 py-0">{doc.fileType}</span>
          <span className="text-xs text-slate-400">{formatFileSize(doc.fileSize)}</span>
          {doc.version > 1 && <span className="text-xs text-slate-400">v{doc.version}</span>}
        </div>
      </div>
      <div className="hidden sm:block text-right flex-shrink-0 min-w-[100px]">
        {uploader && (
          <p className="text-xs text-slate-500 truncate">{uploader.firstName} {uploader.lastName}</p>
        )}
        <p className="text-xs text-slate-400">{formatDate(doc.createdAt)}</p>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <a
          href={doc.filePath}
          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
          title="Download"
          target="_blank"
          rel="noreferrer"
        >
          <Download size={14} />
        </a>
        <button
          onClick={() => { if (confirm('Delete this document?')) onDelete(doc.id); }}
          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          title="Delete"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

function groupDocuments(docs: EnrichedDocument[]) {
  type StageGroup = { stageId: string | null; stageName: string; docs: EnrichedDocument[] };
  type WorkflowGroup = { workflowId: string | null; workflowName: string; stages: StageGroup[] };
  type ProjectGroup = { projectId: string; projectName: string; projectNumber: string; workflows: WorkflowGroup[] };

  const projectMap = new Map<string, {
    projectId: string; projectName: string; projectNumber: string;
    workflowMap: Map<string, { workflowId: string | null; workflowName: string; stageMap: Map<string, StageGroup> }>;
  }>();

  for (const doc of docs) {
    const projectId = doc.projectId;
    const projectName = doc.project?.name || 'Unknown Project';
    const projectNumber = doc.project?.projectNumber || '';
    const workflowId = doc.projectWorkflowId || null;
    const workflowName = (doc.projectWorkflow as { name: string } | null | undefined)?.name || 'General';
    const stageId = doc.stageId || null;
    const stageName = (doc.stage as { stageName: string } | null | undefined)?.stageName || 'Unassigned';

    if (!projectMap.has(projectId)) {
      projectMap.set(projectId, { projectId, projectName, projectNumber, workflowMap: new Map() });
    }
    const pg = projectMap.get(projectId)!;

    const wKey = workflowId || '__general__';
    if (!pg.workflowMap.has(wKey)) {
      pg.workflowMap.set(wKey, { workflowId, workflowName, stageMap: new Map() });
    }
    const wg = pg.workflowMap.get(wKey)!;

    const sKey = stageId || '__unassigned__';
    if (!wg.stageMap.has(sKey)) {
      wg.stageMap.set(sKey, { stageId, stageName, docs: [] });
    }
    wg.stageMap.get(sKey)!.docs.push(doc);
  }

  return Array.from(projectMap.values()).map((pg): ProjectGroup => ({
    projectId: pg.projectId,
    projectName: pg.projectName,
    projectNumber: pg.projectNumber,
    workflows: Array.from(pg.workflowMap.values()).map((wg): WorkflowGroup => ({
      workflowId: wg.workflowId,
      workflowName: wg.workflowName,
      stages: Array.from(wg.stageMap.values()),
    })),
  }));
}

export default function DocumentsPage() {
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState('');
  const [projectId, setProjectId] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [uploadProjectId, setUploadProjectId] = useState('');
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [expandedWorkflows, setExpandedWorkflows] = useState<Set<string>>(new Set());
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set());

  useEffect(() => {
    const pid = searchParams.get('projectId') || '';
    if (pid) { setUploadProjectId(pid); setProjectId(pid); }
    if (searchParams.get('upload') === 'true') setShowUpload(true);
  }, [searchParams]);

  const { data, isLoading } = useQuery({
    queryKey: ['documents', projectId],
    queryFn: () =>
      get<{ items: EnrichedDocument[]; total: number }>('/documents', {
        pageSize: 200,
        projectId: projectId || undefined,
      }),
    placeholderData: (prev) => prev,
  });

  const { data: projectsData } = useQuery({
    queryKey: ['projects', 'all'],
    queryFn: () => get<{ items: Project[] }>('/projects?pageSize=100'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/documents/${id}`),
    onSuccess: () => { toast.success('Document deleted'); qc.invalidateQueries({ queryKey: ['documents'] }); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const allDocs = data?.items || [];

  // Client-side search filter
  const filteredDocs = useMemo(() => {
    if (!search) return allDocs;
    const q = search.toLowerCase();
    return allDocs.filter((d) => d.originalName.toLowerCase().includes(q));
  }, [allDocs, search]);

  const grouped = useMemo(() => groupDocuments(filteredDocs), [filteredDocs]);

  // Auto-expand all sections when data loads or search changes
  useEffect(() => {
    const pIds = new Set<string>();
    const wIds = new Set<string>();
    const sIds = new Set<string>();
    grouped.forEach((pg) => {
      pIds.add(pg.projectId);
      pg.workflows.forEach((wg) => {
        const wKey = `${pg.projectId}__${wg.workflowId || '__general__'}`;
        wIds.add(wKey);
        wg.stages.forEach((sg) => {
          sIds.add(`${wKey}__${sg.stageId || '__unassigned__'}`);
        });
      });
    });
    setExpandedProjects(pIds);
    setExpandedWorkflows(wIds);
    setExpandedStages(sIds);
  }, [grouped]);

  const toggleProject = (id: string) => setExpandedProjects((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleWorkflow = (key: string) => setExpandedWorkflows((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const toggleStage = (key: string) => setExpandedStages((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  return (
    <>
      <Header title="Documents" subtitle="Browse documents organised by project, workflow and stage" />
      {showUpload && <UploadModal onClose={() => setShowUpload(false)} initialProjectId={uploadProjectId} />}

      <div className="p-4 sm:p-6 space-y-4 animate-slide-in">
        {/* Toolbar */}
        <div className="card p-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-48">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="form-input pl-9"
                placeholder="Search documents..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              className="form-select w-56"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">All Projects</option>
              {projectsData?.items?.map((p) => (
                <option key={p.id} value={p.id}>{p.projectNumber} – {p.name}</option>
              ))}
            </select>
            <button onClick={() => setShowUpload(true)} className="btn-primary ml-auto">
              <Upload size={16} /> Upload Document
            </button>
          </div>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="card p-10 flex items-center justify-center">
            <svg className="animate-spin w-6 h-6 text-blue-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && grouped.length === 0 && (
          <div className="card">
            <div className="empty-state py-14">
              <FolderOpen size={48} className="text-slate-200 mb-3" />
              <p className="font-medium text-slate-500">
                {search ? 'No documents match your search' : 'No documents yet'}
              </p>
              {!search && (
                <button onClick={() => setShowUpload(true)} className="btn-primary mt-4">
                  <Upload size={16} /> Upload Document
                </button>
              )}
            </div>
          </div>
        )}

        {/* Grouped tree */}
        {!isLoading && grouped.map((pg) => {
          const pgDocCount = pg.workflows.reduce((a, wg) => a + wg.stages.reduce((b, sg) => b + sg.docs.length, 0), 0);
          const pgExpanded = expandedProjects.has(pg.projectId);

          return (
            <div key={pg.projectId} className="card overflow-hidden">
              {/* Project header */}
              <button
                type="button"
                onClick={() => toggleProject(pg.projectId)}
                className="w-full flex items-center gap-3 px-5 py-4 bg-slate-50 hover:bg-slate-100 transition-colors text-left border-b border-slate-200"
              >
                <ChevronDown size={16} className={cn('text-slate-400 flex-shrink-0 transition-transform duration-200', !pgExpanded && '-rotate-90')} />
                <FolderOpen size={18} className="text-blue-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="font-semibold text-slate-900 truncate">{pg.projectName}</span>
                  <span className="ml-2 text-xs font-mono text-slate-400">{pg.projectNumber}</span>
                </div>
                <CountBadge count={pgDocCount} />
              </button>

              {pgExpanded && (
                <div>
                  {pg.workflows.map((wg) => {
                    const wKey = `${pg.projectId}__${wg.workflowId || '__general__'}`;
                    const wDocCount = wg.stages.reduce((a, sg) => a + sg.docs.length, 0);
                    const wExpanded = expandedWorkflows.has(wKey);

                    return (
                      <div key={wKey} className="border-b border-slate-100 last:border-b-0">
                        {/* Workflow sub-header */}
                        <button
                          type="button"
                          onClick={() => toggleWorkflow(wKey)}
                          className="w-full flex items-center gap-3 px-6 py-3 bg-white hover:bg-slate-50 transition-colors text-left"
                        >
                          <ChevronDown size={14} className={cn('text-slate-400 flex-shrink-0 transition-transform duration-200', !wExpanded && '-rotate-90')} />
                          <GitBranch size={15} className="text-violet-500 flex-shrink-0" />
                          <span className="text-sm font-medium text-slate-700 flex-1 truncate">{wg.workflowName}</span>
                          <CountBadge count={wDocCount} />
                        </button>

                        {wExpanded && (
                          <div className="pl-6">
                            {wg.stages.map((sg) => {
                              const sKey = `${wKey}__${sg.stageId || '__unassigned__'}`;
                              const sExpanded = expandedStages.has(sKey);

                              return (
                                <div key={sKey} className="border-t border-slate-100 first:border-t-0">
                                  {/* Stage sub-header */}
                                  <button
                                    type="button"
                                    onClick={() => toggleStage(sKey)}
                                    className="w-full flex items-center gap-3 px-5 py-2.5 hover:bg-slate-50 transition-colors text-left"
                                  >
                                    <ChevronDown size={13} className={cn('text-slate-300 flex-shrink-0 transition-transform duration-200', !sExpanded && '-rotate-90')} />
                                    <Layers size={14} className="text-amber-500 flex-shrink-0" />
                                    <span className="text-sm text-slate-600 flex-1 truncate">{sg.stageName}</span>
                                    <CountBadge count={sg.docs.length} />
                                  </button>

                                  {/* Documents */}
                                  {sExpanded && (
                                    <div className="pl-5 border-t border-slate-100 bg-white">
                                      {sg.docs.map((doc) => (
                                        <DocRow
                                          key={doc.id}
                                          doc={doc}
                                          onDelete={(id) => deleteMutation.mutate(id)}
                                        />
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {!isLoading && filteredDocs.length > 0 && (
          <p className="text-xs text-slate-400 text-right">{filteredDocs.length} document{filteredDocs.length !== 1 ? 's' : ''} total</p>
        )}
      </div>
    </>
  );
}
