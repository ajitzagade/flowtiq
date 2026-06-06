'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { get, uploadFile } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import { Palette, Bell, Shield, Building2, Save, Upload, X, Image } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/auth';
import { cn, getErrorMessage } from '@/lib/utils';
import type { Tenant } from '@flowtiq/shared-types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const TABS = [
  { key: 'branding', label: 'Branding', icon: Palette },
  { key: 'general', label: 'General', icon: Building2 },
  { key: 'notifications', label: 'Notifications', icon: Bell },
  { key: 'security', label: 'Security', icon: Shield },
] as const;

export default function SettingsPage() {
  const { tenant, user, setTenant } = useAuthStore();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<string>('branding');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  const { data: tenantData, refetch: refetchTenant } = useQuery<Tenant>({
    queryKey: ['tenant', tenant?.id],
    queryFn: () => get<Tenant>(`/tenants/${tenant?.id}`),
    enabled: !!tenant?.id,
  });

  const currentTenant = tenantData || tenant;
  const branding = currentTenant?.branding as { primaryColor?: string; secondaryColor?: string; logoUrl?: string } | undefined;

  // Branding state — sync when tenant data loads
  const [primaryColor, setPrimaryColor] = useState(branding?.primaryColor || '#3b82f6');
  const [secondaryColor, setSecondaryColor] = useState(branding?.secondaryColor || '#64748b');
  const [tenantName, setTenantName] = useState(currentTenant?.name || '');

  useEffect(() => {
    if (tenantData) {
      const b = tenantData.branding as { primaryColor?: string; secondaryColor?: string } | undefined;
      if (b?.primaryColor) setPrimaryColor(b.primaryColor);
      if (b?.secondaryColor) setSecondaryColor(b.secondaryColor);
      if (tenantData.name) setTenantName(tenantData.name);
    }
  }, [tenantData]);

  // Apply color changes to CSS variables in real-time as the user adjusts them
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--brand-primary', primaryColor);
    root.style.setProperty('--brand-primary-hover', primaryColor);
    root.style.setProperty('--sidebar-active', primaryColor);
    root.style.setProperty('--sidebar-active-bg', `${primaryColor}28`);
    root.style.setProperty('--sidebar-active-border', primaryColor);
  }, [primaryColor]);

  const saveMutation = useMutation({
    mutationFn: (data: object) =>
      fetch(`${API_URL}/api/tenants/${currentTenant?.id}/branding`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${useAuthStore.getState().accessToken}`,
        },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: (response) => {
      toast.success('Branding saved');
      // Use the PATCH response directly — GET /tenants/:id was previously super-admin only
      if (response?.data) {
        setTenant(response.data);
        qc.setQueryData(['tenant', currentTenant?.id], response.data);
      }
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const handleSaveBranding = () => {
    saveMutation.mutate({ name: tenantName, branding: { primaryColor, secondaryColor } });
  };

  const handleLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error('Logo must be under 2MB');
      return;
    }

    // Preview
    const reader = new FileReader();
    reader.onload = (ev) => setLogoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);

    // Upload
    setIsUploadingLogo(true);
    try {
      const fd = new FormData();
      fd.append('logo', file);
      const result = await uploadFile<{ logoUrl: string }>(`/tenants/${currentTenant?.id}/logo`, fd);
      toast.success('Logo uploaded');
      // Merge the new logoUrl into the tenant store without a refetch
      if (result?.logoUrl && currentTenant) {
        const updatedTenant = {
          ...currentTenant,
          branding: { ...(currentTenant.branding as object), logoUrl: result.logoUrl },
        };
        setTenant(updatedTenant as unknown as typeof currentTenant);
        qc.setQueryData(['tenant', currentTenant.id], updatedTenant);
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
      setLogoPreview(null);
    } finally {
      setIsUploadingLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveLogo = async () => {
    try {
      const res = await fetch(`${API_URL}/api/tenants/${currentTenant?.id}/branding`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${useAuthStore.getState().accessToken}`,
        },
        body: JSON.stringify({ branding: { logoUrl: null } }),
      }).then((r) => r.json());
      setLogoPreview(null);
      toast.success('Logo removed');
      if (res?.data && currentTenant) {
        setTenant(res.data);
        qc.setQueryData(['tenant', currentTenant.id], res.data);
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  // logoUrl is a full Cloudinary URL — do NOT prepend API_URL
  const currentLogoUrl = logoPreview || branding?.logoUrl || null;

  const isSuperAdmin = user?.isSuperAdmin;

  return (
    <>
      <Header title="Settings" subtitle="Configure your organization settings" />
      <div className="p-4 sm:p-6 animate-slide-in">
        {/* Mobile: horizontal scrollable tab bar; Desktop: vertical sidebar */}
        <div className="flex flex-col md:flex-row gap-4 md:gap-6">
          {/* Tab nav */}
          <div className="md:w-48 md:flex-shrink-0">
            {/* Mobile: horizontal scroll tabs */}
            <div className="flex md:hidden gap-1 overflow-x-auto pb-1 scrollbar-none border-b border-slate-200">
              {TABS.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-2 text-sm font-medium whitespace-nowrap rounded-lg transition-colors flex-shrink-0',
                    activeTab === key
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-slate-600 hover:bg-slate-100'
                  )}
                >
                  <Icon size={15} />
                  {label}
                </button>
              ))}
            </div>
            {/* Desktop: vertical list */}
            <nav className="hidden md:block space-y-0.5">
              {TABS.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors text-left',
                    activeTab === key
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-slate-600 hover:bg-slate-100'
                  )}
                >
                  <Icon size={16} />
                  {label}
                </button>
              ))}
            </nav>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {activeTab === 'branding' && (
              <div className="card">
                <div className="card-header">
                  <h3>Branding & Theme</h3>
                </div>
                <div className="card-body space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                    <div>
                      <label className="form-label">Organization Name</label>
                      <input
                        className="form-input"
                        value={tenantName}
                        onChange={(e) => setTenantName(e.target.value)}
                        placeholder="Organization name"
                      />
                    </div>
                    <div>
                      <label className="form-label">Subdomain / Slug</label>
                      <input className="form-input" value={currentTenant?.slug || ''} disabled />
                      <p className="text-xs text-slate-400 mt-1">Contact support to change subdomain</p>
                    </div>
                  </div>

                  <div>
                    <label className="form-label">Logo</label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/gif,image/webp,image/svg+xml"
                      className="hidden"
                      onChange={handleLogoFileChange}
                    />
                    {currentLogoUrl ? (
                      <div className="border border-slate-200 rounded-xl p-4 flex items-center gap-4">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={currentLogoUrl} alt="Logo" className="h-14 max-w-[180px] object-contain rounded" />
                        <div className="flex flex-col gap-2">
                          <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isUploadingLogo}
                            className="btn-secondary text-xs flex items-center gap-1.5"
                          >
                            <Upload size={13} />
                            {isUploadingLogo ? 'Uploading...' : 'Replace Logo'}
                          </button>
                          <button
                            onClick={handleRemoveLogo}
                            className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1.5"
                          >
                            <X size={13} /> Remove
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploadingLogo}
                        className="w-full border-2 border-dashed border-slate-200 rounded-xl p-8 text-center hover:border-blue-300 hover:bg-blue-50/30 transition-colors group"
                      >
                        <Image size={32} className="mx-auto text-slate-300 group-hover:text-blue-400 mb-2" />
                        <p className="text-slate-500 text-sm font-medium">
                          {isUploadingLogo ? 'Uploading...' : 'Click to upload logo'}
                        </p>
                        <p className="text-xs text-slate-300 mt-1">PNG, JPG, SVG up to 2MB · Recommended: 200×60px</p>
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                    <div>
                      <label className="form-label">Primary Color</label>
                      <div className="flex items-center gap-3">
                        <input
                          type="color"
                          className="w-12 h-10 rounded border border-slate-200 cursor-pointer p-0.5"
                          value={primaryColor}
                          onChange={(e) => setPrimaryColor(e.target.value)}
                        />
                        <input
                          className="form-input flex-1 font-mono"
                          value={primaryColor}
                          onChange={(e) => setPrimaryColor(e.target.value)}
                        />
                      </div>
                      <p className="text-xs text-slate-400 mt-1">Used for buttons, links, and accents</p>
                    </div>

                    <div>
                      <label className="form-label">Secondary Color</label>
                      <div className="flex items-center gap-3">
                        <input
                          type="color"
                          className="w-12 h-10 rounded border border-slate-200 cursor-pointer p-0.5"
                          value={secondaryColor}
                          onChange={(e) => setSecondaryColor(e.target.value)}
                        />
                        <input
                          className="form-input flex-1 font-mono"
                          value={secondaryColor}
                          onChange={(e) => setSecondaryColor(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Live preview */}
                  <div>
                    <label className="form-label">Live Preview</label>
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <div className="h-10 flex items-center gap-2 px-4" style={{ backgroundColor: '#0f172a' }}>
                        <div className="w-6 h-6 rounded" style={{ backgroundColor: primaryColor }} />
                        <span className="text-white text-sm font-bold">{tenantName || 'Your Org'}</span>
                      </div>
                      <div className="p-4 bg-slate-50 space-y-2">
                        <button
                          className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                          style={{ backgroundColor: primaryColor }}
                        >
                          Primary Button
                        </button>
                        <span className="ml-3 text-sm" style={{ color: primaryColor }}>Link color</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button onClick={handleSaveBranding} disabled={saveMutation.isPending} className="btn-primary">
                      <Save size={16} />
                      {saveMutation.isPending ? 'Saving...' : 'Save Branding'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'general' && (
              <div className="card">
                <div className="card-header">
                  <h3>General Settings</h3>
                </div>
                <div className="card-body space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="form-label">Timezone</label>
                      <select className="form-select">
                        <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                        <option value="Asia/Dubai">Asia/Dubai (GST)</option>
                        <option value="Europe/London">Europe/London (GMT)</option>
                        <option value="America/New_York">America/New_York (EST)</option>
                      </select>
                    </div>
                    <div>
                      <label className="form-label">Date Format</label>
                      <select className="form-select">
                        <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                        <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                        <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="form-label">Subscription Plan</label>
                    <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                      <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                        <Shield size={16} className="text-blue-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-800 capitalize">{currentTenant?.subscriptionPlan} Plan</p>
                        <p className="text-xs text-slate-400">Contact sales to upgrade your plan</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button className="btn-primary">
                      <Save size={16} /> Save Settings
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'notifications' && (
              <div className="card">
                <div className="card-header">
                  <h3>Notification Settings</h3>
                </div>
                <div className="card-body space-y-4">
                  {[
                    { label: 'In-app Notifications', desc: 'Show notifications inside the application', key: 'inApp' },
                    { label: 'Email Notifications', desc: 'Send email for important updates', key: 'email' },
                    { label: 'Follow-up Reminders', desc: 'Remind users of upcoming follow-ups', key: 'followUp' },
                    { label: 'Overdue Alerts', desc: 'Alert for overdue tasks and follow-ups', key: 'overdue' },
                    { label: 'Document Notifications', desc: 'Notify on document uploads and replacements', key: 'docs' },
                  ].map((item) => (
                    <div key={item.key} className="flex items-center justify-between p-4 border border-slate-100 rounded-xl">
                      <div>
                        <p className="font-medium text-slate-800">{item.label}</p>
                        <p className="text-sm text-slate-500">{item.desc}</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" defaultChecked className="sr-only peer" />
                        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600" />
                      </label>
                    </div>
                  ))}
                  <div className="flex justify-end">
                    <button className="btn-primary"><Save size={16} /> Save</button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'security' && (
              <div className="card">
                <div className="card-header">
                  <h3>Security Settings</h3>
                </div>
                <div className="card-body space-y-5">
                  <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl">
                    <p className="text-sm font-medium text-emerald-800">Security Status: Good</p>
                    <p className="text-xs text-emerald-600 mt-0.5">All security features are properly configured</p>
                  </div>
                  <div className="space-y-3">
                    {[
                      { label: 'JWT Authentication', status: 'Enabled', good: true },
                      { label: 'Password Hashing (bcrypt)', status: 'Active', good: true },
                      { label: 'Rate Limiting', status: 'Enabled', good: true },
                      { label: 'Audit Logging', status: 'Active', good: true },
                      { label: 'Two-Factor Authentication', status: 'Not configured', good: false },
                    ].map((item) => (
                      <div key={item.label} className="flex items-center justify-between p-3 border border-slate-100 rounded-lg">
                        <span className="text-sm text-slate-700">{item.label}</span>
                        <span className={cn('badge text-xs', item.good ? 'badge-green' : 'badge-yellow')}>
                          {item.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
