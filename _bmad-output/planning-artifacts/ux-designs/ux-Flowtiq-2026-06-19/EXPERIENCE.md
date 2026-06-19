---
title: 'Flowtiq Admin Portal — Experience Specification'
project: Flowtiq
status: final
created: '2026-06-19'
updated: '2026-06-19'
visual-identity: 'DESIGN.md'
---

# Flowtiq Admin Portal — Experience Specification

---

## Foundation

**Form factor:** Web application, desktop primary. Minimum supported viewport: 375px (iPhone SE). Responsive to 1440px wide desktop. Not a PWA in Phase 1; Service Worker added in Phase 2.

**UI system:** Custom component layer on Tailwind CSS 3.4. Component class names defined in `globals.css` (`@layer components`). Visual tokens referenced via `{DESIGN.md}` frontmatter keys.

**Shell:** Three-zone layout — fixed sidebar left, sticky header top, scrollable content right. Sidebar collapses to icon-only on desktop; slides in as full-width drawer on mobile (`<md`).

**Rendering:** All pages are `'use client'` Next.js components. No React Server Components. Auth state lives in Zustand (`flowtiq-auth` localStorage key). Data fetched via TanStack Query; all mutations via `api.*` helpers from `@/lib/api.ts`.

---

## Information Architecture

### Navigation Tree

```
/login                          — Public
/dashboard                      — All roles
/projects                       — projects:view
/projects/[id]                  — projects:view
/follow-ups                     — follow_ups:create
/documents                      — documents:download
/users                          — users:view
/roles                          — roles:manage
/workflows                      — roles:manage
/reports                        — reports:view  ← REVAMP: was roles:manage
/audit-logs                     — roles:manage
/notifications                  — All roles
/settings                       — All roles (branding: admin only)
/tenants                        — Super admin only
```

### Page Hierarchy & Entry Points

| Surface | Primary entry | Secondary entries |
|---|---|---|
| Dashboard | Sidebar / direct URL | — |
| Projects list | Sidebar | Dashboard "Active Projects → View all", Dashboard stat card |
| Project Detail | Projects list row click | Dashboard project row, notification entity link, deep link |
| Follow-ups | Sidebar | Dashboard "Upcoming Follow-ups → View all", Dashboard stat card |
| Documents | Sidebar | Project Detail stage upload, Dashboard stat card |
| Notifications | Header bell → "View all" | Sidebar |
| Settings | Header avatar menu | Sidebar |

---

## Voice and Tone

**Principle:** Functional and precise. No filler words in UI text. No exclamation points outside success toasts.

**Labels:** Noun-based for nouns ("Active Projects"), verb-based for actions ("Add Stage", "Mark as Read"). Avoid gerunds in action buttons ("Adding…" is a loading state, not a label).

**Empty states:** Empathetic but not chatty. Format: one-line what + one-line why/invitation. "No projects yet. Create your first project to get started." Not: "Looks like you don't have any projects! Let's fix that! 🎉"

**Error messages:** Specific. "Invalid email address" not "Validation failed". "Unable to save — please try again" for network errors.

**Timestamps:**
- Events within 24h: relative ("2 hours ago") — via `formatRelative()`
- Events older: absolute ("19 Jun 2026") — via `formatDate()`
- DateTimes: "19 Jun 2026 at 14:30" — via `formatDateTime()`

**Loading states:** "Loading…" as skeleton screens; never a spinning blank page. Buttons show "Saving…" during mutation, revert on error.

---

## Component Patterns

### Buttons

| Variant | Usage | Class |
|---|---|---|
| Primary | One per view — the main call to action | `btn-primary` |
| Secondary | Adjacent to primary, non-destructive alternates | `btn-secondary` |
| Danger | Destructive actions in confirmation dialogs | `btn-danger` |
| Ghost | Icon-only toolbar actions, close buttons | `btn-ghost` |

Primary and Secondary buttons have `shadow-sm`. Disabled state: `opacity-50 cursor-not-allowed`. Loading state: button text replaced with spinner + "Saving…"; button remains disabled.

### Cards

