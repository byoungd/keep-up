# Cowork Motion Spec (v3 - Signature Motion)

> **Principle**: Motion provides **feedback** and **context**, not decoration.
> Motion should feel **responsive**, with a single AI signature moment.

**Changelog (v3)**:
- Restored one AI-only looping shimmer for thinking
- Added shared element transitions for Peek -> Pin -> Split
- Clarified input capsule morph behavior

---

## 1. Core Guidelines

1.  **Motion is invisible when done right.** The user notices when things are slow or jarring, not when they are smooth.
2.  **Duration < 200ms for most interactions.** Anything longer feels sluggish.
3.  **Ease-out for entrances.** Elements appear quickly and settle.
4.  **Only one loop is allowed.** The AI thinking shimmer is the only looping motion.

---

## 2. Standard Transitions

### 2.1 Route / Page Changes
*   **Effect**: Fade in.
*   **Duration**: 150ms.
*   **Easing**: `ease-out`.
*   **Avoid**: Scale effects. They add visual noise without value.

```css
.page-enter {
  opacity: 0;
}
.page-enter-active {
  opacity: 1;
  transition: opacity 150ms ease-out;
}
```

### 2.2 Modals & Popovers
*   **Overlay (Backdrop)**: Fade in (150ms).
*   **Panel**: Fade in + slight slide up (8px).
*   **Duration**: 150ms.

```css
.modal-panel {
  transform: translateY(8px);
  opacity: 0;
  transition: transform 150ms ease-out, opacity 150ms ease-out;
}
.modal-panel.open {
  transform: translateY(0);
  opacity: 1;
}
```

### 2.3 Sidebar Collapse/Expand
*   **Effect**: Horizontal resize.
*   **Type**: Spring (CSS or Framer Motion).
*   **Config**: `stiffness: 400, damping: 30` (fast, no bounce).

### 2.4 List Item Load (Chat Messages)
*   **Effect**: Fade in, optional stagger (30ms delay per item).
*   **Duration**: 100ms per item.
*   **Avoid**: Slide-in effects. They slow reading.

### 2.5 Artifact Open (Peek -> Pin -> Split)
*   **Effect**: Shared element transition or crossfade only.
*   **Duration**: 180-220ms.
*   **Goal**: Preserve visual continuity and scroll position.

---

## 3. Interaction Feedback

### 3.1 Button Click
*   **Effect**: Background color darkens.
*   **Duration**: Instant (0ms on press, 100ms on release).
*   **Avoid**: Scale "squeeze" effects.

### 3.2 Hover States
*   **Effect**: Subtle background shift (e.g., `bg-surface-1` -> `bg-surface-2`).
*   **Duration**: 100ms.
*   **Avoid**: Scale > 1.01. Shadow changes on hover.

### 3.3 Focus Ring
*   **Effect**: Visible ring outline using brand color.
*   **Duration**: Instant.

### 3.4 Input Capsule Morph
*   **Effect**: Height and width expansion only.
*   **Duration**: 150-200ms spring, no bounce.

---

## 4. Status Indicators

### 4.1 Loading / "Thinking"
*   **Visual**: AI shimmer line OR a text label ("Working...").
*   **Behavior**: Loop allowed only for AI thinking. Disable in reduced motion.

```tsx
// Good
<span className="text-muted-foreground">Working...</span>

// Optional AI shimmer (only in AI surfaces)
// <div className="ai-sheen-line" />
```

### 4.2 Streaming Indicator
*   **Visual**: Blinking cursor at end of text, OR static "Streaming..." label.
*   **Duration**: Cursor blink: 500ms interval (standard text cursor).

### 4.3 Progress Bar (for long operations)
*   **Visual**: Thin horizontal bar.
*   **Behavior**: Width animates smoothly based on progress percentage.
*   **Duration**: Smooth transition on width change.

---

## 5. Removed Features (from v1)

| Feature | Reason for Removal |
| :--- | :--- |
| **Hover "Lift" (scale 1.02)** | Distracting. No functional purpose. |
| **"Thinking" Pulse Animation** | Replaced by a single AI shimmer line. |
| **Spring "Bouncy" config** | Too playful. Conflicts with "Tool" aesthetic. |
| **Page transition scale (0.98 -> 1)** | Adds unnecessary visual noise. |
| **Colored shadow glow** | Decorative. Does not convey information. |

---

## 6. Implementation Notes

*   **Prefer CSS Transitions over Framer Motion** for simple effects. Reduces bundle size.
*   **Use `prefers-reduced-motion` media query** to disable non-essential motion.
*   **Test on low-end devices.** If motion causes frame drops, remove it.
