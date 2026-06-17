'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import { useAuthStore } from '@/store/auth';
import {
  FolderKanban, Clock, FileText, CheckCircle2, AlertTriangle,
  TrendingUp, Users, Building2, ArrowRight, GitBranch, ChevronDown,
} from 'lucide-react';
import { formatDate, formatRelative, getStatusBadgeClass, getPriorityBadgeClass, cn } from '@/lib/utils';
import { ProjectProgress } from '@/components/ProjectProgress';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface DashboardStats {
  totalProjects: number;
  activeProjects: number;
  completedProjects: number;
  onHoldProjects: number;
  totalFollowUps: number;
  pendingFollowUps: number;
  overdueFollowUps: number | { id: string; project: { name: string; projectNumber: string; clientName: string }; owner: { firstName: string; lastName: string }; nextFollowUp: string }[];
  totalDocuments: number;
  totalTenants?: number;
  activeTenants?: number;
  totalUsers?: number;
  activeUsers?: number;
  recentProjects?: Array<{
    id: string;
    name: string;
    projectNumber: string;
    clientName: string;
    status: string;
    priority: string;
    currentStage?: string;
    dueDate?: string;
    owner?: { firstName: string; lastName: string };
  }>;
  upcomingFollowUps?: Array<{
    id: string;
    nextFollowUp: string;
    notes?: string;
    project: { id: string; name: string; projectNumber: string; clientName: string };
    owner: { firstName: string; lastName: string };
  }>;
  recentActivity?: Array<{
    id: string;
    action: string;
    module: string;
    entityId?: string;
    entityType?: string;
    entityName?: string;
    userEmail?: string;
    metadata?: Record<string, string> | null;
    createdAt: string;
  }>;
  recentTenants?: Array<{
    id: string;
    name: string;
    slug: string;
    subscriptionPlan: string;
    isActive: boolean;
    userCount: number;
    projectCount: number;
    createdAt: string;
  }>;
  workflowPipeline?: Array<{
    id: string;
    name: string;
    isDefault: boolean;
    totalProjects: number;
    stages: Array<{
      key: string;
      name: string;
      order: number;
      color?: string;
      count: number;
    }>;
  }>;
  overdueList?: Array<{
    id: string;
    nextFollowUp: string;
    project: { id: string; name: string; projectNumber: string; clientName: string };
    owner: { firstName: string; lastName: string };
  }>;
}

function StatCard({
  label, value, icon: Icon, color, href,
}: {
  label: string; value: number | string; icon: React.ElementType; color: string; href?: string;
}) {
  const content = (
    <div className="stat-card group">
      <div className={cn('stat-icon', color)}>
        <Icon size={22} className="text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-2xl font-bold text-slate-900">{value}</p>
        <p className="text-sm text-slate-500 mt-0.5">{label}</p>
      </div>
      {href && (
        <ArrowRight size={16} className="text-slate-300 group-hover:text-blue-500 transition-colors" />
      )}
    </div>
  );

  return href ? <Link href={href}>{content}</Link> : content;
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'bg-red-500',
  high: 'bg-orange-400',
  medium: 'bg-amber-400',
  low: 'bg-slate-400',
};

