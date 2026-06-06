'use client';

import { Bell, Menu } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useSidebarStore } from '@/store/sidebar';
import { getInitials, getAvatarColor } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api';
import Link from 'next/link';

export function Header({ title, subtitle }: { title?: string; subtitle?: string }) {
  const { user } = useAuthStore();
  const { toggleMobile } = useSidebarStore();

  const { data: notifData } = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => get<{ items: unknown[]; unreadCount: number }>('/notifications?pageSize=5&isRead=false'),
    refetchInterval: 60000,
    enabled: !!user,
  });

  const unreadCount = notifData?.unreadCount || 0;
  const initials = user ? getInitials(user.firstName, user.lastName) : '';
  const avatarColor = user ? getAvatarColor(`${user.firstName} ${user.lastName}`) : 'bg-blue-500';

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
        {/* Notifications */}
        <Link
          href="/notifications"
          className="relative p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <Bell size={20} />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Link>

        {/* Avatar */}
        <div
          className={`w-8 h-8 rounded-full ${avatarColor} text-white flex items-center justify-center text-xs font-semibold cursor-pointer flex-shrink-0`}
        >
          {initials}
        </div>
      </div>
    </header>
  );
}
