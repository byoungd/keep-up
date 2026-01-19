# Cowork UI Quality Gates

**Purpose**: Measurable standards for "Arc/Dia-level" quality.

---

## 1. Perception Metrics (Speed)

| Metric | Target | Measurement Method |
| :--- | :--- | :--- |
| **Input Latency** | **< 16ms** | Frame drops in DevTools during typing. |
| **Optimistic UI** | **100%** | Message send / Sidebar toggle must update DOM instantly before network. |
| **Sidebar Resize** | **60fps** | Heavy operations must use `requestAnimationFrame`. |
| **App Load** | **< 600ms** | LCP (Largest Contentful Paint) in Lighthouse. |

---

## 2. Visual Fidelity Standards

### 2.1 The "Pixel Perfect" Check
*   [ ] **Theme Frame**: Content must be inset by `6px` from window edge (Desktop).
*   [ ] **Squircles**: All visible corners must use `rounded-lg` (12px) or `rounded-xl` (16px). NO sharp corners on floating elements.
*   **Fonts**: Chrome must use `13px`. Chat must use `15px+`.

### 2.2 The "Novelty Budget" Audit
*   [ ] **Count the Gradients**: Max **1** visible gradient at rest (The AI input or status). If Sidebar has a gradient -> FAIL.
*   [ ] **Animation Loop**: NO infinite loops allowed (except `Thinking` spinner).

### 2.3 The "Arc/Dia Signature" Audit
*   [ ] **Accent Discipline**: Violet only for AI surfaces. Indigo only for app-level actions.
*   [ ] **Surface Count**: At rest, only three surface tones visible (Frame, Canvas, Overlay).
*   [ ] **Iconography**: Lucide only, `2px` stroke, sizes limited to `16/20/24px`.
*   [ ] **Line Length**: Chat content targets 72-80 characters per line on desktop.

---

## 3. Interaction Standards

### 3.1 "Tuesday Morning" (Boring)
*   **Sidebar**: Must collapse/expand with a solid physical feel (Spring damping > 20). No "bouncy" sidebars.
*   **Settings**: Must open in a modal or inset, preserving context.

### 3.2 "AI Power" (Magic)
*   **Artifact Open**: Must feel "expansive". Transition from Chat -> Split View should be seamless (Layout Projection).
*   **Input Morph**: Typing long text should expand the capsule smoothly.

---

## 4. Experiential Quality Gates (The Arc Bar)

These subjective checks are **required** for feature sign-off.

### 4.1 The "Squint Test" (Focus & Contrast Rhythm)
*   [ ] **Structure Disappears**: When squinting, structural lines (dividers, borders) should vanish. Only Content and Primary Actions should remain visible.
*   [ ] **No Gray Walls**: The UI must not look like a grid of boxes. Use spacing and type weight for separation, not lines.

### 4.2 The "Fluidity Check" (Motion Physics)
*   [ ] **Optimistic UI**: Interactions (sidebar toggle, selection) must feel instant (< 16ms).
*   [ ] **Expansive Open**: Opening an artifact must visually *grow* from its source (Layout Projection), preserving context.

### 4.3 The "Material Integrity" Check
*   [ ] **Depth Count**: Confirm exactly 3 layers of depth at rest (Frame, Canvas, Overlay). No "Level 1.5" cards.
*   [ ] **Optical Inset**: Confirm the 6px gap between Canvas and Frame on desktop.

---

## 5. Engineering Standards

*   **Tailwind**: No arbitrary values (`w-[237px]`). Use design tokens (`w-64`, `w-72`).
*   **Dark Mode**: Must support System/Light/Dark preference.
*   **Bundle Size**: Logic split. `tasks` chunk < 50KB.
