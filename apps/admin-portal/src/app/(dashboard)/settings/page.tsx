'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { get, patch, post, uploadFile } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import { Palette, Bell, Shield, Building2, Save, Upload, X, Image, CheckCircle, XCircle, RefreshCw, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/auth';
import { cn, getErrorMessage } from '@/lib/utils';
import type { Tenant, NotificationPreferences } from '@flowtiq/shared-types';
import { registerWebPushToken } from '@/lib/webPush';

const TABS = [
  { key: 'branding', label: 'Branding', icon: Palette },
  { key: 'general', label: 'General', icon: Building2 },
  { key: 'notifications', label: 'Notifications', icon: Bell },
  { key: 'security', label: 'Security', icon: Shield },
] as const;

type LocalSettings = {
  timezone?: string;
  dateFormat?: string;
  notificationSettings?: {
    inApp: boolean;
    email: boolean;
    followUp: boolean;
    overdue: boolean;
    docs: boolean;
  };
};

const PUSH_PREFS = [
  { field: 'assignments' as const, label: 'Assignments', desc: 'Project, stage, sub-task, and follow-up assignments' },
  { field: 'statusUpdates' as const, label: 'Status Updates', desc: 'Stage and sub-task status changes on my projects' },
  { field: 'documentUploads' as const, label: 'Document Uploads', desc: 'Documents uploaded to my projects' },
  { field: 'followUpReminders' as const, label: 'Follow-up Reminders', desc: 'Due today and overdue follow-up alerts' },
] as const;

