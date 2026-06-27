---
baseline_commit: 7762c2c38406151366caf98dfc687bb738582c84
---

# Story: Cashflow Management — Phase 1 & 2

**Status:** review

## Story
As an admin, I want to track the financial health of each project — setting contract values, defining payment milestones linked to workflow stages, raising invoices, and recording payments — so I can maintain full cashflow visibility per project without leaving the portal.

## Acceptance Criteria
- [ ] AC1: Admin can set a project's contract value, currency, and billing type via a Finance tab on the project detail page
- [ ] AC2: Admin can create, edit, and delete payment milestones per project (name, amount, % of contract, linked stage, due date, status)
- [ ] AC3: When a workflow stage is completed, any milestone linked to that stage auto-transitions to "Due" status
- [ ] AC4: Admin can create invoices per project (number, title, amount, tax, due date, status)
- [ ] AC5: Admin can record payments against an invoice (amount, date, mode, reference) with partial payment support
- [ ] AC6: Invoice status auto-updates: draft → sent → partial/paid based on payments recorded
- [ ] AC7: Contract summary card shows: total contract value, total invoiced, total received, outstanding amount
- [ ] AC8: No existing project, stage, workflow, or user functionality is impacted

## Tasks/Subtasks
- [x] T1: Schema — add ProjectFinancial, PaymentMilestone, Invoice, InvoicePayment models
  - [x] T1.1: Add models to Prisma schema
  - [x] T1.2: Add types to @flowtiq/shared-types
  - [x] T1.3: Run db generate + db push
- [x] T2: Backend — /api/finance router (contract + milestones + invoices + payments)
  - [x] T2.1: Project financial CRUD (GET + POST/PATCH)
  - [x] T2.2: Payment milestones CRUD
  - [x] T2.3: Invoices CRUD
  - [x] T2.4: Invoice payment recording
  - [x] T2.5: Register router in app.ts
  - [x] T2.6: Auto-mark milestone "due" when linked stage completes (hook in stages.ts)
- [x] T3: Frontend — Finance tab on project detail page
  - [x] T3.1: Contract setup card (value, currency, billing type)
  - [x] T3.2: Contract summary card (invoiced vs received vs outstanding)
  - [x] T3.3: Payment milestones section (list + create/edit/delete modal)
  - [x] T3.4: Invoices section (list + create modal + payment recording)
- [x] T4: Push and verify no regressions

## Dev Agent Record

### File List
- packages/database/prisma/schema.prisma
- packages/shared-types/src/index.ts
- services/api/src/routes/finance.ts (new)
- services/api/src/app.ts
- services/api/src/routes/stages.ts
- apps/admin-portal/src/app/(dashboard)/projects/[id]/page.tsx

### Change Log
- 2026-06-27: Story created, implementation starting

### Completion Notes
- Prisma schema: 4 new models (ProjectFinancial, PaymentMilestone, Invoice, InvoicePayment) with Decimal(15,2) for money. Relations added on Project, ProjectStage, Tenant. db:push confirmed sync.
- Shared-types: 10+ new exported types and interfaces covering all finance entities.
- Backend /api/finance router: GET snapshot, POST/PATCH contract, full CRUD for milestones, invoices, payments. Invoice status auto-updates (draft→sent→partial/paid) on payment record/delete. Tenant-scoped throughout.
- stages.ts hook: `paymentMilestone.updateMany({ status: 'due' })` fires when a stage transitions to `completed`.
- Frontend FinanceTab.tsx (~600 lines): ContractModal, MilestoneModal, InvoiceModal, RecordPaymentModal, InvoiceRow (expandable with payment list), SummaryCard with dual progress bars, milestone status inline dropdown, invoice health snapshot. All forms use react-hook-form + zod. All mutations use TanStack React Query with cache invalidation.
- Finance tab added to project detail page alongside existing Workflows/Documents/Follow-ups tabs — no existing tab or functionality altered.
- Full monorepo type-check: 3/3 packages pass, 0 errors.
