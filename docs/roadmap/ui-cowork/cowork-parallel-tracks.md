# Cowork Parallel Development Tracks (v2 - Aligned with UI Spec v2)

**Date**: 2026-01-18
**Philosophy**: **Organization** (Arc) + **Simplicity** (Dia) + **Speed**.
**Design Reference**: `docs/specs/cowork/cowork-visual-design-system.md` (v2)

---

## 🗂️ Track 1: Workspace Shell & Sidebar (Arc Core)
**Goal**: Build the organizational backbone. Sidebar-first, Command Palette-driven.
**Branch**: `feature/ui-workspace-shell`

### Deliverables
1.  **App Shell (`AppShell.tsx`)**
    *   3-column layout: Sidebar (Left), Content (Center), Context (Right, optional).
    *   Responsive: Sidebar collapses to icons on narrow viewports.
2.  **Sidebar (`Sidebar.tsx`)**
    *   Sections: Workspace Switcher (Top), Pinned Sessions (Middle), Recent Items (Bottom).
    *   Collapsible. Resizable width.
    *   Visual: Subtle background elevation (`surface-1`). No hard border.
3.  **Command Palette (`CommandPalette.tsx`)**
    *   Trigger: `Cmd+K`.
    *   Features: Search sessions, run actions, switch spaces.
    *   Visual: Centered modal, clean list, fast filter.

### Acceptance Criteria
- [ ] Sidebar renders with Pinned/Recent structure.
- [ ] Command Palette opens with `Cmd+K` and filters instantly.
- [ ] Sidebar collapse/expand works with fast transition (< 200ms).
- [ ] No decorative blur on sidebar (solid or very subtle transparency only).

---

## 💬 Track 2: Chat & Canvas (Dia Core)
**Goal**: Build the direct manipulation surface. Chat-first, Artifact-expandable.
**Branch**: `feature/ui-chat-canvas`

### Deliverables
1.  **Chat Thread (`ChatThread.tsx`)**
    *   Vertical message stream: User messages, Agent messages.
    *   Markdown rendering for agent output.
2.  **Input Bar (`InputBar.tsx`)**
    *   "Capsule" style. Floating at bottom (or centered when empty).
    *   Large, inviting. Auto-focus on load.
    *   Send button (Arrow/Stop).
3.  **Artifact Split View**
    *   When artifact is clicked, content area splits: Chat | Artifact.
    *   Resizable divider.
4.  **Status Indicators**
    *   "Working..." text for loading states.
    *   Static spinner, not looping gradient.

### Acceptance Criteria
- [ ] Chat messages render with proper Markdown (code blocks, lists).
- [ ] Input bar is prominent and auto-focused.
- [ ] Clicking an artifact card opens Split View.
- [ ] "Thinking" state shows static text/spinner, no pulse animation.

---

## 🛡️ Track 3: Controls & Approvals (Functional Safety)
**Goal**: Build clear, high-contrast controls for actions and safety gates.
**Branch**: `feature/ui-controls-approvals`

### Deliverables
1.  **Approval Modal (`ApprovalModal.tsx`)**
    *   Blocks the interface when approval is required.
    *   High contrast. Risk level clearly displayed (text + color).
    *   Actions: Approve, Reject. Clear buttons.
2.  **Task Timeline (`TaskTimeline.tsx`)**
    *   Simple vertical list of task steps.
    *   Status: Pending, Running, Completed, Failed (text badges, not icons).
    *   Information-dense (monospace for IDs).
3.  **Status Badges**
    *   Simple colored dots or text labels for status.
    *   Colors: Success (Emerald), Error (Rose), Warning (Amber).

### Acceptance Criteria
- [ ] Approval modal is blocking and impossible to miss.
- [ ] Task timeline is dense and readable (like a log, not a marketing card).
- [ ] Risk colors match token spec (no "magic" colors).
- [ ] All buttons use `type="button"` and are keyboard accessible.

---

## Shared Constraints (All Tracks)

*   **No decorative blur.** Use blur functionally (overlays) or not at all.
*   **No gradients on interactive elements.**
*   **No looping animations.**
*   **< 200ms transition durations.**
*   **Test with `prefers-reduced-motion: reduce`.**
*   **Dark mode: `#0a0a0a` background, not `#000000`.**

---

## Merge Order

1.  **Track 1 (Shell)** merges first. Provides container for other tracks.
2.  **Track 2 (Chat)** and **Track 3 (Controls)** can merge in parallel into Track 1.

---

## Verification

After all tracks merge:
*   [ ] Typecheck passes: `pnpm typecheck`
*   [ ] Visual audit: UI matches revised spec (no glow, no pulse, functional layout).
*   [ ] Performance: Interactions feel instant.
