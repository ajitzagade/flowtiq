'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, FolderKanban, Clock, FileText, Users, Shield,
  GitBranch, ClipboardList, Bell, Settings, Building2, LogOut,
  ChevronLeft, ChevronRight, X, BarChart2, CheckCircle, TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { useSidebarStore } from '@/store/sidebar';
import { deregisterPushTokenIfNative } from '@/lib/pushToken';

// permission code required to see a nav item (null = always visible)
const NAV_ITEMS: Array<{ key: string; label: string; href: string; icon: React.ElementType; requiredPermission: string | null }> = [
  { key: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, requiredPermission: null },
  { key: 'projects', label: 'Projects', href: '/projects', icon: FolderKanban, requiredPermission: 'projects:view' },
  { key: 'completed-projects', label: 'Completed Projects', href: '/completed-projects', icon: CheckCircle, requiredPermission: 'projects:view' },
  { key: 'reports', label: 'Reports', href: '/reports', icon: BarChart2, requiredPermission: 'reports:view' },
  { key: 'finance-reports', label: 'Finance Reports', href: '/finance-reports', icon: TrendingUp, requiredPermission: 'reports:view' },
  { key: 'follow-ups', label: 'Follow-ups', href: '/follow-ups', icon: Clock, requiredPermission: 'follow_ups:create' },
  { key: 'documents', label: 'Documents', href: '/documents', icon: FileText, requiredPermission: 'documents:download' },
  { key: 'users', label: 'Users', href: '/users', icon: Users, requiredPermission: 'users:view' },
  { key: 'roles', label: 'Roles & Permissions', href: '/roles', icon: Shield, requiredPermission: 'roles:manage' },
  { key: 'workflows', label: 'Workflows', href: '/workflows', icon: GitBranch, requiredPermission: 'roles:manage' },
  { key: 'audit-logs', label: 'Audit Logs', href: '/audit-logs', icon: ClipboardList, requiredPermission: 'roles:manage' },
  { key: 'notifications', label: 'Notifications', href: '/notifications', icon: Bell, requiredPermission: null },
  { key: 'settings', label: 'Settings', href: '/settings', icon: Settings, requiredPermission: null },
];

const SUPER_ADMIN_ITEMS: Array<{ key: string; label: string; href: string; icon: React.ElementType; requiredPermission: string | null }> = [
  { key: 'tenants', label: 'Tenants', href: '/tenants', icon: Building2, requiredPermission: null },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, tenant, logout } = useAuthStore();
  const { collapsed, setCollapsed, mobileOpen, setMobileOpen } = useSidebarStore();

  const userPermissions = (user?.permissions as string[] | undefined) ?? [];

  const allItems = user?.isSuperAdmin
    ? [...SUPER_ADMIN_ITEMS, ...NAV_ITEMS]
    : NAV_ITEMS;

  const navItems = user?.isSuperAdmin
    ? allItems
    : allItems.filter((item) =>
        item.requiredPermission === null || userPermissions.includes(item.requiredPermission),
      );

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const handleLogout = () => {
    // fire-and-forget: deregister push token before clearing auth state
    deregisterPushTokenIfNative();
    logout();
    window.location.href = '/login';
  };

  // On mobile, close sidebar when a nav link is clicked
  const handleNavClick = () => setMobileOpen(false);

  // On mobile the sidebar is full-width drawer (w-72); on desktop it collapses to w-16 or w-60
  const showLabels = mobileOpen || !collapsed;

  return (
    <aside
      aria-label="Main navigation"
      className={cn(
        'flex flex-col h-screen fixed left-0 top-0 z-50 border-r transition-all duration-300 ease-in-out',
        // Mobile: translate off-screen when closed, slide in when open
        mobileOpen ? 'translate-x-0 w-72' : '-translate-x-full w-72',
        // Desktop: always visible, collapse/expand
        'md:translate-x-0',
        collapsed ? 'md:w-16' : 'md:w-60',
      )}
      style={{
        backgroundColor: 'var(--sidebar-bg)',
        borderColor: 'var(--sidebar-border)',
      }}
    >
      {/* Logo row */}
      <div
        className={cn(
          'flex items-center h-16 px-4 border-b flex-shrink-0',
          !showLabels ? 'justify-center' : 'justify-between',
        )}
        style={{ borderColor: 'var(--sidebar-border)' }}
      >
        {showLabels && (
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              {(tenant?.branding as { logoUrl?: string } | undefined)?.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={(tenant?.branding as { logoUrl?: string }).logoUrl}
                  alt="Logo"
                  className="w-full h-full object-contain"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src="/vastudeep_logo.png" alt="Logo" className="w-full h-full object-contain p-1" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-white font-bold text-sm leading-none truncate">
                {tenant?.name || 'Flowtiq'}
              </p>
              {tenant && (
                <p className="text-white/40 text-xs mt-0.5">Powered by Flowtiq</p>
              )}
            </div>
          </div>
        )}

        {!showLabels && (
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            {(tenant?.branding as { logoUrl?: string } | undefined)?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={(tenant?.branding as { logoUrl?: string }).logoUrl}
                alt="Logo"
                className="w-full h-full object-contain"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src="/vastudeep_logo.png" alt="Logo" className="w-full h-full object-contain p-1" />
            )}
          </div>
        )}

        {/* Mobile: X to close; Desktop: collapse toggle */}
        {mobileOpen ? (
          <button
            onClick={() => setMobileOpen(false)}
            aria-label="Close sidebar"
            className="text-white/40 hover:text-white transition-colors p-1 rounded flex-shrink-0 ml-2"
          >
            <X size={16} />
          </button>
        ) : (
          <button
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="hidden md:block text-white/40 hover:text-white transition-colors p-1 rounded flex-shrink-0"
            style={{ marginLeft: collapsed ? 0 : 8 }}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        )}
      </div>

      {/* Nav */}
      <nav aria-label="Main navigation" className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {navItems.map(({ key, label, href, icon: Icon }) => (
          <Link
            key={key}
            href={href}
            onClick={handleNavClick}
            aria-label={!showLabels ? label : undefined}
            aria-current={isActive(href) ? 'page' : undefined}
          >
            <div
              className={cn(
                'nav-item',
                isActive(href) && 'active',
                !showLabels && 'justify-center px-2',
              )}
              title={!showLabels ? label : undefined}
            >
              <Icon size={18} className="flex-shrink-0" aria-hidden="true" />
              {showLabels && <span>{label}</span>}
            </div>
          </Link>
        ))}
      </nav>

      {/* User & logout */}
      <div className="p-2 border-t flex-shrink-0" style={{ borderColor: 'var(--sidebar-border)' }}>
        {showLabels && user && (
          <div className="px-3 py-2 mb-1 min-w-0">
            <p className="text-white text-sm font-medium truncate">{user.firstName} {user.lastName}</p>
            <p className="text-white/40 text-xs truncate">{user.email}</p>
          </div>
        )}
        <button
          onClick={handleLogout}
          aria-label={!showLabels ? 'Sign out' : undefined}
          className={cn(
            'nav-item w-full text-left hover:text-red-400',
            !showLabels && 'justify-center px-2',
          )}
          title={!showLabels ? 'Sign out' : undefined}
        >
          <LogOut size={18} className="flex-shrink-0" aria-hidden="true" />
          {showLabels && <span>Sign out</span>}
        </button>
      </div>
    </aside>
  );
}
