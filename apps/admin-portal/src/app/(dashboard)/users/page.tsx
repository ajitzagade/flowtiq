'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { get, post, patch, del } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Plus, Search, Users, Edit, Trash2, X, UserCheck, UserX, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatDate, formatRelative, getInitials, getAvatarColor, cn, getErrorMessage } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import type { User, Role } from '@flowtiq/shared-types';
import { ConfirmModal } from '@/components/ConfirmModal';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { SkeletonTable } from '@/components/Skeleton';

const createSchema = z.object({
  email: z.string().email('Valid email required'),
  password: z.string().min(8, 'Min 8 characters'),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
  roleIds: z.array(z.string()).min(1, 'At least one role required'),
});

type CreateForm = z.infer<typeof createSchema>;

function UserModal({ user, roles, onClose }: {
  user?: User | null;
  roles: Role[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const modalRef = useRef<HTMLDivElement>(null);
  useFocusTrap(modalRef, true);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);
  const { register, handleSubmit, setValue, watch, formState: { errors, isSubmitting } } = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: user
      ? {
          email: user.email, firstName: user.firstName, lastName: user.lastName, phone: user.phone || '',
          roleIds: user.roles?.map((r) => r.id) || [],
          password: 'unchanged',
        }
      : { roleIds: [] },
  });

  const selectedRoleIds = watch('roleIds') || [];

  const toggleRole = (roleId: string) => {
    const current = selectedRoleIds;
    setValue('roleIds', current.includes(roleId) ? current.filter((r) => r !== roleId) : [...current, roleId]);
  };

  const onSubmit = async (data: CreateForm) => {
    try {
      if (user) {
        const { password, ...rest } = data;
        await patch(`/users/${user.id}`, { ...rest, ...(password !== 'unchanged' && { password }) });
        toast.success('User updated');
      } else {
        await post('/users', data);
        toast.success('User created');
      }
      qc.invalidateQueries({ queryKey: ['users'] });
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={modalRef} className="modal-content max-w-lg w-full" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="card-header">
          <h3 id="modal-title">{user ? 'Edit User' : 'New User'}</h3>
          <button onClick={onClose} aria-label="Close" className="btn-ghost p-1.5"><X size={18} aria-hidden="true" /></button>
        </div>
        <div className="card-body">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="form-label">First Name *</label>
                <input className={cn('form-input', errors.firstName && 'border-red-400')} {...register('firstName')} />
              </div>
              <div>
                <label className="form-label">Last Name *</label>
                <input className={cn('form-input', errors.lastName && 'border-red-400')} {...register('lastName')} />
              </div>
            </div>

            <div>
              <label className="form-label">Email *</label>
              <input type="email" className={cn('form-input', errors.email && 'border-red-400')} {...register('email')} />
              {errors.email && <p className="form-error">{errors.email.message}</p>}
            </div>

            <div>
              <label className="form-label">{user ? 'New Password (leave as-is to keep current)' : 'Password *'}</label>
              <input type="password" className={cn('form-input', errors.password && 'border-red-400')} placeholder={user ? 'unchanged' : 'Min 8 characters'} {...register('password')} />
              {errors.password && <p className="form-error">{errors.password.message}</p>}
            </div>

            <div>
              <label className="form-label">Phone</label>
              <input className="form-input" placeholder="+91 XXXXX XXXXX" {...register('phone')} />
            </div>

            <div>
              <label className="form-label">Roles * {errors.roleIds && <span className="form-error inline ml-1">{errors.roleIds.message}</span>}</label>
              <div className="flex flex-wrap gap-2 mt-1">
                {roles.map((role) => (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => toggleRole(role.id)}
                    className={cn(
                      'px-3 py-1.5 text-xs font-medium rounded-full border transition-all',
                      selectedRoleIds.includes(role.id)
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
                    )}
                  >
                    {role.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={isSubmitting} className="btn-primary">
                {isSubmitting ? 'Saving...' : user ? 'Save Changes' : 'Create User'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function UsersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<User | null>(null);
  const { user: authUser } = useAuthStore();
  const userPermissions = (authUser?.permissions as string[] | undefined) ?? [];
  const canCreate = authUser?.isSuperAdmin || userPermissions.includes('users:create');
  const canEdit = authUser?.isSuperAdmin || userPermissions.includes('users:edit');

  const { data, isLoading } = useQuery({
    queryKey: ['users', page, search, showInactive],
    queryFn: () => get<{ items: User[]; total: number; totalPages: number }>('/users', {
      page, pageSize: 15, search: search || undefined,
      isActive: showInactive ? 'all' : 'true',
    }),
    placeholderData: (prev) => prev,
  });

  const { data: roles } = useQuery<Role[]>({
    queryKey: ['roles'],
    queryFn: () => get<Role[]>('/roles'),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      patch(`/users/${id}`, { isActive }),
    onSuccess: (_, vars) => {
      toast.success(vars.isActive ? 'User activated' : 'User deactivated');
      qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const hardDeleteMutation = useMutation({
    mutationFn: (id: string) => del(`/users/${id}?hard=true`),
    onSuccess: () => {
      toast.success('User permanently deleted');
      qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const handleHardDelete = (user: User) => {
    setDeleteTarget(user);
  };

  const users = data?.items || [];
  const totalPages = data?.totalPages || 1;
  const roleList = roles || [];

  return (
    <>
      <Header title="Users" subtitle="Manage team members and their access" />
      <ConfirmModal
        isOpen={!!deleteTarget}
        title={`Permanently delete "${deleteTarget?.firstName} ${deleteTarget?.lastName}"?`}
        description={`The user account for ${deleteTarget?.firstName} ${deleteTarget?.lastName} (${deleteTarget?.email}) will be permanently removed along with all associated data. This cannot be undone.`}
        confirmLabel="Delete User"
        onConfirm={() => { if (deleteTarget) hardDeleteMutation.mutate(deleteTarget.id); setDeleteTarget(null); }}
        onCancel={() => setDeleteTarget(null)}
      />
      <ConfirmModal
        isOpen={!!deactivateTarget}
        title={`Deactivate "${deactivateTarget?.firstName} ${deactivateTarget?.lastName}"?`}
        description={`${deactivateTarget?.firstName} ${deactivateTarget?.lastName} (${deactivateTarget?.email}) will immediately lose access to the platform. You can reactivate them at any time.`}
        confirmLabel="Deactivate User"
        onConfirm={() => { if (deactivateTarget) toggleActiveMutation.mutate({ id: deactivateTarget.id, isActive: false }); setDeactivateTarget(null); }}
        onCancel={() => setDeactivateTarget(null)}
      />
      {(showModal || editUser) && (
        <UserModal
          user={editUser}
          roles={roleList}
          onClose={() => { setShowModal(false); setEditUser(null); }}
        />
      )}

      <div className="p-4 sm:p-6 space-y-4 animate-slide-in">
        <div className="card p-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-48">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="form-input pl-9"
                placeholder="Search by name or email..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => { setShowInactive(e.target.checked); setPage(1); }}
                className="accent-blue-600"
              />
              Show inactive
            </label>
            {canCreate && (
              <button onClick={() => setShowModal(true)} className="btn-primary ml-auto">
                <Plus size={16} /> New User
              </button>
            )}
          </div>
        </div>

        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th>Roles</th>
                <th>Status</th>
                <th>Last Login</th>
                <th>Joined</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <SkeletonTable rows={8} cols={7} />}
              {!isLoading && users.length === 0 && (
                <tr><td colSpan={7}>
                  <div className="empty-state">
                    <Users size={48} className="text-slate-200 mb-3" />
                    <p className="font-medium text-slate-500">No users found</p>
                    {canCreate && (
                      <button onClick={() => setShowModal(true)} className="btn-primary mt-4">
                        <Plus size={16} /> New User
                      </button>
                    )}
                  </div>
                </td></tr>
              )}
              {users.map((user) => {
                const initials = getInitials(user.firstName, user.lastName);
                const avatarColor = getAvatarColor(`${user.firstName} ${user.lastName}`);
                return (
                  <tr key={user.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full ${avatarColor} text-white flex items-center justify-center text-xs font-semibold flex-shrink-0`}>
                          {initials}
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">{user.firstName} {user.lastName}</p>
                          {user.phone && <p className="text-xs text-slate-400">{user.phone}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="text-slate-600">{user.email}</td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {user.roles?.map((role) => (
                          <span
                            key={role.id}
                            className="badge badge-blue text-[11px]"
                            style={{ backgroundColor: role.color ? `${role.color}15` : undefined, color: role.color || undefined }}
                          >
                            {role.name}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <span className={user.isActive ? 'badge-green badge' : 'badge-red badge'}>
                        {user.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="text-right font-mono text-sm text-slate-500">
                      {user.lastLoginAt ? formatRelative(user.lastLoginAt) : 'Never'}
                    </td>
                    <td className="text-right font-mono text-sm text-slate-500">{formatDate(user.createdAt)}</td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        {canEdit && (
                          <button
                            onClick={() => setEditUser(user)}
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Edit size={16} />
                          </button>
                        )}
                        {canEdit && (
                          <button
                            onClick={() => user.isActive ? setDeactivateTarget(user) : toggleActiveMutation.mutate({ id: user.id, isActive: true })}
                            className={cn(
                              'p-1.5 rounded-lg transition-colors',
                              user.isActive
                                ? 'text-slate-400 hover:text-red-600 hover:bg-red-50'
                                : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                            )}
                            title={user.isActive ? 'Deactivate' : 'Activate'}
                          >
                            {user.isActive ? <UserX size={16} /> : <UserCheck size={16} />}
                          </button>
                        )}
                        {canEdit && !user.isActive && (
                          <button
                            onClick={() => handleHardDelete(user)}
                            disabled={hardDeleteMutation.isPending}
                            className="p-1.5 text-slate-400 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
                            title="Permanently delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">Total: {data?.total} users</p>
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
