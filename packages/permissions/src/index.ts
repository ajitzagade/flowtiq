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
    'projects:view',
    'projects:view_all',
    'projects:create',
    'projects:edit',
    'projects:delete',
    'documents:upload',
    'documents:download',
    'documents:delete',
    'follow_ups:view',
    'follow_ups:create',
    'follow_ups:edit',
    'users:view',
    'users:create',
    'users:edit',
    'roles:view',
    'roles:manage',
    'workflows:view',
    'workflows:manage',
    'reports:view',
  ],
  'Project Manager': [
    'projects:view',
    'projects:view_all',
    'projects:create',
    'projects:edit',
    'documents:upload',
    'documents:download',
    'follow_ups:view',
    'follow_ups:create',
    'follow_ups:edit',
    'users:view',
    'reports:view',
  ],
  'File Executive': [
    'projects:view',
    'projects:create',
    'projects:edit',
    'documents:upload',
    'documents:download',
    'follow_ups:view',
    'follow_ups:create',
  ],
  'Follow-up Executive': [
    'projects:view',
    'follow_ups:view',
    'follow_ups:create',
    'follow_ups:edit',
  ],
  'Reporting Executive': [
    'projects:view',
    'projects:view_all',
    'documents:download',
    'reports:view',
  ],
  'Viewer': [
    'projects:view',
    'documents:download',
    'reports:view',
  ],
};

// =============================================
// UI PERMISSION HELPERS
// =============================================

export function getNavigationItems(permissions: string[], isSuperAdmin: boolean) {
  const items = [];

  items.push({ key: 'dashboard', label: 'Dashboard', href: '/dashboard' });

  if (isSuperAdmin || permissions.includes('projects:view') || permissions.includes('projects:view_all')) {
    items.push({ key: 'projects', label: 'Projects', href: '/projects' });
  }

  if (isSuperAdmin || permissions.includes('follow_ups:view') || permissions.includes('follow_ups:create')) {
    items.push({ key: 'follow-ups', label: 'Follow-ups', href: '/follow-ups' });
  }

  if (isSuperAdmin || permissions.includes('documents:upload') || permissions.includes('documents:download')) {
    items.push({ key: 'documents', label: 'Documents', href: '/documents' });
  }

  if (isSuperAdmin || permissions.includes('users:view')) {
    items.push({ key: 'users', label: 'Users', href: '/users' });
  }

  if (isSuperAdmin || permissions.includes('roles:manage')) {
    items.push({ key: 'roles', label: 'Roles', href: '/roles' });
  }

  if (isSuperAdmin || permissions.includes('workflows:manage')) {
    items.push({ key: 'workflows', label: 'Workflows', href: '/workflows' });
  }

  if (isSuperAdmin || permissions.includes('reports:view')) {
    items.push({ key: 'audit-logs', label: 'Audit Logs', href: '/audit-logs' });
  }

  if (isSuperAdmin) {
    items.push({ key: 'tenants', label: 'Tenants', href: '/tenants' });
  }

  return items;
}

export type { PermissionCode };
