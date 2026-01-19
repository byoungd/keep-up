# Cowork Visual Design System (v3 - Definitive)

> **Core Philosophy**: **Tuesday Morning Familiarity** + **AI Precision Power**.
> **Influences**: Arc (Structure/Theming), Dia (Simplicity/Restraint), Linear (Precision).

---

## 1. The "Novelty Budget" Strategy

We spend our limited "Novelty Budget" **exclusively** on AI features.

### 1.1 "Tuesday Morning" (The Shell)
*   **Goal**: Familiar, Invisible, Calm.
*   **Rules**:
    *   No "Magic" gradients on navigation or sidebars.
    *   Standard icons (Lucide).
    *   Predictable physics (Collapsing sidebar behaves like a physical object).

### 1.2 "The Novelty Spend" (The AI)
*   **Goal**: Signal Intelligence and Power.
*   **Rules**:
    *   **Violet/Indigo** is reserved for AI.
    *   **Motion**: Tools "stack" playfully. Input bar "morphs" when processing.
    *   **Thinking**: A subtle, beautiful indicator (e.g., a shifting hue line, not a strobe light).

---

## 2. Surfaces & Framing (Arc Style)

The app is defined by **Frames (Spaces)**.

### 2.1 The Theme Frame
*   The "Background" is actually a **Theme Frame**.
*   **Boosts Concept**: Users can tint this frame.
*   **Default**: `zinc-100` (Light) / `zinc-900` (Dark).
*   **Role**: Differentiates context (e.g., "Work" = Blue Tint, "Personal" = Pink Tint).

### 2.2 The Canvas (The Web)
*   Sitting *on top* of the Frame.
*   **White** (Light) / **Gray-950** (Dark).
*   **Elevation**: `shadow-sm`.
*   **Border Radius**: `12px` (Squircle).

---

## 3. Typography

**Font**: `Inter` (Variable).

### 3.1 Weight as Hierarchy
*   **Heavy (600)**: Primary Headings.
*   **Regular (400)**: Body.
*   **Medium (500)**: UI Labels (Sidebar, Buttons).

### 3.2 Size Scale
*   `13px`: Sidebar / Meta (High density).
*   `15px`: Body / Chat (Readability).
*   `24px`: Headings.

> **Note**: We use `13px` for UI chrome to feel "Pro/Dense" (like VS Code/Linear), and `15px` for Chat to feel "Readable" (like Medium/Arc Reader).

---

## 4. Color System

### 4.1 Semantic Roles
| Role | Token | Color | Usage |
| :--- | :--- | :--- | :--- |
| **Theme Base** | `bg-theme` | User-defined Tint | The App Frame. |
| **Canvas** | `bg-canvas` | White / Gray-950 | The main work area. |
| **Sidebar** | `bg-sidebar` | Transparent / Tinted | Sits on Theme Base. |
| **Primary** | `accent-primary` | Indigo-600 | Buttons, Active State. |
| **AI (Magic)** | `accent-ai` | **Violet-500** (base), `violet-600` (active) | Only for AI generation. |

### 4.2 Status Colors (Restrained)
*   **Success**: `emerald-600` (Text/Icon) - No full green backgrounds.
*   **Error**: `rose-600`.
*   **Warning**: `amber-500`.

---

## 5. Definition of "Done" (Visual)

1.  **The "Squint Test"**: If you squint, the most prominent thing should be the **Content (Chat/Artifact)**, not the Sidebar or Buttons.
2.  **No Grey Walls**: The UI is structured by **spacing and frames**, not 1px grey borders everywhere.
3.  **Themeable**: Changing `bg-theme` should change the "vibe" of the entire app without breaking contrast.

---

## 6. Visual Signature (Arc/Dia Bar)

1.  **Frame/Canvas Separation**: Maintain a `6px` inset between window edge and canvas on desktop. Canvas is never full-bleed.
2.  **Chrome Restraint**: Shell surfaces are borderless. Use 1px borders only for inputs, focus rings, and data tables.
3.  **Accent Discipline**: `accent-primary` is for app-level actions and selection. `accent-ai` is for AI-only moments.
4.  **Material Grammar**: Only three elevations at rest (Frame, Canvas, Overlay). No colored glows.

---

## 7. Typography and Rhythm

*   **Inter Variable** with optical sizing when available.
*   **Sizes**: UI `13px`, meta `12px`, chat `15px`, headings `20-24px`.
*   **Line Length**: Chat content targets 72-80 characters per line on desktop.

---

## 8. Iconography

*   **Lucide** only. `2px` stroke.
*   **Sizes**: `16px` inline, `20px` rails, `24px` empty states.
*   **Style**: Outline icons for controls; filled icons only for status badges.

---

## 9. AI Signature Layer

*   **Allowed**: A subtle AI sheen line under the active AI message or input.
*   **Allowed**: A single thinking shimmer (looping) during generation.
*   **Not Allowed**: Gradients in the shell, sidebar, or at-rest chrome.