function WorkflowCard({ workflow, onStageClick }: {
  workflow: NonNullable<DashboardStats['workflowPipeline']>[number];
  onStageClick: (workflowId: string, stageKey: string, count: number) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="break-inside-avoid mb-4 last:mb-0 border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      {/* Workflow header — clickable to expand/collapse */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gradient-to-r from-slate-50 to-white border-b border-slate-200 hover:from-slate-100 transition-colors text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <ChevronDown
            size={15}
            className={cn('text-slate-400 flex-shrink-0 transition-transform duration-200', !open && '-rotate-90')}
          />
          <span className="font-semibold text-slate-800 truncate text-sm">{workflow.name}</span>
          {workflow.isDefault && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600 flex-shrink-0">
              Default
            </span>
          )}
        </div>
        {/* Project count pill */}
        <div className="flex items-center gap-1.5 flex-shrink-0 ml-3">
          <span className={cn(
            'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold shadow-sm',
            workflow.totalProjects > 0
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 text-slate-400',
          )}>
            <span className="text-sm leading-none">{workflow.totalProjects}</span>
            <span className="font-normal opacity-90">{workflow.totalProjects !== 1 ? 'projects' : 'project'}</span>
          </span>
        </div>
      </button>

      {/* Stages list */}
      {open && (
        <div className="divide-y divide-slate-100 bg-white">
          {workflow.stages.map((stage, idx) => {
            const max = Math.max(...workflow.stages.map((s) => s.count), 1);
            const pct = Math.round((stage.count / max) * 100);
            const stageColor = stage.color || '#94a3b8';
            const isClickable = stage.count > 0;
            const isEven = idx % 2 === 1;
            return (
              <div
                key={stage.key}
                onClick={() => onStageClick(workflow.id, stage.key, stage.count)}
                className={cn(
                  'flex items-center gap-3 px-4 py-2.5 transition-colors group',
                  isClickable ? 'cursor-pointer hover:bg-blue-50/60' : 'cursor-default',
                  isEven && !isClickable && 'bg-slate-50/60',
                  isEven && isClickable && 'bg-slate-50/40',
                )}
                title={isClickable ? `View ${stage.count} project${stage.count !== 1 ? 's' : ''} in ${stage.name}` : undefined}
              >
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: stageColor }} />
                <span className={cn('text-sm flex-1 min-w-0 truncate', isClickable ? 'text-slate-800 font-medium' : 'text-slate-500')}>
                  {stage.name}
                </span>
                {/* Progress bar */}
                <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden flex-shrink-0">
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: stageColor }} />
                </div>
                {/* Count badge */}
                {stage.count > 0 ? (
                  <span
                    className="flex-shrink-0 min-w-[28px] h-6 px-2 rounded-full text-xs font-bold text-white flex items-center justify-center shadow-sm"
                    style={{ backgroundColor: stageColor }}
                  >
                    {stage.count}
                  </span>
                ) : (
                  <span className="flex-shrink-0 min-w-[28px] h-6 px-2 rounded-full text-xs font-medium text-slate-300 bg-slate-100 flex items-center justify-center">
                    0
                  </span>
                )}
                <ArrowRight size={13} className={cn('flex-shrink-0 transition-opacity', isClickable ? 'text-blue-400 opacity-0 group-hover:opacity-100' : 'opacity-0')} />
              </div>
            );
          })}
          {workflow.stages.length === 0 && (
            <div className="px-4 py-3 text-sm text-slate-400 text-center">No stages configured</div>
          )}
        </div>
      )}
    </div>
  );
}

