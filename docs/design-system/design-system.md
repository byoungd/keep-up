# Design System

This document catalogs the Reader app's component library and design tokens.

## Design Tokens

Defined in `apps/reader/app/globals.css`:

### Colors
| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--color-primary` | Slate 900 | Zinc 50 | Primary actions, links |
| `--color-muted-foreground` | Slate 500 | Zinc 400 | Secondary text |
| `--color-surface-2` | Slate 100 | Zinc 800 | Hover states, cards |
| `--color-border` | Slate 200 | Zinc 800 | Borders, dividers |

### Spacing & Radius
| Token | Value | Usage |
|-------|-------|-------|
| `--radius` | 8px | Standard containers |
| `--radius-sm` | 4px | Inner items, badges |
| `--radius-2xl` | 16px | Modals, dialogs |

### Motion
| Token | Value | Usage |
|-------|-------|-------|
| `--duration-fast` | 100ms | Micro-interactions |
| `--duration-normal` | 200ms | Standard transitions |
| `--ease-smooth` | cubic-bezier(0.4, 0, 0.2, 1) | Default easing |

### Density System
| Mode | Row Height | Font Size | Padding |
|------|------------|-----------|---------|
| Compact | 32px | 13px | 6px / 8px |
| Default | 40px | 14px | 10px / 12px |
| Comfortable | 48px | 15px | 14px / 16px |

Use `useDensity()` hook to access/set density mode.

---

## Component Catalog

### Primitives (`components/ui/`)
| Component | Description |
|-----------|-------------|
| `Button` | Primary action button with variants |
| `ButtonGroup` | Grouped buttons with merged borders |
| `Input` | Text input with icons |
| `SearchInput` | Search-specific input with clear button |
| `Badge` | Status indicators |
| `Dialog` | Modal dialogs |
| `Sheet` | Slide-out panels |
| `Toast` | Notifications |

### Navigation (`components/ui/`)
| Component | Description |
|-----------|-------------|
| `NavSection` | Semantic nav container |
| `NavGroup` | Collapsible group header |
| `NavItem` | Navigation link with icon/badge |

### Lists (`components/ui/`)
| Component | Description |
|-----------|-------------|
| `List` | Keyboard-navigable list container |
| `ListRow` | Density-aware list item |
| `ListSection` | List section header |

---

## Do's and Don'ts

### ✅ Do
- Use design tokens, not hardcoded values
- Use `cn()` utility for conditional classes
- Support keyboard navigation
- Use semantic HTML (`nav`, `button`, `fieldset`)

### ❌ Don't
- Use inline colors (`#fff`, `rgb()`)
- Skip focus states
- Use `div` with `onClick` instead of `button`
- Create one-off components without extracting to UI