`.card` = white surface with `{DESIGN.md colors.border-default}` border and `{DESIGN.md colors.card-shadow}`. All page sections live in cards. Card structure:
- `.card-header` — title left, optional action right. `px-6 py-4`. Divider below.
- `.card-body` — `p-6`. Free content.
- Rows inside cards: `divide-y divide-slate-100` with `px-6 py-4` per row.

**Card hover (for clickable cards):** `hover:shadow-md transition-shadow`. No scale transform.

### Tables

`.table-container` wraps `.table` for horizontal scroll. Table header: `{DESIGN.md colors.table-header-bg}`. Row striping: odd = white, even = `#f2f5ff`. Row hover: `#e6edff`. Clickable rows: `.row-clickable cursor-pointer`.

**Column alignment:**
- Text columns: left-aligned
- Number columns: right-aligned (`text-right`)
- Date columns: right-aligned, `font-mono`
- Badge columns: left-aligned
- Action columns: right-aligned, icon buttons only

**Pagination:** Below table, right-aligned. "Showing X–Y of Z" text left-aligned. Prev/Next buttons as `btn-secondary`. Page size selector as `form-select`, inline.

### Modals

`.modal-overlay` (fixed inset, `bg-black/40 backdrop-blur-sm`) wrapping `.modal-content`. Focus trap: Tab key must cycle within the modal. Escape key must dismiss. Click outside (on overlay) must dismiss.

**Modal anatomy:**
- `.card-header`: title + X close button (`btn-ghost p-1.5`)
- `.card-body`: form or content
- Footer (when needed): `flex justify-end gap-2 px-6 py-4 border-t border-slate-100`

**Modal sizes:**
- Small: `max-w-md` — confirmations, simple forms
- Medium: `max-w-lg` — standard forms (create/edit)
- Large: `max-w-4xl` — document preview
- Max height: `max-h-[90vh] overflow-y-auto`

### Badges

Semantic status badges use `{DESIGN.md components.badge-*}` specs. Always `rounded-full`. Text: `text-xs font-medium`. Content: single word or short phrase, no sentence case.

Status → Badge mapping:
- `active` → `badge-green`
- `in_progress` → `badge-blue`
- `pending` → `badge-yellow`
- `on_hold` → `badge-yellow`
- `completed` → `badge-green`
- `cancelled` → `badge-gray`
- `overdue` → `badge-red`
- `urgent` priority → `badge-red`
- `high` priority → `badge-orange`
- `medium` priority → `badge-yellow`
- `low` priority → `badge-gray`

### Stat Cards

`.stat-card` = `.card p-6 flex items-start gap-4`. Icon block (`{DESIGN.md components.stat-icon}`) left; metric block right. Metric: `text-2xl font-bold text-slate-900`. Label: `text-sm text-slate-500 mt-0.5`.

**Revamp addition:** Trend indicator below label — a small `↑ N% vs last month` in emerald or red. Optional. Only shown when trend data available.

Clickable stat cards: full card is a `<Link>`. Arrow icon (`ArrowRight size={16}`) right-edge, visible on hover. No border change on hover — shadow increase only.

### Skeleton Loaders

Used for every async surface. Match the shape of the content:
- Stat card skeleton: `w-12 h-12 bg-slate-100 rounded-xl` icon + `h-8 w-1/2 bg-slate-100 rounded` value + `h-4 w-3/4 bg-slate-100 rounded` label
- Table skeleton: 5 rows, each with grey bars matching column widths
- All: `animate-pulse`

### Empty States

`.empty-state` = `flex flex-col items-center justify-center py-16 text-center`. Icon: `text-slate-200` Lucide icon at 40px. Heading: `text-slate-500 text-base font-medium mt-3`. Subtext: `text-slate-400 text-sm mt-1`. CTA: `btn-primary mt-4` (when applicable).

Empty state copy:
- Projects: "No projects yet" / "Create your first project to get started."
- Follow-ups: "All caught up" / "No pending follow-ups."
- Documents: "No documents" / "Upload the first document for this project."
- Notifications: "You're up to date" / "No notifications at this time."
- Audit Logs: "No activity recorded" (no CTA)

### Notification Popover (New — Revamp)

**Trigger:** Bell icon in header (`{DESIGN.md components.notification-popover}`).

