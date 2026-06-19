---
epicId: 0
storyId: '00-05'
title: 'Login — Tenant Branding + Forgot Password Flow'
status: ready
priority: high
estimate: 3
dependencies: []
---

# Story 0.5 — Login: Tenant Branding + Forgot Password

## Story

**As a** tenant user arriving at the login page,
**I want** to see my organisation's name and brand colours instead of the generic "Flowtiq" branding, and to have a "Forgot password?" link that works,
**so that** the portal feels like it belongs to my organisation and I can recover access without contacting an admin.

---

## Context

Two issues in `apps/admin-portal/src/app/(auth)/login/page.tsx`:

- **F-01**: The left panel hardcodes the string "Flowtiq" and a `<Layers>` icon. For white-label, this must use `tenant.name` and `tenant.branding.logoUrl`. The tenant is identified by subdomain/hostname at load time.
- **F-18**: No "Forgot password?" link exists anywhere. Admins must reset passwords via the API manually. A password reset flow is required for the commercial launch with Vastudeep Associates.

The `key-login.html` mockup shows both resolved. The app/layout.tsx metadata title is also hardcoded as "Flowtiq | Workflow Management" (F-28) — fix that here too.

A public tenant endpoint must exist or be created: `GET /api/public/tenant?slug={slug}` that returns `{ name, branding: { primaryColor, logoUrl } }` without authentication. Check if this endpoint already exists before creating it.

---

## Acceptance Criteria

### AC-1: Login page left panel uses tenant branding

**Given** the login page loads (unauthenticated, no token),
**When** the page mounts,
**Then** a call is made to the public tenant endpoint using the hostname slug (e.g. `vastudeep` from `vastudeep.flowtiq.app`, or `localhost` in dev → fallback to default).
**And** the left panel displays `tenant.name` instead of the hardcoded string "Flowtiq".
**And** if `tenant.branding.logoUrl` is set, the logo `<img>` renders with `alt={tenant.name}` and `className="h-10 max-w-[160px] object-contain"`.
**And** if no `logoUrl` is set, a generic icon (`<Building2>` from lucide-react) renders instead.
**And** the tagline below the logo reads "Powered by Flowtiq" in `text-slate-400 text-xs`.
**And** if the public API call fails (network error, unknown slug), the panel falls back to showing "Flowtiq" and the default icon — no error is thrown to the user.

### AC-2: Left panel stat numbers are dynamic (not hardcoded)

**Given** the public tenant summary API returns stats,
**When** the login page left panel renders,
**Then** the three stats (Active Projects, Follow-ups Due, Documents) come from the API response.
**And** if the API does not yet return these fields, the stat numbers are hidden entirely rather than showing stale hardcoded values (24, 8, 142).
**And** the stat section is omitted (not rendered as zeros) when data is unavailable.

### AC-3: Forgot password link appears on login form

**Given** the login page password field,
**When** the form renders,
**Then** a "Forgot password?" link appears to the right of the password label (or below the field).
**And** clicking "Forgot password?" opens a modal (or inline section) with a single email input and a "Send reset link" button.
**And** the modal/section heading is "Reset your password".
**And** the sub-text reads: "Enter your email and we will send a reset link. The link expires in 30 minutes."

### AC-4: Forgot password form submits to the API

**Given** the forgot password modal is open,
**When** the user enters a valid email and clicks "Send reset link",
**Then** `POST /api/auth/forgot-password` is called with `{ email }`.
**And** on success (any 2xx), the modal shows a confirmation message: "Check your inbox. If an account exists for {email}, a reset link has been sent." — regardless of whether the email exists (security: do not enumerate accounts).
**And** on network error, a toast shows "Something went wrong. Please try again."
**And** the button is disabled while the request is in flight.

**Note:** If `POST /api/auth/forgot-password` does not exist in the backend yet, create a stub route that returns `200 OK` with a success message (the actual email send is a future story). The AC must be wired end-to-end even if the email is not delivered yet.

### AC-5: Browser tab title is tenant-aware

**Given** `apps/admin-portal/src/app/layout.tsx`,
**When** the page loads,
**Then** the `<title>` tag reads `{tenant.name} | Workflow Management` instead of `Flowtiq | Workflow Management`.
**And** because Next.js `metadata` is static at build time, use a `<title>` tag via `useEffect` on the client for the tenant name, OR use `generateMetadata` with the hostname in the server layout.
**And** the fallback title (when tenant cannot be resolved) remains "Flowtiq | Workflow Management".

---

## Technical Notes

- Public tenant endpoint: check `services/api/src/routes/tenants.ts` for an existing unauthenticated route. If absent, add `GET /api/public/tenant` (no auth middleware) that looks up tenant by slug from query param, returns only safe public fields.
- Hostname slug parsing: `window.location.hostname.split('.')[0]` gives `vastudeep` from `vastudeep.flowtiq.app`. On `localhost`, return `null` → use dev default.
- Forgot password route stub: `POST /api/auth/forgot-password` → log the email + return `{ message: 'If an account exists, a reset link has been sent.' }`. Full email sending is out of scope for this story.
- The login page is in `(auth)` route group which does NOT use the dashboard layout — `BrandingApplicator` is not available. Apply tenant primary colour directly via `document.documentElement.style.setProperty('--brand-primary', tenant.branding.primaryColor)` in a `useEffect` on the login page.

---

## Files to Change

- `apps/admin-portal/src/app/(auth)/login/page.tsx` — AC-1, AC-2, AC-3, AC-4
- `apps/admin-portal/src/app/layout.tsx` — AC-5
- `services/api/src/routes/tenants.ts` (or new `public.ts`) — public tenant endpoint (AC-1, AC-2)
- `services/api/src/app.ts` — register new public route without auth middleware (if new file)

---

## Reference

- `key-login.html` mockup — visual reference for both panels
- `.decision-log.md` — F-01, F-18, F-28, D-06
