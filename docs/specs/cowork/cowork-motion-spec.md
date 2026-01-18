# Cowork Motion Spec

> **Philosophy**: Interfaces should feel "alive" and "physical".
> We assume **Framer Motion** (React) and **CSS Transitions** (Tailwind).
>
> **Implementation**: [`packages/design-system/src/motion.ts`](file:///Users/han/Documents/Code/Parallel/keep-up/packages/design-system/src/motion.ts)

## 1. Physics & Timing

We avoid linear easing ("robots"). We use **Springs** for movement and **Ease-Out** for opacity.

### 1.1 Spring Configurations
Used for layout changes, modals, and sliders.

| Name | Stiffness | Damping | Mass | Description |
| :--- | :--- | :--- | :--- | :--- |
| **`spring.quick`** | 500 | 30 | 0.5 | Snappy. Toggles, Checkboxes. |
| **`spring.standard`** | 300 | 30 | 1 | The default. Modals, Sheets. |
| **`spring.slow`** | 180 | 30 | 1 | Large shifts. Page transitions. |
| **`spring.bouncy`** | 400 | 20 | 1 | "Fun" elements. Badges, Icons. |

### 1.2 Durations (CSS)
Used for colors, opacity, and transforms where springs are overkill.

| Token | Time | Ease | Use Case |
| :--- | :--- | :--- | :--- |
| **`duration-fast`** | `150ms` | `ease-out` | Hover interactions. |
| **`duration-normal`** | `300ms` | `ease-out` | Fades, Tooltips. |
| **`duration-slow`** | `500ms` | `ease-in-out` | Background shifts. |

---

## 2. Standard Transitions

### 2.1 Page / View Transition
When switching routes or major views.
*   **Initial**: `opacity: 0`, `scale: 0.98`, `y: 4`
*   **Animate**: `opacity: 1`, `scale: 1`, `y: 0`
*   **Exit**: `opacity: 0` (Instant or fast fade)
*   **Config**: `spring.standard`

### 2.2 Modal Entry
*   **Overlay**: Fade in (`duration-normal`).
*   **Panel**:
    *   **Initial**: `opacity: 0`, `scale: 0.95`, `y: 8`
    *   **Animate**: `opacity: 1`, `scale: 1`, `y: 0`
    *   **Config**: `spring.quick` (We want modals to feel fast).

### 2.3 List Items (Staggered)
For lists of artifacts or messages.
*   **Stagger Children**: `0.05s`
*   **Variant**: Slide in from left/bottom.

### 2.4 Hover "Lift"
Standard interactive hover.
*   **Scale**: `1.01` or `1.02`
*   **Y**: `-1px` or `-2px`
*   **Shadow**: Increase shadow Spread/Opacity.

---

## 3. Micro-Interactions

### 3.1 The "Squeeze" (Click)
Buttons should feel tactile.
*   **Active/Press**: `scale: 0.96`
*   **Config**: `spring.quick`

### 3.2 "Thinking" Pulse
For AI states.
*   **Keyframes**:
    *   `0%`: `opacity: 0.4`, `scale: 0.98`
    *   `50%`: `opacity: 1`, `scale: 1.02`, `border-color: highlight`
    *   `100%`: `opacity: 0.4`, `scale: 0.98`
*   **Loop**: Infinity.

---

## 4. Implementation Snippets (Framer Motion)

```tsx
// Generic wrapper for "Page" content
export const PageTransition = ({ children }: { children: ReactNode }) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.99 }}
    animate={{ opacity: 1, scale: 1 }}
    transition={{ type: "spring", stiffness: 300, damping: 30 }}
    className="h-full w-full"
  >
    {children}
  </motion.div>
);

// Standard Button tap
export const tapAnimation = {
  scale: 0.97,
  transition: { duration: 0.05 }
};
```
