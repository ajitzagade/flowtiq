'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { get, post, patch, del } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import { Plus, GitBranch, Trash2, Edit, Star, ChevronRight, X, GripVertical } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatDate, cn, getErrorMessage } from '@/lib/utils';
import type { WorkflowTemplate } from '@flowtiq/shared-types';

interface StageInput {
  key: string;
  name: string;
  order: number;
  color: string;
  isRequired: boolean;
  requiresApproval: boolean;
  description: string;
}

const STAGE_COLORS = ['#94a3b8', '#38bdf8', '#3b82f6', '#8b5cf6', '#f59e0b', '#14b8a6', '#10b981', '#ef4444'];

function generateKey(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'stage';
}

function WorkflowModal({ workflow, onClose }: { workflow?: WorkflowTemplate | null; onClose: () => void }) {
  const qc = useQueryClient();
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);
  const [name, setName] = useState(workflow?.name || '');
  const [description, setDescription] = useState(workflow?.description || '');
  const [isDefault, setIsDefault] = useState(workflow?.isDefault || false);
  const [saving, setSaving] = useState(false);
  const [stages, setStages] = useState<StageInput[]>(
    workflow?.stages
      ? (workflow.stages as Array<{ key: string; name: string; order: number; color?: string; isRequired?: boolean; requiresApproval?: boolean; description?: string }>)
          .sort((a, b) => a.order - b.order)
          .map((s) => ({ key: s.key, name: s.name, order: s.order, color: s.color || '#6366f1', isRequired: s.isRequired !== false, requiresApproval: s.requiresApproval || false, description: s.description || '' }))
      : [
          { key: 'stage_1', name: 'Stage 1', order: 1, color: '#94a3b8', isRequired: true, requiresApproval: false, description: '' },
        ]
  );
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const addStage = () => {
    const order = stages.length + 1;
    setStages((prev) => [...prev, { key: `stage_${order}`, name: `Stage ${order}`, order, color: STAGE_COLORS[(order - 1) % STAGE_COLORS.length], isRequired: true, requiresApproval: false, description: '' }]);
  };

  const removeStage = (idx: number) => {
    setStages((prev) => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order: i + 1 })));
  };

  const updateStage = (idx: number, field: keyof StageInput, value: string | number | boolean | undefined) => {
    setStages((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      if (field === 'name') {
        next[idx].key = generateKey(value as string) || `stage_${idx + 1}`;
      }
      return next;
    });
  };

  const handleStageDragStart = (e: React.DragEvent, idx: number) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(idx));
    setDragIdx(idx);
  };

  const handleStageDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (idx !== dragOverIdx) setDragOverIdx(idx);
  };

  const handleStageDrop = (e: React.DragEvent, targetIdx: number) => {
    e.preventDefault();
    const sourceIdx = Number(e.dataTransfer.getData('text/plain'));
    if (!isNaN(sourceIdx) && sourceIdx !== targetIdx) {
      setStages((prev) => {
        const next = [...prev];
        const [moved] = next.splice(sourceIdx, 1);
        next.splice(targetIdx, 0, moved);
        return next.map((s, i) => ({ ...s, order: i + 1 }));
      });
    }
    setDragIdx(null);
    setDragOverIdx(null);
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Workflow name is required'); return; }
    if (stages.length === 0) { toast.error('At least one stage is required'); return; }
    setSaving(true);
    try {
      const payload = { name: name.trim(), description: description.trim() || undefined, isDefault, stages };
      if (workflow) {
        await patch(`/workflows/${workflow.id}`, payload);
        toast.success('Workflow updated');
      } else {
        await post('/workflows', payload);
        toast.success('Workflow created');
      }
      qc.invalidateQueries({ queryKey: ['workflows'] });
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content max-w-2xl w-full max-h-[90vh] flex flex-col" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="card-header flex-shrink-0">
          <h3 id="modal-title">{workflow ? 'Edit Workflow' : 'New Workflow'}</h3>
          <button onClick={onClose} aria-label="Close" className="btn-ghost p-1.5"><X size={18} aria-hidden="true" /></button>
        </div>
        <div className="card-body overflow-y-auto flex-1 space-y-5">
          {/* Basic info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="form-label">Workflow Name *</label>
              <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Standard Approval Flow" />
            </div>
            <div className="col-span-2">
              <label className="form-label">Description</label>
              <textarea rows={2} className="form-input resize-none" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the purpose of this workflow..." />
            </div>
            <div className="flex items-center gap-3">
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
                <div className="w-9 h-5 bg-slate-200 peer-checked:bg-blue-600 rounded-full transition-colors peer-focus:ring-2 peer-focus:ring-blue-300" />
                <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
              </label>
              <span className="text-sm text-slate-700">Set as default workflow</span>
            </div>
          </div>

          {/* Stages */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="form-label mb-0">Stages *</label>
              <button onClick={addStage} className="btn-secondary text-xs py-1.5">
                <Plus size={13} /> Add Stage
              </button>
            </div>
            <div className="space-y-2">
              {stages.map((stage, idx) => (
                <div
                  key={idx}
                  draggable
                  onDragStart={(e) => handleStageDragStart(e, idx)}
                  onDragOver={(e) => handleStageDragOver(e, idx)}
                  onDrop={(e) => handleStageDrop(e, idx)}
                  onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
                  className={cn(
                    'bg-slate-50 rounded-xl px-3 py-2.5 border transition-all',
                    dragOverIdx === idx && dragIdx !== idx
                      ? 'border-blue-400 bg-blue-50 shadow-md'
                      : 'border-slate-100',
                    dragIdx === idx ? 'opacity-40' : '',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <GripVertical size={14} className="text-slate-400 flex-shrink-0 cursor-grab active:cursor-grabbing" />
                    <div
                      className="w-5 h-5 rounded-full flex-shrink-0 cursor-pointer border-2 border-white shadow"
                      style={{ backgroundColor: stage.color }}
                      title="Click to change color"
                    >
                      <input
                        type="color"
                        className="opacity-0 w-full h-full cursor-pointer"
                        value={stage.color}
                        onChange={(e) => updateStage(idx, 'color', e.target.value)}
                      />
                    </div>
                    <span className="text-xs font-bold text-slate-400 w-5 flex-shrink-0">{idx + 1}</span>
                    <input
                      className="form-input py-1 text-sm flex-1 min-w-0"
                      value={stage.name}
                      onChange={(e) => updateStage(idx, 'name', e.target.value)}
                      placeholder="Stage name"
                    />
                    <label className="flex items-center gap-1.5 text-xs flex-shrink-0 whitespace-nowrap cursor-pointer select-none">
                      <input
                        type="checkbox"
                        className="rounded"
                        checked={stage.isRequired}
                        onChange={(e) => updateStage(idx, 'isRequired', e.target.checked)}
                      />
                      <span className={stage.isRequired ? 'text-red-600 font-medium' : 'text-slate-400'}>Required</span>
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-slate-500 flex-shrink-0 whitespace-nowrap cursor-pointer select-none">
                      <input
                        type="checkbox"
                        className="rounded"
                        checked={stage.requiresApproval}
                        onChange={(e) => updateStage(idx, 'requiresApproval', e.target.checked)}
                      />
                      Approval
                    </label>
                    <button
                      onClick={() => removeStage(idx)}
                      disabled={stages.length === 1}
                      className="p-1 text-slate-300 hover:text-red-500 disabled:opacity-30 transition-colors flex-shrink-0"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <input
                    className="form-input py-1 text-xs mt-2 w-full text-slate-500"
                    value={stage.description}
                    onChange={(e) => updateStage(idx, 'description', e.target.value)}
                    placeholder="Stage description (optional)"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100 flex-shrink-0">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? 'Saving...' : workflow ? 'Save Changes' : 'Create Workflow'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function WorkflowsPage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editWorkflow, setEditWorkflow] = useState<WorkflowTemplate | null>(null);

  const { data: workflows, isLoading } = useQuery<WorkflowTemplate[]>({
    queryKey: ['workflows'],
    queryFn: () => get<WorkflowTemplate[]>('/workflows'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => del(`/workflows/${id}`),
    onSuccess: () => { toast.success('Workflow deleted'); qc.invalidateQueries({ queryKey: ['workflows'] }); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const workflowList = workflows || [];

  return (
    <>
      <Header title="Workflows" subtitle="Configure dynamic workflows for your projects" />
      {(showModal || editWorkflow) && (
        <WorkflowModal
          workflow={editWorkflow}
          onClose={() => { setShowModal(false); setEditWorkflow(null); }}
        />
      )}
      <div className="p-4 sm:p-6 space-y-4 animate-slide-in">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="card p-4 flex-1 bg-blue-50 border-blue-100">
            <p className="text-sm text-blue-700 font-medium">Dynamic Workflow Engine</p>
            <p className="text-xs text-blue-500 mt-0.5">
              Configure custom stages, checklists, approval flows, and follow-up rules without any code changes.
            </p>
          </div>
          <button onClick={() => setShowModal(true)} className="btn-primary whitespace-nowrap self-start sm:self-auto">
            <Plus size={16} /> New Workflow
          </button>
        </div>

        {isLoading && (
          <div className="flex justify-center py-12">
            <svg className="animate-spin w-8 h-8 text-blue-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {workflowList.map((workflow) => (
            <div key={workflow.id} className="card p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                    <GitBranch size={20} className="text-blue-600" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-slate-900">{workflow.name}</h4>
                      {workflow.isDefault && (
                        <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                          <Star size={10} fill="currentColor" /> Default
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{workflow.projectCount || 0} projects • Created {formatDate(workflow.createdAt)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setEditWorkflow(workflow)} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg" title="Edit">
                    <Edit size={15} />
                  </button>
                  <button
                    onClick={() => { if (confirm('Delete workflow?')) deleteMutation.mutate(workflow.id); }}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              {workflow.description && (
                <p className="text-sm text-slate-500 mb-4">{workflow.description}</p>
              )}

              {/* Stage flow visualization */}
              <div className="space-y-1">
                {(workflow.stages as Array<{ key: string; name: string; order: number; color?: string; isRequired?: boolean; requiresApproval?: boolean; description?: string }>).map((stage, idx) => (
                  <div key={stage.key} className="flex items-center gap-2">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                      style={{ backgroundColor: stage.color || '#6366f1' }}
                    >
                      {stage.order}
                    </div>
                    <div className="flex-1 bg-slate-50 rounded px-3 py-1.5 flex items-center justify-between gap-2">
                      <span className="text-sm text-slate-700 truncate">{stage.name}</span>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {stage.isRequired !== false
                          ? <span className="text-[10px] font-medium text-red-600 bg-red-50 px-1.5 py-0.5 rounded">Required</span>
                          : <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">Optional</span>
                        }
                        {stage.requiresApproval && (
                          <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">Approval</span>
                        )}
                      </div>
                    </div>
                    {idx < workflow.stages.length - 1 && (
                      <ChevronRight size={12} className="text-slate-300 flex-shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {!isLoading && workflowList.length === 0 && (
            <div className="col-span-2 empty-state card py-16">
              <GitBranch size={48} className="text-slate-200 mb-3" />
              <p className="text-slate-500">No workflows configured</p>
              <button onClick={() => setShowModal(true)} className="btn-primary mt-4">
                <Plus size={16} /> Create Workflow
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
