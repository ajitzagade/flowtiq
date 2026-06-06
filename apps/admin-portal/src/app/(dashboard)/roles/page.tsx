'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { get, post, patch, del } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import { Plus, Shield, Edit, Trash2, X, Users, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn, getErrorMessage } from '@/lib/utils';
import type { Role, Permission } from '@flowtiq/shared-types';

const MODULE_LABELS: Record<string, string> = {
  projects: 'Projects', stages: 'Stages', documents: 'Documents',
  followups: 'Follow-ups', users: 'Users', roles: 'Roles',
  workflows: 'Workflows', audit: 'Audit Logs', settings: 'Settings', reports: 'Reports',
};

function RoleModal({ role, permissions, onClose }: {
  role?: Role | null;
  permissions: Permission[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(role?.name || '');
  const [description, setDescription] = useState(role?.description || '');
  const [color, setColor] = useState(role?.color || '#3b82f6');
  const [selectedPermIds, setSelectedPermIds] = useState<string[]>(
    role?.permissions?.map((p) => p.id) || []
  );
  const [saving, setSaving] = useState(false);

  const togglePerm = (id: string) => {
    setSelectedPermIds((prev) => prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]);
  };

  const toggleModule = (modulePerms: Permission[]) => {
    const ids = modulePerms.map((p) => p.id);
    const allSelected = ids.every((id) => selectedPermIds.includes(id));
    if (allSelected) {
      setSelectedPermIds((prev) => prev.filter((id) => !ids.includes(id)));
    } else {
      setSelectedPermIds((prev) => [...new Set([...prev, ...ids])]);
    }
  };

  const byModule = permissions.reduce<Record<string, Permission[]>>((acc, p) => {
    if (!acc[p.module]) acc[p.module] = [];
    acc[p.module].push(p);
    return acc;
  }, {});

  const onSubmit = async () => {
    if (!name.trim()) { toast.error('Role name is required'); return; }
    setSaving(true);
    try {
      if (role) {
        await patch(`/roles/${role.id}`, { name, description, color, permissionIds: selectedPermIds });
        toast.success('Role updated');
      } else {
        await post('/roles', { name, description, color, permissionIds: selectedPermIds });
        toast.success('Role created');
      }
      qc.invalidateQueries({ queryKey: ['roles'] });
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content max-w-2xl w-full">
        <div className="card-header">
          <h3>{role ? 'Edit Role' : 'New Role'}</h3>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={18} /></button>
        </div>
        <div className="card-body space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="form-label">Role Name *</label>
              <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Senior Analyst" />
            </div>
            <div>
              <label className="form-label">Color</label>
              <div className="flex items-center gap-2">
                <input type="color" className="w-10 h-10 rounded border border-slate-200 cursor-pointer p-0.5" value={color} onChange={(e) => setColor(e.target.value)} />
                <input className="form-input flex-1 font-mono text-sm" value={color} onChange={(e) => setColor(e.target.value)} />
              </div>
            </div>
          </div>

          <div>
            <label className="form-label">Description</label>
            <input className="form-input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description of this role" />
          </div>

          <div>
            <p className="text-sm font-medium text-slate-700 mb-3">Permissions ({selectedPermIds.length} selected)</p>
            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              {Object.entries(byModule).map(([mod, perms]) => {
                const allSelected = perms.every((p) => selectedPermIds.includes(p.id));
                return (
                  <div key={mod} className="border border-slate-200 rounded-lg overflow-hidden">
                    <div
                      className="flex items-center gap-2 px-3 py-2 bg-slate-50 cursor-pointer hover:bg-slate-100"
                      onClick={() => toggleModule(perms)}
                    >
                      <div className={cn('w-4 h-4 rounded border flex items-center justify-center flex-shrink-0', allSelected ? 'bg-blue-600 border-blue-600' : 'border-slate-300')}>
                        {allSelected && <Check size={10} className="text-white" />}
                      </div>
                      <p className="text-sm font-semibold text-slate-700">{MODULE_LABELS[mod] || mod}</p>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 p-2">
                      {perms.map((perm) => (
                        <label key={perm.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-50 cursor-pointer">
                          <div
                            className={cn('w-4 h-4 rounded border flex items-center justify-center flex-shrink-0', selectedPermIds.includes(perm.id) ? 'bg-blue-600 border-blue-600' : 'border-slate-300')}
                            onClick={() => togglePerm(perm.id)}
                          >
                            {selectedPermIds.includes(perm.id) && <Check size={10} className="text-white" />}
                          </div>
                          <span className="text-xs text-slate-600 capitalize">{perm.action.replace('_', ' ')}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={onClose} className="btn-secondary">Cancel</button>
            <button onClick={onSubmit} disabled={saving} className="btn-primary">
              {saving ? 'Saving...' : role ? 'Save Changes' : 'Create Role'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RolesPage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editRole, setEditRole] = useState<Role | null>(null);

  const { data: roles, isLoading } = useQuery<Role[]>({
    queryKey: ['roles'],
    queryFn: () => get<Role[]>('/roles'),
  });

  const { data: permissions } = useQuery<Permission[]>({
    queryKey: ['permissions'],
    queryFn: () => get<Permission[]>('/roles/permissions/all'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => del(`/roles/${id}`),
    onSuccess: () => { toast.success('Role deleted'); qc.invalidateQueries({ queryKey: ['roles'] }); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const roleList = roles || [];
  const permList = permissions || [];

  return (
    <>
      <Header title="Roles & Permissions" subtitle="Define roles and configure access control" />
      {(showModal || editRole) && (
        <RoleModal
          role={editRole}
          permissions={permList}
          onClose={() => { setShowModal(false); setEditRole(null); }}
        />
      )}

      <div className="p-4 sm:p-6 space-y-4 animate-slide-in">
        <div className="flex justify-end">
          <button onClick={() => setShowModal(true)} className="btn-primary">
            <Plus size={16} /> New Role
          </button>
        </div>

        {isLoading && (
          <div className="flex justify-center py-12">
            <svg className="animate-spin w-8 h-8 text-blue-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {roleList.map((role) => (
            <div key={role.id} className="card p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: `${role.color || '#3b82f6'}20` }}
                  >
                    <Shield size={20} style={{ color: role.color || '#3b82f6' }} />
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900">{role.name}</h4>
                    {role.isSystem && (
                      <span className="text-xs text-slate-400">System role</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setEditRole(role)} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg">
                    <Edit size={15} />
                  </button>
                  {!role.isSystem && (
                    <button
                      onClick={() => { if (confirm('Delete this role?')) deleteMutation.mutate(role.id); }}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>

              {role.description && (
                <p className="text-sm text-slate-500 mb-3">{role.description}</p>
              )}

              <div className="flex items-center gap-4 text-sm text-slate-500 border-t border-slate-100 pt-3">
                <div className="flex items-center gap-1.5">
                  <Shield size={13} className="text-slate-400" />
                  <span>{role.permissions?.length || 0} permissions</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Users size={13} className="text-slate-400" />
                  <span>{role.userCount || 0} users</span>
                </div>
              </div>

              {role.permissions && role.permissions.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {role.permissions.slice(0, 6).map((p) => (
                    <span key={p.id} className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono">
                      {p.code}
                    </span>
                  ))}
                  {role.permissions.length > 6 && (
                    <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                      +{role.permissions.length - 6} more
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}

          {!isLoading && roleList.length === 0 && (
            <div className="col-span-3 empty-state card py-16">
              <Shield size={48} className="text-slate-200 mb-3" />
              <p className="text-slate-500">No roles defined yet</p>
              <button onClick={() => setShowModal(true)} className="btn-primary mt-4">
                <Plus size={16} /> Create Role
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
