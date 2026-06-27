'use client';

import { useRef, useState, useEffect } from 'react';
import { Bell, Menu, User, Clock, AlertTriangle, FileText, GitBranch, CheckCheck, Settings, LogOut, ChevronDown, Search, X } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useSidebarStore } from '@/store/sidebar';
import { getInitials, getAvatarColor, formatRelative, cn } from '@/lib/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { get, patch } from '@/lib/api';
import { playNotificationSound } from '@/lib/sound';
import { NotificationToast } from '@/components/NotificationToast';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import type { Notification } from '@flowtiq/shared-types';

const TYPE_ICONS: Record<string, { icon: React.ElementType; color: string }> = {
  assignment: { icon: User, color: 'text-blue-500' },
  follow_up_reminder: { icon: Clock, color: 'text-amber-500' },
  overdue: { icon: AlertTriangle, color: 'text-red-500' },
  document_uploaded: { icon: FileText, color: 'text-emerald-500' },
  status_changed: { icon: GitBranch, color: 'text-blue-600' },
  project_created: { icon: Bell, color: 'text-blue-500' },
};

export function Header({ title, subtitle }: { title?: string; subtitle?: string }) {
  const { user, logout } = useAuthStore();
  const { toggleMobile } = useSidebarStore();
  const router = useRouter();
  const qc = useQueryClient();

  const [activePanel, setActivePanel] = useState<'bell' | 'avatar' | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  const bellRef = useRef<HTMLDivElement>(null);
  const avatarRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Debounce search query (300ms)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Close panels on outside click or Escape
  useEffect(() => {
    if (!activePanel) return;

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        !bellRef.current?.contains(target) &&
        !avatarRef.current?.contains(target)
      ) {
        setActivePanel(null);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActivePanel(null);
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [activePanel]);

  // Close search on outside click
  useEffect(() => {
    if (!searchOpen) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (!searchRef.current?.contains(e.target as Node)) {
        setSearchOpen(false);
        setSearchQuery('');
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [searchOpen]);

  const { data: notifData } = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => get<{ items: Notification[]; unreadCount: number }>('/notifications?pageSize=5&isRead=false'),
    refetchInterval: 15000,
    enabled: !!user,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => patch(`/notifications/${id}/read`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => patch('/notifications/read-all', {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
    onError: () => toast.error('Failed to mark all notifications as read'),
  });

  const { data: searchData, isFetching: searchFetching } = useQuery({
    queryKey: ['projects', 'search', debouncedQuery],
    queryFn: () => get<{ items: import('@flowtiq/shared-types').Project[] }>(`/projects?search=${encodeURIComponent(debouncedQuery)}&pageSize=6`),
    enabled: debouncedQuery.length >= 2,
    staleTime: 10000,
  });

  const unreadCount = notifData?.unreadCount ?? 0;
  const previewNotifs = notifData?.items ?? [];

  const prevUnreadRef = useRef<number | null>(null);
  useEffect(() => {
    // Skip while data hasn't loaded yet — unreadCount defaults to 0 before the
    // first fetch completes, which would make every page refresh look like new
    // notifications arriving (0 → N triggers the toast incorrectly).
    if (!notifData) return;

    if (prevUnreadRef.current !== null && unreadCount > prevUnreadRef.current) {
      playNotificationSound();
      const newest = previewNotifs[0];
      if (newest) {
        toast.custom(
          (t) => (
            <NotificationToast
              t={t}
              title={newest.title}
              body={newest.message || newest.title}
            />
          ),
          { duration: 7000, position: 'top-right' },
        );
      }
    }
    prevUnreadRef.current = unreadCount;
  }, [unreadCount, previewNotifs, notifData]);
  const initials = user ? getInitials(user.firstName, user.lastName) : '';
  const avatarColor = user ? getAvatarColor(`${user.firstName} ${user.lastName}`) : 'bg-blue-500';

  function togglePanel(panel: 'bell' | 'avatar') {
    setActivePanel((prev) => (prev === panel ? null : panel));
  }

  function handleNotifClick(notif: Notification) {
    markReadMutation.mutate(notif.id);
    setActivePanel(null);
    const link = notif.data?.link as string | undefined;
    router.push(link || '/notifications');
  }

  function handleSignOut() {
    setActivePanel(null);
    logout();
    router.push('/login');
  }

  function handleSelectProject(id: string) {
    router.push(`/projects/${id}`);
    setSearchOpen(false);
    setSearchQuery('');
  }

  function openSearch() {
    setActivePanel(null);
    setSearchOpen(true);
    setTimeout(() => searchInputRef.current?.focus(), 50);
  }

  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-6 sticky top-0 z-20 gap-3">
      <div className="flex items-center gap-3 min-w-0">
        {/* Hamburger — mobile only */}
        <button
          onClick={toggleMobile}
          className="md:hidden flex-shrink-0 p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>

        <div className="min-w-0">
          {title && <h1 className="text-base md:text-lg font-semibold text-slate-900 truncate">{title}</h1>}
          {subtitle && <p className="text-xs text-slate-500 truncate hidden sm:block">{subtitle}</p>}
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
        {/* Global project search */}
        <div ref={searchRef} className="relative">
          {searchOpen ? (
            <div>
              {/* Input */}
              <div className="flex items-center relative">
                <Search size={14} className="absolute left-2.5 text-slate-400 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search projects..."
                  className="w-52 sm:w-64 pl-8 pr-7 py-1.5 text-sm rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                  onKeyDown={(e) => { if (e.key === 'Escape') { setSearchOpen(false); setSearchQuery(''); } }}
                />
                <button
                  type="button"
                  onClick={() => { setSearchOpen(false); setSearchQuery(''); }}
                  className="absolute right-2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X size={13} />
                </button>
              </div>

              {/* Results dropdown */}
              {debouncedQuery.length >= 2 && (
                <div className="absolute right-0 top-full mt-1.5 w-72 sm:w-80 bg-white rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.12)] border border-slate-200 z-50 overflow-hidden animate-slide-in">
                  {searchFetching ? (
                    <div className="px-4 py-6 text-center text-sm text-slate-400">Searching...</div>
                  ) : searchData?.items?.length === 0 ? (
                    <div className="px-4 py-6 text-center text-sm text-slate-400">No projects found</div>
                  ) : (
                    <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
                      {searchData?.items?.map((project) => (
                        <button
                          key={project.id}
                          onClick={() => handleSelectProject(project.id)}
                          className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors flex items-start gap-3"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-900 truncate">{project.name}</p>
                            <p className="text-xs text-slate-400 truncate mt-0.5">
                              {project.clientName}
                              {project.location ? ` · ${project.location}` : ''}
                            </p>
                          </div>
                          <span className={cn(
                            'flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full mt-0.5',
                            project.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                            project.status === 'on_hold' ? 'bg-amber-100 text-amber-700' :
                            project.status === 'completed' ? 'bg-blue-100 text-blue-700' :
                            'bg-slate-100 text-slate-500'
                          )}>
                            {project.status.replace('_', ' ')}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={openSearch}
              className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              aria-label="Search projects"
            >
              <Search size={20} />
            </button>
          )}
        </div>

        {/* Notifications bell + popover */}
        <div ref={bellRef} className="relative">
          <button
            onClick={() => togglePanel('bell')}
            aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
            aria-expanded={activePanel === 'bell'}
            className="relative p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <Bell size={20} aria-hidden="true" />
            {unreadCount > 0 && (
              <span
                className="absolute top-1.5 right-1.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center"
                aria-hidden="true"
              >
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {activePanel === 'bell' && (
            <div
              className="absolute right-0 top-full mt-2 w-[380px] max-h-[480px] bg-white rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.12)] border border-slate-200 flex flex-col animate-slide-in z-50"
              role="dialog"
              aria-label="Notifications"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                <span className="text-sm font-semibold text-slate-900">Notifications</span>
                {unreadCount > 0 && (
                  <span className="text-xs text-slate-500">{unreadCount} unread</span>
                )}
              </div>

              {/* Items */}
              <div className="overflow-y-auto flex-1 divide-y divide-slate-100">
                {previewNotifs.length === 0 ? (
                  <div className="py-10 text-center text-sm text-slate-500">No new notifications</div>
                ) : (
                  previewNotifs.map((notif) => {
                    const { icon: Icon, color } = TYPE_ICONS[notif.type] ?? { icon: Bell, color: 'text-slate-500' };
                    return (
                      <button
                        key={notif.id}
                        onClick={() => handleNotifClick(notif)}
                        className={cn(
                          'w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-slate-50 transition-colors',
                          !notif.isRead && 'bg-blue-50/40'
                        )}
                      >
                        <span className={cn('flex-shrink-0 mt-0.5', color)}>
                          <Icon size={16} />
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 leading-snug line-clamp-1">{notif.title}</p>
                          <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{notif.message}</p>
                          <p className="text-[11px] text-slate-400 mt-1">{formatRelative(notif.createdAt)}</p>
                        </div>
                        {!notif.isRead && (
                          <span className="flex-shrink-0 mt-1.5 w-2 h-2 rounded-full bg-blue-500" aria-label="Unread" />
                        )}
                      </button>
                    );
                  })
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-100 bg-slate-50 rounded-b-xl">
                <button
                  onClick={() => { markAllReadMutation.mutate(); }}
                  disabled={markAllReadMutation.isPending || unreadCount === 0}
                  className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 disabled:opacity-40 transition-colors"
                >
                  <CheckCheck size={13} />
                  Mark all read
                </button>
                <Link
                  href="/notifications"
                  onClick={() => setActivePanel(null)}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
                >
                  View all
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Avatar + user menu */}
        <div ref={avatarRef} className="relative">
          <button
            onClick={() => togglePanel('avatar')}
            aria-label={`User menu for ${user?.firstName} ${user?.lastName}`}
            aria-expanded={activePanel === 'avatar'}
            className="flex items-center gap-1.5 group"
          >
            <span
              className={cn(
                'w-8 h-8 rounded-full text-white flex items-center justify-center text-xs font-semibold flex-shrink-0 transition-all ring-2 ring-transparent group-hover:ring-blue-400 group-hover:ring-offset-1',
                avatarColor
              )}
            >
              {initials}
            </span>
            <ChevronDown
              size={14}
              className={cn('text-slate-400 transition-transform', activePanel === 'avatar' && 'rotate-180')}
            />
          </button>

          {activePanel === 'avatar' && (
            <div
              className="absolute right-0 top-full mt-2 w-52 bg-white rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.12)] border border-slate-200 animate-slide-in z-50 py-1"
              role="menu"
            >
              {/* User info */}
              <div className="px-4 py-3 border-b border-slate-100">
                <p className="text-sm font-semibold text-slate-900 truncate">
                  {user?.firstName} {user?.lastName}
                </p>
                <p className="text-xs text-slate-400 truncate mt-0.5">{user?.email}</p>
              </div>

              {/* Menu items */}
              <div className="py-1">
                <Link
                  href="/settings"
                  role="menuitem"
                  onClick={() => setActivePanel(null)}
                  className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <Settings size={15} className="text-slate-400" />
                  Settings
                </Link>
                <button
                  role="menuitem"
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogOut size={15} className="text-red-500" />
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
