'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { get, patch } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import { Bell, CheckCheck, Clock, AlertTriangle, FileText, GitBranch, User } from 'lucide-react';
import { formatRelative, cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import type { Notification } from '@flowtiq/shared-types';

const TYPE_ICONS: Record<string, { icon: React.ElementType; color: string }> = {
  assignment: { icon: User, color: 'text-blue-500' },
  follow_up_reminder: { icon: Clock, color: 'text-amber-500' },
  overdue: { icon: AlertTriangle, color: 'text-red-500' },
  document_uploaded: { icon: FileText, color: 'text-emerald-500' },
  status_changed: { icon: GitBranch, color: 'text-violet-500' },
  project_created: { icon: Bell, color: 'text-blue-500' },
};

export default function NotificationsPage() {
  const qc = useQueryClient();
  const [isRead, setIsRead] = useState<string>('');

  const { data, isLoading } = useQuery({
    queryKey: ['notifications', 'list', isRead],
    queryFn: () =>
      get<{ items: Notification[]; total: number; unreadCount: number }>('/notifications', {
        pageSize: 50,
        isRead: isRead !== '' ? isRead : undefined,
      }),
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => patch(`/notifications/${id}/read`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => patch('/notifications/read-all', {}),
    onSuccess: () => { toast.success('All notifications marked as read'); qc.invalidateQueries({ queryKey: ['notifications'] }); },
  });

  const notifications = data?.items || [];
  const unreadCount = data?.unreadCount || 0;

  return (
    <>
      <Header title="Notifications" subtitle={`${unreadCount} unread`} />
      <div className="p-4 sm:p-6 space-y-4 animate-slide-in">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            {['', 'false', 'true'].map((val) => (
              <button
                key={val}
                onClick={() => setIsRead(val)}
                className={cn(
                  'px-3 py-1.5 text-sm rounded-lg font-medium transition-colors',
                  isRead === val
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-500 hover:bg-slate-100'
                )}
              >
                {val === '' ? 'All' : val === 'false' ? 'Unread' : 'Read'}
                {val === 'false' && unreadCount > 0 && (
                  <span className="ml-1.5 bg-blue-100 text-blue-700 text-xs px-1.5 py-0.5 rounded-full">
                    {unreadCount}
                  </span>
                )}
              </button>
            ))}
          </div>
          {unreadCount > 0 && (
            <button
              onClick={() => markAllReadMutation.mutate()}
              className="btn-secondary text-xs"
              disabled={markAllReadMutation.isPending}
            >
              <CheckCheck size={14} /> Mark all as read
            </button>
          )}
        </div>

        <div className="card divide-y divide-slate-100">
          {isLoading && (
            <div className="flex justify-center py-12">
              <svg className="animate-spin w-6 h-6 text-blue-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          )}

          {!isLoading && notifications.length === 0 && (
            <div className="empty-state py-16">
              <Bell size={48} className="text-slate-200 mb-3" />
              <p className="text-slate-500">No notifications</p>
            </div>
          )}

          {notifications.map((notif) => {
            const typeConfig = TYPE_ICONS[notif.type] || { icon: Bell, color: 'text-slate-400' };
            const Icon = typeConfig.icon;

            return (
              <div
                key={notif.id}
                className={cn(
                  'flex items-start gap-4 px-6 py-4 transition-colors cursor-pointer',
                  !notif.isRead ? 'bg-blue-50/30 hover:bg-blue-50' : 'hover:bg-slate-50'
                )}
                onClick={() => !notif.isRead && markReadMutation.mutate(notif.id)}
              >
                <div className={cn('mt-0.5 flex-shrink-0', typeConfig.color)}>
                  <Icon size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn('text-sm', !notif.isRead ? 'font-semibold text-slate-900' : 'text-slate-700')}>
                    {notif.title}
                  </p>
                  <p className="text-sm text-slate-500 mt-0.5">{notif.message}</p>
                  <p className="text-xs text-slate-400 mt-1">{formatRelative(notif.createdAt)}</p>
                </div>
                {!notif.isRead && (
                  <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-2" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
