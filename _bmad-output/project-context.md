---
project_name: 'Flowtiq'
user_name: 'Ajit'
date: '2026-06-19'
sections_completed: ['technology_stack', 'language_rules', 'framework_rules', 'testing_rules', 'quality_rules', 'workflow_rules', 'anti_patterns']
status: 'complete'
rule_count: 58
optimized_for_llm: true
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

### Monorepo
- Turborepo 2.0 + pnpm 8.15.0 (workspaces)
- Node.js >=18 (CI/Docker targets Node 20)
- TypeScript 5.4.0 (strict mode via shared tsconfig)

### Frontend — apps/admin-portal (port 3000)
- Next.js 14.1.4 — App Router, React Server Components disabled (all pages are 'use client')
- React 18.2.0
- Tailwind CSS 3.4.3
- Zustand 4.5.2 with `persist` middleware (localStorage key: `flowtiq-auth`)
- TanStack React Query 5.28.4
- React Hook Form 7.51.1 + Zod 3.22.4 + @hookform/resolvers 3.3.4
- Axios 1.6.8
- Lucide React 0.363.0 (icon library)
- react-hot-toast 2.4.1
- date-fns 3.6.0
- recharts 2.12.3
- clsx 2.1.0 + tailwind-merge 2.2.2

### Backend — services/api (port 3001)
- Express.js 4.18.3 + TypeScript
- Prisma ORM 5.11.0 + @prisma/client 5.11.0
- PostgreSQL (via Railway in prod; local via DATABASE_URL env var)
- jsonwebtoken 9.0.2 (access: 15min, refresh: 7d)
- bcryptjs 2.4.3
- Cloudinary 2.2.0 (file storage)
- multer 1.4.5-lts.1 (file upload middleware)
- Zod 3.22.4 (request validation)
- helmet 7.1.0, cors 2.8.5, express-rate-limit 7.2.0, morgan 1.10.0

### Testing
- E2E: @playwright/test 1.44.0 (apps/admin-portal)
- Unit/Integration: Jest 29.7.0 + Supertest 6.3.4 (services/api)

### Workspace Packages
- @flowtiq/shared-types — all TypeScript interfaces (import types from here, not locally)
- @flowtiq/database — Prisma schema + client + seed
- @flowtiq/permissions — RBAC definitions
- @flowtiq/auth — JWT utilities
- @flowtiq/api-client — type-safe API client (NOT used in admin-portal; portal uses @/lib/api.ts directly)

---

## Critical Implementation Rules

### Language-Specific Rules (TypeScript)

**Imports**
- Use path alias `@/*` for all imports within admin-portal (maps to `./src/*`)
- Import shared types exclusively from `@flowtiq/shared-types` — never redefine them locally
- Named imports only; no default exports from utility modules

**Type Casting**
- Cast `req` to `AuthRequest` (not `Request`) inside authenticated route handlers: `const authReq = req as AuthRequest`
- The RBAC middleware uses plain `string` type for permission codes — do NOT use the `PermissionCode` enum from shared-types in middleware (causes TS build failures)

**Error Handling**
- API routes: wrap all logic in try/catch, pass errors to `next(error)` — the global `errorHandler` middleware in `src/middleware/error.ts` handles the response
- Frontend: use `getErrorMessage(error)` from `@/lib/utils` to extract user-facing messages from AxiosError
- Never throw raw strings; always throw `Error` instances or pass to `next()`

**Async Patterns**
- All route handlers are `async` returning `Promise<void>`
- Use `Promise.all([...])` for parallel Prisma queries (e.g., `[data, total]` for paginated endpoints)
- Frontend data fetching: always use TanStack React Query — no raw `useEffect` + fetch patterns

**Null Safety**
- Prisma IDs use `cuid()` — always `string`, never `number`
- Optional fields in Prisma schema are `String?` — TypeScript sees them as `string | null`
- `tenantId` is `string | null` for super admin users (isSuperAdmin=true has tenantId=null)

### Framework-Specific Rules

**Next.js (App Router)**
- ALL page components must have `'use client'` at the top — this project does not use React Server Components
- Route groups: `(auth)` for login, `(dashboard)` for all protected pages
- Next.js rewrites proxy `/api/*` to the Express backend — never call the Express URL directly from frontend code; always use `/api/...` paths via the `@/lib/api.ts` helpers
- Path alias `@/*` → `./src/*` is configured in tsconfig; always use it
- Middleware (`src/middleware.ts`) does NOT enforce auth (localStorage is inaccessible in Edge runtime); auth redirect is handled client-side in layout

**State Management (Zustand)**
- Auth state lives in `useAuthStore` (`@/store/auth`). Access outside React components via `useAuthStore.getState()` (used in api.ts interceptors)
- Store is persisted to localStorage under key `flowtiq-auth`; hydration state tracked via `_hasHydrated` flag — check this before rendering auth-dependent UI
- Only add new slices if truly global; page-level state stays in component `useState`