**Behavior:**
- Click bell → popover appears anchored below-right of bell icon
- Click bell again → closes
- Click outside → closes
- Escape key → closes
- Does NOT navigate away from current page

**Contents:**
- Header row: "Notifications" label left, "Mark all read" ghost button right (only when unread > 0)
- Notification list: max 5 items, scrollable if more
- Each item: type icon (colored per `TYPE_ICONS` map) + message (2-line truncate) + relative time + blue dot for unread
- Click item: marks as read + navigates to entity URL (see Notification entity routing below)
- Footer: "View all notifications →" full-width link to `/notifications`

**Notification entity routing:**
| `type` | Navigate to |
|---|---|
| `assignment` | `/projects/{entityId}` |
| `status_changed` | `/projects/{entityId}` |
| `follow_up_reminder` | `/follow-ups` |
| `overdue` | `/follow-ups?overdue=true` |
| `document_uploaded` | `/documents` |
| `project_created` | `/projects/{entityId}` |

### User Menu Dropdown (New — Revamp)

**Trigger:** Avatar in header.

**Behavior:** Click → dropdown anchored below-right of avatar. Click outside or Escape → close.

**Contents:**
- User display name (`text-sm font-medium text-slate-900`)
- User email (`text-xs text-slate-500`)
- Divider
- Link: "Settings" → `/settings`
- Button: "Sign out" (red text `text-red-500`, hover `bg-red-50`) → triggers logout + redirect to `/login`

### Breadcrumb (New — Revamp)

**Placement:** Inside `.card-header` or just above the first card on deep pages, below the `<Header>` component.

**Format:** `[Parent page] / [Current page name]`

**Behavior:** Parent segment is a `<Link>`. Current segment is plain text. Separator: ` / ` in `text-slate-400`. Truncate current segment at 40 characters on mobile.

**Applies to:** `/projects/[id]` (breadcrumb: "Projects / {project.name}"), `/roles/[id]` if added in future.

---

## State Patterns

### Loading

Every async surface has an explicit loading state. Loading is shown via skeleton screens — not spinners — for main content areas. Spinners only on buttons during mutations and for inline loaders (e.g., search result fetch).

### Error

- **Page-level data fetch error:** "Failed to load data" card with a "Retry" button that calls `refetch()`.
- **Mutation error:** `toast.error(getErrorMessage(err))` — extracted from AxiosError via `getErrorMessage()` utility.
- **Form validation error:** Inline below each field, `form-error` class, red text `text-red-600 text-xs mt-1`.
- **Network error during settings save:** Must not silently fail. See F-16 fix — use `api.patch` instead of raw `fetch`.

### Empty

Each surface has a designed empty state (see Component Patterns → Empty States). Empty state appears when: query returns `items.length === 0` AND `isLoading === false`. Never show empty state during loading.

### Success

`toast.success('...')` from `react-hot-toast`. Message format: past-tense verb + noun. "Project created", "Stage updated", "Document uploaded". Never show success state in the page body — toasts only.

### Optimistic vs Confirmed

All mutations follow the confirmed pattern (no optimistic updates) in Phase 1 — toast on success, invalidate query on success. Optimistic updates can be added per-surface in Phase 2 if latency becomes perceptible.

---

## Interaction Primitives

### Click targets

Minimum touch target: 44×44px on mobile. Icon-only buttons must be wrapped in a `p-2` container to achieve this.

### Hover

Cards: `hover:shadow-md`. Table rows: background color change (see Tables). Buttons: background color change per variant. Navigation items: `{DESIGN.md colors.sidebar-hover}` background. No scale transforms on hover.

### Focus

All interactive elements must show a visible focus ring: `focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500`. Tab order must follow visual reading order (top-left to bottom-right).

### Drag and Drop

Kanban board uses HTML5 drag-and-drop. Known limitation: unreliable in headless Chromium (E2E tests skip drag-drop). No drag handle visible in current implementation — add `<GripVertical>` icon to `KanbanCard` as a visual affordance. Not required for Phase 1 revamp.

### Keyboard shortcuts (Future — Phase 2)

