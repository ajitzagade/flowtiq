---
epicId: 5
storyId: '05-01'
title: 'On-Demand Excel Export'
status: review
priority: high
estimate: 3
baseline_commit: 1573fa25cc2b4b1b9ca4fa618783af28a96e13c5
---

# Story 5.1 — On-Demand Excel Export

## Story

**As an** admin user,
**I want** to download a complete Excel workbook of all project data with a single click,
**so that** I have an offline copy of the entire dataset for reporting, auditing, or sharing with stakeholders.

---

## Context

This is the foundational story for Epic 5. It adds a `GET /api/export/excel` endpoint that generates a multi-sheet `.xlsx` workbook covering projects, financials, payment milestones, invoices, follow-ups, and users, then streams it to the browser as a file download. A new "Export & Backup" tab is added to the Settings page in the admin portal with a single "Download Excel" button.

No existing routes or models are modified. The `exceljs` package is added to `services/api`. All data is scoped to the caller's `tenantId`.

---

## Acceptance Criteria

### AC-1: `exceljs` dependency installed in services/api

**Given** `services/api/package.json`,
**When** the story is implemented,
**Then** `exceljs` (^4.x) is listed as a dependency.
**And** `pnpm install` completes without errors.
**And** TypeScript can import `import ExcelJS from 'exceljs'` without type errors.

---

### AC-2: `GET /api/export/excel` endpoint exists and is protected

