'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Eye, EyeOff, Building2, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';
import { registerPushTokenIfNative } from '@/lib/pushToken';
import { isNativeApp } from '@/lib/nativeBridge';

const loginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginForm = z.infer<typeof loginSchema>;

interface PublicTenantBranding {
  primaryColor?: string;
  logoUrl?: string;
  secondaryColor?: string;
}

interface PublicTenant {
  name: string;
  slug: string;
  branding?: PublicTenantBranding;
}

export default function LoginPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [publicTenant, setPublicTenant] = useState<PublicTenant | null>(null);

  // Load public tenant branding by hostname slug
  useEffect(() => {
    const slug = typeof window !== 'undefined'
      ? window.location.hostname.split('.')[0]
      : null;

    if (!slug || slug === 'localhost' || slug === '127') return;

    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    fetch(`${apiBase}/api/tenants/public?slug=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((body) => {
        if (body.success && body.data) {
          setPublicTenant(body.data as PublicTenant);
          // Apply brand color to CSS variable
          const primary = (body.data as PublicTenant).branding?.primaryColor;
          if (primary) {
            document.documentElement.style.setProperty('--brand-primary', primary);
          }
          // Update page title
          document.title = `${(body.data as PublicTenant).name} | Workflow Management`;
        }
      })
      .catch(() => {
        // Graceful degradation — keep defaults
      });
  }, []);

  const tenantName = publicTenant?.name ?? 'Flowtiq';
  const logoUrl = publicTenant?.branding?.logoUrl;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (form: LoginForm) => {
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', form);
      const { user, accessToken, refreshToken, tenant } = data.data;
      setAuth(user, accessToken, refreshToken, tenant);
      toast.success(`Welcome back, ${user.firstName}!`);
      // Story 3.3: send tokens to native Keychain when running inside the shell
      if (isNativeApp()) {
        window.NativeBridge!.postMessage(JSON.stringify({
          type: 'STORE_TOKENS',
          requestId: crypto.randomUUID(),
          payload: { accessToken, refreshToken, user, tenant }, // P18: include tenant so native shell can restore it
        }));
      }
      // Story 2.4: fire-and-forget push token registration
      registerPushTokenIfNative();
      router.push('/dashboard');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Invalid credentials';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const onForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) return;
    setForgotLoading(true);
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      await fetch(`${apiBase}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail }),
      });
      setForgotSent(true);
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel — tenant branding */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 p-12" style={{ backgroundColor: '#0d1b2e' }}>
        <div className="flex items-center gap-3">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={tenantName} className="h-10 max-w-[160px] object-contain" />
          ) : (
            <>
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                <Building2 className="w-6 h-6 text-white" />
              </div>
              <span className="text-xl font-bold text-white">{tenantName}</span>
            </>
          )}
        </div>

        <div>
          <div className="mb-8">
            <div className="flex gap-1 mb-6">
              {[0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-1.5 rounded-full flex-1"
                  style={{
                    backgroundColor: i < 2
                      ? 'var(--brand-primary)'
                      : i === 2
                      ? 'rgba(59,130,246,0.4)'
                      : 'rgba(255,255,255,0.1)',
                  }}
                />
              ))}
            </div>
            <p className="text-slate-400 text-sm">Project Progress</p>
          </div>

          <h1 className="text-4xl font-bold text-white mb-4 leading-tight">
            Manage your workflows<br />with precision
          </h1>
          <p className="text-slate-400 text-lg leading-relaxed">
            Track projects, manage follow-ups, upload documents, and collaborate with your team —
            all in one platform.
          </p>
        </div>

        <p className="text-slate-600 text-sm">
          Powered by Flowtiq &nbsp;&middot;&nbsp; &copy; {new Date().getFullYear()} All rights reserved.
        </p>
      </div>

      {/* Right panel — login form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-slate-50">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-10 lg:hidden">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={tenantName} className="h-9 max-w-[140px] object-contain" />
            ) : (
              <>
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: 'var(--brand-primary)' }}
                >
                  <Building2 className="w-6 h-6 text-white" />
                </div>
                <span className="text-xl font-bold text-slate-900">{tenantName}</span>
              </>
            )}
          </div>

          <div className="mb-8">
            <h2 className="text-3xl font-bold text-slate-900">Sign in</h2>
            <p className="text-slate-500 mt-2">Enter your credentials to access your account</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div>
              <label className="form-label">Email address</label>
              <input
                type="email"
                placeholder="you@company.com"
                className={cn('form-input', errors.email && 'border-red-400 focus:border-red-400 focus:ring-red-400/20')}
                {...register('email')}
              />
              {errors.email && <p className="form-error">{errors.email.message}</p>}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="form-label !mb-0">Password</label>
                <button
                  type="button"
                  onClick={() => { setShowForgot(true); setForgotSent(false); }}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  className={cn('form-input pr-10', errors.password && 'border-red-400')}
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && <p className="form-error">{errors.password.message}</p>}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3 text-base"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing in...
                </span>
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          <div className="mt-8 p-4 bg-blue-50 rounded-xl border border-blue-100">
            <p className="text-xs font-semibold text-blue-800 mb-2">Demo Credentials</p>
            <div className="space-y-1 text-xs text-blue-700">
              <p><span className="font-medium">Admin:</span> admin@vastudeep.com</p>
              <p><span className="font-medium">PM:</span> pm@vastudeep.com</p>
              <p><span className="font-medium">Password:</span> Admin@123</p>
            </div>
          </div>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgot && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setShowForgot(false)}
        >
          <div className="modal-content max-w-sm w-full" role="dialog" aria-modal="true" aria-labelledby="forgot-title">
            <div className="card-header">
              <h3 id="forgot-title" className="font-semibold text-slate-900">Reset your password</h3>
              <button onClick={() => setShowForgot(false)} className="btn-ghost p-1.5"><X size={18} /></button>
            </div>
            <div className="p-6">
              {forgotSent ? (
                <div className="text-center py-4">
                  <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-slate-800">Check your inbox.</p>
                  <p className="text-sm text-slate-500 mt-1">
                    If an account exists for <strong>{forgotEmail}</strong>, a reset link has been sent.
                  </p>
                  <button onClick={() => setShowForgot(false)} className="btn-primary mt-6 w-full">
                    Back to sign in
                  </button>
                </div>
              ) : (
                <form onSubmit={onForgotSubmit} className="space-y-4">
                  <p className="text-sm text-slate-500">
                    Enter your email and we will send a reset link. The link expires in 30 minutes.
                  </p>
                  <div>
                    <label className="form-label">Email address</label>
                    <input
                      type="email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="you@company.com"
                      className="form-input"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={forgotLoading}
                    className="btn-primary w-full"
                  >
                    {forgotLoading ? 'Sending...' : 'Send reset link'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
