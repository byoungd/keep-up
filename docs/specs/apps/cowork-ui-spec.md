# Cowork UI Spec

> UI specification for the Cowork app (apps/cowork). Task-mode coworking with artifacts, approvals, and transparent agent execution. Desktop-first; adaptive to tablet/mobile later.

## Goals
- Make task-mode transparent: show plan, execution, artifacts, approvals, and logs without context loss.
- Keep agents on-rails: approvals by risk, scoped file access, deterministic TaskGraph visibility.
- Maintain flow speed: command-first navigation, quick task submission, fast artifact preview.
- Honor Keep-Up design standards (a11y, timing, tokens) and Cowork architecture (SSE, policy DSL, LFCC principles).

## Non-Goals
- Full Reader/Brief authoring (covered elsewhere).
- Building a marketplace UI; only support local connectors and BYOK setup.
- Mobile parity; only essential responsive adjustments for narrow viewports.

---

## Visual Direction
- **Palette**: Neutral graphite surfaces with bright cyan for AI/command actions and amber for risk/approvals. Avoid purple. Use shared tokens from `design-system`.
- **Typography**: Purposeful sans with weight contrast (body 14 regular, headings 16-20 semi). Monospace for logs and TaskGraph IDs.
- **Density**: Default density for lists; compact rows for timeline/log panes; generous spacing in artifact readers.
- **Background**: Layered cards; workspace shell stays light, task/timeline panes use slightly darker surface bands for separation.
- **Iconography**: Line icons with 1.5px stroke; badges for status (running, blocked, needs-approval).

---

## Layout & IA
- **Left Rail (72px collapsed -> 240px expanded)**: Workspace switcher, Sessions, Tasks, Artifacts, Approvals, Settings. Color stripe per workspace. Hover/focus expands.
- **Primary Workspace (center)**: Two modes:
  - **Chat + Task Canvas**: Messages, prompts, task outputs.
  - **Artifact View**: Large card renderer (plan, diff, checklist, report) with action bar.
- **Right Rail (320px)**: Context/AI panel, approval summary, model lane selector, run status. Dock/undock toggle; hides in focus mode.
- **Secondary Drawer (bottom 30-40% height)**: Timeline/logs and TaskGraph view; resizable; collapsed by default on small screens.
- **Top Bar**: Breadcrumb (Workspace / Session), command button (CmdK), connection status (online/offline/SSE resumable), BYOK/model lane chip.
- **Bottom Input Bar**: Task prompt input with attachments (files, paths, artifacts), presets, run button with risk badge.

---

## Core Flows

1) **Start a Session**
   - From Sessions list -> open session -> shell loads chat + task canvas.
   - Command palette (CmdK) supports "New task", "Open artifact", "Switch workspace".

2) **Submit a Task**
   - Enter prompt; attach files/paths/artifacts; select lane (fast/deep/consensus) and risk disclosure.
   - On submit: show TaskGraph node placeholders; right rail shows context chips; bottom drawer opens timeline.

3) **Approval Gate**
   - When a node requires approval: inline card appears with risk tag (read/write/file/system). Primary actions: Approve, Deny, Edit scope.
   - Approvals also list in the right rail and in /approvals route for batch review.

4) **Execution & Streaming**
   - SSE stream updates timeline (Queued -> Running -> Succeeded/Failed) and chat responses.
   - Context chips show active grants; conflicts or retries surface as chips with tooltips.

5) **Artifacts**
   - Rendered in central pane; header shows type (plan, diff, checklist, report), created time, status.
   - Action bar: Apply (when applicable), Download, Copy, Open in new tab, Send to chat (preload context).
   - Diff artifacts use side-by-side split toggle; checklist uses interactive checkboxes.

6) **Logs & TaskGraph**
   - Bottom drawer tabs: Timeline, Logs, TaskGraph.
   - TaskGraph tab shows DAG nodes with status chips; click node -> right rail details (inputs, outputs, tool run logs).

7) **Error Recovery**
   - Failed nodes show retry button; approval rescopes if needed.
   - Conflict banner links to troubleshooting (AI Envelope expectations, missing grant).

8) **Session Summary**
   - End-of-run summary card: what changed, approvals granted, artifacts produced, costs/time. Export to Markdown/PDF.

---

## Navigation & Information Architecture
- Routes: `/` (sessions list), `/sessions/:id` (chat/task), `/sessions/:id/artifacts`, `/sessions/:id/logs`, `/approvals`, `/settings`.
- Tabs inside session: **Chat**, **Artifacts**, **Approvals**, **Logs**; maintain state per tab.
- Command palette categories: Navigate, Create, Run AI, Approvals, Settings, Help.
- Saved views: filters for sessions (Active, Completed, Needs approval).