**Given** an authenticated request with a valid JWT (any non-super-admin user with `reports:view` permission),
**When** `GET /api/export/excel` is called,
**Then** the response status is `200`.
**And** the `Content-Type` header is `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.
**And** the `Content-Disposition` header is `attachment; filename="flowtiq-export-YYYY-MM-DD.xlsx"` where the date is today's UTC date.
**And** the response body is a valid `.xlsx` binary.

**Given** an unauthenticated request,
**When** `GET /api/export/excel` is called,
**Then** the response status is `401`.

**Given** an authenticated user WITHOUT `reports:view` permission,
**When** `GET /api/export/excel` is called,
**Then** the response status is `403`.

---

### AC-3: Workbook contains all required sheets

**Given** a tenant with existing data,
**When** the Excel file is downloaded and opened,
**Then** the workbook contains exactly these sheets in this order:
1. **Projects** — all non-deleted, non-cancelled projects for the tenant
2. **Project Financials** — one row per project that has a `ProjectFinancial` record
3. **Payment Milestones** — all milestones for the tenant
4. **Invoices** — all invoices for the tenant
5. **Invoice Payments** — all payment records for the tenant
6. **Follow-ups** — all follow-ups for the tenant
7. **Users** — all active users for the tenant

---

### AC-4: Projects sheet columns

**Given** the Projects sheet,
**Then** it contains these columns (header row frozen, bold):
`Project Number | Project Name | Status | Priority | Client Name | Client Email | Client Phone | Start Date | Due Date | Contract Value | Currency | Billing Type | Total Invoiced | Total Received | Outstanding | Assigned Team | Created At`

**And** `Contract Value`, `Total Invoiced`, `Total Received`, `Outstanding` are formatted as numbers (not text), with 2 decimal places.
**And** date columns use `dd-mmm-yyyy` format.
**And** the column widths are auto-sized to fit content (minimum 12, maximum 40 characters).

---

### AC-5: Project Financials sheet columns

**Given** the Project Financials sheet,
**Then** it contains:
`Project Number | Project Name | Contract Value | Currency | Billing Type | Total Invoiced | Total Received | Outstanding | Notes | Created At`

**And** monetary columns are number-formatted with 2 decimal places.

---

### AC-6: Payment Milestones sheet columns

**Given** the Payment Milestones sheet,
**Then** it contains:
`Project Number | Project Name | Milestone Title | Amount | Status | Due Date | Linked Stage | Notes | Created At`

**And** `Amount` is number-formatted.
**And** `Status` values are: `pending`, `due`, `invoiced`, `paid`.

---

### AC-7: Invoices sheet columns

**Given** the Invoices sheet,
**Then** it contains:
`Invoice Number | Project Number | Project Name | Title | Status | Invoice Date | Due Date | Total Amount | Amount Paid | Outstanding | Notes | Created At`

**And** monetary columns are number-formatted.
**And** `Status` is one of: `draft`, `sent`, `partial`, `paid`, `cancelled`.

---

### AC-8: Invoice Payments sheet columns

**Given** the Invoice Payments sheet,
**Then** it contains:
`Invoice Number | Project Number | Amount | Payment Mode | Payment Date | Reference Number | Notes | Created At`

**And** `Amount` is number-formatted.
**And** `Payment Mode` values: `bank_transfer`, `cheque`, `cash`, `upi`, `other`.

---

### AC-9: Follow-ups sheet columns

**Given** the Follow-ups sheet,
**Then** it contains:
`Project Number | Project Name | Type | Subject | Due Date | Priority | Status | Assigned To | Notes | Completed At | Created At`

**And** date columns use `dd-mmm-yyyy` format.

---

### AC-10: Users sheet columns

**Given** the Users sheet,
**Then** it contains:
`First Name | Last Name | Email | Roles | Is Active | Created At`

**And** `Roles` is a comma-separated list of the user's role names.
**And** only active users (`isActive = true`) are included.

---

### AC-11: All data is tenant-scoped

**Given** a multi-tenant environment,
**When** any user calls the export endpoint,
**Then** ONLY data belonging to their `tenantId` appears in the workbook.
**And** super admin calls with `isSuperAdmin = true` return data across ALL tenants (one tenant per logical block in each sheet, with a `Tenant` column prepended).

---

### AC-12: Empty state handled gracefully

**Given** a tenant with no data in a given category (e.g. no invoices yet),
**When** the workbook is generated,
**Then** the corresponding sheet still exists with the header row, but zero data rows.
**And** the download still completes successfully (status 200).

---

### AC-13: Audit log entry created

**Given** a successful export,
**When** the endpoint responds with 200,
**Then** `createAuditLog` is called with:
- `action: 'export'`
- `module: 'export'`
- `description: 'Excel export downloaded'`
- `userId` and `tenantId` from the authenticated request.

---

### AC-14: Settings page "Export & Backup" tab

**Given** a user with `reports:view` permission navigates to `/settings`,
**When** the Settings page loads,
**Then** a new tab labelled "Export & Backup" is visible.

**Given** the user clicks "Export & Backup",
**Then** the tab panel shows:
- A section titled "Download Data Export"
- A description: "Export all project, financial, follow-up, and user data as an Excel workbook."
- A button labelled "Download Excel (.xlsx)" with a `Download` icon (Lucide).

**Given** the user clicks "Download Excel (.xlsx)",
**Then** the browser triggers a file download of the `.xlsx` file (fetched via the `/api/export/excel` endpoint using `window.open` or a hidden `<a>` tag with the access token injected via the API interceptor pattern).
**And** while the download is in progress, the button shows a loading spinner and is disabled.
**And** on completion or error, a `toast.success` or `toast.error` message is shown.

---

### AC-15: TypeScript compilation passes

**Given** all changes above are implemented,
**When** `pnpm type-check` is run from the repo root,
**Then** zero TypeScript errors are reported.

---

## Dev Notes

### Backend

- **Route file**: `services/api/src/routes/export.ts` (new file)
- **Registration**: `app.use('/api/export', exportRouter)` in `services/api/src/app.ts`
- **Permissions**: `router.use(authenticate)`, then `requirePermission('reports:view')` on the Excel route
- **ExcelJS pattern**:
  ```typescript
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Flowtiq';
  workbook.created = new Date();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="flowtiq-export-${today}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
  ```
- **Header row style**: bold font, light grey fill (`FFEEEEEE`), frozen first row (`worksheet.views = [{ state: 'frozen', ySplit: 1 }]`)
- **Auto-width**: iterate `worksheet.columns` after adding rows, set `column.width = Math.min(40, Math.max(12, maxLength + 2))`
- **Parallel queries**: use `Promise.all([...])` for all Prisma queries to minimize latency
- **Decimal conversion**: Prisma `Decimal` → JS number via `.toNumber()` before writing to cell; set `numFmt: '#,##0.00'` on monetary columns

### Frontend

- **File**: `apps/admin-portal/src/app/(dashboard)/settings/page.tsx` — add `'export-backup'` to the tabs array
- **Download trigger**: use a direct fetch with auth header, convert blob to object URL, trigger `<a>.click()` — do NOT use `window.open` (loses auth headers)
  ```typescript
  const response = await fetch('/api/export/excel', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `flowtiq-export-${today}.xlsx`; a.click();
  URL.revokeObjectURL(url);
  ```
- Get the access token from `useAuthStore.getState().token`

---

## Out of Scope

- Scheduled/automatic exports (Story 5.3)
- Google Sheets sync (Story 5.2)
- Email delivery of the file
- Filtering exports by date range (deferred)

---

## Definition of Done

- [x] `exceljs` installed in `services/api`
- [x] `GET /api/export/excel` route implemented, protected, returns valid `.xlsx`
- [x] All 7 sheets present with correct columns and number formatting
- [x] Data is tenant-scoped; super admin gets all-tenant view
- [x] Audit log entry created on each export
- [x] Empty sheets handled gracefully
- [x] Settings page has "Export & Backup" tab with working download button
- [x] Loading and error states shown in UI
- [x] `pnpm type-check` passes with zero errors

## Dev Agent Record

### Completion Notes

Implemented `GET /api/export/excel` in new `services/api/src/routes/export.ts`. Uses `exceljs` to build a 7-sheet workbook (Projects, Project Financials, Payment Milestones, Invoices, Invoice Payments, Follow-ups, Users) with bold+grey frozen headers, auto-sized columns, and `#,##0.00` monetary formatting. Data fetched via `Promise.all` for performance; tenant-scoped for regular users, all-tenant with a prepended Tenant column for super admins. `EXPORTED` audit log created after response is sent (fire-and-forget). `InvoicePayment` has no `tenantId` — filtered via `invoiceId IN (...)` derived from the already-scoped invoice query. Settings page gains a 5th "Export & Backup" tab with a download button that uses `fetch` + `URL.createObjectURL` to trigger the browser download with auth header.

### File List

- `services/api/src/routes/export.ts` (new)
- `services/api/src/app.ts` (modified — added exportRouter)
- `services/api/package.json` (modified — added exceljs)
- `apps/admin-portal/src/app/(dashboard)/settings/page.tsx` (modified — added Export & Backup tab)

### Change Log

- 2026-06-27: Story 5.1 implemented — on-demand Excel export endpoint + Settings tab
