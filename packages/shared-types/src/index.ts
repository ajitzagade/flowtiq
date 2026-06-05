// =============================================
// FLOWTIQ SHARED TYPES
// Multi-tenant workflow management platform
// =============================================

// =============================================
// TENANT
// =============================================

export interface TenantBranding {
  logo?: string;
  favicon?: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor?: string;
  fontFamily?: string;
  loginBackground?: string;
  emailHeader?: string;
  theme: 'light' | 'dark' | 'system';
}

export interface TenantSettings {
  maxUsers: number;
  maxStorage: number; // bytes
  usedStorage: number;
  features: {
    workflows: boolean;
    documents: boolean;
    followUps: boolean;
    auditLogs: boolean;
    notifications: boolean;
    apiAccess: boolean;
    whiteLabel: boolean;
  };
  notificationSettings: {
    emailEnabled: boolean;
    inAppEnabled: boolean;
    whatsappEnabled: boolean;
  };
  timezone: string;
  dateFormat: string;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  domain?: string;
  branding: TenantBranding;
  settings: TenantSettings;
  subscriptionPlan: SubscriptionPlan;
  subscriptionStatus: 'active' | 'suspended' | 'cancelled' | 'trial';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  // computed
  userCount?: number;
  projectCount?: number;
}

export type SubscriptionPlan = 'trial' | 'starter' | 'professional' | 'enterprise';

// =============================================
// USER
// =============================================

export interface User {
  id: string;
  tenantId?: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone?: string;
  avatar?: string;
  isSuperAdmin: boolean;
  isActive: boolean;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
  roles?: Role[];
  permissions?: string[];
}

export interface CreateUserInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  roleIds: string[];
}

export interface UpdateUserInput {
  firstName?: string;
  lastName?: string;
  phone?: string;
  avatar?: string;
  isActive?: boolean;
  roleIds?: string[];
}

// =============================================
// ROLES & PERMISSIONS
// =============================================

export interface Permission {
  id: string;
  code: string;
  name: string;
  description?: string;
  module: PermissionModule;
  action: PermissionAction;
}

export type PermissionModule =
  | 'tenants'
  | 'users'
  | 'roles'
  | 'projects'
  | 'stages'
  | 'documents'
  | 'followups'
  | 'workflows'
  | 'audit'
  | 'notifications'
  | 'settings'
  | 'reports';

export type PermissionAction =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'upload'
  | 'download'
  | 'approve'
  | 'reject'
  | 'manage'
  | 'view_all'
  | 'export';

export const PERMISSION_CODES = {
  // Projects
  PROJECTS_CREATE: 'projects:create',
  PROJECTS_READ: 'projects:read',
  PROJECTS_UPDATE: 'projects:update',
  PROJECTS_DELETE: 'projects:delete',
  PROJECTS_VIEW_ALL: 'projects:view_all',
  // Stages
  STAGES_UPDATE: 'stages:update',
  STAGES_APPROVE: 'stages:approve',
  // Documents
  DOCUMENTS_UPLOAD: 'documents:upload',
  DOCUMENTS_DOWNLOAD: 'documents:download',
  DOCUMENTS_DELETE: 'documents:delete',
  // Follow-ups
  FOLLOWUPS_CREATE: 'followups:create',
  FOLLOWUPS_UPDATE: 'followups:update',
  FOLLOWUPS_VIEW_ALL: 'followups:view_all',
  // Users
  USERS_CREATE: 'users:create',
  USERS_READ: 'users:read',
  USERS_UPDATE: 'users:update',
  USERS_DELETE: 'users:delete',
  USERS_MANAGE: 'users:manage',
  // Roles
  ROLES_MANAGE: 'roles:manage',
  // Workflows
  WORKFLOWS_MANAGE: 'workflows:manage',
  // Audit
  AUDIT_VIEW: 'audit:read',
  // Settings
  SETTINGS_MANAGE: 'settings:manage',
  // Reports
  REPORTS_VIEW: 'reports:read',
  REPORTS_EXPORT: 'reports:export',
} as const;

export type PermissionCode = typeof PERMISSION_CODES[keyof typeof PERMISSION_CODES];

export interface Role {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  isSystem: boolean;
  color?: string;
  permissions: Permission[];
  createdAt: string;
  updatedAt: string;
  userCount?: number;
}

export interface CreateRoleInput {
  name: string;
  description?: string;
  color?: string;
  permissionIds: string[];
}

