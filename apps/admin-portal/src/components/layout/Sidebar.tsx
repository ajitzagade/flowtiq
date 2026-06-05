'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, FolderKanban, Clock, FileText, Users, Shield,
  GitBranch, ClipboardList, Bell, Settings, Building2, Layers, LogOut,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { useState } from 'react';

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { key: 'projects', label: 'Projects', href: '/projects', icon: FolderKanban },
  { key: 'follow-ups', label: 'Follow-ups', href: '/follow-ups', icon: Clock },
  { key: 'documents', label: 'Documents', href: '/documents', icon: FileText },
  { key: 'users', label: 'Users', href: '/users', icon: Users },
  { key: 'roles', label: 'Roles & Permissions', href: '/roles', icon: Shield },
  { key: 'workflows', label: 'Workflows', href: '/workflows', icon: GitBranch },
  { key: 'audit-logs', label: 'Audit Logs', href: '/audit-logs', icon: ClipboardList },
  { key: 'notifications', label: 'Notifications', href: '/notifications', icon: Bell },
  { key: 'settings', label: 'Settings', href: '/settings', icon: Settings },
];

const SUPER_ADMIN_ITEMS = [
  { key: 'tenants', label: 'Tenants', href: '/tenants', icon: Building2 },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, tenant, logout } = useAuthStore();
  const [collapsed, setCollapsed] = useState(false);

  const navItems = user?.isSuperAdmin
    ? [...SUPER_ADMIN_ITEMS, ...NAV_ITEMS]
    : NAV_ITEMS;

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const handleLogout = () => {
    logout();
    window.location.href = '/login';
  };

  return (
    <aside
      className={cn(
        'flex flex-col h-screen fixed left-0 top-0 z-30 transition-all duration-300 ease-in-out border-r',
        collapsed ? 'w-16' : 'w-60'
      )}
      style={{
        backgroundColor: 'var(--sidebar-bg)',
        borderColor: 'var(--sidebar-border)',
      }}
    >
      {/* Logo */}
      <div className={cn('flex items-center h-16 px-4 border-b', collapsed ? 'justify-center' : 'justify-between')}
        style={{ borderColor: 'var(--sidebar-border)' }}>
        {!collapsed && (
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden" style={{ backgroundColor: 'var(--brand-primary)' }}>
              {(tenant?.branding as { logoUrl?: string } | undefined)?.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}${(tenant?.branding as { logoUrl?: string }).logoUrl}`} alt="Logo" className="w-full h-full object-contain" />
              ) : (
                <Layers className="w-4.5 h-4.5 text-white" size={18} />
              )}
            </div>
            <div>
              <p className="text-white font-bold text-sm leading-none">
                {tenant?.name || 'Flowtiq'}
              </p>
              {tenant && (
                <p className="text-slate-500 text-xs mt-0.5">Powered by Flowtiq</p>
              )}
            </div>
          </div>
        )}
        {collapsed && (
          <div className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden" style={{ backgroundColor: 'var(--brand-primary)' }}>
            {(tenant?.branding as { logoUrl?: string } | undefined)?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}${(tenant?.branding as { logoUrl?: string }).logoUrl}`} alt="Logo" className="w-full h-full object-contain" />
            ) : (
              <Layers size={18} className="text-white" />
            )}
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="text-slate-500 hover:text-slate-300 transition-colors p-1 rounded"
          style={{ marginLeft: collapsed ? 0 : 8 }}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {navItems.map(({ key, label, href, icon: Icon }) => (
          <Link key={key} href={href}>
            <div
              className={cn(
                'nav-item',
                isActive(href) && 'active',
                collapsed && 'justify-center px-2'
              )}
              title={collapsed ? label : undefined}
            >
              <Icon size={18} className="flex-shrink-0" />
              {!collapsed && <span>{label}</span>}
            </div>
          </Link>
        ))}
      </nav>

      {/* User & logout */}
      <div className="p-2 border-t" style={{ borderColor: 'var(--sidebar-border)' }}>
        {!collapsed && user && (
          <div className="px-3 py-2 mb-1">
            <p className="text-white text-sm font-medium truncate">{user.firstName} {user.lastName}</p>
            <p className="text-slate-500 text-xs truncate">{user.email}</p>
          </div>
        )}
        <button
          onClick={handleLogout}
          className={cn(
            'nav-item w-full text-left hover:text-red-400',
            collapsed && 'justify-center px-2'
          )}
          title={collapsed ? 'Sign out' : undefined}
        >
          <LogOut size={18} className="flex-shrink-0" />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </aside>
  );
}
