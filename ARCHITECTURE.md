# Flowtiq — Infrastructure & Architecture Document

**Version:** 1.0
**Last Updated:** June 2026
**Stack:** Next.js 14 · Express.js · Prisma · PostgreSQL · Cloudinary

---

## 1. High-Level Overview

Flowtiq is a multi-tenant enterprise project management platform. The infrastructure is split across three hosted services with clearly separated responsibilities:

| Layer | Technology | Host |
|---|---|---|
| Frontend | Next.js 14 (App Router) | Vercel |
| Backend API | Express.js (Node.js) | Railway |
| Database | PostgreSQL | Railway |
| File Storage | Cloudinary | Cloudinary CDN |

---

## 2. Architecture Block Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                          CLIENT BROWSER                             │
│                                                                     │
│   ┌──────────────┐   ┌───────────────┐   ┌─────────────────────┐   │
│   │   Zustand    │   │ React Query   │   │   Axios API Client  │   │
│   │  Auth Store  │   │  Cache Layer  │   │  + JWT interceptor  │   │
│   │  (persisted) │   │  (stale-while │   │  + 401 auto-refresh │   │
│   │              │   │   revalidate) │   │                     │   │
│   └──────┬───────┘   └───────────────┘   └──────────┬──────────┘   │
│          │                                           │              │
│     localStorage                            HTTPS requests          │
│   (accessToken,                             Authorization:          │
│    refreshToken,                            Bearer <token>          │
│    user, tenant)                                                     │
└──────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ HTTPS
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        VERCEL  (Frontend)                           │
│                                                                     │
│   Next.js 14 — App Router                                          │
│                                                                     │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │  middleware.ts  (Edge Runtime)                              │   │
│   │  — Reads token from localStorage (client-side redirect)    │   │
│   │  — Unauthenticated users → /login                          │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│   ┌──────────────────────────────────────────────────────────────┐  │
│   │  Pages (16 routes — all statically pre-rendered at build)   │  │
│   │                                                              │  │
│   │  /login         /dashboard      /projects                   │  │
│   │  /projects/[id] /follow-ups     /documents                  │  │
│   │  /users         /roles          /workflows                  │  │
│   │  /audit-logs    /notifications  /settings                   │  │
│   │  /reports       /tenants        /                           │  │
│   └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│   ┌──────────────────────────────────────────────────────────────┐  │
│   │  BrandingApplicator (client component)                      │  │
│   │  — Reads tenant.branding from Zustand on mount              │  │
│   │  — Sets CSS custom properties on <html>:                    │  │
│   │    --brand-primary, --sidebar-active, etc.                  │  │
│   └──────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ HTTPS (NEXT_PUBLIC_API_URL)
                                    │ All requests to /api/*
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      RAILWAY  (Backend API)                         │
│                      Express.js — Port 3001                         │
│                                                                     │
│   ┌──────────────────────────────────────────────────────────────┐  │
│   │  Global Middleware (runs on every request)                  │  │
│   │                                                              │  │
│   │  cors()      — Allow Vercel origin only                     │  │
│   │  helmet()    — Security headers                             │  │
│   │  morgan()    — Request logging                              │  │
│   │  json()      — Parse request body                           │  │
│   └──────────────────────────────────────────────────────────────┘  │
│                              │                                      │
│                              ▼                                      │
│   ┌──────────────────────────────────────────────────────────────┐  │
│   │  authenticate()  middleware                                  │  │
│   │                                                              │  │
│   │  1. Extract Bearer token from Authorization header          │  │
│   │  2. Verify JWT signature (JWT_SECRET)                       │  │
│   │  3. Decode payload → { userId, tenantId,                    │  │
│   │       isSuperAdmin, permissions[] }                         │  │
│   │  4. Attach to req.user                                      │  │
│   │  5. Rejected → 401 Unauthorized                             │  │
│   └──────────────────────────────────────────────────────────────┘  │
│                              │                                      │
│                              ▼                                      │
│   ┌──────────────────────────────────────────────────────────────┐  │
│   │  Route Handlers (12 routers)                                │  │
│   │                                                              │  │
│   │  POST /auth/login          — Issue access + refresh tokens  │  │
│   │  POST /auth/refresh        — Rotate access token on expiry  │  │
│   │  GET/POST /projects        — CRUD, scoped to tenantId       │  │
│   │  GET/POST /follow-ups      — Scoped + permission checked    │  │
│   │  GET/POST /documents       — Upload, version, download      │  │
│   │  GET/POST /users           — Tenant user management         │  │
│   │  GET/POST /roles           — RBAC role + permission CRUD    │  │
│   │  GET/POST /workflows       — Workflow template management   │  │
│   │  GET/POST /stages          — Project stage transitions      │  │
│   │  GET      /dashboard/stats — Aggregated stats + pipeline    │  │
│   │  GET      /audit-logs      — Immutable action history       │  │
│   │  GET/POST /notifications   — In-app notification system     │  │
│   │  GET/PATCH/DELETE /tenants — Super-admin + own-tenant       │  │
│   └──────────────────────────────────────────────────────────────┘  │
│                    │                          │                     │
│                    ▼                          ▼                     │
│          Prisma ORM Client              multer (file buffer)        │
│          (type-safe queries)            passed to Cloudinary SDK    │
└──────────────────────────────────────────────────────────────────────┘
              │                                      │
              │ TCP / SSL                            │ HTTPS
              ▼                                      ▼
┌──────────────────────────┐          ┌──────────────────────────────┐
│   RAILWAY — PostgreSQL   │          │   CLOUDINARY (File CDN)      │
│                          │          │                              │
│   17 Models:             │          │   Folder structure:          │
│                          │          │   /flowtiq/logos/:tenantId   │
│   Tenant                 │          │   /flowtiq/documents/        │
│   User                   │          │     :tenantId/:docId         │
│   RefreshToken           │          │                              │
│   Role                   │          │   Returns full CDN URL       │
│   Permission             │          │   stored in Postgres         │
│   RolePermission         │          │   (branding.logoUrl,         │
│   UserRole               │          │    document.fileUrl)         │
│   WorkflowTemplate       │          │                              │
│   Project                │          └──────────────────────────────┘
│   ProjectStage           │
│   StageHistory           │
│   FollowUp               │
│   FollowUpHistory        │
│   Document               │
│   DocumentVersion        │
│   AuditLog               │
│   Notification           │
│                          │
│   Row-level isolation:   │
│   Every table has        │
│   tenantId column.       │
│   All queries scoped     │
│   in Prisma where clause │
└──────────────────────────┘
```

---

## 3. Authentication & Token Flow

```
Browser                      API                        Postgres
  │                           │                             │
  │── POST /auth/login ───────►│                             │
  │   { email, password }     │── SELECT user WHERE email ──►│
  │                           │◄── user row ────────────────│
  │                           │   bcrypt.compare(password)  │
  │                           │   build JWT payload:        │
  │                           │   { userId, tenantId,       │
  │                           │     isSuperAdmin,           │
  │                           │     permissions[] }         │
  │                           │   sign accessToken (15min)  │
  │                           │   sign refreshToken (7d)    │
  │                           │── INSERT refreshToken ──────►│
  │◄── { accessToken,         │                             │
  │      refreshToken } ──────│                             │
  │                           │                             │
  │  Store in Zustand         │                             │
  │  (persisted localStorage) │                             │
  │                           │                             │
  │── Any API call ───────────►│                             │
  │   Authorization:          │  authenticate() middleware  │
  │   Bearer <accessToken>    │  verify + decode JWT        │
  │                           │  attach to req.user         │
  │                           │  (no DB hit on every call)  │
  │                           │                             │
  │◄── 401 Unauthorized ──────│  (token expired)            │
  │                           │                             │
  │  Axios interceptor:       │                             │
  │── POST /auth/refresh ─────►│                             │
  │   { refreshToken }        │── SELECT refreshToken ──────►│
  │                           │◄── valid row ───────────────│
  │                           │   issue new accessToken     │
  │◄── { accessToken } ───────│                             │
  │  Update Zustand store     │                             │
  │  Retry original request   │                             │
```

---

## 4. Multi-Tenancy Strategy

Every database table has a `tenantId` column. All Prisma queries include `where: { tenantId }` pulled from `req.user.tenantId` (decoded from JWT — never trusted from the request body).

```
JWT payload
  └── tenantId
        └── All Prisma queries
              ├── project.findMany({ where: { tenantId } })
              ├── followUp.count({ where: { tenantId } })
              ├── document.findMany({ where: { tenantId } })
              └── ...every model
```

Super admin (`isSuperAdmin: true`, `tenantId: null`) bypasses tenant scoping and can query across all tenants.

---

## 5. RBAC (Role-Based Access Control)

```
User ──── UserRole ──── Role ──── RolePermission ──── Permission
                                                       (e.g. projects:view_all,
                                                             projects:create,
                                                             followups:manage)

Permissions are loaded at login, packed into the JWT,
and checked in route handlers without a DB lookup per request.
```

---

## 6. File Upload Flow

```
Browser → multipart/form-data → API (multer buffers file in memory)
                                      │
                                      ▼
                              uploadToCloudinary()
                              (streams buffer via Cloudinary SDK)
                                      │
                                      ▼
                              Cloudinary CDN
                              returns { url }
                                      │
                                      ▼
                              URL saved to Postgres
                              (document.fileUrl or
                               tenant.branding.logoUrl)
                                      │
                                      ▼
                              Browser fetches file
                              directly from Cloudinary CDN
                              (API not in the path)
```

---

## 7. Branding / White-Label Flow

```
Tenant logs in
      │
      ▼
API returns tenant object with branding JSON
{ primaryColor, secondaryColor, logoUrl, theme }
      │
      ▼
Zustand auth store: setTenant(tenant)
      │
      ▼
BrandingApplicator (client component, runs on every page)
useEffect watches tenant → sets CSS custom properties:
  document.documentElement.style.setProperty('--brand-primary', ...)
  document.documentElement.style.setProperty('--sidebar-active', ...)
  document.documentElement.style.setProperty('--sidebar-active-bg', ...)
      │
      ▼
All Tailwind components using var(--brand-primary) update instantly.
No rebuild or redeployment required per tenant.
```

---

## 8. Deployment Pipeline

```
Developer
  │
  ├── git push origin main
  │         │
  │         ├──► GitHub
  │         │       │
  │         │       ├──► Vercel (auto-detect push)
  │         │       │    pnpm build → Next.js static export
  │         │       │    Deploy to global CDN
  │         │       │    Live at: flowtiq-admin.vercel.app
  │         │       │
  │         │       └──► Railway (auto-detect push)
  │         │            pnpm build → node dist/index.js
  │         │            Live at: flowtiq-api.railway.app
  │         │
  │         └── OR: npx vercel --prod  (manual trigger)
  │
  └── Database changes (schema only)
        pnpm db:migrate:prod
        (run manually — Railway does not auto-migrate)
```

---

## 9. Environment Variables

### Vercel (Frontend)
| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://flowtiq-api.railway.app` |

### Railway (API)
| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Sign access tokens (15 min) |
| `JWT_REFRESH_SECRET` | Sign refresh tokens (7 days) |
| `CLOUDINARY_CLOUD_NAME` | File storage account |
| `CLOUDINARY_API_KEY` | File storage credentials |
| `CLOUDINARY_API_SECRET` | File storage credentials |
| `CORS_ORIGIN` | `https://flowtiq-admin.vercel.app` |
| `PORT` | `3001` |
| `NODE_ENV` | `production` |

---

## 10. Render vs Railway — Platform History

The project originally had `render.yaml` configured for **Render** as the API host. At some point during active development sessions, **Railway** was used instead for deployments.

**Why Render was the original choice:**
- `render.yaml` exists in the repo root with full build + start commands
- Render has a native free tier (with cold starts after 15 min inactivity)
- Simple GitHub integration

**Why Railway ended up being used:**
- Railway has no cold starts (always-on within credit limit)
- Better developer UX — faster deploys, cleaner logs dashboard
- Managed PostgreSQL provisioned in the same project dashboard
- No sleep/wake cycle during active development

**Honest note:** The exact session where the switch from Render to Railway happened is outside the current context window — the switch was made in a prior session. Both platforms are viable. The `render.yaml` is still present and fully functional if you want to revert to Render.

**Current recommendation:**
- **Short term (development/demo):** Railway — no cold starts, good DX
- **Production with real clients:** Render paid tier ($7/mo, no cold starts) or DigitalOcean App Platform ($12/mo) — more predictable pricing than Railway's credit model

---

## 11. Why Changes Require Incognito to Verify

This is a **browser caching issue**, not a deployment issue.

**What happens:**

```
You push code
      │
      ▼
Vercel rebuilds (new JS chunk filenames via content hash)
e.g. chunks/8a1b25eb-NEW.js
      │
      ▼
Regular browser window
  — still has old HTML page cached
  — old HTML references old chunk filenames
  — browser serves old JS from cache
  — looks like nothing changed
      │
Incognito window
  — empty cache
  — fetches fresh HTML → references new chunk filenames
  — fetches new JS → sees updated code
```

**Permanent fix — just use hard refresh:**

```
Mac:    Cmd + Shift + R
Win:    Ctrl + Shift + R
```

This forces the browser to bypass cache and fetch fresh assets — no incognito needed.

If you want to force users to always get the latest version, add this to `next.config.js`:

```js
headers: async () => [
  {
    source: '/(.*)',
    headers: [{ key: 'Cache-Control', value: 'no-store' }],
  },
],
```

Note: This disables caching entirely and will make every page load slower. The hard refresh approach is better for development; the `Cache-Control` header is only needed if end users (not developers) are reporting stale pages.
