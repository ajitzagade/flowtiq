import type { PermissionCode, JwtPayload } from '@flowtiq/shared-types';

// =============================================
// PERMISSION DEFINITIONS
// =============================================

export const SYSTEM_ROLES = {
  SUPER_ADMIN: 'Super Admin',
  TENANT_ADMIN: 'Tenant Admin',
  PROJECT_MANAGER: 'Project Manager',
  FILE_EXECUTIVE: 'File Executive',
  FOLLOW_UP_EXECUTIVE: 'Follow-up Executive',
  REPORTING_EXECUTIVE: 'Reporting Executive',
  VIEWER: 'Viewer',
} as const;

export const MODULES = {
  TENANTS: 'tenants',
  USERS: 'users',
  ROLES: 'roles',
  PROJECTS: 'projects',
  STAGES: 'stages',
  DOCUMENTS: 'documents',
  FOLLOWUPS: 'followups',
  WORKFLOWS: 'workflows',
  AUDIT: 'audit',
  NOTIFICATIONS: 'notifications',
  SETTINGS: 'settings',
  REPORTS: 'reports',
} as const;

// =============================================
// PERMISSION CHECKING
// =============================================

/**
 * Check if a user has a specific permission
 */
export function hasPermission(user: JwtPayload, permissionCode: PermissionCode): boolean {
  if (user.isSuperAdmin) return true;
  return user.permissions.includes(permissionCode);
}

/**
 * Check if a user has any of the given permissions
 */
export function hasAnyPermission(user: JwtPayload, permissionCodes: PermissionCode[]): boolean {
  if (user.isSuperAdmin) return true;
  return permissionCodes.some((code) => user.permissions.includes(code));
}

/**
 * Check if a user has all of the given permissions
 */
export function hasAllPermissions(user: JwtPayload, permissionCodes: PermissionCode[]): boolean {
  if (user.isSuperAdmin) return true;
  return permissionCodes.every((code) => user.permissions.includes(code));
}

/**
 * Check if a user can access a project
 * (either has view_all, is owner, or is a team member)
 */
export function canAccessProject(
  user: JwtPayload,
  projectOwnerId: string,
  teamMembers: string[]
): boolean {
  if (user.isSuperAdmin) return true;
  if (hasPermission(user, 'projects:view_all')) return true;
  if (projectOwnerId === user.userId) return true;
  if (teamMembers.includes(user.userId)) return true;
  return false;
}

// =============================================
// ROLE-BASED DEFAULT PERMISSIONS
// =============================================

export const ROLE_DEFAULT_PERMISSIONS: Record<string, PermissionCode[]> = {
  'Tenant Admin': [
    'projects:create',
    'projects:read',
    'projects:update',
    'projects:delete',
    'projects:view_all',
    'stages:update',
    'stages:approve',
    'documents:upload',
    'documents:download',
    'documents:delete',
    'followups:create',
    'followups:update',
    'followups:view_all',
    'users:create',
    'users:read',
    'users:update',
    'users:delete',
    'users:manage',
    'roles:manage',
    'workflows:manage',
    'audit:read',
    'settings:manage',
    'reports:read',
    'reports:export',
  ],
  'Project Manager': [
    'projects:create',
    'projects:read',
    'projects:update',
    'projects:view_all',
    'stages:update',
    'stages:approve',
    'documents:upload',
    'documents:download',
    'followups:create',
    'followups:update',
    'followups:view_all',
    'users:read',
    'reports:read',
    'reports:export',
  ],
  'File Executive': [
    'projects:read',
    'projects:update',
    'stages:update',
    'documents:upload',
    'documents:download',
    'followups:create',
    'followups:update',
  ],
  'Follow-up Executive': [
    'projects:read',
    'projects:view_all',
    'followups:create',
    'followups:update',
    'followups:view_all',
    'documents:download',
  ],
  'Reporting Executive': [
    'projects:read',
    'projects:view_all',
    'documents:download',
    'reports:read',
    'reports:export',
    'audit:read',
  ],
  'Viewer': [
    'projects:read',
    'documents:download',
    'reports:read',
  ],
};

// =============================================
// UI PERMISSION HELPERS
// =============================================

export function getNavigationItems(permissions: string[], isSuperAdmin: boolean) {
  const items = [];

  items.push({ key: 'dashboard', label: 'Dashboard', href: '/dashboard' });

  if (isSuperAdmin || permissions.includes('projects:read')) {
    items.push({ key: 'projects', label: 'Projects', href: '/projects' });
  }

  if (isSuperAdmin || permissions.includes('followups:view_all') || permissions.includes('followups:create')) {
    items.push({ key: 'follow-ups', label: 'Follow-ups', href: '/follow-ups' });
  }

  if (isSuperAdmin || permissions.includes('documents:upload') || permissions.includes('documents:download')) {
    items.push({ key: 'documents', label: 'Documents', href: '/documents' });
  }

  if (isSuperAdmin || permissions.includes('users:read')) {
    items.push({ key: 'users', label: 'Users', href: '/users' });
  }

  if (isSuperAdmin || permissions.includes('roles:manage')) {
    items.push({ key: 'roles', label: 'Roles', href: '/roles' });
  }

  if (isSuperAdmin || permissions.includes('workflows:manage')) {
    items.push({ key: 'workflows', label: 'Workflows', href: '/workflows' });
  }

  if (isSuperAdmin || permissions.includes('audit:read')) {
    items.push({ key: 'audit-logs', label: 'Audit Logs', href: '/audit-logs' });
  }

  if (isSuperAdmin || permissions.includes('settings:manage')) {
    items.push({ key: 'settings', label: 'Settings', href: '/settings' });
  }

  if (isSuperAdmin) {
    items.push({ key: 'tenants', label: 'Tenants', href: '/tenants' });
  }

  return items;
}

export type { PermissionCode };
