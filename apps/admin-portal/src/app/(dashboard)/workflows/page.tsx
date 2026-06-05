'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { get, del } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import { Plus, GitBranch, Trash2, Edit, Star, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatDate, cn, getErrorMessage } from '@/lib/utils';
import type { WorkflowTemplate } from '@flowtiq/shared-types';

export default function WorkflowsPage() {
  const qc = useQueryClient();

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
      <div className="p-6 space-y-4 animate-slide-in">
        <div className="flex items-center justify-between">
          <div className="card p-4 flex-1 mr-4 bg-blue-50 border-blue-100">
            <p className="text-sm text-blue-700 font-medium">Dynamic Workflow Engine</p>
            <p className="text-xs text-blue-500 mt-0.5">
              Configure custom stages, checklists, approval flows, and follow-up rules without any code changes.
            </p>
          </div>
          <button className="btn-primary whitespace-nowrap">
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
                  <button className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg">
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
                {(workflow.stages as Array<{ key: string; name: string; order: number; color?: string; requiresApproval?: boolean }>).map((stage, idx) => (
                  <div key={stage.key} className="flex items-center gap-2">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                      style={{ backgroundColor: stage.color || '#6366f1' }}
                    >
                      {stage.order}
                    </div>
                    <div className="flex-1 bg-slate-50 rounded px-3 py-1.5 flex items-center justify-between">
                      <span className="text-sm text-slate-700">{stage.name}</span>
                      {stage.requiresApproval && (
                        <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">Requires Approval</span>
                      )}
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
              <button className="btn-primary mt-4">
                <Plus size={16} /> Create Workflow
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