function WorkflowPipelineSection({ pipeline }: {
  pipeline: NonNullable<DashboardStats['workflowPipeline']>;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const router = useRouter();
  if (!pipeline || pipeline.length === 0) return null;

  const handleStageClick = (workflowId: string, stageKey: string, count: number) => {
    if (count === 0) return;
    router.push(`/projects?view=kanban&workflowId=${workflowId}&stage=${stageKey}`);
  };

  return (
    <div className="card">
      <div
        className="card-header cursor-pointer select-none"
        onClick={() => setCollapsed((c) => !c)}
      >
        <div className="flex items-center gap-2">
          <GitBranch size={18} className="text-slate-500" />
          <h3 className="font-semibold text-slate-900">Workflow Pipeline</h3>
          <span className="text-xs text-slate-400 hidden sm:inline">— active projects per stage</span>
          <ChevronDown
            size={16}
            className={cn('text-slate-400 transition-transform duration-200 ml-1', collapsed && '-rotate-90')}
          />
        </div>
        <Link
          href="/projects"
          className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          View all <ArrowRight size={14} />
        </Link>
      </div>
      {!collapsed && (
        <div className="p-4 columns-1 lg:columns-2 gap-x-4">
          {pipeline.map((workflow) => (
            <WorkflowCard key={workflow.id} workflow={workflow} onStageClick={handleStageClick} />
          ))}
        </div>
      )}
    </div>
  );
}

function getActionLabel(action: string): string {
  const map: Record<string, string> = {
    CREATED: 'created',
    UPDATED: 'updated',
    DELETED: 'deleted',
    UPLOADED: 'uploaded',
    DOWNLOADED: 'downloaded',
    LOGGED_IN: 'logged in',
    STATUS_CHANGED: 'changed status of',
    REPLACED: 'replaced',
  };
  return map[action] || action.toLowerCase();
}

export default function DashboardPage() {
  const { user } = useAuthStore();

  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ['dashboard', 'stats'],
    queryFn: () => get<DashboardStats>('/dashboard/stats'),
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <>
        <Header title="Dashboard" subtitle={`Welcome back, ${user?.firstName}`} />
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="card p-6 animate-pulse">
                <div className="w-12 h-12 bg-slate-100 rounded-xl mb-4" />
                <div className="h-8 bg-slate-100 rounded w-1/2 mb-2" />
                <div className="h-4 bg-slate-100 rounded w-3/4" />
              </div>
            ))}
          </div>
        </div>
      </>
    );
  }

  const isSuperAdmin = user?.isSuperAdmin;

  return (
    <>
      <Header title="Dashboard" subtitle={`Welcome back, ${user?.firstName}. Here is what is happening.`} />
      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 animate-slide-in">

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {isSuperAdmin ? (
            <>
              <StatCard label="Total Tenants" value={stats?.totalTenants || 0} icon={Building2} color="bg-blue-500" href="/tenants" />
              <StatCard label="Active Users" value={stats?.activeUsers || 0} icon={Users} color="bg-violet-500" href="/users" />
              <StatCard label="Total Projects" value={stats?.totalProjects || 0} icon={FolderKanban} color="bg-emerald-500" href="/projects" />
              <StatCard label="Total Documents" value={stats?.totalDocuments || 0} icon={FileText} color="bg-amber-500" href="/documents" />
            </>
          ) : (
            <>
              <StatCard label="Active Projects" value={stats?.activeProjects || 0} icon={FolderKanban} color="bg-blue-500" href="/projects?status=active" />
              <StatCard label="Pending Follow-ups" value={stats?.pendingFollowUps || 0} icon={Clock} color="bg-amber-500" href="/follow-ups?status=pending" />
              <StatCard label="Overdue" value={typeof stats?.overdueFollowUps === 'number' ? stats.overdueFollowUps : (Array.isArray(stats?.overdueFollowUps) ? stats.overdueFollowUps.length : 0)} icon={AlertTriangle} color="bg-red-500" href="/follow-ups?overdue=true" />
              <StatCard label="Documents" value={stats?.totalDocuments || 0} icon={FileText} color="bg-emerald-500" href="/documents" />
            </>
          )}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-6 xl:items-stretch">
          {/* Recent / Active Projects */}
          <div className="xl:col-span-2 card flex flex-col min-h-0">
            <div className="card-header flex-shrink-0">
              <div>
                <h3 className="font-semibold text-slate-900">Active Projects</h3>
                <p className="text-xs text-slate-500 mt-0.5">Sorted by priority — urgent first</p>
              </div>
              <Link href="/projects" className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                View all <ArrowRight size={14} />
              </Link>
            </div>
            <div className="divide-y overflow-y-auto max-h-[400px]" style={{ borderColor: '#eef0f8' }}>
              {stats?.recentProjects?.length === 0 && (
                <div className="empty-state py-10">
                  <FolderKanban size={40} className="text-slate-200 mb-3" />
                  <p className="text-slate-500">No projects yet</p>
                </div>
              )}
              {stats?.recentProjects?.map((project, idx) => (
                <Link key={project.id} href={`/projects/${project.id}`}>
                  <div
                    className={cn(
                      'px-6 py-4 transition-colors cursor-pointer',
                      idx % 2 === 1
                        ? 'bg-violet-50 hover:bg-violet-100'
                        : 'bg-white hover:bg-indigo-50',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2.5">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <div
                            className={cn('w-2 h-2 rounded-full flex-shrink-0', PRIORITY_COLORS[project.priority] || 'bg-slate-300')}
                            title={`${project.priority} priority`}
                          />
                          <span className="text-xs font-mono text-slate-400">{project.projectNumber}</span>
                          <span className={getStatusBadgeClass(project.status)}>
                            {project.status.replace('_', ' ')}
                          </span>
                          <span className={getPriorityBadgeClass(project.priority)}>
                            {project.priority}
                          </span>
                        </div>
                        <p className="font-medium text-slate-900 truncate">{project.name}</p>
                        <p className="text-sm text-slate-500 mt-0.5">{project.clientName}</p>
                      </div>
                      {project.dueDate && (
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs text-slate-400">Due</p>
                          <p className="text-sm font-medium text-slate-700">{formatDate(project.dueDate)}</p>
                        </div>
                      )}
                    </div>
                    <ProjectProgress
                      currentStage={project.currentStage}
                      status={project.status}
                    />
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Right column */}
          <div className="flex flex-col gap-4">
            {/* Upcoming follow-ups */}
            <div className="card">
              <div className="card-header">
                <h3 className="font-semibold text-slate-900">Upcoming Follow-ups</h3>
                <Link href="/follow-ups" className="text-xs text-blue-600 hover:text-blue-700">View all</Link>
              </div>
              <div className="divide-y divide-slate-100">
                {(!stats?.upcomingFollowUps || stats.upcomingFollowUps.length === 0) && (
                  <div className="px-6 py-6 text-center">
                    <CheckCircle2 size={28} className="text-emerald-200 mx-auto mb-2" />
                    <p className="text-sm text-slate-400">No upcoming follow-ups</p>
                  </div>
                )}
                {stats?.upcomingFollowUps?.map((fu) => (
                  <div key={fu.id} className="px-4 py-3">
                    <p className="text-sm font-medium text-slate-800 truncate">{fu.project.name}</p>
                    <p className="text-xs text-slate-500">{fu.project.clientName}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-slate-400">{fu.owner.firstName} {fu.owner.lastName}</span>
                      <span className="text-xs font-medium text-blue-600">{formatDate(fu.nextFollowUp)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent activity */}
            <div className="card flex flex-col">
              <div className="card-header flex-shrink-0">
                <h3 className="font-semibold text-slate-900">Recent Activity</h3>
              </div>
              <div className="divide-y divide-slate-100 overflow-y-auto max-h-[280px]">
                {stats?.recentActivity?.slice(0, 8).map((log) => {
                  const projectName = log.metadata?.projectName as string | undefined;
                  const projectId = log.metadata?.projectId as string | undefined;
                  return (
                    <div key={log.id} className="px-4 py-3">
                      <p className="text-sm text-slate-700">
                        <span className="font-medium">{log.userEmail?.split('@')[0]}</span>{' '}
                        {getActionLabel(log.action)}{' '}
                        {log.entityName && <span className="text-slate-500">"{log.entityName}"</span>}
                      </p>
                      {projectName && (
                        <p className="text-xs text-slate-400 mt-0.5">
                          <span className="text-slate-500">Project: </span>
                          {projectId ? (
                            <Link href={`/projects/${projectId}`} className="text-blue-500 hover:underline">
                              {projectName}
                            </Link>
                          ) : (
                            <span>{projectName}</span>
                          )}
                        </p>
                      )}
                      <p className="text-xs text-slate-400 mt-0.5">{formatRelative(log.createdAt)}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Workflow Pipeline */}
        {!isSuperAdmin && stats?.workflowPipeline && stats.workflowPipeline.length > 0 && (
          <WorkflowPipelineSection pipeline={stats.workflowPipeline} />
        )}

        {/* Summary row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="card p-5 flex items-center gap-4">
            <div className="stat-icon bg-blue-50">
              <FolderKanban size={22} className="text-blue-600" />
            </div>
            <div>
              <p className="text-xl font-bold text-slate-900">{stats?.completedProjects || 0}</p>
              <p className="text-sm text-slate-500">Completed Projects</p>
            </div>
          </div>
          <div className="card p-5 flex items-center gap-4">
            <div className="stat-icon bg-amber-50">
              <TrendingUp size={22} className="text-amber-600" />
            </div>
            <div>
              <p className="text-xl font-bold text-slate-900">{stats?.onHoldProjects || 0}</p>
              <p className="text-sm text-slate-500">Projects On Hold</p>
            </div>
          </div>
          <div className="card p-5 flex items-center gap-4">
            <div className="stat-icon bg-emerald-50">
              <CheckCircle2 size={22} className="text-emerald-600" />
            </div>
            <div>
              <p className="text-xl font-bold text-slate-900">{stats?.totalFollowUps || 0}</p>
              <p className="text-sm text-slate-500">Total Follow-ups</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
