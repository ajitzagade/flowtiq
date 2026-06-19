---
title: 'Flowtiq Admin Portal — Design System'
project: Flowtiq
status: final
created: '2026-06-19'
updated: '2026-06-19'
ui_system: 'Custom (Tailwind CSS 3.4 + globals.css component layer)'
---

colors:
  sidebar-bg: '#0d1b2e'
  sidebar-text: '#8ba3be'
  sidebar-active: '#60a5fa'
  sidebar-active-bg: 'rgba(59, 130, 246, 0.18)'
  sidebar-active-border: '#3b82f6'
  sidebar-hover: 'rgba(255, 255, 255, 0.07)'
  sidebar-border: 'rgba(255, 255, 255, 0.08)'
  brand-primary: '#3b82f6'
  brand-primary-hover: '#2563eb'
  body-bg: '#f8fafc'         # Tailwind slate-50
  surface: '#ffffff'
  surface-raised: '#ffffff'
  border-default: '#dde3f8'
  border-subtle: '#eef0f8'
  table-header-bg: '#eef1ff'
  table-header-text: '#4a5699'
  text-primary: '#0f172a'    # slate-900
  text-secondary: '#475569'  # slate-600
  text-tertiary: '#94a3b8'   # slate-400
  text-inverse: '#ffffff'
  focus-ring: 'rgba(59, 130, 246, 0.20)'
  card-shadow: '0 2px 12px rgba(99, 102, 241, 0.07), 0 1px 3px rgba(0,0,0,0.05)'

  # Status semantics
  status-success: '#10b981'      # emerald-500
  status-success-bg: '#ecfdf5'   # emerald-50
  status-warning: '#f59e0b'      # amber-500
  status-warning-bg: '#fffbeb'   # amber-50
  status-danger: '#ef4444'       # red-500
  status-danger-bg: '#fef2f2'    # red-50
  status-info: '#3b82f6'         # blue-500
  status-info-bg: '#eff6ff'      # blue-50
  status-neutral: '#64748b'      # slate-500
  status-neutral-bg: '#f1f5f9'   # slate-100

  # Priority semantics
  priority-urgent: '#ef4444'
  priority-high: '#f97316'
  priority-medium: '#f59e0b'
  priority-low: '#94a3b8'

  # Notification bell badge
  badge-unread: '#ef4444'

typography:
  font-family: "'Inter', system-ui, sans-serif"
  font-size-base: '14px'
  line-height-base: '1.6'
  font-size-xs: '12px'
  font-size-sm: '13px'
  font-size-md: '14px'
  font-size-lg: '16px'
  font-size-xl: '18px'
  font-size-2xl: '24px'
  font-size-3xl: '30px'
  font-weight-normal: '400'
  font-weight-medium: '500'
  font-weight-semibold: '600'
  font-weight-bold: '700'
  font-weight-extrabold: '800'

rounded:
  none: '0px'
  sm: '6px'
  md: '8px'
  lg: '12px'       # cards, modals
  xl: '16px'       # large cards
  full: '9999px'   # badges, pills, avatars

spacing:
  page-padding-x: '24px'       # p-6 on desktop, p-4 on mobile
  page-padding-y: '24px'
  card-padding: '24px'         # card-body: p-6
  card-header-x: '24px'        # card-header: px-6
  card-header-y: '16px'        # card-header: py-4
  gap-xs: '4px'
  gap-sm: '8px'
  gap-md: '16px'
  gap-lg: '24px'
  gap-xl: '32px'
  sidebar-width-collapsed: '64px'   # w-16
  sidebar-width-expanded: '240px'   # w-60
  header-height: '64px'             # h-16

