# Cowork Component Specifications

> This document defines the **Behavioral & API Contracts** for core Cowork components.
> Alignment: `Visual Design System` (Arc/Dia) & `Design Tokens`.

## 1. Core Primitives

### 1.1 Button (`<Button />`)
*   **Philosophy**: "Clicky", tactile, and responsive. No flat buttons.
*   **Variants**:
    *   `primary`: Background `foreground`, Text `background`. (The "Action" button).
    *   `secondary`: Background `surface-2`, Border `border`. (Standard actions).
    *   `ghost`: Transparent background, hover `surface-2`. (Icon buttons, tertiary).
    *   `danger`: Background `error/10`, Text `error`.
    *   **`magic`**: Animated gradient background. Used for "Generate", "Ask AI".
*   **States**:
    *   `loading`: Replaces icon with `Loader2` (spinner), preserves width.
    *   `disabled`: Opacity 50%, no pointer events.
*   **Props**:
    ```ts
    interface ButtonProps {
      variant?: "primary" | "secondary" | "ghost" | "danger" | "magic";
      size?: "sm" | "md" | "lg" | "icon";
      isLoading?: boolean;
      icon?: LucideIcon;
      iconPosition?: "left" | "right";
    }
    ```

### 1.2 Input (`<Input />` & `<Textarea />`)
*   **Philosophy**: "Capsule" or "Soft Rect". High contrast focus ring.
*   **Visual**:
    *   Background: `surface-2` (or `surface-1` with border).
    *   Border: `border` (transparent typically, visible on hover).
    *   Focus: `ring-2 ring-primary/20` + `border-primary`.
*   **Variants**:
    *   `default`: Standard form input.
    *   **`chat`**: The "Dia" input. Large text (text-lg), transparent pill, integrated "Send" button. auto-growing textarea.

### 1.3 Card (`<Card />`)
*   **Philosophy**: A container for content. Can be interactive.
*   **Visual**:
    *   Background: `surface-1` or `surface-2`.
    *   Border: `border` (1px).
    *   Radius: `rounded-lg` or `rounded-xl`.
*   **interactive**: If true, adds hover lift (scale 1.01) and border glow.

---

## 2. Layout Components

### 2.1 Sidebar (`<Sidebar />`)
*   **Philosophy**: Arc-style, collapsible, transparent.
*   **Behavior**:
    *   **Expanded**: Width ~240px. Blur backdrop (`surface-1`).
    *   **Collapsed**: Width ~64px. Icon only.
*   **Structure**:
    *   `<SidebarHeader />`: Workspace switcher.
    *   `<SidebarContent />`: Scrollable area for Items.
    *   `<SidebarFooter />`: User profile / Settings.

### 2.2 SplitPane (`<SplitPane />`)
*   **Philosophy**: Fluid resizing between Chat and Canvas.
*   **Props**:
    ```ts
    interface SplitPaneProps {
      left: ReactNode; // Chat
      right: ReactNode; // Canvas
      defaultRatio?: number; // e.g. 0.3 (30% chat)
      minSize?: number; // px
    }
    ```

---

## 3. Feedback & Overlay

### 3.1 Modal / Dialog (`<Dialog />`)
*   **Philosophy**: Center stage focus.
*   **Visual**:
    *   Backdrop: `bg-black/40` + `backdrop-blur-sm`.
    *   Panel: `surface-1` + `shadow-lg` + `border`.
    *   Animation: Zoom-in (0.95 -> 1.00) + Fade-in.
*   **Usage**: Critical confirmations, Settings.

### 3.2 Command Palette (`<Command />`)
*   **Philosophy**: The "Speed" interface.
*   **Visual**:
    *   Position: Fixed top-center (20%) or Center.
    *   Style: Glass texture (`bg-surface-0/80`).
    *   Look: "Raycast" or "Arc" style (Search bar prominent, distinct sections).

### 3.3 Toast (`<Toast />`)
*   **Philosophy**: Non-intrusive status.
*   **Position**: Bottom-right (or Bottom-center).
*   **Visual**: Small, pill-shaped, `surface-3` or `black` (inverse).

---

## 4. AI-Specific Components

### 4.1 ChatBubble (`<ChatBubble />`)
*   **Philosophy**: Distinct separation between "User" and "AI".
*   **AI Bubble**:
    *   Background: Transparent.
    *   Icon: Avatar or Logo.
    *   Content: Markdown rendered. Diffs/Cards embedded inline.
*   **User Bubble**:
    *   Background: `surface-2` (light gray) or `primary/10`.
    *   Shape: Rounded-2xl.

### 4.2 ThinkingIndicator (`<ThinkingIndicator />`)
*   **Philosophy**: Show *activity* not just wait time.
*   **Visual**:
    *   Collapsed: "Thinking..." with pulsing dot.
    *   Expanded: A "Log" stream of what the agent is doing (`plan`, `web_search`, `read_file`).
    *   Animation: Accordion style expand/collapse.
