'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import { Search, ClipboardList, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';
import type { AuditLog } from '@flowtiq/shared-types';

const ACTION_COLORS: Record<string, string> = {
  CREATED: 'badge-green',
  UPDATED: 'badge-blue',
  DELETED: 'badge-red',
  UPLOADED: 'badge-purple',
  DOWNLOADED: 'badge-gray',
  LOGGED_IN: 'badge-gray',
  LOGGED_OUT: 'badge-gray',
  STATUS_CHANGED: 'badge-yellow',
  REPLACED: 'badge-orange',
  PASSWORD_CHANGED: 'badge-yellow',
  APPROVED: 'badge-green',
  REJECTED: 'badge-red',
};

export default function AuditLogsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [module, setModule] = useState('');
  const [action, setAction] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['audit', page, search, module, action, dateFrom, dateTo],
    queryFn: () =>
      get<{ items: AuditLog[]; total: number; totalPages: number }>('/audit', {
        page, pageSize: 30,
        search: search || undefined,
        module: module || undefined,
        action: action || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      }),
    placeholderData: (prev) => prev,
  });

  const logs = data?.items || [];
  const totalPages = data?.totalPages || 1;

  return (
    <>
      <Header title="Audit Logs" subtitle="Complete record of all system activities" />
      <div className="p-4 sm:p-6 space-y-4 animate-slide-in">
        {/* Filters */}
        <div className="card p-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-48">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="form-input pl-9"
                placeholder="Search by user, entity..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
            </div>
            <select className="form-select w-full sm:w-36" value={module} onChange={(e) => { setModule(e.target.value); setPage(1); }}>
              <option value="">All Modules</option>
              <option value="projects">Projects</option>
              <option value="stages">Stages</option>
              <option value="documents">Documents</option>
              <option value="followups">Follow-ups</option>
              <option value="users">Users</option>
              <option value="roles">Roles</option>
              <option value="workflows">Workflows</option>
              <option value="auth">Auth</option>
            </select>
            <select className="form-select w-full sm:w-40" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}>
              <option value="">All Actions</option>
              <option value="CREATED">Created</option>
              <option value="UPDATED">Updated</option>
              <option value="DELETED">Deleted</option>
              <option value="UPLOADED">Uploaded</option>
              <option value="DOWNLOADED">Downloaded</option>
              <option value="STATUS_CHANGED">Status Changed</option>
              <option value="LOGGED_IN">Logged In</option>
            </select>
            <input type="date" className="form-input w-full sm:w-36" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} placeholder="From" />
            <input type="date" className="form-input w-full sm:w-36" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} placeholder="To" />
          </div>
        </div>

        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>User</th>
                <th>Action</th>
                <th>Module</th>
                <th>Entity</th>
                <th>IP Address</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={6} className="text-center py-10">
                  <svg className="animate-spin w-6 h-6 mx-auto text-blue-500" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                </td></tr>
              )}
              {!isLoading && logs.length === 0 && (
                <tr><td colSpan={6}>
                  <div className="empty-state py-12">
                    <ClipboardList size={40} className="text-slate-200 mb-3" />
                    <p className="text-slate-400">No audit logs found</p>
                  </div>
                </td></tr>
              )}
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="text-sm text-slate-600 whitespace-nowrap">{formatDateTime(log.createdAt)}</td>
                  <td>
                    <p className="font-medium text-slate-800 text-sm">{log.userEmail || '—'}</p>
                    {log.userRole && <p className="text-xs text-slate-400">{log.userRole}</p>}
                  </td>
                  <td>
                    <span className={ACTION_COLORS[log.action] || 'badge-gray badge'}>
                      {log.action.replace('_', ' ')}
                    </span>
                  </td>
                  <td>
                    <span className="text-sm text-slate-600 capitalize">{log.module}</span>
                  </td>
                  <td>
                    {log.entityName ? (
                      <div>
                        <p className="text-sm font-medium text-slate-700">{log.entityName}</p>
                        {log.entityType && <p className="text-xs text-slate-400 capitalize">{log.entityType}</p>}
                      </div>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="text-sm text-slate-500 font-mono">{log.ipAddress || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">Total: {data?.total} records</p>
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