**Data Fetching (TanStack React Query)**
- All server data must go through `useQuery` / `useMutation` — no direct API calls in event handlers except inside `mutate()` callbacks
- Use `refetchInterval: 30000` (30s) on dashboard, project list, project detail, and kanban queries; use `refetchInterval: 15000` (15s) on notifications
- Invalidate related queries after mutations: `queryClient.invalidateQueries({ queryKey: [...] })`
- Query keys should be arrays that include all filter parameters so cache is properly scoped

**API Client (admin-portal)**
- Use the typed helpers from `@/lib/api.ts`: `get<T>`, `post<T>`, `patch<T>`, `del<T>`, `uploadFile<T>`
- All helpers unwrap the `{ success, data }` envelope automatically — you receive `T` directly
- `uploadFile<T>` sets `Content-Type: multipart/form-data` automatically; do NOT set it manually
- Auto-refresh on 401 is handled by the axios interceptor — do not implement retry logic manually

**Forms (React Hook Form + Zod)**
- Always use `zodResolver` from `@hookform/resolvers/zod` — not manual validation
- Define Zod schema first, infer TypeScript type with `z.infer<typeof schema>`
- Use `react-hot-toast` (`toast.success` / `toast.error`) for mutation feedback — not inline error state

**Express API (Backend)**
- Apply `authenticate` middleware at the router level (`router.use(authenticate)`) then `requirePermission` / `requireAnyPermission` per-route
- All responses follow the envelope: `res.json({ success: true, data: ... })` or `res.status(4xx).json({ success: false, error: '...' })`
- Paginated endpoints return: `{ success: true, data: { items: [...], total, page, pageSize, totalPages } }`
- Always call `createAuditLog(...)` after successful write operations (create/update/delete)
- Multi-tenancy: scope ALL Prisma queries with `tenantId` unless `isSuperAdmin === true`

### Testing Rules

**E2E Tests (Playwright — admin-portal)**
- Config: `apps/admin-portal/playwright.config.ts`
- Auth setup: `e2e/auth.setup.ts` logs in once and saves state to `.auth/user.json` — all specs use `storageState` to skip login
- Spec files live in `apps/admin-portal/e2e/`; one file per feature area (e.g., `projects.spec.ts`, `follow-ups.spec.ts`)
- Stat cards use CSS class `.stat-card` — NOT `data-testid`; WorkflowCard uses `role="button"`; StageCard uses `button[aria-expanded]`
- When adding a new feature, add tests to the relevant existing spec file or create a new `<feature>.spec.ts`
- CI runs E2E against the Vercel prod URL on push to main (2-minute wait for deployment); local runs use BASE_URL=http://localhost:3000
- HTML5 drag-and-drop is unreliable in headless Chromium — skip or use `test.skip` for drag-drop assertions

**Unit/Integration Tests (Jest — services/api)**
- Config: `services/api` package scripts (`test`, `test:watch`, `test:coverage`)
- Use `supertest` for route integration tests
- Mock Prisma client — do not hit the real database in unit tests
- Test files co-located with source or in a `__tests__` folder within the package

**General**
- Do not add `data-testid` attributes arbitrarily — check existing test selectors first
- When fixing a selector, update the spec file to match the actual rendered HTML, not the other way around

### Code Quality & Style Rules

**File & Folder Naming**
- Files: kebab-case (e.g., `project-workflows.ts`, `follow-ups.spec.ts`)
- React components: PascalCase filename matching the exported component name (e.g., `ProjectProgress.tsx`)
- API route files: kebab-case matching the URL segment (e.g., `project-workflows.ts` → `/api/project-workflows`)

**Component Structure (admin-portal)**
- Sub-components defined in the same file as the page when used only there (e.g., `KanbanCard` inside `projects/page.tsx`)
- Extract to `src/components/` only when used across 2+ pages
- Shared layout components live in `src/components/layout/` (e.g., `Header`, `Sidebar`)
- `'use client'` directive required at the top of every component/page file

**CSS & Styling**
- Use `cn()` from `@/lib/utils` (clsx + tailwind-merge) for conditional class merging — never string concatenation
- Status badges: use `getStatusBadgeClass(status)` and `getPriorityBadgeClass(priority)` from `@/lib/utils` — returns CSS class strings like `badge-green`, `badge-red`
- Design tokens: navy sidebar `#0f172a`, white content area, primary blue `#3b82f6`
- No inline `style` objects for colors that can be expressed as Tailwind classes

**Date Formatting**
- Always use helpers from `@/lib/utils`: `formatDate()`, `formatDateTime()`, `formatRelative()`, `formatFollowUpDate()`
- Default date format is `dd MMM yyyy` (e.g., "19 Jun 2026")
- Never use `new Date().toLocaleDateString()` directly

**Code Comments**
- Section dividers use `// ── SectionName ─────` style (em-dash + dashes) for visual grouping in large files
- Only comment non-obvious logic; do not add JSDoc to every function

### Development Workflow Rules

**Local Development**
- Start both services: `pnpm dev` from repo root (runs API on :3001 + portal on :3000 via Turborepo)
- Database setup (first time): `pnpm db:setup` then `pnpm db:seed`
- Must run `pnpm db:generate` + `pnpm db:push` after any Prisma schema change before starting services

