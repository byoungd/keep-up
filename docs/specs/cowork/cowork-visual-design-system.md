# Cowork Visual Design System (v2 - Arc/Dia Aligned)

> **Philosophy**: **Organization** (Arc) + **Simplicity** (Dia) + **Speed**.
>
> **Core Principle**: The interface is a **tool**, not a canvas. Content (user work, AI output) is the focus. The UI recedes. Every element must earn its place.

**Changelog (v2)**:
- Removed "Magic/Gradient" emphasis
- De-emphasized decorative blur ("Glassmorphism")
- Removed looping animations
- Refocused on Organization, Simplicity, Speed

---

## 1. Design Philosophy

### 1.1 The "Piano" Principle (Dia)
*   **Core Idea**: Simple inputs produce complex outputs. Complexity is **hidden**, not displayed.
*   **Application**:
    *   Standard, familiar layouts. Left Sidebar. Center Content. Right Context (optional).
    *   Advanced settings are tucked away. The main surface is clean.
    *   AI does the heavy lifting. The user stays in flow.
*   **Anti-pattern**: Exposing internal AI states (routing decisions, phase changes) unless user explicitly requests them. "Thinking..." text is enough.

### 1.2 The "Internet Computer" Principle (Arc)
*   **Core Idea**: The app is a **Workspace**. It manages state and context, not just displays content.
*   **Application**:
    *   **Sidebar-First**: The sidebar holds the user's "world state" (Sessions, Artifacts, Approvals).
    *   **Spaces**: Allow context-switching (e.g., "Project A" vs "Project B"). Each space remembers its state.
    *   **Command Bar (`Cmd+K`)**: The universal search and action interface. Should be the fastest way to do anything.
*   **Anti-pattern**: Hiding the sidebar to be "minimalist". The sidebar IS the organization.

### 1.3 Speed is a Feature
*   Latency is the enemy.
*   UI updates must be **optimistic** (appear instantly, reconcile later).
*   Interaction response: **< 16ms** (instant).
*   Data fetch to render: **< 100ms**.

---

## 2. Visual Language

### 2.1 Surfaces
The UI is **layered**, not **flat**. Layers are distinguished by **opacity and blur**, used **functionally**.

| Layer | Purpose | Technique |
| :--- | :--- | :--- |
| **Background** | The root. Static. | Solid color. Subtle noise allowed for texture, but not required. |
| **Surface 1 (Sidebar/Panels)** | Persistent navigation. | Slightly elevated. `bg-surface/50` + `backdrop-blur-sm`. Blur is functional (readability over varied backgrounds), not decorative. |
| **Surface 2 (Cards/Inputs)** | Content containers. | Higher opacity. Solid or near-solid fill. |
| **Overlays (Modals/Popovers)** | Demand attention. | Full blur behind. Modal surface is solid. |

> **Guideline**: If an element doesn't float, it probably doesn't need blur.

### 2.2 Typography
*   **Font**: `Inter` (UI), `JetBrains Mono` (Code/Data).
*   **Hierarchy via Weight**: Use **font-weight** to create hierarchy, not size.
    *   Headings: Semibold (600).
    *   Body: Regular (400).
    *   Muted: Regular (400) + lighter color.
*   **Keep it readable**: Avoid light text on light backgrounds. Contrast ratio ≥ 4.5:1.

### 2.3 Color

**Principle**: **90% Neutral, 10% Meaningful**.

*   **Neutral Foundation**: Backgrounds and most UI elements are monochrome (Grays, Black, White).
*   **Meaningful Color**: Reserved for **status** and **action**.

| Role | Color | Usage |
| :--- | :--- | :--- |
| **Primary Action** | Brand Blue/Indigo | Primary buttons, active states. Solid, not gradient. |
| **Success** | Emerald/Green | Completed tasks, saved states. |
| **Error** | Rose/Red | Failures, validation errors. |
| **Warning** | Amber/Orange | Requires attention (approvals, limits). |
| **AI Status** | Muted Violet/Gray | "Thinking" indicator. **Static text or icon**, not animated glow. |

> **Removed**: "Magic Gradient", "Colored Shadow Glow". These are decorative and distract from content.

---

## 3. Component Specifications

### 3.1 The Sidebar (Arc Style)
*   **Purpose**: The user's "state container". Always visible (unless minimized).
*   **Structure**:
    *   **Top**: Workspace/Profile switcher.
    *   **Middle**: Pinned Sessions, Favorites.
    *   **Bottom**: Recent items, Settings link.
*   **Interaction**: Collapsible to icons. Resizable width.
*   **Visual**: Subtle background difference from content area. **No hard border**; use whitespace or shadow.

### 3.2 The Chat Input
*   **Position**: Fixed at bottom (or centered when canvas is empty).
*   **Visual**: A "capsule" or "bar" that feels like a focused input field, not a toolbar.
*   **Behavior**: Large, inviting. Auto-focuses on page load.
*   **Actions**: Minimal. Send button (Arrow/Stop).

### 3.3 The Content Canvas
*   **Purpose**: Where user work and AI output live.
*   **Behavior**:
    *   Default: Chat messages flow vertically.
    *   Artifact: Large outputs (Code, Plans) expand into a **Split View** or a **Sheet**. Chat shifts to make room.
*   **Cards**: Artifacts appear as expandable cards within the stream.

### 3.4 Command Palette (`Cmd+K`)
*   **Purpose**: The power-user's primary interface.
*   **Features**: Search sessions, run actions, switch spaces.
*   **Visual**: Centered modal. Clean list. Fast filtering.
*   **Priority**: Recent items first.

---

## 4. Motion & Interaction

**Principle**: Motion is for **feedback**, not **decoration**.

### 4.1 Transitions
*   **Route Changes**: Fade in (150ms, ease-out). No scaling.
*   **Modals**: Fade in + subtle slide up (150ms).
*   **Sidebar Collapse**: Horizontal slide (fast, spring-based).

### 4.2 Hover States
*   **Buttons/Cards**: Subtle background color shift.
*   **Scale**: **Avoid** or use sparingly (1.01 max). Can feel gimmicky.
*   **Cursor**: `pointer` on interactive elements.

### 4.3 Status Indicators
*   **"Thinking" / Loading**: Static spinner or progress bar. Text: "Working..."
*   **Streaming**: Static "Streaming..." text with optional progress indicator.
*   **Removed**: Looping pulse animations, gradient borders.

### 4.4 Click Feedback
*   Buttons: Brief `active` state (darker background). No "squeeze" effect.

---

## 5. Implementation Checklist

1.  [x] **Remove decorative borders.** Use whitespace and background shifts.
2.  [x] **Use blur functionally.** Only for overlays and floating elements over varied backgrounds.
3.  [x] **Static status indicators.** No looping "pulse" or "shimmer".
4.  [x] **Solid colors for actions.** No gradients for buttons or status.
5.  [x] **Deep Dark Mode.** `#0a0a0a` or similar. Not pure black.
6.  [x] **Speed.** Every interaction feels instant.