export interface UpdateRoleInput {
  name?: string;
  description?: string;
  color?: string;
  permissionIds?: string[];
}

// =============================================
// WORKFLOW ENGINE
// =============================================

export interface StageConfig {
  key: string;
  name: string;
  order: number;
  description?: string;
  color?: string;
  icon?: string;
  requiresApproval: boolean;
  approverRoleIds?: string[];
  requiredDocuments?: string[];
  checklist?: ChecklistItem[];
  followUpRules?: FollowUpRule;
  canSkip: boolean;
}

export interface ChecklistItem {
  id: string;
  label: string;
  required: boolean;
}

export interface FollowUpRule {
  autoCreate: boolean;
  defaultDaysAhead: number;
  reminderDaysBefore: number;
}

export interface WorkflowTemplate {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  isDefault: boolean;
  isActive: boolean;
  stages: StageConfig[];
  createdAt: string;
  updatedAt: string;
  projectCount?: number;
}

export interface CreateWorkflowInput {
  name: string;
  description?: string;
  isDefault?: boolean;
  stages: StageConfig[];
}

// =============================================
// PROJECT
// =============================================

export type ProjectStatus = 'active' | 'on_hold' | 'completed' | 'cancelled';
export type ProjectPriority = 'low' | 'medium' | 'high' | 'urgent';
export type StageStatus = 'pending' | 'in_progress' | 'completed' | 'skipped' | 'on_hold';

export interface Project {
  id: string;
  tenantId: string;
  projectNumber: string;
  name: string;
  description?: string;
  clientName: string;
  location?: string;
  status: ProjectStatus;
  priority: ProjectPriority;
  startDate?: string;
  dueDate?: string;
  completionDate?: string;
  workflowId?: string;
  currentStage?: string;
  ownerId: string;
  teamMembers: string[];
  followUpOwnerId?: string;
  reportingOwnerId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  // populated
  owner?: User;
  workflow?: WorkflowTemplate;
  stages?: ProjectStage[];
  documentsCount?: number;
  followUpsCount?: number;
  pendingFollowUps?: number;
}

export interface CreateProjectInput {
  projectNumber?: string;
  name: string;
  description?: string;
  clientName: string;
  location?: string;
  priority?: ProjectPriority;
  startDate?: string;
  dueDate?: string;
  workflowId?: string;
  ownerId: string;
  teamMembers?: string[];
  followUpOwnerId?: string;
  reportingOwnerId?: string;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
  clientName?: string;
  location?: string;
  status?: ProjectStatus;
  priority?: ProjectPriority;
  startDate?: string;
  dueDate?: string;
  completionDate?: string;
  workflowId?: string;
  ownerId?: string;
  teamMembers?: string[];
  followUpOwnerId?: string;
  reportingOwnerId?: string;
}

// =============================================
// PROJECT STAGE
// =============================================

export interface ProjectStage {
  id: string;
  projectId: string;
  stageName: string;
  stageKey: string;
  stageOrder: number;
  status: StageStatus;
  assignedTo?: string;
  startDate?: string;
  completionDate?: string;
  notes?: string;
  checklist?: ChecklistItem[];
  createdAt: string;
  updatedAt: string;
  // populated
  assignedUser?: User;
  history?: StageHistory[];
  documents?: Document[];
}

export interface StageHistory {
  id: string;
  stageId: string;
  changedById: string;
  previousStatus?: StageStatus;
  newStatus: StageStatus;
  comment?: string;
  createdAt: string;
  changedBy?: User;
}

export interface UpdateStageInput {
  status?: StageStatus;
  assignedTo?: string;
  notes?: string;
  startDate?: string;
  completionDate?: string;
  comment?: string;
  checklist?: ChecklistItem[];
}

// =============================================
// FOLLOW-UP
// =============================================

export type FollowUpStatus = 'pending' | 'completed' | 'overdue' | 'cancelled';

export interface FollowUp {
  id: string;
  tenantId: string;
  projectId: string;
  ownerId: string;
  createdById: string;
  status: FollowUpStatus;
  lastFollowUp?: string;
  nextFollowUp: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  // populated
  project?: Project;
  owner?: User;
  createdBy?: User;
  history?: FollowUpHistory[];
}

export interface FollowUpHistory {
  id: string;
  followUpId: string;
  notes: string;
  createdById: string;
  status?: FollowUpStatus;
  createdAt: string;
  createdBy?: User;
}