**Environment Variables**
- Frontend (admin-portal): `NEXT_PUBLIC_API_URL` — set to `http://localhost:3001` locally, Railway URL in prod
- Backend: `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `CORS_ORIGIN`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `SEED_SECRET`
- Never commit `.env` files; use `.env.example` as reference

**Git & Branches**
- Main branch: `main` — auto-deploys to Vercel (frontend) and Railway (backend)
- Feature branches off `main`; PR into `main`
- CI on PRs: type-check only; CI on push to main: type-check + E2E tests against prod

**Deployment**
- Frontend: Vercel auto-deploy on push to main; config in `apps/admin-portal/vercel.json`
- Backend: Railway via Dockerfile at repo root; `start.sh` runs `prisma db push` then starts node
- Prisma `binaryTargets` must include `"debian-openssl-3.0.x"` for Railway (Docker) compatibility
- Seed in prod: `POST /api/seed` with header `x-seed-secret: <SEED_SECRET>`

**Adding New API Routes**
1. Create `services/api/src/routes/<name>.ts`
2. Register router in `services/api/src/app.ts` under `/api/<name>`
3. Add required permissions to seed data if new permissions are introduced
4. Add frontend API calls in `apps/admin-portal/src/lib/api.ts` or inline in the page

### Critical Don't-Miss Rules

**Stage & Workflow Data Model (Most Common Source of Bugs)**
- Seeded workflow stages use `{ stageKey, stageName, order }` shape — NOT `{ key, name, order }`. Code must handle both formats
- The completed stage key is `"completed_stage"` — NOT `"completed"`
- `ProjectStage` records are auto-created by `GET /api/projects/:id` if missing (seeded projects bypass POST creation logic)
- `stageHistory` in Prisma is remapped to `history` in API responses — frontend must use `history`, not `stageHistory`
- `assignedToIds` on ProjectStage is `String[]` (array of user IDs), defaulting to `[]`
- `Document.projectWorkflowId` links documents to a specific workflow — used for stage-grouped document viewing

**Multi-Tenancy (Never Skip)**
- Every Prisma query on a tenant-scoped model MUST include `tenantId` in the `where` clause
- Super admin (`isSuperAdmin: true`) has `tenantId: null` — skip tenantId filter for super admin queries
- JWT payload carries `tenantId`, `userId`, `isSuperAdmin`, and `permissions[]` — always destructure from `authReq.user`

**RBAC & Permissions**
- Permission codes are plain strings (e.g., `'projects:view'`) — NEVER use the `PermissionCode` enum in middleware
- `isSuperAdmin` bypasses all permission checks — both `requirePermission` and `requireAnyPermission` short-circuit for super admin
- Sidebar nav items are filtered by `user.permissions` on the frontend — adding a new nav item requires a corresponding permission check
- Audit logs route uses `reports:view` permission

**Auth Flow**
- Access token expires in 15 minutes; refresh token in 7 days
- 401 responses trigger automatic token refresh via axios interceptor — a queue prevents multiple simultaneous refresh calls
- On refresh failure: queue is cleared, user is logged out, redirected to `/login`
- Zustand `_hasHydrated` must be `true` before rendering auth-dependent UI to avoid flicker

**CORS**
- Backend accepts all `*.vercel.app` origins dynamically (checked via `origin.endsWith('.vercel.app')`)
- `CORS_ORIGIN` env var is comma-separated for multiple explicit origins

**Prisma Schema**
- Client output path: `packages/database/node_modules/.prisma/client`
- `binaryTargets: ["native", "debian-openssl-3.0.x"]` required — do not remove
- `Project` has soft-delete: `deletedAt DateTime?`; default list queries exclude `deletedAt != null` AND `status = 'cancelled'`
- `User.isActive` defaults to `true`; GET /users defaults to active-only unless `showInactive=true` query param passed

**Anti-Patterns to Avoid**
- Do NOT call the Railway API URL directly from frontend — always use the Next.js rewrite (`/api/...`)
- Do NOT use `PermissionCode` enum type in `rbac.ts` middleware — use raw `string`
- Do NOT define TypeScript interfaces that already exist in `@flowtiq/shared-types`
- Do NOT add `refetchInterval` to queries that don't need real-time updates (e.g., roles, workflows — these are rarely changing)
- Do NOT use `new Date().toLocaleDateString()` — use `formatDate()` from `@/lib/utils`
- Do NOT use `console.log` in production code; use `next()` with Error objects in Express

---

## Usage Guidelines

**For AI Agents:**
- Read this file before implementing any code in this project
- Follow ALL rules exactly as documented — especially the Critical Don't-Miss Rules section
- When in doubt about a pattern, prefer the approach already used in the existing codebase
- Update this file if new patterns emerge during implementation

**For Humans:**
- Keep this file lean and focused on agent needs — remove rules that become obvious over time
- Update when the technology stack changes (package versions, new libraries, removed packages)
- Review quarterly for outdated or redundant rules

_Last Updated: 2026-06-19_
