# Cowork Design Tokens Spec (v2 - Simplified)

> **Principle**: Tokens define a **functional palette**, not a decorative one.
> Implementation: `packages/design-system/src/tokens.ts` & `src/theme.css`.

**Changelog (v2)**:
- Removed "glow" and "shimmer" effects
- Simplified accent system (no gradients)
- Aligned with v2 Visual Design System

---

## 1. Color System

Components should use **semantic tokens**, never raw hex codes.

### 1.1 Surfaces & Backgrounds
| Token | CSS Variable | Description |
| :--- | :--- | :--- |
| **`background`** | `--color-background` | Root page background. Deep gray in dark mode. |
| **`surface-0`** | `--color-surface-0` | Base elevation. Same as background or slightly lifted. |
| **`surface-1`** | `--color-surface-1` | Sidebar, Panels. Slightly elevated. Optional subtle blur. |
| **`surface-2`** | `--color-surface-2` | Cards, Inputs. Solid fill. |
| **`surface-3`** | `--color-surface-3` | Hover/Active states on cards. |
| **`overlay`** | `--color-overlay` | Modal backdrop. `rgba(0,0,0,0.5)` with blur. |

### 1.2 Foreground & Content
| Token | CSS Variable | Description |
| :--- | :--- | :--- |
| **`foreground`** | `--color-foreground` | Primary text. High contrast. |
| **`muted-foreground`** | `--color-muted-foreground` | Secondary text, labels, timestamps. |
| **`subtle-foreground`** | `--color-subtle-foreground` | Disabled text, placeholders. |

### 1.3 Borders
| Token | CSS Variable | Description |
| :--- | :--- | :--- |
| **`border`** | `--color-border` | Structural borders. Low opacity (5-10%). |
| **`input`** | `--color-input` | Input field borders. Slightly more visible. |
| **`ring`** | `--color-ring` | Focus ring. Uses primary color. |

### 1.4 Status & Accents
Colors for **meaningful information only**.

| Role | Color Family | Token |
| :--- | :--- | :--- |
| **Primary (Brand/Action)** | Indigo/Blue | `accent-primary` |
| **Success** | Emerald | `accent-success` |
| **Warning** | Amber | `accent-warning` |
| **Error** | Rose | `accent-error` |
| **Muted (AI Status)** | Gray/Dim Violet | `accent-muted` |

> **Removed**: `accent-indigo-glow`, `accent-gradient`. No "magic" colors.

---

## 2. Typography

**Font Family**: 
*   UI: `Inter`, `system-ui`, sans-serif.
*   Code: `JetBrains Mono`, `Fira Code`, monospace.

### 2.1 Scale
| Token | Size | Line Height | Tracking | Usage |
| :--- | :--- | :--- | :--- | :--- |
| **`text-xs`** | 12px | 16px | 0 | Metadata, Captions |
| **`text-sm`** | 14px | 20px | 0 | Body, Buttons |
| **`text-base`** | 16px | 24px | 0 | Main content, Chat |
| **`text-lg`** | 18px | 28px | -0.01em | Subheadings |
| **`text-xl`** | 20px | 28px | -0.01em | Page Titles |
| **`text-2xl`** | 24px | 32px | -0.02em | Hero Titles |

### 2.2 Weights
| Weight | Value | Usage |
| :--- | :--- | :--- |
| Regular | 400 | Body text |
| Medium | 500 | Button labels, highlights |
| Semibold | 600 | Headings, Active states |

---

## 3. Radii & Spacing

### 3.1 Border Radius
| Token | Value | Usage |
| :--- | :--- | :--- |
| **`rounded-sm`** | 4px | Checkboxes, Tags |
| **`rounded-md`** | 8px | Buttons, Inputs |
| **`rounded-lg`** | 12px | Cards, Panels, Modals |
| **`rounded-full`** | 9999px | Pills, Avatars |

### 3.2 Spacing (4px Grid)
| Token | Value |
| :--- | :--- |
| `0.5` | 2px |
| `1` | 4px |
| `2` | 8px |
| `3` | 12px |
| `4` (**Base**) | 16px |
| `6` | 24px |
| `8` | 32px |

---

## 4. Effects

### 4.1 Shadows (Functional)
| Token | Value | Usage |
| :--- | :--- | :--- |
| **`shadow-sm`** | `0 1px 2px rgba(0,0,0,0.05)` | Subtle depth for cards. |
| **`shadow-md`** | `0 4px 6px rgba(0,0,0,0.1)` | Floating elements. |
| **`shadow-lg`** | `0 10px 15px rgba(0,0,0,0.15)` | Modals, Command Palette. |

> **Removed**: `shadow-glow`. Colored shadows are decorative.

### 4.2 Backdrop Blur (Functional)
| Token | Value | Usage |
| :--- | :--- | :--- |
| **`backdrop-blur-sm`** | 8px | Sidebar over varied content. |
| **`backdrop-blur-md`** | 12px | Panels if needed. |
| **`backdrop-blur-lg`** | 20px | Modal overlays. |

> **Guideline**: Use blur for **readability**, not aesthetics. If the background is solid, no blur needed.

---

## 5. Dark Mode Values

| Token | Light | Dark |
| :--- | :--- | :--- |
| `background` | `#ffffff` | `#0a0a0a` |
| `surface-1` | `#fafafa` | `#141414` |
| `surface-2` | `#f5f5f5` | `#1c1c1c` |
| `foreground` | `#0a0a0a` | `#fafafa` |
| `muted-foreground` | `#6b7280` | `#9ca3af` |
| `border` | `rgba(0,0,0,0.08)` | `rgba(255,255,255,0.08)` |
