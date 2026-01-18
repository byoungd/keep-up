# Cowork Layout Spec (v3 - Structural Foundation)

> **Philosophy**: **Structure** provides calm. **Geometry** provides softness.
> **Reference**: Arc (Sidebar/Spaces), iOS (Squircles).

---

## 1. The Container Geometry

The application window itself dictates the feel. We use **Squircles** (super-ellipses) to reduce visual tension.

### 1.1 Window & Panels
*   **Window Border Radius**: `12px` (Mac standard) or `16px` (Frameless).
*   **Panel Border Radius**: `12px` (nested panels).
*   **Shape**: Avoid sharp 90-degree corners on floating elements. Use `border-radius: 12px` (`rounded-lg`) consistently.

### 1.2 The "Border" Concept (Arc-like)
*   **The Frame**: The app content is "framed" by a border that represents the **current Space/Context**.
*   **Implementation**:
    *   A `4px` - `8px` padding around the main content area (Canvas).
    *   The background color of this frame creates the "Theme".
*   **Why**: separation of App Chrome (Sidebar) from Web Content (Canvas).

---

## 2. The Sidebar (The Nervous System)

**Role**: Holds the user's state. Always anchored.

### 2.1 Dimensions
*   **Collapsed**: `72px` (Icon only + Notification Badge).
*   **Expanded**: `240px` (Standard).
*   **Max**: `400px` (User resizable).

### 2.2 Sections
1.  **Space Switcher (Top)**:
    *   Horizontal scroll or Grid of Icons (Work, Personal, Dev).
    *   Theme Color indicator surrounds the active space icon.
2.  **Pinned Contexts (Middle)**:
    *   "Favorites". Always available.
    *   Height: Auto.
3.  **Active Tree (Bottom/Fill)**:
    *   Current session history.
    *   Tree structure (Folders/Tasks).

### 2.3 Visual Material
*   **Background**: `bg-surface-1` (See Design System v3).
*   **Transparency**: `98%` (Almost solid) or `bg-opacity-90` + `backdrop-blur-md` (If user enabled).
*   **No Border constraint**: The sidebar blends into the "Frame".

---

## 3. The Content Canvas (The "Web View")

**Role**: The "Page". It should feel independent of the chrome.

### 3.1 Layout
*   **Inset**: The canvas is a "Card" floating *inside* the App Frame.
*   **Shadow**: `shadow-sm` (Subtle lift) to separate from the Theme Frame.
*   **Background**: `bg-background` (Solid).

### 3.2 Split View (Task Mode)
*   **Ratio**: default 50/50, resizable.
*   **Left**: Chat / Command Stream.
*   **Right**: Artifact / Browser / Tool Output.
*   **Divider**: `1px` transparent hit area (`w-4` hover).

---

## 4. The Input Capsule (Dia-Style)

**Role**: The "Spotlight".

### 4.1 Positioning
*   **State: Empty**: Centered in the Canvas (Hero mode).
*   **State: Active**: Pinned to bottom `24px`.

### 4.2 Geometry
*   **Shape**: Pill / Stadia (`rounded-full` or `rounded-xl`).
*   **Width**: `max-w-3xl` (never full width).
*   **Elevation**: `shadow-lg` (Floating).

---

## 5. Responsive Breakpoints

| Breakpoint | Sidebar | Canvas | Input |
| :--- | :--- | :--- | :--- |
| **Mobile (<768px)** | Hidden (Drawer) | Full Screen | Fixed Bottom |
| **Tablet (<1024px)** | Icons (72px) | Inset | Floating |
| **Desktop (>1024px)** | Expanded (240px) | Inset | Floating |

---

## 6. Implementation Checklist

- [ ] **Frame**: Main content is wrapped in a `p-2` container with the Theme Background.
- [ ] **Squircles**: Use `figma-squircle` or CSS `clip-path` if possible, else standard `border-radius`.
- [ ] **Sidebar**: Resizable handle implementation.
- [ ] **Input Capsule**: Transitions between Center and Bottom positions using Layout Projection (Framer Motion).
