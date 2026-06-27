'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import {
  Search, Calendar, CheckCircle, Trophy, Eye, SortAsc, User,
} from 'lucide-react';
import { formatDate, cn, getPriorityBadgeClass } from '@/lib/utils';
import type { Project } from '@flowtiq/shared-types';
import Link from 'next/link';

// ── CompletedProjectCard ───────────────────────────────────────────────────────
function CompletedProjectCard({ project }: { project: Project }) {
  const owner = project.owner as { firstName: string; lastName: string } | undefined;
  const workflows = project.projectWorkflows as Array<{ name: string }> | undefined;
  const displayDate = project.completionDate || project.updatedAt;
  const initials = owner
    ? `${owner.firstName[0]}${owner.lastName[0]}`.toUpperCase()
    : '?';

  return (
    <Link href={`/projects/${project.id}`}>
      <div className="group relative bg-white rounded-2xl border border-slate-200 overflow-hidden hover:shadow-2xl hover:border-emerald-200 hover:-translate-y-0.5 transition-all duration-200 cursor-pointer h-full flex flex-col">
        {/* Top gradient accent */}
        <div className="h-1 bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400" />

        <div className="p-5 flex flex-col flex-1">
          {/* Project number + priority */}
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-1.5">
              <CheckCircle size={12} className="text-emerald-500 flex-shrink-0" />
              <span className="text-[10px] font-mono text-slate-400 tracking-wide">
                {project.projectNumber}
              </span>
            </div>
            <span className={cn('badge text-[10px] px-1.5 py-0 flex-shrink-0', getPriorityBadgeClass(project.priority))}>
              {project.priority}
            </span>
          </div>

          {/* Project name */}
          <h3 className="font-bold text-slate-900 text-sm leading-snug mb-1 line-clamp-2 group-hover:text-emerald-700 transition-colors">
            {project.name}
          </h3>

          {/* Client name */}
          <p className="text-xs text-slate-500 mb-4 truncate">{project.clientName}</p>

          {/* Completion date — prominent */}
          <div
            className="flex items-center gap-2.5 p-3 rounded-xl mb-4 flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)' }}
          >
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
            >
              <Trophy size={14} className="text-white" />
            </div>
            <div>
              <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider">
                Completed on
              </p>
              <p className="text-sm font-bold text-emerald-900">
                {displayDate ? formatDate(displayDate) : '—'}
              </p>
            </div>
          </div>

          {/* Workflows */}
          {workflows && workflows.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-4">
              {workflows.slice(0, 3).map((w, i) => (
                <span
                  key={i}
                  className="text-[9px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-500"
                >
                  {w.name}
                </span>
              ))}
              {workflows.length > 3 && (
                <span className="text-[9px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-400">
                  +{workflows.length - 3} more
                </span>
              )}
            </div>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Footer: owner + due date + view */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center flex-shrink-0">
                <span className="text-[9px] font-bold text-slate-600">{initials}</span>
              </div>
              <span className="text-xs text-slate-500 truncate">
                {owner ? `${owner.firstName} ${owner.lastName}` : '—'}
              </span>
            </div>
            <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 group-hover:text-emerald-700 flex-shrink-0 transition-colors">
              <Eye size={11} />
              View
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

// ── CompletedProjectsPage ──────────────────────────────────────────────────────
export default function CompletedProjectsPage() {
  const [search, setSearch] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [sortBy, setSortBy] = useState<'completionDate' | 'name' | 'dueDate'>('completionDate');

  const { data, isLoading } = useQuery({
    queryKey: ['projects', 'completed', ownerFilter],
    queryFn: () =>
      get<{ items: Project[]; total: number }>('/projects', {
        status: 'completed',
        pageSize: 500,
        ownerId: ownerFilter || undefined,
      }),
    refetchInterval: 30000,
  });

  const { data: members } = useQuery<Array<{ id: string; firstName: string; lastName: string }>>({
    queryKey: ['users', 'members'],
    queryFn: () => get('/users/members'),
  });

  const allProjects = data?.items ?? [];

  // Client-side filtering + sorting
  const filtered = useMemo(() => {
    let list = [...allProjects];

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.clientName.toLowerCase().includes(q) ||
          p.projectNumber.toLowerCase().includes(q),
      );
    }

    list.sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'dueDate') {
        return (
          new Date(b.dueDate ?? 0).getTime() - new Date(a.dueDate ?? 0).getTime()
        );
      }
      // Default: latest completion first
      const aDate = a.completionDate ?? a.updatedAt ?? '';
      const bDate = b.completionDate ?? b.updatedAt ?? '';
      return new Date(bDate).getTime() - new Date(aDate).getTime();
    });

    return list;
  }, [allProjects, search, sortBy]);

  // Stats
  const now = new Date();
  const thisMonth = allProjects.filter((p) => {
    const d = new Date(p.completionDate ?? p.updatedAt ?? '');
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  const thisYear = allProjects.filter((p) => {
    const d = new Date(p.completionDate ?? p.updatedAt ?? '');
    return d.getFullYear() === now.getFullYear();
  }).length;

  return (
    <>
      <Header title="Completed Projects" subtitle="All successfully completed projects" />
      <div className="p-4 sm:p-6 animate-slide-in space-y-5">

        {/* ── Stats ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="stat-card group">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Total Completed
                </p>
                <p className="text-3xl font-bold text-slate-900">
                  {isLoading ? '—' : allProjects.length}
                </p>
              </div>
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                <Trophy size={22} className="text-white" />
              </div>
            </div>
          </div>

          <div className="stat-card group">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  This Month
                </p>
                <p className="text-3xl font-bold text-slate-900">
                  {isLoading ? '—' : thisMonth}
                </p>
              </div>
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)' }}>
                <Calendar size={22} className="text-white" />
              </div>
            </div>
          </div>

          <div className="stat-card group">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  This Year
                </p>
                <p className="text-3xl font-bold text-slate-900">
                  {isLoading ? '—' : thisYear}
                </p>
              </div>
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)' }}>
                <CheckCircle size={22} className="text-white" />
              </div>
            </div>
          </div>
        </div>

        {/* ── Filters ── */}
        <div className="card p-4">
          <div className="flex flex-wrap gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-52">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="form-input pl-9"
                placeholder="Search by name, client, project number..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {/* Owner filter */}
            <div className="relative">
              <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <select
                className="form-select pl-8 w-full sm:w-44"
                value={ownerFilter}
                onChange={(e) => setOwnerFilter(e.target.value)}
              >
                <option value="">All Owners</option>
                {(members ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.firstName} {m.lastName}
                  </option>
                ))}
              </select>
            </div>

            {/* Sort */}
            <div className="relative">
              <SortAsc size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <select
                className="form-select pl-8 w-full sm:w-44"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              >
                <option value="completionDate">Latest Completed</option>
                <option value="name">Name A–Z</option>
                <option value="dueDate">Due Date</option>
              </select>
            </div>
          </div>

          {/* Result count */}
          {!isLoading && (
            <p className="text-xs text-slate-400 mt-3">
              Showing {filtered.length} of {allProjects.length} completed project{allProjects.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        {/* ── Grid ── */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-200 p-5 animate-pulse">
                <div className="h-3 w-24 bg-slate-100 rounded mb-3" />
                <div className="h-5 w-3/4 bg-slate-200 rounded mb-2" />
                <div className="h-3 w-1/2 bg-slate-100 rounded mb-4" />
                <div className="h-14 bg-emerald-50 rounded-xl mb-4" />
                <div className="h-3 w-full bg-slate-100 rounded" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="card">
            <div className="empty-state py-20">
              <div
                className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-4"
                style={{ background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)' }}
              >
                <Trophy size={36} className="text-emerald-400" />
              </div>
              <p className="font-semibold text-slate-600 text-lg">
                {search || ownerFilter ? 'No matching completed projects' : 'No completed projects yet'}
              </p>
              <p className="text-slate-400 text-sm mt-1">
                {search || ownerFilter
                  ? 'Try adjusting your search or filters'
                  : 'Completed projects will appear here once marked as done'}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((project) => (
              <CompletedProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
