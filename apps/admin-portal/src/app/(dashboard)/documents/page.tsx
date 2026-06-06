'use client';

import { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { get } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import { Search, FileText, Upload, Download, Trash2, ChevronLeft, ChevronRight, X, FolderOpen } from 'lucide-react';
import { formatDate, formatFileSize, cn, getErrorMessage } from '@/lib/utils';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import type { Document, Project } from '@flowtiq/shared-types';

function UploadModal({ onClose, initialProjectId = '' }: { onClose: () => void; initialProjectId?: string }) {
  const qc = useQueryClient();
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
      <div className="modal-content max-w-md w-full">
        <div className="card-header">
          <h3>Upload Document</h3>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={18} /></button>
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

export default function DocumentsPage() {
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState('');
  const [projectId, setProjectId] = useState('');
  const [page, setPage] = useState(1);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadProjectId, setUploadProjectId] = useState('');

  useEffect(() => {
    const pid = searchParams.get('projectId') || '';
    if (pid) setUploadProjectId(pid);
    if (searchParams.get('upload') === 'true') setShowUpload(true);
  }, [searchParams]);

  const { data, isLoading } = useQuery({
    queryKey: ['documents', page, search, projectId],
    queryFn: () =>
      get<{ items: Document[]; total: number; totalPages: number }>('/documents', {
        page, pageSize: 20,
        search: search || undefined,
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

  const documents = data?.items || [];
  const totalPages = data?.totalPages || 1;

  return (
    <>
      <Header title="Documents" subtitle="Manage and track all uploaded documents" />
      {showUpload && <UploadModal onClose={() => setShowUpload(false)} initialProjectId={uploadProjectId} />}

      <div className="p-4 sm:p-6 space-y-4 animate-slide-in">
        <div className="card p-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-48">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="form-input pl-9"
                placeholder="Search documents..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
            </div>
            <select
              className="form-select w-56"
              value={projectId}
              onChange={(e) => { setProjectId(e.target.value); setPage(1); }}
            >
              <option value="">All Projects</option>
              {projectsData?.items?.map((p) => (
                <option key={p.id} value={p.id}>{p.projectNumber} - {p.name}</option>
              ))}
            </select>
            <button onClick={() => setShowUpload(true)} className="btn-primary ml-auto">
              <Upload size={16} /> Upload Document
            </button>
          </div>
        </div>

        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Document</th>
                <th>Project</th>
                <th>Type</th>
                <th>Size</th>
                <th>Version</th>
                <th>Uploaded By</th>
                <th>Date</th>
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
              {!isLoading && documents.length === 0 && (
                <tr><td colSpan={8}>
                  <div className="empty-state py-12">
                    <FolderOpen size={48} className="text-slate-200 mb-3" />
                    <p className="font-medium text-slate-500">No documents found</p>
                    <button onClick={() => setShowUpload(true)} className="btn-primary mt-4">
                      <Upload size={16} /> Upload Document
                    </button>
                  </div>
                </td></tr>
              )}
              {documents.map((doc) => (
                <tr key={doc.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <FileText size={18} className={FILE_TYPE_ICONS[doc.fileType] || 'text-slate-400'} />
                      <div>
                        <p className="font-medium text-slate-800 max-w-64 truncate">{doc.originalName}</p>
                        <p className="text-xs text-slate-400">{doc.fileName}</p>
                      </div>
                    </div>
                  </td>
                  <td>
                    {(doc as unknown as { project?: { name: string; projectNumber: string } }).project ? (
                      <div>
                        <p className="text-sm text-slate-700 max-w-40 truncate">{(doc as unknown as { project: { name: string } }).project.name}</p>
                        <p className="text-xs font-mono text-slate-400">{(doc as unknown as { project: { projectNumber: string } }).project.projectNumber}</p>
                      </div>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td>
                    <span className="badge badge-blue text-[11px]">{doc.fileType}</span>
                  </td>
                  <td className="text-sm text-slate-600">{formatFileSize(doc.fileSize)}</td>
                  <td>
                    <span className="text-sm text-slate-600">v{doc.version}</span>
                  </td>
                  <td className="text-sm text-slate-600">
                    {(doc.uploadedBy as { firstName: string; lastName: string } | undefined)?.firstName}{' '}
                    {(doc.uploadedBy as { firstName: string; lastName: string } | undefined)?.lastName}
                  </td>
                  <td className="text-sm text-slate-500 whitespace-nowrap">{formatDate(doc.createdAt)}</td>
                  <td>
                    <div className="flex items-center justify-end gap-1">
                      <a
                        href={`${process.env.NEXT_PUBLIC_API_URL}/api/documents/${doc.id}/download`}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Download"
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Download size={16} />
                      </a>
                      <button
                        onClick={() => {
                          if (confirm('Delete this document?')) deleteMutation.mutate(doc.id);
                        }}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">Total: {data?.total} documents</p>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(page - 1)} disabled={page === 1} className="btn-secondary py-1.5 px-3 disabled:opacity-40"><ChevronLeft size={16} /></button>
              <span className="text-sm text-slate-600">Page {page} of {totalPages}</span>
              <button onClick={() => setPage(page + 1)} disabled={page === totalPages} className="btn-secondary py-1.5 px-3 disabled:opacity-40"><ChevronRight size={16} /></button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
