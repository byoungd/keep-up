# UI Polish Guidelines

> Bridging the gap between Design System spec and implementation to achieve top-tier product quality.

## Overview

This document outlines the standards and practices for achieving premium UI quality in the Cowork application. It addresses the disconnect between our well-defined Design System and actual component implementations.

---

## Core Principles

### 1. Token-First Development

**Never use hardcoded values.** All styling must reference design tokens.

| ❌ Anti-pattern | ✅ Correct |
|----------------|-----------|
| `border-gray-200/50` | `border-border/50` |
| `bg-zinc-800` | `bg-surface-2` |
| `#f8fafc` | `var(--color-surface-1)` |
| `transition-all` | `transition-colors duration-fast ease-smooth` |

### 2. Semantic Styling

Use semantic color tokens that automatically adapt to light/dark modes:

```tsx
// Surface hierarchy (lower = deeper)
bg-surface-0  // Base layer
bg-surface-1  // Cards, panels
bg-surface-2  // Hover states, secondary cards
bg-surface-3  // Active states

// Text hierarchy
text-foreground        // Primary text
text-muted-foreground  // Secondary text
```

### 3. Motion Standards

All animations must use design system timing tokens:

```css
/* Duration tokens */
--duration-fast: 100ms    /* Micro-interactions */
--duration-normal: 200ms  /* Standard transitions */
--duration-slow: 300ms    /* Complex animations */

/* Easing tokens */
--ease-smooth: cubic-bezier(0.4, 0, 0.2, 1)
--ease-spring: cubic-bezier(0.175, 0.885, 0.32, 1.275)
--ease-out-expo: cubic-bezier(0.19, 1, 0.22, 1)
```

---

## Component Patterns

### Buttons

Standard button should include:
- Press feedback: `active:scale-[0.98]` ✓
- Hover elevation: `hover:shadow-sm hover:-translate-y-px`
- Focus ring with proper offset
- Duration token: `duration-fast`

```tsx
// Recommended button hover pattern
className={cn(
  "transition-all duration-fast ease-smooth",
  "hover:shadow-sm hover:-translate-y-px",
  "active:translate-y-0 active:shadow-none"
)}
```

### Interactive List Items

Sidebar and list items should have:
- Background transition on hover
- Subtle border glow effect (optional)
- Clear active state indication

```tsx
// Sidebar item pattern
className={cn(
  "transition-all duration-fast",
  "hover:bg-surface-2",
  isActive && "bg-surface-2 text-foreground"
)}
```

### Messages & Entries

New content should animate in using our animation utilities:

```tsx
// Apply entry animation to messages
className="ai-message-enter"

// Available animations (from animations.css):
// - ai-message-enter: Fade + slide + scale
// - animate-in-fade-slide: Simple fade + slide
// - ai-thinking-pulse: Subtle breathing effect
```

### Panels & Cards

Elevated content requires proper shadow hierarchy:

```tsx
// Base card
className="bg-surface-1 border border-border/50 rounded-xl shadow-sm"

// Elevated popover
className="bg-surface-elevated border border-border/70 rounded-xl shadow-lg"

// Modal dialog
className="bg-surface-0 rounded-2xl shadow-xl backdrop-blur-sm"
```

---

## Typography Scale

Use semantic font size tokens that map to specific use cases:

| Token | Size | Use Case |
|-------|------|----------|
| `--font-size-nano` | 8px | Tiny labels (rarely used) |
| `--font-size-tiny` | 9px | Timestamp, metadata |
| `--font-size-micro` | 10px | Badges, status indicators |
| `--font-size-fine` | 11px | Secondary UI text |
| `--font-size-chrome` | 13px | **Primary UI chrome** |
| `--font-size-content` | 15px | Main content body |

### Applying Typography

```tsx
// Chrome text (buttons, nav, labels)
className="text-chrome"  // Uses font-size-chrome

// Or with Tailwind (if custom class unavailable)
className="text-[13px] leading-[1.45]"
```

---

## Border Radius Scale

Maintain "squircle" feel with consistent radius tokens:

| Token | Value | Use Case |
|-------|-------|----------|
| `--radius-sm` | 4px | Inline badges, small chips |
| `--radius-md` | 6px | Buttons, inputs |
| `--radius-lg` | 12px | Cards, panels |
| `--radius-xl` | 16px | Large panels, sidebars |
| `--radius-2xl` | 24px | Modals, dialogs |
| `--radius-3xl` | 32px | Hero sections |

---

## Common Violations & Fixes

### Violation 1: Hardcoded Border Colors

```tsx
// ❌ Wrong
className="border-gray-200/50 dark:border-gray-800/50"

// ✅ Correct
className="border-border/50"
```

### Violation 2: Magic Number Opacity

```tsx
// ❌ Wrong
className="hover:bg-foreground/[0.05]"

// ✅ Correct - Use surface tokens
className="hover:bg-surface-2"
```

### Violation 3: Missing Animation Timing

```tsx
// ❌ Wrong
className="transition-colors"

// ✅ Correct
className="transition-colors duration-fast ease-smooth"
```

### Violation 4: Inconsistent Text Sizing

```tsx
// ❌ Wrong - Using raw Tailwind sizes
className="text-xs"  // 12px, might not match spec

// ✅ Correct - Using semantic tokens
className="text-fine"  // 11px, matches design spec
// Or explicit with line-height
className="text-[11px] leading-[1.3]"
```

---

## Scrollbar Styling

Ensure consistent scrollbar appearance across panels:

```tsx
className={cn(
  "overflow-y-auto",
  "[&::-webkit-scrollbar]:w-1.5",
  "[&::-webkit-scrollbar-track]:bg-transparent",
  "[&::-webkit-scrollbar-thumb]:bg-transparent",
  "hover:[&::-webkit-scrollbar-thumb]:bg-border/40",
  "[&::-webkit-scrollbar-thumb]:rounded-full",
  "transition-colors"
)}
```

---

## Visual Hierarchy Checklist

For every new component, verify:

- [ ] Uses design tokens, no hardcoded colors
- [ ] Has appropriate hover/focus/active states
- [ ] Animations use duration and easing tokens
- [ ] Text uses semantic size tokens
- [ ] Border radius follows the scale
- [ ] Shadows match elevation level
- [ ] Scrollbar styled if scrollable
- [ ] Dark mode tested

---

## Related Documentation

- [Design System Overview](../design-system/design-system.md)
- [Design Tokens Usage](../design-system/USAGE.md)
- [Theme CSS Variables](../../packages/design-system/src/theme.css)
- [Animation Utilities](../../packages/design-system/src/animations.css)