---

## Components & States

- **Session List**: Rows with title, last updated, status pill, unread badge; supports quick actions (Resume, Open artifacts).
- **Prompt Bar**: Input + attachment chips; presets dropdown; lane selector; run button with spinner on submit; disabled when offline or approval pending.
- **Message Bubbles**: User vs Agent with subtle background difference; inline citations; action bar on hover (copy, pin, open artifact).
- **Artifacts**: Card container with secondary metadata stripe; interactive controls per type (checklist, diff view toggle, apply).
- **Approvals Card**: Risk tag, scope list, rationale text area, Approve/Deny buttons with type="button" and keyboard shortcuts.
- **Timeline**: Vertical list; each entry shows timestamp, node ID, status, duration; keyboard scrollable.
- **TaskGraph Mini-map**: Compact DAG with node badges; click to focus node in detail drawer.
- **Status Chips**: Synced, Offline, Reconnecting (SSE resume), Pending Approval, Blocked.
- **Notifications/Toasts**: Success/failure and approval required; auto-dismiss except approvals.

---

## Command & AI Surfaces
- **Command Palette (CmdK or /)**: Search sessions, artifacts, approvals; run quick actions (retry node, open TaskGraph, toggle density); shows preview pane with effect.
- **Right Rail AI Panel**: Chat-style, context-aware. Chips: session, selected message/task, attached artifacts, file paths. Mode toggles: Tone (neutral/brief/technical), Lane (fast/deep/consensus), Privacy (local-only vs outbound). Responses show citations and linked artifacts.
- **Inline Actions**: Message hover -> "Turn into task", "Send to approvals", "Create checklist". Artifact hover -> "Send to chat", "Apply", "Pin".
- **Selection Menu**: In logs or artifacts, selecting text opens small pill menu (copy, send to AI, add note). Use CSS transitions; no Framer Motion in editor contexts.

---

## Interaction & Motion
- Durations: 120-150ms for hover/focus; 200-260ms for drawers/panels. Easing `ease-out` (enter) and `ease-in-out` (layout).
- Drawer resize with smooth width/height transitions; remember last height per session.
- Command palette: scale 0.98 -> 1 + opacity; focus trap active.
- Approval banners slide down 12px with opacity; closing reverses motion.
- TaskGraph node status changes pulse once (200ms) to draw attention, then settle.
- Respect prefers-reduced-motion: switch to opacity-only.

---

## Accessibility
- Landmarks: `nav` for rails, `main` for content, `aside` for right rail, `footer` for bottom drawer when visible.
- Keyboard: Tab order through rails -> content -> drawer; shortcuts CmdK (command), / (focus prompt), Shift+L (open logs), Shift+T (toggle TaskGraph), ESC closes overlays/drawers.
- ARIA: Icon-only buttons get `aria-label`; live region for streaming responses and approvals; status role for sync chip; associate error text with inputs.
- Contrast: Text 4.5:1, UI 3:1; ensure cyan/amber meet contrast on surfaces.
- Forms: Buttons use `type="button"`; inputs with visible labels or `aria-label`.

---

## Data & AI Envelope Hooks
- Context chips carry session/task IDs, artifact IDs, and path scopes; sent to AI Gateway with preconditions.
- Approvals display the scope (path/tool) and risk tier tied to TaskGraph node IDs.
- Logs and TaskGraph nodes show `Last-Event-ID` from SSE for debugging resumability.
- Artifact apply uses deterministic diff pipeline; no direct file mutation without approval.

---

## Offline, Sync, and Conflict Handling
- Offline state disables run/approve buttons; prompt bar shows queued badge; SSE auto-resume with Last-Event-ID.
- Conflict banner links to retry with refreshed frontier/context chips.
- Pending approvals persist locally; retry once connection restores.

---

## Desktop -> Narrow View Adaptation
- Left rail collapses to icons; top bar gains overflow menu for routes.
- Right rail becomes overlay drawer; bottom logs collapse to tabbed sheet.
- Split/diff views fall back to stacked toggles.

---

## Open Questions
- Should approvals support batch Approve with shared scope notes? (recommend scoped batch by risk tier)
- Do we persist command palette recent actions per workspace? (recommend yes, local-only)
- Should TaskGraph mini-map show tool-specific icons or generic nodes? (lean generic with tooltip for clarity)
