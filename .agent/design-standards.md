# Design Standards

> Linear-level UI/UX quality standards for Keep-Up Reader.

---

## Project Context

Keep-Up Reader uses:
- **React 19** with Server Components
- **Tailwind CSS v4** for styling
- **Framer Motion** for animations (except in ProseMirror editor components)
- **shadcn/ui** patterns for component architecture

---

## Design Philosophy

### Core Principles

1. **Minimal Chrome, Maximum Usability**
   - Remove visual noise
   - Every element earns its place
   - Whitespace is a feature

2. **Progressive Disclosure**
   - Show what's needed, hide complexity
   - Actions reveal on hover/focus
   - Advanced features in menus

3. **Keyboard-First with Clear Affordances**
   - All actions accessible via keyboard
   - Shortcuts displayed subtly
   - Focus states visible but not loud

4. **Instant Feedback, Smooth Transitions**
   - < 100ms response for interactions
   - Animations guide attention
   - Loading states communicate progress

---

## Animation Standards

### Timing
| Type | Duration | Easing |
|------|----------|--------|
| Micro-interactions | 100-150ms | ease-out |
| Panel transitions | 200-300ms | ease-in-out |
| Page transitions | 300-400ms | ease-in-out |
| Loading shimmer | 1.5s loop | linear |

### Spring Configuration (Framer Motion)
```typescript
// Standard spring - snappy and responsive
const SPRING = { type: "spring", stiffness: 500, damping: 35 };

// Gentle spring - for larger movements
const SPRING_GENTLE = { type: "spring", stiffness: 300, damping: 30 };

// Bouncy spring - for playful elements
const SPRING_BOUNCY = { type: "spring", stiffness: 600, damping: 20 };
```

### Animation Patterns
```tsx
// Fade in
initial={{ opacity: 0 }}
animate={{ opacity: 1 }}
transition={{ duration: 0.15 }}

// Slide up
initial={{ opacity: 0, y: 8 }}
animate={{ opacity: 1, y: 0 }}
transition={SPRING}

// Scale in
initial={{ opacity: 0, scale: 0.95 }}
animate={{ opacity: 1, scale: 1 }}
transition={{ duration: 0.15 }}

// Exit slide left
exit={{ opacity: 0, x: -8 }}
transition={{ duration: 0.15 }}
```

---

## Color System

### Semantic Colors
```css
/* Primary actions */
--primary: hsl(220, 100%, 60%);
--primary-foreground: hsl(0, 0%, 100%);

/* Surface hierarchy */
--background: hsl(0, 0%, 100%);
--surface-1: hsl(220, 10%, 98%);
--surface-2: hsl(220, 10%, 95%);

/* Text hierarchy */
--foreground: hsl(220, 15%, 10%);
--muted-foreground: hsl(220, 10%, 45%);

/* Status */
--success: hsl(142, 70%, 45%);
--warning: hsl(38, 92%, 50%);
--error: hsl(0, 72%, 51%);
```

### Opacity Scale
| Use Case | Opacity |
|----------|---------|
| Primary text | 100% |
| Secondary text | 70% |
| Tertiary text (hints) | 50% |
| Disabled | 40% |
| Borders | 30% |
| Subtle backgrounds | 10% |

---

## Typography

### Scale
```css
--text-xs: 0.6875rem;   /* 11px - hints, labels */
--text-sm: 0.8125rem;   /* 13px - secondary */
--text-base: 0.875rem;  /* 14px - body */
--text-lg: 1rem;        /* 16px - titles */
--text-xl: 1.25rem;     /* 20px - headings */
```

### Weights
| Use | Weight |
|-----|--------|
| Body text | 400 (normal) |
| Emphasis | 500 (medium) |
| Headings | 600 (semibold) |

### Line Heights
| Text Size | Line Height |
|-----------|-------------|
| xs, sm | 1.4 |
| base | 1.5 |
| lg, xl | 1.3 |

---

## Spacing

### Scale
```css
--space-0: 0;
--space-0.5: 0.125rem;  /* 2px */
--space-1: 0.25rem;     /* 4px */
--space-1.5: 0.375rem;  /* 6px */
--space-2: 0.5rem;      /* 8px */
--space-3: 0.75rem;     /* 12px */
--space-4: 1rem;        /* 16px */
--space-6: 1.5rem;      /* 24px */
--space-8: 2rem;        /* 32px */
```

