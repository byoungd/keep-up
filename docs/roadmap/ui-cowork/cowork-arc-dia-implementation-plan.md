# Cowork Arc/Dia Implementation Plan

> **Goal**: Execute the `cowork-arc-dia-standards.md` to raise Cowork UI from "Linear-like" to "Arc/Dia Signature".
> **Status Note**: Progress tracked in `docs/roadmap/ui-cowork/track-1-foundation.md`, `docs/roadmap/ui-cowork/track-2-components.md`,
> and `docs/roadmap/ui-cowork/track-3-motion.md`. This checklist is retained for historical reference.

---

## Phase 1: The Physics Foundation (Day 1-2)
*Goal: Fix the "container feel". If the shell isn't right, nothing inside matters.*

### 1.1 The 3-Layer Depth System
- [ ] **Global Layer Refactor** (`globals.css` / `theme.css`)
    - Define `layer-base` (Frame), `layer-canvas` (Paper), `layer-overlay` (Glass).
    - Enforce `z-index` constants in `tokens.ts`.
- [ ] **App Shell Layout** (`AppShell.tsx`)
    - Implement **6px Inset** for Desktop (media query `lg`).
    - Apply `shadow-soft` to the Canvas container.
    - Ensure Sidebar sits effectively on `layer-base` (tinted).

### 1.2 Optical Typography & Density
- [ ] **Semantic Type Tokens** (`tailwind.config.ts`)
    - Register `.text-ui` (13px/18px) for ALL chrome.
    - Register `.text-chat` (15px/24px) for content.
- [ ] **Grid Alignment Check**
    - Audit `SidebarItem` height to regularize on 4px grid (e.g., 32px or 36px exact).

### 1.3 The "Calm Chrome" Reset
- [ ] **Border Removal**
    - Remove `border-r` from Sidebar. Reliance on color difference (`surface-1` vs `canvas`) only.
    - Remove internal borders in panels.
- [ ] **Token Update**
    - Audit and remove any `gray-400` borders. Replace with `border-transparent` or subtle `surface-3`.

---

## Phase 2: Component Material Upgrade (Day 3-5)
*Goal: Upgrade "Shadcn defaults" to "Cowork Signature" materials.*

### 2.1 Inputs & Interactive Elements
- [ ] **Input Capsule** (`Input.tsx`, `ChatInput.tsx`)
    - Switch to "Soft Input" style: `bg-surface-2`, no border (default), `ring-1` (focus).
    - Add "Input Morph" physics (height expansion only).
- [ ] **Buttons** (`Button.tsx`)
    - Audit sizes: ensure 13px text for UI buttons.
    - Hover state: `brightness-95` or `bg-surface-3` (no shadow add).

### 2.2 Cards & Artifacts
- [ ] **Artifact Card** (`ArtifactCard.tsx`)
    - Flatten to `bg-surface-0` or `bg-surface-1` (depending on context).
    - Remove outer border. Use `shadow-sm` for lift on hover only.
- [ ] **Approval Gate** (`ApprovalCard.tsx`)
    - **Exception**: This *must* pop. Keep unique border/bg, but align to optical grid.

### 2.3 Iconography Audit
- [ ] **Global Icon Refactor**
    - Enforce `stroke-width={2}` on all Lucide icons.
    - Resize `16px` (UI) vs `20px` (Nav) vs `18px` (Chat companion).

---

## Phase 3: The Signature Motion Layers (Day 6-7)
*Goal: Implement the "feel" of intelligence.*

### 3.1 AI Thinking Signature
- [ ] **The Sheen Line** (`animations.css`)
    - Implement `@keyframes ai-sheen` (gradient slide).
    - Create `ai-sheen-line` utility class.
- [ ] **Integration**
    - Apply to `ChatInput` (processing state).
    - Apply to `ThinkingNode` (generation state).

### 3.2 Layout Projection (FLIP)
- [ ] **Artifact Open Transition**
    - Implement shared element transition ID strategy for Artifact Links.
    - Ensure "Peek -> Split" animates bounding box (using `framer-motion` layout prop or View Transitions API).

---

## Phase 4: Assurance & Review (Continuous)

### 4.1 The "Squint Test" Protocol
- [ ] **Storybook Setup**
    - Create a "Dense State" story for `AppShell` to test "Gray Wall" avoidance.
- [ ] **Lint Rules** (Optional but recommended)
    - Warn on `border-gray-*` usage (prefer `divide` or `gap`).
    - Warn on `w-[px]` arbitrary values.

### 4.2 Manual Polish Session
- [ ] **Walkthrough**: Execute `ui-polish-guidelines.md` manually.
- [ ] **Fix Snags**: Any 1px misalignment or jarring transition.

---

## Success Criteria (The Definition of Done)

1.  **3 Layers Max**: Usage of Inspector reveals max 3 z-index layers at rest.
2.  **6px Rule**: Screenshot measurement confirms exact 6px gap on Mac desktop.
3.  **No Gray Lines**: Visual separation is achieved via `bg` tones, not `border`.
4.  **One Loop**: Only the AI Sheen loops.
