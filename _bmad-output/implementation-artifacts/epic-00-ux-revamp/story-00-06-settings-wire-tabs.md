---
epicId: 0
storyId: '00-06'
title: 'Settings — Wire General + Notifications Tabs, Fix secondaryColor, Fix Raw Fetch'
status: ready
priority: medium
estimate: 3
dependencies: []
---

# Story 0.6 — Settings: Wire Tabs + secondaryColor + Auth Fix

## Story

**As an** admin configuring the portal,
**I want** the General and Notifications settings tabs to actually save, the secondary colour to visibly affect the UI, and branding changes to survive token expiry,
**so that** Settings is a trustworthy place where what I configure takes effect.

---

## Context

Four issues in `apps/admin-portal/src/app/(dashboard)/settings/page.tsx` and `apps/admin-portal/src/components/BrandingApplicator.tsx`:

- **F-21**: General tab (timezone, date format) and Notifications tab (5 toggles) are full UI stubs — no state binding, no API calls. Save buttons exist but do nothing.
- **F-22**: `secondaryColor` is collected, saved to the DB via the branding PATCH, but `BrandingApplicator.tsx` never reads or applies it — dead setting.
- **F-16 / F-32**: Both `handleSaveBranding` and `handleRemoveLogo` use raw `fetch()` with manually constructed `Authorization` headers, bypassing the axios interceptor that handles 401/token refresh. Silent auth failure on token expiry.

---

## Acceptance Criteria

### AC-1: General tab timezone and date format are saved

**Given** the user is on Settings → General,
**When** they select a timezone or date format and click "Save Settings",
**Then** `PATCH /api/tenants/:id` is called with `{ timezone, dateFormat }`.
**And** on success, a toast "Settings saved" appears.
**And** the selected values are pre-populated from `currentTenant.timezone` and `currentTenant.dateFormat` when the tab opens.
**And** the `<select>` elements are controlled (bound to state, not uncontrolled).

**Note:** If `Tenant` model does not yet have `timezone`/`dateFormat` fields, add them to the Prisma schema as nullable strings with no migration (just `prisma db push`) before wiring the UI. Defaults: `timezone = 'Asia/Kolkata'`, `dateFormat = 'DD/MM/YYYY'`.

### AC-2: Notifications tab toggles are saved

**Given** the user is on Settings → Notifications,
**When** they toggle any of the 5 notification switches and click "Save",
**Then** `PATCH /api/tenants/:id` is called with `{ notificationSettings: { inApp, email, followUp, overdue, docs } }`.
**And** on success, a toast "Notification settings saved" appears.
**And** each toggle is a controlled `<input type="checkbox">` bound to state (not `defaultChecked`).
**And** initial values are loaded from `currentTenant.notificationSettings` (or all `true` as defaults if the field does not exist yet).

### AC-3: secondaryColor is applied to a visible CSS variable

**Given** a tenant has `branding.secondaryColor` set,
**When** `BrandingApplicator` runs after login,
**Then** `--sidebar-bg` is set to `branding.secondaryColor` (making the sidebar background tenant-configurable for the first time).
**And** `BrandingApplicator.tsx` reads `branding.secondaryColor` and calls `root.style.setProperty('--sidebar-bg', secondaryColor)` when it is present.
**And** the Settings Branding tab live preview updates to show the sidebar preview colour changing in real time as the user adjusts the secondary colour picker.
**And** the label for the secondary colour field is updated from "Secondary Color" to "Sidebar Background Color" to accurately describe its effect.

### AC-4: Branding save uses `api.patch()` not raw `fetch()`

**Given** `settings/page.tsx` `handleSaveBranding` and `handleRemoveLogo` functions,
**When** the developer implements this story,
**Then** both functions are migrated to use `api.patch(...)` from `@/lib/api` (the axios instance that includes the 401 interceptor and auto-refresh logic).
**And** the raw `fetch()` calls with manual `Authorization` headers at lines 65–72 and 129–136 are removed.
**And** the `API_URL` constant at line 13 is no longer needed for these calls and can be removed if unused elsewhere.
**And** the `saveMutation` `mutationFn` is updated accordingly.

---

## Technical Notes

- `api.patch` signature: `api.patch('/tenants/:id/branding', payload)` — check the existing route definition in `services/api/src/routes/tenants.ts` to confirm the path. The axios instance in `@/lib/api` has the base URL already set.
- For General/Notifications tabs: reuse the same `useMutation` + `toast` pattern already used in the Branding tab. Keep a single `PATCH /api/tenants/:id` call that merges whatever the tab manages.
- `notificationSettings` JSON field: if not yet on the `Tenant` model, add `notificationSettings Json?` to schema.prisma and `prisma db push`.
- `secondaryColor` as `--sidebar-bg`: confirm with the team that this is the desired mapping before implementing. It is the most visible use of a second colour. If a different mapping is preferred, update DESIGN.md and the Settings label accordingly.

---

## Files to Change

- `apps/admin-portal/src/app/(dashboard)/settings/page.tsx` — AC-1, AC-2, AC-4
- `apps/admin-portal/src/components/BrandingApplicator.tsx` — AC-3
- `packages/database/prisma/schema.prisma` — if `timezone`, `dateFormat`, `notificationSettings` fields are absent
- `services/api/src/routes/tenants.ts` — accept new fields in PATCH body (if not already)

---

## Reference

- `.decision-log.md` — F-16, F-21, F-22, F-32, D-09, D-13, D-14, D-20
