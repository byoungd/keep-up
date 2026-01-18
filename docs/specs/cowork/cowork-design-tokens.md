# Cowork Design Tokens Spec

> This document defines the **atomic design tokens** for the Cowork design system.
> Implementation Reference: `packages/design-system/src/tokens.ts` & `src/theme.css`.

## 1. Color System

We use a semantic alias system. Components should **never** use raw hex codes.

### 1.1 Surfaces & Backgrounds
| Token | Variable | Use Case |
| :--- | :--- | :--- |
| **`background`** | `--color-background` | The root page background. Slightly noisy in dark mode. |
| **`surface-0`** | `--color-surface-0` | Base surface. Same as background in light mode. |
| **`surface-1`** | `--color-surface-1` | Sidebar, Panels. `backdrop-filter` applied. |
| **`surface-2`** | `--color-surface-2` | Cards, Inputs. Higher opacity for better contrast. |
| **`surface-3`** | `--color-surface-3` | Hover states on cards/buttons. |
| **`glass`** | (Utility Class) | `bg-white/5` + `backdrop-blur-xl` + `border-white/10`. |

### 1.2 Foreground & Content
| Token | Variable | Use Case |
| :--- | :--- | :--- |
| **`foreground`** | `--color-foreground` | Primary text (Headings, Body). |
| **`muted-foreground`** | `--color-muted-foreground` | Secondary text, labels, timestamps. |
| **`subtle-foreground`** | `--color-subtle-foreground` | Disabled text, placeholders. |

### 1.3 Borders
| Token | Variable | Use Case |
| :--- | :--- | :--- |
| **`border`** | `--color-border` | Default structural borders (5-10% opacity). |
| **`input`** | `--color-input` | Input field borders. |
| **`ring`** | `--color-ring` | Focus states. |

### 1.4 Status & Accents
| Role | Color Family | Token Example |
| :--- | :--- | :--- |
| **Brand (AI/Magic)** | Violet/Indigo | `accent-indigo`, `accent-indigo-glow` |
| **Success** | Emerald | `accent-emerald` |
| **Warning** | Amber | `accent-amber` |
| **Error** | Rose/Red | `accent-rose` |
| **Info** | Sky/Blue | `accent-cyan` |

---

## 2. Typography

**Font Family**: `Inter` (Sans), `JetBrains Mono` (Mono).

### 2.1 Scale & Leading
| Token | Size | Line Height | Tracking | Use Case |
| :--- | :--- | :--- | :--- | :--- |
| **`text-xs`** | 12px | 16px | 0 | Metadata, Captions |
| **`text-sm`** | 14px | 20px | 0 | Body, Inputs, Buttons |
| **`text-base`** | 16px | 24px | 0 | Main Content, Chat Messages |
| **`text-lg`** | 18px | 28px | -0.01em | Subheadings |
| **`text-xl`** | 20px | 28px | -0.01em | Page Titles |
| **`text-2xl`** | 24px | 32px | -0.02em | Hero Titles |

### 2.2 Weights
*   **Regular (400)**: Body text.
*   **Medium (500)**: Highlights, Button labels.
*   **Semibold (600)**: Headings, Active states.

---

## 3. Radii & Spacing

### 3.1 Border Radius
*   **`rounded-sm`** (4px): Inner elements (checkboxes, tags).
*   **`rounded-md`** (8px): Buttons, Inputs, Small cards.
*   **`rounded-lg`** (12px): **Standard** for Windows, Panels, Modals.
*   **`rounded-xl`** (16px): Large containers, "Smooth" feel.
*   **`rounded-full`**: Pills, Avatars.

### 3.2 Spacing Scale
Based on **4px** grid.
*   `0.5` (2px)
*   `1` (4px)
*   `2` (8px)
*   `3` (12px)
*   `4` (16px) - **Base Unit**
*   `6` (24px)
*   `8` (32px)

---

## 4. Effects (Shadows & Blurs)

### 4.1 Shadows
*   **`shadow-sm`**: Subtle depth for cards.
*   **`shadow-md`**: Floating elements (Popovers).
*   **`shadow-lg`**: Modals, Command Palette.
*   **`shadow-glow`**: Colored shadow for AI states (`0 0 20px var(--accent-color)`).

### 4.2 Blurs (Backdrop)
*   **`backdrop-blur-md`** (12px): Standard panels.
*   **`backdrop-blur-xl`** (24px): Overlay backgrounds, Modal backdrops.
