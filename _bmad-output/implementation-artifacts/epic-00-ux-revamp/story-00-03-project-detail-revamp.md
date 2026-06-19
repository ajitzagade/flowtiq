---
epicId: 0
storyId: '00-03'
title: 'Project Detail — Breadcrumb, First Stage Expanded, Edit-Mode Panel'
status: ready
priority: high
estimate: 3
dependencies: []
---

# Story 0.3 — Project Detail Revamp

## Story

**As a** user viewing a project,
**I want** to see where I am in the app via a breadcrumb, see the active stage already expanded when I arrive, and clearly understand when I am in edit mode vs read mode,
**so that** I can orient myself and act immediately without extra clicks.

---

## Context

Three fixes in `apps/admin-portal/src/app/(dashboard)/projects/[id]/page.tsx` (large file, ~800+ lines). All are UI-layer changes; no API changes needed.

- **F-12**: No breadcrumb — only a `<ArrowLeft>` back button with no context of where the user came from
- **F-11**: `const [expanded, setExpanded] = useState(false)` on every StageCard → all collapsed on load; first active (or first) stage should start expanded
- **F-13**: The stage update form appears inside the expanded card body with no visual separation from read-mode content — edit and view modes are indistinguishable

The `key-project-detail.html` mockup shows all three resolved.

---

## Acceptance Criteria

### AC-1: Breadcrumb navigation added to project detail header

**Given** the user is on `/projects/[id]`,
**When** the page renders,
**Then** a breadcrumb appears in the page header area above (or replacing) the current `<ArrowLeft>` back button.
**And** the breadcrumb format is: `Projects / {project.name}`.
**And** "Projects" is a `<Link href="/projects">` styled as `text-blue-600 hover:underline text-sm`.
**And** the separator `/` is `text-slate-400`.
**And** `{project.name}` is non-linked, `text-slate-600 text-sm`, truncated at 40 characters with `title` attribute showing full name.
**And** the existing `<ArrowLeft>` back button is removed (breadcrumb replaces its function).

### AC-2: First in-progress (or first) stage card is expanded by default

**Given** the project detail page loads and has at least one stage card,
**When** the component mounts,
**Then** the stage card whose status is `in_progress` and has the lowest `order` value starts with `expanded = true`.
**And** if no stage is `in_progress`, the stage with the lowest `order` (stage 1) starts expanded.
**And** all other stage cards start collapsed (`expanded = false`).
**And** the user can still manually expand/collapse any card after load.

**Implementation note:** Change `const [expanded, setExpanded] = useState(false)` inside the StageCard component to accept an `defaultExpanded?: boolean` prop and initialise state from it. Pass `defaultExpanded={isFirstActive}` from the parent when mapping stages.

### AC-3: Stage update form is visually separated as an edit panel

**Given** a stage card is expanded and the user clicks "Update Stage",
**When** the update form appears,
**Then** the form renders in a visually distinct container — a panel with: `border-2 border-blue-500 rounded-xl bg-blue-50/30 p-4` — separate from the read-mode content.
**And** a label "Updating this stage" (or similar) appears at the top of the edit panel in `text-blue-600 text-sm font-semibold`.
**And** the read-mode content (sub-tasks, notes, history) remains visible above/beside the edit panel — it is NOT replaced or hidden.
**And** a prominent "Save Update" primary button and a "Cancel" secondary button appear at the bottom of the edit panel.
**And** clicking Cancel hides the edit panel and returns to read-only view.
**And** the current pattern of `setShowUpdateForm(true)` injecting the form inline as a sibling of the card content is replaced with this panel approach.

### AC-4: Stage update form shows current status pre-selected

**Given** the edit panel is open for a stage,
**When** the status dropdown renders,
**Then** the current stage status is pre-selected (not blank / defaulting to first option).

---

## Technical Notes

- Breadcrumb: add above the `<Header>` component call or inside the Header's `title` prop area. Check how Header renders `title` to determine the cleanest insertion point.
- `defaultExpanded` prop: the parent (project detail page) maps over `projectWorkflow.stages` sorted by order. Find the first `in_progress` stage; pass `defaultExpanded={stage.id === firstActiveId}`.
- Edit panel: wrap the existing form JSX in `<div className="border-2 border-blue-500 rounded-xl bg-blue-50/30 p-4 mt-4">`. Add the label heading. Move the Save/Cancel buttons inside this wrapper.
- No new components needed — all changes are inline in the existing StageCard and project detail page.

---

## Files to Change

- `apps/admin-portal/src/app/(dashboard)/projects/[id]/page.tsx` — all ACs

---

## Reference

- `key-project-detail.html` mockup — all three patterns shown visually
- `.decision-log.md` — F-11, F-12, F-13, D-04, D-07