components:
  button-primary:
    bg: '{colors.brand-primary}'
    text: '{colors.text-inverse}'
    hover-bg: '{colors.brand-primary-hover}'
    border-radius: '{rounded.lg}'
    padding: '8px 16px'
    font-size: '{typography.font-size-sm}'
    font-weight: '{typography.font-weight-medium}'
    shadow: 'shadow-sm'
  button-secondary:
    bg: '{colors.surface}'
    text: '{colors.text-secondary}'
    border: '1px solid {colors.border-default}'
    hover-bg: '#f8fafc'
    border-radius: '{rounded.lg}'
  button-danger:
    bg: '{colors.status-danger}'
    text: '{colors.text-inverse}'
    hover-bg: '#dc2626'
  button-ghost:
    bg: 'transparent'
    text: '{colors.text-secondary}'
    hover-bg: '{colors.status-neutral-bg}'
  input:
    bg: '{colors.surface}'
    border: '1px solid {colors.border-default}'
    border-radius: '{rounded.lg}'
    padding: '10px 12px'
    font-size: '{typography.font-size-sm}'
    focus-border: '{colors.brand-primary}'
    focus-ring: '{colors.focus-ring}'
    placeholder-color: '{colors.text-tertiary}'
  card:
    bg: '{colors.surface}'
    border: '1px solid {colors.border-default}'
    border-radius: '{rounded.xl}'
    shadow: '{colors.card-shadow}'
  badge-green:
    bg: '{colors.status-success-bg}'
    text: '{colors.status-success}'
    ring: 'ring-1 ring-inset ring-emerald-700/10'
  badge-yellow:
    bg: '{colors.status-warning-bg}'
    text: '{colors.status-warning}'
  badge-red:
    bg: '{colors.status-danger-bg}'
    text: '{colors.status-danger}'
  badge-blue:
    bg: '{colors.status-info-bg}'
    text: '{colors.status-info}'
  badge-gray:
    bg: '{colors.status-neutral-bg}'
    text: '{colors.status-neutral}'
  avatar:
    size: '32px'
    border-radius: '{rounded.full}'
    font-size: '{typography.font-size-xs}'
    font-weight: '{typography.font-weight-semibold}'
  stat-icon:
    size: '48px'
    border-radius: '{rounded.xl}'
  modal-overlay:
    bg: 'rgba(0,0,0,0.40)'
    backdrop: 'blur(4px)'
  notification-popover:
    width: '380px'
    max-height: '480px'
    border-radius: '{rounded.xl}'
    shadow: '0 10px 40px rgba(0,0,0,0.12)'

---

# Flowtiq Admin Portal — Brand & Design System

## Brand & Style

Flowtiq presents as a **professional, enterprise-grade B2B SaaS tool** for workflow management. The visual language is clean, data-dense, and authoritative — built for people who live in the dashboard all day. It is not playful; it is reliable.

**Voice in UI text (microcopy is in EXPERIENCE.md):** Functional and direct. "Active Projects", not "Projects you are working on". Dates, statuses, and counts are always precise. Error messages say what happened and what to do, not just what failed.

**White-label overlay:** The sidebar background (`{colors.sidebar-bg}`), header, and primary action colors are controlled by CSS variables that tenants can override via the branding settings. Every hardcoded `"Flowtiq"` brand mention is a revamp target — replaced with `tenant.name` or the tenant logo.

## Colors

**Primary palette:** A deep navy sidebar (`{colors.sidebar-bg}`) paired with a clean white content area creates an immediate visual hierarchy. The primary blue (`{colors.brand-primary}`) drives all interactive actions — buttons, links, active states, progress bars.

**Row striping:** Audit and table rows alternate between `{colors.surface}` (white) and `#f2f5ff` (a very light periwinkle). This is intentional and correct. **Revamp fix:** The dashboard Active Projects list was mixing `violet-50` and `white` with inconsistent hover states — align to the same `#f2f5ff / white` pattern used in tables.

**Status colors are semantic:** Emerald = success/completed, Amber = warning/pending/on-hold, Red = danger/overdue/urgent, Blue = info/in-progress, Slate = neutral/cancelled. Never use a status color outside its semantic meaning.

## Typography

