# Cowork UI Spec (v3 — Final)

> **Purpose**: Defines the UI for the Cowork App — a task-mode agentic workspace with transparent execution, artifacts, and approvals. Desktop-first; adaptive to tablet/mobile.

**Design System Reference**:
*   [`docs/specs/cowork/cowork-visual-design-system.md`](file:///Users/han/Documents/Code/Parallel/keep-up/docs/specs/cowork/cowork-visual-design-system.md) (v3)
*   [`docs/specs/cowork/cowork-arc-dia-standards.md`](file:///Users/han/Documents/Code/Parallel/keep-up/docs/specs/cowork/cowork-arc-dia-standards.md) (New: The Experiential & Composition Standard)

---

## 1. Design Philosophy

### 1.1 The "Novelty Budget" & Calm Chrome
We follow the strict standards defined in **Cowork Arc/Dia Standards**.
*   **Calm Chrome**: Defined as **Curated Minimalism with Optical Precision**. It is not just "absence of decoration", but the precise alignment (4px grid), layering (3-depth rule), and material integrity of the shell.
*   **Novelty Budget**: Spent **exclusively on AI features** (Violet shimmer, generative UI).

| Scope | Rule |
| :--- | :--- |
| **Shell (Sidebar, Nav, Settings)** | Familiar, calm, solid. No decorations. No gradients. |
| **AI (Thinking, Artifacts, Chat)** | Expressive. Use **Violet** brand color, subtle motion, and playful stacking. |

### 1.2 "Calm Chrome" (Arc Principle)
*   **Default View**: **Left Rail + Canvas only**. Right Rail and Bottom Drawer are hidden by default.
*   **Focus Mode**: Hides all rails for reading/review.
*   The UI reads "quiet" at rest. Color/attention spikes **only** on exceptions (Approval Required, Error, Conflict).

### 1.3 "Peek → Pin → Split" (Arc Flow Continuity)
*   Default artifact interaction: **Peek** (overlay, ESC closes).
*   **Pin**: Opens artifact in Right Rail or Split View.
*   **Split**: Side-by-side Chat + Artifact for sustained reference.
*   State (scroll, selection) is preserved on promote/demote.

---

## 2. Visual Direction

| Element | Value | Notes |
| :--- | :--- | :--- |
| **Theme Frame** | `zinc-100` (Light) / `zinc-900` (Dark) | The App's background tint. User-customizable per Workspace. |
| **Canvas** | `white` (Light) / `gray-950` (Dark) | Solid. Elevated with `shadow-sm` and `rounded-lg`. |
| **AI/Magic** | **`violet-500` (base) / `violet-600` (active)** | Reserved for AI thinking, generation, and interactive artifacts. **No cyan**. |
| **Risk/Approval** | **`amber-500`** | Unmissable. High contrast. |
| **Typography** | `13px` UI / `15px` Chat / `Inter` | Weight as hierarchy. |
| **Corner Radius** | `12px` ("Squircle") | All panels, cards, modals. |

### 2.1 Global Visual Signature (Arc/Dia Bar)
*   **Frame + Canvas**: Two distinct planes. Content inset `6px` from window edge on desktop. Canvas never full-bleed.
*   **Chrome Restraint**: No borders on shell surfaces. Use borders only for inputs, focus, and data tables.
*   **Accent Discipline**: `indigo-600` for global actions and selection. **Violet is AI-only** (thinking, generation, AI actions).
*   **Iconography**: Lucide, `2px` stroke. Sizes: `16px` inline, `20px` in rails, `24px` in empty states.
*   **Type Ramp**: UI `13px`, meta `12px`, chat `15px`, headings `20-24px`. Use Inter variable with optical sizing if available.
*   **Density Rhythm**: 4px base grid. Chrome padding `16px` x `12px`. Chat vertical rhythm `20-24px`.
*   **Line Length**: Chat content targets 72-80 characters per line on desktop.

---

## 3. Layout & Information Architecture

### 3.1 Structural Zones

```
┌─────────────────────────────────────────────────────────────┐
│ Top Bar: Breadcrumb | CmdK | Status                         │
├──────────────┬──────────────────────────────────────────────┤
│              │                                              │
│   Sidebar    │               Content Canvas                 │
│   (240px)    │         (Chat / Artifact Split)              │
│              │                                              │
├──────────────┴──────────────────────────────────────────────┤
│ (Optional) Bottom Drawer: Timeline / Logs / TaskGraph       │
└─────────────────────────────────────────────────────────────┘
```

*   **Left Sidebar (240px, collapsible to 72px)**: Workspace Switcher, Pinned Sessions, Recent Sessions.
*   **Content Canvas**: Chat Thread (default). Expands to Split View for Artifacts.
*   **Right Rail (320px, opt-in)**: AI Panel, Context Chips, Approval Summary. Hidden by default.
*   **Bottom Drawer (30%, opt-in)**: Timeline / Logs / TaskGraph. Collapsed by default.

### 3.2 Routes
*   `/`: Sessions List.
*   `/sessions/:id`: Chat / Task Workspace.
*   `/sessions/:id/artifacts`: Full Artifact Gallery.
*   `/sessions/:id/logs`: Full Logs View.
*   `/approvals`: Batch Approval Review.
*   `/settings`: Workspace and Model Settings.

### 3.3 Density & Breakpoints
*   **>= 1440px**: Left rail `240px`, right rail `360px` (opt-in). Canvas max width `920px`, centered.
*   **1280-1439px**: Right rail `320px` (hidden by default). Canvas max width `860px`.
*   **1024-1279px**: Right rail becomes overlay. Left rail collapses to `72px` by default.
*   **< 1024px**: Single column. Rails become drawers. Bottom drawer becomes full-width sheet.
*   **< 768px**: Input capsule docks to bottom edge. Peek overlay uses full width.

---

## 4. Core Flows

### 4.1 Submit a Task
1.  User enters prompt in **Input Capsule** (floating bottom).
2.  Attaches files/paths using `@mention` syntax.
3.  Selects Model Lane (optional).
4.  On submit: Task appears in Chat as a Processing Message with status indicator.

### 4.2 Approval Gate
1.  Approval card appears **inline in Chat** (not a separate panel).
2.  Risk badge: **Amber** (High), **Yellow** (Medium).
3.  Scope list: Affected paths/tools.
4.  Actions: **Approve**, **Deny**, **Edit Scope**.
5.  Keyboard: `Enter` to Approve, `Esc` or `Shift+Enter` to Deny.

### 4.3 Artifact Interaction (Peek → Pin → Split)
1.  **Click artifact link in Chat**: Opens **Peek Overlay** (420px, ESC closes).
2.  **Click "Pin"**: Opens in **Right Rail**.
3.  **Click "Split"**: Opens **Split View** (Chat | Artifact).

### 4.4 Execution & Streaming
1.  SSE stream updates Chat messages and Timeline (if visible).
2.  **Thinking State**: Violet shimmer bar below the message being generated.
3.  **Tool Call**: Inline expandable card showing tool name, args, and result.

---

## 5. Components

### 5.1 Input Capsule
*   **Shape**: `rounded-full` pill.
*   **Position**: Empty state = Centered. Active state = Fixed Bottom.
*   **Elevation**: `shadow-lg`.
*   **Attachments**: Use `@mention` chips for files/artifacts.

### 5.2 Sidebar Item
*   **Active State**: `bg-surface-2`, solid highlight.
*   **Hover**: `bg-surface-2/50`.
*   See Reference Implementation: `docs/specs/cowork/reference-implementation/README.md`.

### 5.3 Approval Card
*   **Background**: `bg-amber-500/10`.
*   **Border**: `border-amber-500`.
*   **Content**: Risk Badge, Scope List, Rationale (optional), Action Buttons.

### 5.4 Status Indicators
*   **Synced**: Static green dot.
*   **Offline**: Static gray dot + text.
*   **Streaming**: Static text "Streaming..." (no infinite pulse).
*   **Thinking**: Violet shimmer bar (the **one** place we use decorative motion).

### 5.5 Artifact Card
*   **Surface**: `bg-surface-2`, `rounded-lg`, `shadow-sm`.
*   **Header**: Title `13px` medium, meta `12px` muted.
*   **Actions**: Hidden by default, reveal on hover/focus.

---

## 6. Command & AI Surfaces

### 6.1 Command Palette (`Cmd+K` or `/`)
*   **Primary interface**. Fastest path to everything.
*   Actions: Navigate, Open Artifact, Approve, Retry Node, Toggle Panels.
*   Inline hints: Show `Cmd+K` in empty states.

### 6.2 Right Rail AI Panel (opt-in)
*   Chat-style context-aware assistant.
*   **Context Chips**: Session, Task, Artifact, File Path.
*   **Controls**: Lane (Fast/Deep/Consensus), Tone, Privacy.

### 6.3 Inline Actions (Hover)
*   Message: "Turn into Task", "Pin", "Copy".
*   Artifact: "Send to Chat", "Apply", "Open in Split".

---

## 7. Motion

| Interaction | Duration | Easing | Notes |
| :--- | :--- | :--- | :--- |
| **Route Change** | 150ms | `ease-out` | Fade only. No scale. |
| **Modal/Drawer** | 150ms | `ease-out` | Fade + SlideY(8px). |
| **Sidebar Collapse** | 200ms | Spring (stiff) | Fast, no bounce. |
| **Hover** | 100ms | `ease-out` | Background color shift only. No scale. |
| **Thinking** | Loop | N/A | The **ONLY** looping animation. Violet shimmer. |

> **`prefers-reduced-motion`**: Disable shimmer. Use static "Working..." text.

**Additional Motion Rules**
*   **Input Morph**: 150-200ms spring, no bounce. Height and width only.
*   **Peek -> Pin -> Split**: Shared element transition, preserve scroll and selection.
*   **Artifact Open**: 180-220ms, layout projection or crossfade only.

---

## 8. Accessibility

*   **Landmarks**: `nav` (Sidebar), `main` (Canvas), `aside` (Right Rail), `footer` (Drawer).
*   **Keyboard**: Tab order: Rails → Canvas → Drawer. `Esc` closes overlays.
*   **Shortcuts**: `Cmd+K` (Command), `/` (Focus Input), `Shift+L` (Logs), `Shift+T` (TaskGraph).
*   **ARIA**: `aria-label` for icon buttons. Live region for streaming responses.
*   **Contrast**: Text 4.5:1, UI 3:1.

---

## 9. Quality Gates

See: [`docs/specs/cowork/cowork-ui-quality-gates.md`](file:///Users/han/Documents/Code/Parallel/keep-up/docs/specs/cowork/cowork-ui-quality-gates.md).

---

## 10. Open Questions (Deferred)

*   Batch Approve with shared scope notes? (Defer)
*   Persist Command Palette recents per workspace? (Recommend: Yes, local-only)
*   TaskGraph mini-map: Tool icons vs generic nodes? (Lean generic)