### Component Spacing
| Element | Padding |
|---------|---------|
| Button (sm) | 4px 8px |
| Button (md) | 6px 12px |
| Input | 8px 12px |
| Card | 16px |
| Dialog | 24px |

---

## Interactive States

### Hover Effects
```css
/* Subtle background change */
.interactive:hover {
  background-color: hsl(220, 10%, 95%);
  transition: background-color 150ms ease;
}

/* Text color shift */
.link:hover {
  color: var(--primary);
  transition: color 150ms ease;
}
```

### Focus States
```css
.focusable:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}
```

### Disabled States
```css
.disabled {
  opacity: 0.4;
  pointer-events: none;
}
```

### Loading States
```tsx
// Spinner for buttons
{isLoading && <Loader2 className="w-4 h-4 animate-spin" />}

// Skeleton for content
<div className="animate-pulse bg-surface-2 rounded h-4 w-32" />
```

---

## Component Patterns

### Buttons
```tsx
// Primary action
<Button variant="primary" size="sm">
  Save
</Button>

// Ghost action (secondary)
<Button variant="ghost" size="sm">
  Cancel
</Button>

// Icon-only (MUST have aria-label)
<Button variant="ghost" size="icon" aria-label="Close">
  <X className="w-4 h-4" />
</Button>
```

### Keyboard Hints
```tsx
<kbd className={cn(
  "px-1 py-0.5 rounded text-[9px]",
  "bg-surface-1 border border-border/30",
  "font-mono font-medium text-muted-foreground/50"
)}>
  ⌘K
</kbd>
```

### Empty States
```tsx
<div className="flex flex-col items-center justify-center py-12 text-center">
  <Icon className="w-12 h-12 text-muted-foreground/30 mb-4" />
  <h3 className="text-sm font-medium text-foreground mb-1">
    No items yet
  </h3>
  <p className="text-xs text-muted-foreground/60 max-w-xs">
    Get started by adding your first item.
  </p>
</div>
```

### List Items
```tsx
<div className={cn(
  "group flex items-center gap-3 px-3 py-2.5 rounded-lg",
  "hover:bg-surface-1/80 transition-colors duration-150"
)}>
  {/* Icon */}
  <div className="w-8 h-8 rounded-md flex items-center justify-center bg-surface-2/50">
    <Icon className="w-4 h-4" />
  </div>

  {/* Content */}
  <div className="flex-1 min-w-0">
    <span className="text-[13px] font-medium truncate">{title}</span>
    <p className="text-[11px] text-muted-foreground/60 truncate">{subtitle}</p>
  </div>

  {/* Actions - revealed on hover */}
  <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150">
    <Button variant="ghost" size="icon" aria-label="More actions">
      <MoreHorizontal className="w-4 h-4" />
    </Button>
  </div>
</div>
```

---

## Accessibility Requirements

### ARIA Labels
- All icon-only buttons
- Form inputs without visible labels
- Interactive icons
- Color pickers

### Keyboard Navigation
- All interactive elements focusable
- Tab order logical
- Escape closes modals/popovers
- Arrow keys for lists/menus

### Screen Reader
- Decorative icons: `aria-hidden="true"`
- Loading states announced
- Error messages associated with inputs
- Live regions for dynamic content

### Color Contrast
- Normal text: 4.5:1 minimum
- Large text: 3:1 minimum
- UI components: 3:1 minimum

---

## Anti-Patterns

### ❌ Don't Do
```tsx
// Missing button type
<button onClick={...}>

// Missing aria-label on icon button
<button type="button"><X /></button>

// Array index as key
{items.map((item, i) => <div key={i}>)}

// div as button
<div role="button" onClick={...}>

// Instant state changes
setVisible(!visible);
```

### ✅ Do Instead
```tsx
// Explicit button type
<button type="button" onClick={...}>

// aria-label present
<button type="button" aria-label="Close"><X /></button>

// Stable key
{items.map((item) => <div key={item.id}>)}

// Semantic element
<button type="button" onClick={...}>

// Animated transitions
<AnimatePresence>
  {visible && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} />}
</AnimatePresence>
```

---

## Review Checklist

### Before PR
- [ ] All buttons have `type="button"`
- [ ] Icon-only buttons have `aria-label`
- [ ] Animations use standard timing
- [ ] Hover states are subtle (150ms transition)
- [ ] Focus states are visible
- [ ] Loading states show spinners
- [ ] Empty states are helpful
- [ ] Color contrast meets WCAG AA
- [ ] Keyboard navigation works
