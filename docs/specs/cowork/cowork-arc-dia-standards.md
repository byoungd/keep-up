# Cowork Arc/Dia Quality Standards

> **Purpose**: To bridge the gap between "compliant spec implementation" (Linear-level) and "signature product experience" (Arc/Dia-level). This document defines the *experiential* and *compositional* standards required to achieve that ceiling.

---

## 1. Redefining "Calm Chrome"

**Old Definition**: "No decoration. Boring shell."
**New Definition**: **"Curated Minimalism with Optical Precision."**

It is not the *absence* of design, but the **perfect balancing** of it.

### 1.1 Optical Precision Rules
*   **The 6px Inset**: The Canvas must separate from the Window Frame by exactly `6px` on desktop. This creates the "Application Frame" feel rather than a web page.
*   **Alignment**: All vertical rhythm must align to the **4px baseline**. Text baselines, container edges, and icon centers must hit this grid.
*   **Contrast Rhythm**:
    *   **Low Contrast**: Structural divisions (Sidebar vs Canvas). Use `bg-surface-1` vs `bg-surface-0`. *Never* use high-contrast borders for structure.
    *   **High Contrast**: Content and Action. Text is `foreground`. Primary inputs have `ring`.
    *   **Rule**: If you squint, the *structure* should disappear, leaving only *content*.

### 1.2 The "Material" of Calm
*   **Solid, not Flat**: Surfaces should feel like they have *mass*.
*   **Sidebar**: Is not just "gray background". It is a distinct material (User Tintable).
*   **Canvas**: Is a physical sheet of paper sitting *on top* of the Sidebar/Frame.
*   **Shadows**: Use `shadow-soft` (large blur, low opacity) to lift the Canvas off the Frame. Avoid generic `shadow-md`.

---

## 2. Visual Grammar & Composition

### 2.1 Screen Composition Strategy
Structure the screen to guide the eye, not just hold components.

*   **The Golden Ratio of Density**:
    *   **Sidebar**: High Density (Compact lists, 13px type).
    *   **Canvas**: "Breathing Room" (Comfortable reading, 15px type, 72ch width).
    *   **Rail**: Contextual Density (Information snippets, cards).
*   **Empty States are Canvases**: Never leave a white void. Use the "Center of Gravity" principle—content sits optically centered (45% from top), not mathematically centered (50%).

### 2.2 Iconography "Signature"
*   **Weight**: Strictly **2px stroke**. Matches the weight of standard text.
*   **Optical Size**: Icons must visualy balance with text.
    *   Next to 13px text -> 16px icon.
    *   Next to 15px text -> 18px icon.
*   **Color**: Icons are **Text Color**, not "Icon Color". They are part of the typography.

### 2.3 Layering Physics
We enforce exactly **3 Layers** of depth at rest:

1.  **Level 0: The Frame (App Background)**
    *   Concept: The desk surface.
    *   Color: `theme-base` (Tinted).
    *   Contains: Sidebar, Window Controls.
2.  **Level 1: The Canvas (Work Surface)**
    *   Concept: The paper you are working on.
    *   Color: `bg-canvas` (White/Dark).
    *   Shadow: `shadow-sm` or `shadow-soft`.
    *   Contains: Chat, Artifacts.
3.  **Level 2: The Overlay (Transient)**
    *   Concept: A sticky note or tool hovering above.
    *   Color: `bg-surface-elevated`.
    *   Shadow: `shadow-lg` + `backdrop-blur`.
    *   Contains: Command Palette, Popovers, Peek Artifacts.

**Violation**: Using a "Level 1.5" (e.g., a card *inside* the canvas with a shadow). Cards inside the canvas should use **borders** or **color fills**, not elevation shadows, to maintain the clean, single-surface feel of the canvas.

---

## 3. Motion: The "Expansive" Feel

Resolve conflicts between specs: **We follow the `cowork-motion-spec.md` v3 rules**, focusing on *responsive feedback*.

### 3.1 The "Layout Projection" Rule
When opening an artifact (Peek -> Pin -> Split):
*   **Concept**: The element doesn't "fade in from nowhere". It **expands** from its origin link.
*   **Technique**: Use Layout Projection (FLIP). The container grows; the content crossfades if needed.
*   **Feeling**: Continuity. You don't lose your place.

### 3.2 The Single "Magic" Loop
*   **Restraint**: No loaders or spinners for standard XHR. Use static skeletons.
*   **Magic**: The **AI Thinking Shimmer** (`ai-sheen-line`) is the *only* allowed continuous animation. It signals "Intelligence at Work".

---

## 4. Experiential Quality Gates

Add these qualitative checks to the review process to ensure Arc/Dia feel.

### 4.1 The "Squint Test" (Focus)
*   [ ] **Pass**: When squinting, do I see *Content blocks*?
*   [ ] **Fail**: Do I see *Grid lines* or *Gray boxes*?

### 4.2 The "Fluidity Check" (Flow)
*   [ ] **Pass**: Does the UI feel like it updates *instantly* (Optimistic UI)?
*   [ ] **Pass**: Does opening a panel feel like *shifting focus* (Layout Projection), not *loading a new page*?

### 4.3 The "Material Integrity" Check
*   [ ] **Pass**: Are there exactly 3 layers of depth?
*   [ ] **Pass**: Is the Canvas clearly separated from the Frame (6px inset)?
*   [ ] **Pass**: **Binding Interaction Physics**: Do Hover and Active states share the same material physics? (e.g., both Alpha-bases or both Solid)? NO mixing `bg-surface-2` (Solid) with `bg-foreground/10` (Alpha).

---

## 5. Implementation Guide: From Shadcn to Arc

| Shadcn Pattern | Arc/Dia Upgrade |
|:---|:---|
| **Bordered Card** | **Borderless Surface** (`bg-surface-2`) + Hover Lift (Color shift, no shadow) |
| **Outline Input** | **Soft Input** (`bg-surface-2`) + `ring-1` on Focus only |
| **Separator Line** | **Whitespace** or `bg-border/30` (very subtle) |
| **Sheet (Side)** | **Right Rail** (Pushes content, doesn't just overlay) |
| **Toast** | **Status Pill** (Inline or less obtrusive) |

---
