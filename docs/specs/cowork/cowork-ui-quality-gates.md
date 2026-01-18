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
*   [ ] **Theme Frame**: Content must be inset by `4px` - `8px` from window edge (Desktop).
*   [ ] **Squircles**: All visible corners must use `rounded-lg` (12px) or `rounded-xl` (16px). NO sharp corners on floating elements.
*   **Fonts**: Chrome must use `13px`. Chat must use `15px+`.

### 2.2 The "Novelty Budget" Audit
*   [ ] **Count the Gradients**: Max **1** visible gradient at rest (The AI input or status). If Sidebar has a gradient -> FAIL.
*   [ ] **Animation Loop**: NO infinite loops allowed (except `Thinking` spinner).

---

## 3. Interaction Standards

### 3.1 "Tuesday Morning" (Boring)
*   **Sidebar**: Must collapse/expand with a solid physical feel (Spring damping > 20). No "bouncy" sidebars.
*   **Settings**: Must open in a modal or inset, preserving context.

### 3.2 "AI Power" (Magic)
*   **Artifact Open**: Must feel "expansive". Transition from Chat -> Split View should be seamless (Layout Projection).
*   **Input Morph**: Typing long text should expand the capsule smoothly.

---

## 4. Engineering Standards

*   **Tailwind**: No arbitrary values (`w-[237px]`). Use design tokens (`w-64`, `w-72`).
*   **Dark Mode**: Must support System/Light/Dark preference.
*   **Bundle Size**: Logic split. `tasks` chunk < 50KB.