function PushStatus() {
  type Status = 'idle' | 'checking' | 'registered' | 'permission_denied' | 'unsupported' | 'error';
  const [status, setStatus] = useState<Status>('idle');
  const [isSendingTest, setIsSendingTest] = useState(false);

  async function handleSendTest() {
    setIsSendingTest(true);
    try {
      await post('/notifications/test-push', {});
      toast.success('Test notification sent — check your device!');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsSendingTest(false);
    }
  }

  useEffect(() => {
    if (!('Notification' in window)) { setStatus('unsupported'); return; }
    if (Notification.permission === 'denied') { setStatus('permission_denied'); return; }
    if (Notification.permission === 'granted') {
      // Permission already granted — safe to verify FCM token silently
      handleReconnect();
    }
    // If permission is 'default' (not yet asked), leave status as 'idle' — wait for user click
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleReconnect() {
    setStatus('checking');
    const result = await registerWebPushToken();
    setStatus(result);
    if (result === 'registered') toast.success('Push notifications connected');
    else if (result === 'permission_denied') toast.error('Notification permission denied — enable it in browser settings');
    else if (result === 'error') toast.error('Failed to connect push notifications');
  }

  const config: Record<Status, { icon: React.ReactNode; label: string; desc: string; color: string; bg: string }> = {
    idle:             { icon: <Bell size={16} />,        label: 'Unknown',           desc: 'Click Reconnect to check status',              color: '#64748b', bg: '#f1f5f9' },
    checking:         { icon: <RefreshCw size={16} className="animate-spin" />, label: 'Checking...', desc: 'Registering with Firebase...', color: '#6366f1', bg: '#eef2ff' },
    registered:       { icon: <CheckCircle size={16} />, label: 'Connected',         desc: 'Firebase push notifications are active',        color: '#16a34a', bg: '#f0fdf4' },
    permission_denied:{ icon: <XCircle size={16} />,     label: 'Permission Denied', desc: 'Allow notifications in browser site settings', color: '#dc2626', bg: '#fef2f2' },
    unsupported:      { icon: <XCircle size={16} />,     label: 'Not Supported',     desc: 'This browser does not support push notifications', color: '#d97706', bg: '#fffbeb' },
    error:            { icon: <XCircle size={16} />,     label: 'Not Connected',     desc: 'Firebase config may be missing — check Vercel env vars', color: '#dc2626', bg: '#fef2f2' },
  };

  const c = config[status];

  return (
    <div className="card">
      <div className="card-header"><h3>Push Notification Status</h3></div>
      <div className="card-body">
        <div className="flex items-center justify-between p-4 rounded-xl" style={{ background: c.bg }}>
          <div className="flex items-center gap-3">
            <span style={{ color: c.color }}>{c.icon}</span>
            <div>
              <p className="text-sm font-semibold" style={{ color: c.color }}>{c.label}</p>
              <p className="text-xs text-slate-500 mt-0.5">{c.desc}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {status === 'registered' && (
              <button
                onClick={handleSendTest}
                disabled={isSendingTest}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50 transition-colors"
              >
                <Send size={12} />
                {isSendingTest ? 'Sending...' : 'Send Test'}
              </button>
            )}
            <button
              onClick={handleReconnect}
              disabled={status === 'checking'}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              <RefreshCw size={12} />
              Reconnect
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PushNotificationPreferences({ qc }: { qc: ReturnType<typeof useQueryClient> }) {
  const { data: prefs, isLoading, isError } = useQuery<NotificationPreferences>({
    queryKey: ['notification-preferences'],
    queryFn: () => get<NotificationPreferences>('/users/notification-preferences'),
  });

  const [pendingField, setPendingField] = useState<keyof NotificationPreferences | null>(null);

  const mutation = useMutation({
    mutationFn: (update: Partial<NotificationPreferences>) =>
      patch<NotificationPreferences>('/users/notification-preferences', update),
    onMutate: async (update) => {
      // P16: Cancel in-flight queries, take a snapshot, then apply optimistic update.
      // Snapshot is restored on error to handle concurrent toggle reversions correctly.
      await qc.cancelQueries({ queryKey: ['notification-preferences'] });
      const previous = qc.getQueryData<NotificationPreferences>(['notification-preferences']);
      qc.setQueryData<NotificationPreferences>(['notification-preferences'], (old) =>
        old ? { ...old, ...update } : old
      );
      return { previous };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notification-preferences'] });
    },
    onError: (err, _update, context) => {
      if (context?.previous) {
        qc.setQueryData<NotificationPreferences>(['notification-preferences'], context.previous);
      }
      toast.error(getErrorMessage(err));
    },
    onSettled: () => setPendingField(null),
  });

  const handleToggle = (field: keyof NotificationPreferences, currentValue: boolean) => {
    setPendingField(field);
    mutation.mutate({ [field]: !currentValue });
  };

  return (
    <div className="card">
      <div className="card-header"><h3>Notification Preferences</h3></div>
      <div className="card-body space-y-4">
        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center justify-between p-4 border border-slate-100 rounded-xl animate-pulse">
                <div className="space-y-1.5">
                  <div className="h-4 w-32 bg-slate-200 rounded" />
                  <div className="h-3 w-48 bg-slate-100 rounded" />
                </div>
                <div className="w-11 h-6 bg-slate-200 rounded-full" />
              </div>
            ))}
          </div>
        )}
        {isError && (
          <p className="text-sm text-red-600 p-4 border border-red-100 rounded-xl bg-red-50">
            Failed to load notification preferences. Please refresh to retry.
          </p>
        )}
        {prefs && PUSH_PREFS.map(({ field, label, desc }) => (
          <div key={field} className="flex items-center justify-between p-4 border border-slate-100 rounded-xl">
            <div>
              <p className="font-medium text-slate-800">{label}</p>
              <p className="text-sm text-slate-500">{desc}</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={prefs[field]}
                disabled={pendingField === field}
                onChange={() => handleToggle(field, prefs[field])}
                className="sr-only peer"
              />
              <div className={cn(
                'w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[\'\'] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600',
                pendingField === field && 'opacity-50'
              )} />
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { tenant, user, setTenant } = useAuthStore();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<string>('branding');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  const { data: tenantData } = useQuery<Tenant>({
    queryKey: ['tenant', tenant?.id],
    queryFn: () => get<Tenant>(`/tenants/${tenant?.id}`),
    enabled: !!tenant?.id,
  });

  const currentTenant = tenantData || tenant;
  const branding = currentTenant?.branding as { primaryColor?: string; secondaryColor?: string; logoUrl?: string } | undefined;
  const tenantSettings = (currentTenant?.settings as unknown as LocalSettings) ?? {};

  // Branding state
  const [primaryColor, setPrimaryColor] = useState(branding?.primaryColor || '#ffffff');
  const [secondaryColor, setSecondaryColor] = useState(branding?.secondaryColor || '#000000');
  const [tenantName, setTenantName] = useState(currentTenant?.name || '');

  // General tab state
  const [timezone, setTimezone] = useState(tenantSettings.timezone || 'Asia/Kolkata');
  const [dateFormat, setDateFormat] = useState(tenantSettings.dateFormat || 'DD/MM/YYYY');

  // Notifications tab state
  const defaultNotifSettings = { inApp: true, email: true, followUp: true, overdue: true, docs: true };
  const [notifSettings, setNotifSettings] = useState(tenantSettings.notificationSettings ?? defaultNotifSettings);

  useEffect(() => {
    if (tenantData) {
      const b = tenantData.branding as { primaryColor?: string; secondaryColor?: string } | undefined;
      if (b?.primaryColor) setPrimaryColor(b.primaryColor);
      if (b?.secondaryColor) setSecondaryColor(b.secondaryColor);
      if (tenantData.name) setTenantName(tenantData.name);
      const s = (tenantData.settings as unknown as LocalSettings) ?? {};
      if (s.timezone) setTimezone(s.timezone);
      if (s.dateFormat) setDateFormat(s.dateFormat);
      if (s.notificationSettings) setNotifSettings(s.notificationSettings);
    }
  }, [tenantData]);

  // Apply primary color changes in real-time
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--brand-primary', primaryColor);
    root.style.setProperty('--brand-primary-hover', primaryColor);
    root.style.setProperty('--sidebar-active', primaryColor);
    root.style.setProperty('--sidebar-active-bg', `${primaryColor}28`);
    root.style.setProperty('--sidebar-active-border', primaryColor);
  }, [primaryColor]);

  // Apply secondary color to sidebar-bg in real-time
  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-bg', secondaryColor);
  }, [secondaryColor]);

  // ── Branding save — uses api.patch (not raw fetch) ──
  const saveBrandingMutation = useMutation({
    mutationFn: (data: object) => patch(`/tenants/${currentTenant?.id}/branding`, data),
    onSuccess: (response) => {
      toast.success('Branding saved');
      const updated = (response as { data?: Tenant })?.data;
      if (updated) {
        setTenant(updated);
        qc.setQueryData(['tenant', currentTenant?.id], updated);
      }
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  // ── General settings save ──
  const saveGeneralMutation = useMutation({
    mutationFn: () =>
      patch(`/tenants/${currentTenant?.id}`, {
        settings: { ...tenantSettings, timezone, dateFormat },
      }),
    onSuccess: () => toast.success('Settings saved'),
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  // ── Notification settings save ──
  const saveNotifMutation = useMutation({
    mutationFn: () =>
      patch(`/tenants/${currentTenant?.id}`, {
        settings: { ...tenantSettings, notificationSettings: notifSettings },
      }),
    onSuccess: () => toast.success('Notification settings saved'),
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const handleSaveBranding = () => {
    saveBrandingMutation.mutate({ name: tenantName, branding: { primaryColor, secondaryColor } });
  };

  const handleLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error('Logo must be under 2MB'); return; }

    const reader = new FileReader();
    reader.onload = (ev) => setLogoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);

    setIsUploadingLogo(true);
    try {
      const fd = new FormData();
      fd.append('logo', file);
      const result = await uploadFile<{ logoUrl: string }>(`/tenants/${currentTenant?.id}/logo`, fd);
      toast.success('Logo uploaded');
      if (result?.logoUrl && currentTenant) {
        const updatedTenant = { ...currentTenant, branding: { ...(currentTenant.branding as object), logoUrl: result.logoUrl } };
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

  // ── Remove logo — uses api.patch (not raw fetch) ──
  const handleRemoveLogo = async () => {
    try {
      const res = await patch(`/tenants/${currentTenant?.id}/branding`, { branding: { logoUrl: null } }) as { data?: Tenant };
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

  const currentLogoUrl = logoPreview || branding?.logoUrl || null;
  const isSuperAdmin = user?.isSuperAdmin;

  return (
    <>
      <Header title="Settings" subtitle="Configure your organization settings" />
      <div className="p-4 sm:p-6 animate-slide-in">
        <div className="flex flex-col md:flex-row gap-4 md:gap-6">
          {/* Tab nav */}
          <div className="md:w-48 md:flex-shrink-0">
            <div className="flex md:hidden gap-1 overflow-x-auto pb-1 scrollbar-none border-b border-slate-200">
              {TABS.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-2 text-sm font-medium whitespace-nowrap rounded-lg transition-colors flex-shrink-0',
                    activeTab === key ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-100'
                  )}
                >
                  <Icon size={15} />{label}
                </button>
              ))}
            </div>
            <nav className="hidden md:block space-y-0.5">
              {TABS.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors text-left',
                    activeTab === key ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-100'
                  )}
                >
                  <Icon size={16} />{label}
                </button>
              ))}
            </nav>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* ── BRANDING TAB ── */}
            {activeTab === 'branding' && (
              <div className="card">
                <div className="card-header"><h3>Branding & Theme</h3></div>
                <div className="card-body space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                    <div>
                      <label className="form-label">Organization Name</label>
                      <input className="form-input" value={tenantName} onChange={(e) => setTenantName(e.target.value)} placeholder="Organization name" />
                    </div>
                    <div>
                      <label className="form-label">Subdomain / Slug</label>
                      <input className="form-input" value={currentTenant?.slug || ''} disabled />
                      <p className="text-xs text-slate-400 mt-1">Contact support to change subdomain</p>
                    </div>
                  </div>

                  <div>
                    <label className="form-label">Logo</label>
                    <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/jpg,image/gif,image/webp,image/svg+xml" className="hidden" onChange={handleLogoFileChange} />
                    {currentLogoUrl ? (
                      <div className="border border-slate-200 rounded-xl p-4 flex items-center gap-4">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={currentLogoUrl} alt="Logo" className="h-14 max-w-[180px] object-contain rounded" />
                        <div className="flex flex-col gap-2">
                          <button onClick={() => fileInputRef.current?.click()} disabled={isUploadingLogo} className="btn-secondary text-xs flex items-center gap-1.5">
                            <Upload size={13} />{isUploadingLogo ? 'Uploading...' : 'Replace Logo'}
                          </button>
                          <button onClick={handleRemoveLogo} className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1.5">
                            <X size={13} /> Remove
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => fileInputRef.current?.click()} disabled={isUploadingLogo} className="w-full border-2 border-dashed border-slate-200 rounded-xl p-8 text-center hover:border-blue-300 hover:bg-blue-50/30 transition-colors group">
                        <Image size={32} className="mx-auto text-slate-300 group-hover:text-blue-400 mb-2" />
                        <p className="text-slate-500 text-sm font-medium">{isUploadingLogo ? 'Uploading...' : 'Click to upload logo'}</p>
                        <p className="text-xs text-slate-300 mt-1">PNG, JPG, SVG up to 2MB · Recommended: 200×60px</p>
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                    <div>
                      <label className="form-label">Primary Color</label>
                      <div className="flex items-center gap-3">
                        <input type="color" className="w-12 h-10 rounded border border-slate-200 cursor-pointer p-0.5" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} />
                        <input className="form-input flex-1 font-mono" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} />
                      </div>
                      <p className="text-xs text-slate-400 mt-1">Used for buttons, links, and accents</p>
                    </div>
                    <div>
                      <label className="form-label">Sidebar Background Color</label>
                      <div className="flex items-center gap-3">
                        <input type="color" className="w-12 h-10 rounded border border-slate-200 cursor-pointer p-0.5" value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} />
                        <input className="form-input flex-1 font-mono" value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} />
                      </div>
                      <p className="text-xs text-slate-400 mt-1">Controls the sidebar background color</p>
                    </div>
                  </div>

                  {/* Live preview */}
                  <div>
                    <label className="form-label">Live Preview</label>
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <div className="h-10 flex items-center gap-2 px-4" style={{ backgroundColor: secondaryColor }}>
                        <div className="w-6 h-6 rounded" style={{ backgroundColor: primaryColor }} />
                        <span className="text-white text-sm font-bold">{tenantName || 'Your Org'}</span>
                      </div>
                      <div className="p-4 bg-slate-50 space-y-2">
                        <button className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ backgroundColor: primaryColor }}>
                          Primary Button
                        </button>
                        <span className="ml-3 text-sm" style={{ color: primaryColor }}>Link color</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button onClick={handleSaveBranding} disabled={saveBrandingMutation.isPending} className="btn-primary">
                      <Save size={16} />{saveBrandingMutation.isPending ? 'Saving...' : 'Save Branding'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── GENERAL TAB ── */}
            {activeTab === 'general' && (
              <div className="card">
                <div className="card-header"><h3>General Settings</h3></div>
                <div className="card-body space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="form-label">Timezone</label>
                      <select
                        className="form-select"
                        value={timezone}
                        onChange={(e) => setTimezone(e.target.value)}
                      >
                        <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                        <option value="Asia/Dubai">Asia/Dubai (GST)</option>
                        <option value="Europe/London">Europe/London (GMT)</option>
                        <option value="America/New_York">America/New_York (EST)</option>
                      </select>
                    </div>
                    <div>
                      <label className="form-label">Date Format</label>
                      <select
                        className="form-select"
                        value={dateFormat}
                        onChange={(e) => setDateFormat(e.target.value)}
                      >
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
                    <button onClick={() => saveGeneralMutation.mutate()} disabled={saveGeneralMutation.isPending} className="btn-primary">
                      <Save size={16} />{saveGeneralMutation.isPending ? 'Saving...' : 'Save Settings'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── NOTIFICATIONS TAB ── */}
            {activeTab === 'notifications' && (
              <div className="space-y-4">
                {/* Tenant-level notification settings */}
                <div className="card">
                  <div className="card-header"><h3>Notification Settings</h3></div>
                  <div className="card-body space-y-4">
                    {(
                      [
                        { label: 'In-app Notifications', desc: 'Show notifications inside the application', key: 'inApp' },
                        { label: 'Email Notifications', desc: 'Send email for important updates', key: 'email' },
                        { label: 'Follow-up Reminders', desc: 'Remind users of upcoming follow-ups', key: 'followUp' },
                        { label: 'Overdue Alerts', desc: 'Alert for overdue tasks and follow-ups', key: 'overdue' },
                        { label: 'Document Notifications', desc: 'Notify on document uploads and replacements', key: 'docs' },
                      ] as const
                    ).map((item) => (
                      <div key={item.key} className="flex items-center justify-between p-4 border border-slate-100 rounded-xl">
                        <div>
                          <p className="font-medium text-slate-800">{item.label}</p>
                          <p className="text-sm text-slate-500">{item.desc}</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={notifSettings[item.key]}
                            onChange={(e) => setNotifSettings((prev) => ({ ...prev, [item.key]: e.target.checked }))}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600" />
                        </label>
                      </div>
                    ))}
                    <div className="flex justify-end">
                      <button onClick={() => saveNotifMutation.mutate()} disabled={saveNotifMutation.isPending} className="btn-primary">
                        <Save size={16} />{saveNotifMutation.isPending ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Push notification connection status */}
                <PushStatus />

                {/* User-level push notification preferences */}
                <PushNotificationPreferences qc={qc} />
              </div>
            )}

            {/* ── SECURITY TAB ── */}
            {activeTab === 'security' && (
              <div className="card">
                <div className="card-header"><h3>Security Settings</h3></div>
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
                        <span className={cn('badge text-xs', item.good ? 'badge-green' : 'badge-yellow')}>{item.status}</span>
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