export interface CreateFollowUpInput {
  projectId: string;
  ownerId: string;
  nextFollowUp: string;
  notes?: string;
}

export interface UpdateFollowUpInput {
  status?: FollowUpStatus;
  ownerId?: string;
  nextFollowUp?: string;
  notes?: string;
  historyNote?: string;
}

// =============================================
// DOCUMENT
// =============================================

export interface Document {
  id: string;
  tenantId: string;
  projectId: string;
  stageId?: string;
  fileName: string;
  originalName: string;
  fileType: string;
  fileSize: number;
  filePath: string;
  mimeType?: string;
  version: number;
  uploadedById: string;
  isActive: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  // populated
  uploadedBy?: User;
  stage?: ProjectStage;
  versions?: DocumentVersion[];
}

export interface DocumentVersion {
  id: string;
  documentId: string;
  version: number;
  filePath: string;
  fileSize: number;
  uploadedById: string;
  notes?: string;
  createdAt: string;
  uploadedBy?: User;
}

// =============================================
// AUDIT LOG
// =============================================

export type AuditAction =
  | 'CREATED'
  | 'UPDATED'
  | 'DELETED'
  | 'VIEWED'
  | 'UPLOADED'
  | 'DOWNLOADED'
  | 'REPLACED'
  | 'APPROVED'
  | 'REJECTED'
  | 'LOGGED_IN'
  | 'LOGGED_OUT'
  | 'PASSWORD_CHANGED'
  | 'ROLE_ASSIGNED'
  | 'ROLE_REMOVED'
  | 'STATUS_CHANGED'
  | 'EXPORTED';

export interface AuditLog {
  id: string;
  tenantId?: string;
  userId?: string;
  userEmail?: string;
  userRole?: string;
  action: AuditAction;
  module: string;
  entityId?: string;
  entityType?: string;
  entityName?: string;
  previousData?: Record<string, unknown>;
  newData?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

// =============================================
// NOTIFICATIONS
// =============================================

export type NotificationType =
  | 'assignment'
  | 'follow_up_reminder'
  | 'overdue'
  | 'approval_request'
  | 'document_uploaded'
  | 'status_changed'
  | 'project_created'
  | 'mention';

export interface Notification {
  id: string;
  tenantId: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  isRead: boolean;
  readAt?: string;
  createdAt: string;
}

// =============================================
// DASHBOARD
// =============================================

export interface DashboardStats {
  totalProjects: number;
  activeProjects: number;
  completedProjects: number;
  onHoldProjects: number;
  totalFollowUps: number;
  pendingFollowUps: number;
  overdueFollowUps: number;
  totalDocuments: number;
  totalUsers?: number;
  recentActivity?: AuditLog[];
  projectsByStatus?: Record<string, number>;
  projectsByPriority?: Record<string, number>;
}

export interface SuperAdminStats {
  totalTenants: number;
  activeTenants: number;
  totalUsers: number;
  activeUsers: number;
  totalProjects: number;
  totalDocuments: number;
  totalStorageUsed: number;
  recentTenants: Tenant[];
  systemHealth: {
    database: 'healthy' | 'degraded' | 'down';
    api: 'healthy' | 'degraded' | 'down';
    storage: 'healthy' | 'degraded' | 'down';
  };
}

// =============================================
// API RESPONSE TYPES
// =============================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  errors?: Record<string, string[]>;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PaginationParams {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// =============================================
// AUTH
// =============================================

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
  tenant?: Tenant;
}

export interface JwtPayload {
  userId: string;
  tenantId: string | null;
  isSuperAdmin: boolean;
  email: string;
  roles: string[];
  permissions: string[];
}

// =============================================
// FILTERS
// =============================================

export interface ProjectFilters extends PaginationParams {
  status?: ProjectStatus;
  priority?: ProjectPriority;
  ownerId?: string;
  workflowId?: string;
  startDateFrom?: string;
  startDateTo?: string;
  dueDateFrom?: string;
  dueDateTo?: string;
}

export interface FollowUpFilters extends PaginationParams {
  status?: FollowUpStatus;
  ownerId?: string;
  projectId?: string;
  dueDateFrom?: string;
  dueDateTo?: string;
  overdue?: boolean;
}

export interface AuditLogFilters extends PaginationParams {
  userId?: string;
  action?: AuditAction;
  module?: string;
  entityId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface NotificationFilters extends PaginationParams {
  isRead?: boolean;
  type?: NotificationType;
}