Inter at 14px base. All UI text is rendered with `-webkit-font-smoothing: antialiased`. The scale above covers all sizes in use. **Do not introduce new font sizes** outside this scale.

Headings inside cards use `{typography.font-size-lg}` at `{typography.font-weight-semibold}` (`text-lg font-semibold`). Page-level section headings use `{typography.font-size-2xl}` at `{typography.font-weight-bold}`.

**Monospace exception:** Project numbers (`PRJ-001` etc.) render in `font-mono` to preserve digit alignment.

## Layout & Spacing

**Page shell:** Fixed sidebar (left) + sticky header (top) + scrollable content area. Sidebar width: `{spacing.sidebar-width-expanded}` expanded, `{spacing.sidebar-width-collapsed}` collapsed. Header height: `{spacing.header-height}`. Content area top padding compensates for sticky header.

**Content padding:** `p-4` on mobile (`<sm`), `p-6` on tablet and above. Cards internal: `{spacing.card-padding}`.

**Grid system:** Dashboard uses `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` for stat cards, `grid-cols-1 xl:grid-cols-3` for the main content area. Table pages use a single-column layout with a filter bar above the table.

**Responsive breakpoints (Tailwind defaults):**
- `sm`: 640px
- `md`: 768px (sidebar becomes permanent/fixed)
- `lg`: 1024px
- `xl`: 1280px

## Elevation & Depth

Three elevation levels:
1. **Flat** — body background (`{colors.body-bg}`)
2. **Raised** — cards and table containers (`{colors.card-shadow}`)
3. **Floating** — modals, dropdowns, popovers (stronger shadow: `0 10px 40px rgba(0,0,0,0.12)`, `backdrop-blur`)

The sidebar sits at `z-50`. The sticky header at `z-20`. Modals at `z-50` with overlay. Notification popover at `z-40`.

## Shapes

All interactive surfaces use `{rounded.lg}` (12px) or `{rounded.xl}` (16px). Badges and pills use `{rounded.full}`. Avatars use `{rounded.full}`. The sidebar active indicator uses `inset 3px 0 0 {colors.sidebar-active-border}` (left border accent, no radius).

## Components

See the YAML frontmatter for token-level specs on all components. Key behavioral specs are in EXPERIENCE.md.

### Notification Popover (New — Revamp)

Width: `{components.notification-popover.width}`. Appears on Bell click, anchored to the bell icon, right-aligned. Max 5 recent notifications. Each item: type icon + message text (truncated to 2 lines) + relative time + unread dot. Footer: "Mark all read" + "View all notifications" link. Click on item: marks read + navigates to entity. Dismiss: click outside or `Escape`.

### User Menu Dropdown (New — Revamp)

Appears on Avatar click, right-aligned below the avatar. Contains: user display name + email (non-interactive), divider, "Settings" link, "Sign out" action (with red text). Width: `200px`.

### Breadcrumb (New — Revamp)

Used on deep pages (Project Detail, Role Detail). Format: `Projects / {project.name}`. Separator: `/` in `{colors.text-tertiary}`. Parent segments are links; current page is non-linked, `{colors.text-secondary}`.

## Do's and Don'ts

**Do:**
- Use `cn()` for all conditional class merging — never template string concatenation
- Use `{colors.brand-primary}` for all primary interactive actions
- Use semantic status colors only for their semantic meaning
- Show a skeleton loader for every async surface with more than 2 fields
- Align all table dates right (`text-right font-mono`) for scannability

**Don't:**
- Don't hardcode `"Flowtiq"` brand name in tenant-facing UI — use `tenant.name || 'Flowtiq'`
- Don't use `violet-*` and `indigo-*` interchangeably — pick one accent family per surface
- Don't use raw `fetch()` in component mutations — always use the `api.*` helpers
- Don't render an empty `<div>` where an illustrated empty state belongs
- Don't use inline `style={{ color: '...' }}` for colors that have a Tailwind class or CSS variable equivalent
