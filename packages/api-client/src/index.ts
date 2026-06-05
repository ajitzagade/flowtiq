/**
 * @flowtiq/api-client
 * Type-safe API client for Flowtiq platform
 * Can be used in server-side (Node.js) or client-side contexts
 */

import axios, { AxiosInstance } from 'axios';
import type {
  Project, User, Role, FollowUp, Document, AuditLog,
  Notification, WorkflowTemplate, DashboardStats,
  PaginatedResponse, ApiResponse,
  CreateProjectInput, UpdateProjectInput,
  CreateUserInput, UpdateUserInput,
  CreateFollowUpInput, UpdateFollowUpInput,
  LoginInput, AuthResponse,
} from '@flowtiq/shared-types';

export class FlowtiqApiClient {
  private client: AxiosInstance;

  constructor(baseURL: string, token?: string) {
    this.client = axios.create({
      baseURL: `${baseURL}/api`,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
    });
  }

  setToken(token: string) {
    this.client.defaults.headers.Authorization = `Bearer ${token}`;
  }

  private async get<T>(url: string, params?: object): Promise<T> {
    const { data } = await this.client.get<ApiResponse<T>>(url, { params });
    return data.data as T;
  }

  private async post<T>(url: string, body?: object): Promise<T> {
    const { data } = await this.client.post<ApiResponse<T>>(url, body);
    return data.data as T;
  }

  private async patch<T>(url: string, body?: object): Promise<T> {
    const { data } = await this.client.patch<ApiResponse<T>>(url, body);
    return data.data as T;
  }

  private async delete<T>(url: string): Promise<T> {
    const { data } = await this.client.delete<ApiResponse<T>>(url);
    return data.data as T;
  }

  // =============================================
  // AUTH
  // =============================================
  async login(input: LoginInput): Promise<AuthResponse> {
    return this.post<AuthResponse>('/auth/login', input);
  }

  async refreshToken(refreshToken: string): Promise<{ accessToken: string }> {
    return this.post<{ accessToken: string }>('/auth/refresh', { refreshToken });
  }

  async me(): Promise<User> {
    return this.get<User>('/auth/me');
  }

  // =============================================
  // PROJECTS
  // =============================================
  async getProjects(params?: object): Promise<PaginatedResponse<Project>> {
    return this.get<PaginatedResponse<Project>>('/projects', params);
  }

  async getProject(id: string): Promise<Project> {
    return this.get<Project>(`/projects/${id}`);
  }

  async createProject(input: CreateProjectInput): Promise<Project> {
    return this.post<Project>('/projects', input);
  }

  async updateProject(id: string, input: UpdateProjectInput): Promise<Project> {
    return this.patch<Project>(`/projects/${id}`, input);
  }

  // =============================================
  // USERS
  // =============================================
  async getUsers(params?: object): Promise<PaginatedResponse<User>> {
    return this.get<PaginatedResponse<User>>('/users', params);
  }

  async createUser(input: CreateUserInput): Promise<User> {
    return this.post<User>('/users', input);
  }

  async updateUser(id: string, input: UpdateUserInput): Promise<User> {
    return this.patch<User>(`/users/${id}`, input);
  }

  // =============================================
  // ROLES
  // =============================================
  async getRoles(): Promise<Role[]> {
    return this.get<Role[]>('/roles');
  }

  // =============================================
  // FOLLOW-UPS
  // =============================================
  async getFollowUps(params?: object): Promise<PaginatedResponse<FollowUp>> {
    return this.get<PaginatedResponse<FollowUp>>('/follow-ups', params);
  }

  async createFollowUp(input: CreateFollowUpInput): Promise<FollowUp> {
    return this.post<FollowUp>('/follow-ups', input);
  }

  async updateFollowUp(id: string, input: UpdateFollowUpInput): Promise<FollowUp> {
    return this.patch<FollowUp>(`/follow-ups/${id}`, input);
  }

  // =============================================
  // DOCUMENTS
  // =============================================
  async getDocuments(params?: object): Promise<PaginatedResponse<Document>> {
    return this.get<PaginatedResponse<Document>>('/documents', params);
  }

  // =============================================
  // WORKFLOWS
  // =============================================
  async getWorkflows(): Promise<WorkflowTemplate[]> {
    return this.get<WorkflowTemplate[]>('/workflows');
  }

  // =============================================
  // AUDIT LOGS
  // =============================================
  async getAuditLogs(params?: object): Promise<PaginatedResponse<AuditLog>> {
    return this.get<PaginatedResponse<AuditLog>>('/audit', params);
  }

  // =============================================
  // NOTIFICATIONS
  // =============================================
  async getNotifications(params?: object): Promise<PaginatedResponse<Notification> & { unreadCount: number }> {
    return this.get<PaginatedResponse<Notification> & { unreadCount: number }>('/notifications', params);
  }

  // =============================================
  // DASHBOARD
  // =============================================
  async getDashboardStats(): Promise<DashboardStats> {
    return this.get<DashboardStats>('/dashboard/stats');
  }
}

export type { Project, User, Role, FollowUp, Document, AuditLog, Notification, WorkflowTemplate };