Document in Experience.md for future implementation:
- `⌘K` / `Ctrl+K` — Global search
- `N` — New (context-sensitive: new project on /projects, new follow-up on /follow-ups)
- `[` — Collapse/expand sidebar
- `Escape` — Close modal/popover

---

## Accessibility Floor

Minimum: WCAG 2.1 Level AA.

**Color contrast:** All text on white: `{DESIGN.md colors.text-primary}` (#0f172a) on white = 18.1:1 (passes). `{DESIGN.md colors.text-secondary}` (#475569) on white = 7.5:1 (passes). `{DESIGN.md colors.text-tertiary}` (#94a3b8) on white = 2.8:1 — **use only for non-essential supplementary text** (timestamps, labels), never for primary readable content.

**Focus trap (fix for F-15):** All modal dialogs must implement a focus trap. Implementation: on open, move focus to the first focusable element inside the modal. Tab cycles within the modal. Shift+Tab cycles backwards. Escape closes. On close, return focus to the trigger element.

**ARIA:** Modals: `role="dialog" aria-modal="true" aria-labelledby="{modal-title-id}"`. Nav sidebar: `aria-label="Main navigation"`. Notification bell: `aria-label="Notifications, N unread"` dynamically. Avatar: `aria-label="User menu: {firstName} {lastName}"`.

**Icons:** All decorative icons: `aria-hidden="true"`. Icons used as the sole communicator of meaning must have `aria-label` on their parent button.

**Images:** Logo images: `alt="Logo"`. Document thumbnails: `alt={doc.originalName}`. Decorative backgrounds: `aria-hidden="true"` or CSS background-image (not `<img>`).

---

## Key Flows

### Flow 1 — Priya creates a project and assigns a stage

Priya is a Project Manager at Vastudeep Associates. She's been handed a new file from her manager and needs to register it in Flowtiq and assign the first stage to her team.

1. Priya opens the app. The header says "Dashboard — Welcome back, Priya." She sees 3 active projects in the stat cards. She clicks "+ New Project" (top-right of the Projects page — she navigates there first via the sidebar).

2. On `/projects`, she clicks "New Project". A `max-w-lg` modal opens with form fields: Project Name (required), Project Number (auto-suggested), Client Name, Workflow (dropdown), Priority, Due Date, Assigned To.

3. She fills in the form. Clicks "Create Project". Button shows "Creating…". Success: toast "Project created." Modal closes. The project list refetches and her new project appears at the top.

4. She clicks the project row. She arrives at `/projects/{id}`. The page shows project header (name, number, client, status badge, priority badge) then the workflow cards. The **first stage card is expanded by default** (revamp — F-11 fix). She can see the stage is "Pending" with no assignees.

5. She clicks "Update Stage" inside the first stage card. The stage update form expands below. She selects "In Progress", adds a comment ("Started file review"), and selects two team members as assignees.

6. She clicks "Save". The form collapses. The stage card now shows "In Progress" badge, the two assignee avatars, and a "2 hours ago" history entry. A toast: "Stage updated."

**Climax beat:** Stage transitions from "Pending" to "In Progress" with assigned users — the project is now live in the workflow. The breadcrumb at the top confirms she's still on the right project: "Projects / {project.name}".

---

### Flow 2 — Rajesh gets a push notification and acts on it

Rajesh is a Follow-up Executive. He's away from his desk and receives a push notification: "Follow-up Overdue — Client callback for ABC project is 1 day past due."

1. He taps the notification on his phone. The Flowtiq mobile app opens (Phase 2). In Phase 1 (web): he's working in another tab, glances at the header, sees a red "1" badge on the bell icon.

2. He clicks the bell. The notification popover opens (revamp — F-06 fix). He sees: "Follow-up Overdue — Client callback for ABC Project is 1 day past due" with a red alert icon and "1 hour ago" timestamp. Blue unread dot.

3. He clicks the notification item. The popover closes. He is navigated to `/follow-ups`. The follow-up for ABC project is highlighted at the top (or filtered as overdue).

4. He opens the follow-up's update modal. Changes the date to today. Adds a note: "Called client — meeting scheduled for tomorrow." Saves.

**Climax beat:** The overdue follow-up is rescheduled in under 60 seconds, triggered by a notification that surfaced the right item at the right time.

---

### Flow 3 — Arjun reviews a project's documents before an approval meeting

Arjun is a Tenant Admin. He needs to check that all required documents are uploaded before an approval meeting in 30 minutes.

1. Arjun navigates to `/projects/{id}`. The project breadcrumb confirms: "Projects / Site Clearance — Building 4B".

2. He scrolls to the "Zoning Workflow" card and expands the "File Creation" stage. He sees 3 document thumbnails. A `+2` button indicates more. He clicks it — navigates to the documents tab of this project.

3. On the documents tab, documents are grouped by stage. He sees all 5 documents for "File Creation". One is a PDF — he clicks the thumbnail. The DocPreviewModal opens with an iframe preview.

4. He checks the document is the correct version. Satisfied, he clicks the stage update panel. Marks it as "Completed". Toast: "Stage updated."

**Climax beat:** Visual document access within the project workflow view prevents Arjun from needing to cross-reference between the Documents page and the Project page.

---

## Responsive & Platform

### Mobile (< 640px)

- Sidebar: hidden by default, full-width drawer (`w-72`) triggered by hamburger in header
- Header: hamburger button (mobile only) + truncated title + bell + avatar
- Stat cards: single column (`grid-cols-1`)
- Dashboard project list: full width, all content visible
- Modals: full-width `max-w-full`, slide up from bottom on mobile (future enhancement — Phase 2)
- Tables: horizontal scroll (`overflow-x-auto`) — no column hiding
- Page padding: `p-4` (not `p-6`)

### Tablet (640px–1024px)

- Sidebar: permanent, expanded by default; hamburger hidden
- Stat cards: 2 columns (`sm:grid-cols-2`)
- Dashboard main area: single column (2-column split only at `xl:`)
- Tables: full width, all columns visible

### Desktop (> 1024px)

- Sidebar: permanent, collapsible
- Stat cards: 4 columns (`lg:grid-cols-4`)
- Dashboard: 2/3 + 1/3 split at `xl:`
- Modals: centered, max-width constrained

### Dark mode

Not implemented. Not planned for Phase 1. Sidebar is permanently dark (`{DESIGN.md colors.sidebar-bg}`); content area is permanently light. Dark mode as a user preference is a Phase 3 item.

---

## Revamp Priority Matrix

| Finding | Page/Component | Severity | Effort | Priority |
|---|---|---|---|---|
| F-06 Notification bell → popover | Header | High | Medium | P0 |
| F-14 Notification items no entity link | Notifications page | High | Low | P0 |
| F-11 Stage cards all collapsed | Project Detail | High | Low | P0 |
| F-07 Avatar → user menu dropdown | Header | Medium | Low | P1 |
| F-03 Follow-up items not clickable | Dashboard | High | Low | P1 |
| F-18 No "Forgot password" | Login | High | High | P1 |
| F-01 Login hardcoded branding | Login | High | Medium | P1 |
| F-12 No breadcrumb on Project Detail | Project Detail | Medium | Low | P1 |
| F-16 Settings raw fetch | Settings | Medium | Low | P1 |
| F-10 Reports permission mismatch | Sidebar | Medium | Low | P1 |
| F-15 No focus trap in modals | All modals | Medium | Medium | P1 |
| F-02 Dashboard bottom row duplication | Dashboard | Medium | Low | P2 |
| F-05 Row color inconsistency | Dashboard | Low | Low | P2 |
| F-13 Stage update form UX | Project Detail | Medium | Medium | P2 |
| F-08 No global search | All | Medium | High | P3 |
| F-20 No keyboard shortcuts | All | Low | High | P3 |
| F-09 Sidebar collapse affordance | Sidebar | Low | Low | P2 |
| F-17 Mobile subtitle hidden | Header | Low | Low | P2 |
| F-04 Activity no view-all | Dashboard | Low | Low | P2 |
| F-19 Empty states missing | Various | Low | Medium | P2 |

**P0:** Fix before Vastudeep production launch — notification flow is broken without these.
**P1:** Fix in same sprint — user trust and core workflow issues.
**P2:** Next sprint — polish and consistency.
**P3:** Future phase.
