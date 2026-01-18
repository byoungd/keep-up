# Cowork Visual Design System

> **Philosophy**: A synthesis of **Arc's fluid organization** and **Dia's AI-native simplicity**.
>
> **Core Principle**: The interface is a "living surface" where content and AI conversation coexist fluidly. It is "chromeless" by default, prioritizing focus, yet "magical" in its responsiveness and motion.

**Related Specs:**
- [Design Tokens](file:///Users/han/Documents/Code/Parallel/keep-up/docs/specs/cowork/cowork-design-tokens.md) — Atomic color, typography, spacing
- [Component Spec](file:///Users/han/Documents/Code/Parallel/keep-up/docs/specs/cowork/cowork-component-spec.md) — Component contracts
- [Motion Spec](file:///Users/han/Documents/Code/Parallel/keep-up/docs/specs/cowork/cowork-motion-spec.md) — Animation physics
- [Reference Implementation](file:///Users/han/Documents/Code/Parallel/keep-up/docs/specs/cowork/cowork-reference-implementation.md) — Gold standard code
- [Quality Gates](file:///Users/han/Documents/Code/Parallel/keep-up/docs/specs/cowork/cowork-ui-quality-gates.md) — Definition of Done

---

## 1. Design Philosophy

### 1.1 The "Piano" vs. "Saxophone" (Dia Influence)
*   **Concept**: We prioritize **Simplicity over Novelty**. The tool should feel like a "Piano" (familiar keys, infinite potential, distinct layout) rather than a "Saxophone" (complex fingering, high learning curve).
*   **Application**:
    *   Standard layouts where possible (Sidebar Left, Content Center, Context Right).
    *   Hiding complexity: Advanced controls (like granular model params) are tucked away in "Details" or settings, not on the main stage.
    *   **Speed is a Feature**: Latency is the enemy. UI updates must be optimistic and instant (under 16ms for interaction, under 100ms for data).

### 1.2 The "Internet Computer" (Arc Influence)
*   **Concept**: The app is a **Workspace**, not just a feed. It must support managing state, collecting artifacts, and organizing "messy" creative work.
*   **Application**:
    *   **Spaces**: distinct contexts for different tasks (e.g., "Research", "Coding", "Review").
    *   **Sidebar-First**: The primary navigation is vertical. It holds the "Context" (Chats, Files, Artifacts).
    *   **Fluidity**: Elements don't just "appear"; they slide, expand, and morph. The UI feels liquid.

### 1.3 AI-Native Surface (Dia Influence)
*   **Concept**: The AI is not a chatbot in a drawer; it is the **Host** of the application.
*   **Application**:
    *   **Conversation as Root**: The primary view is the Chat Thread.
    *   **Tools as Content**: When the AI runs a tool (browser, terminal), it doesn't open a popup; it expands the "Canvas" or renders an inline card. The content *is* the tool output.

---

## 2. Visual Language

### 2.1 Surfaces & Materials
We strictly follow a "Material" hierarchy based on transparency and blur (Apple/Arc style), moving away from flat solid backgrounds.

*   **Base Layer (`bg-background`)**: The root application layer. Subtle noise texture allowed. Dark/Light adaptive.
*   **Surface 1 (`bg-surface-1`)**: Sidebar / Panels. `backdrop-filter: blur(20px)` + `bg-white/5` (Dark) or `bg-black/5` (Light).
*   **Surface 2 (`bg-surface-2`)**: Secondary cards, inputs. Higher opacity.
*   **Glass**: Used for floating elements (Command Palette, Toast, Sticky Headers).
*   **Borders**: Ultra-thin (`1px`), low opacity (`border-white/10`).
*   **Shadows**: Deep but diffused. Colored shadows allowed for "Magic" states (AI thinking, Success).

### 2.2 Typography
*   **Family**: `Inter` (or System Default San Francisco/Segoe).
*   **Weights**: Heavy reliance on **font-weight** to denote hierarchy rather than size.
    *   **Headings**: Bold/Black, Tracking-tight (-0.02em).
    *   **Body**: Regular/Medium.
    *   **Mono**: `JetBrains Mono` or `Fira Code` for all code/data.

### 2.3 Color & Magic
*   **Neutral Foundation**: 90% of the UI is monochrome (Grays, Black, White). Content provides the color.
*   **Brand/Magic Color**: A vibrant gradient (e.g., Purple/Blue/Pink) used *only* for AI actions.
    *   **"Thinking" State**: animated gradient border or glow.
    *   **"Focus" State**: subtle colored halo.
*   **Status Colors**:
    *   **Success**: Emerald/Teal (Arc Green).
    *   **Error**: Rose/Red (Soft, not alarming).
    *   **Warning**: Amber/Orange.
    *   **Info**: Blue/Sky.

---

## 3. Component Specifications

### 3.1 The Sidebar (Arc Style)
*   **Behavior**: Collapsible, resizable.
*   **Content**:
    *   **Top**: User/Workspace switcher.
    *   **Middle**: "Pinned" contexts (Sessions, Favorites).
    *   **Bottom**: "Recent" items (Session history).
*   **Visual**: Transparent/Glass. No hard right border (use slight shadow or color difference).

### 3.2 The Chat Input (Dia/Linear/Perplexity Style)
*   **Position**: Sticky bottom (or center for new tasks).
*   **Visual**: A floating "capsule" or "bar".
*   **Typography**: Large input text (16px+).
*   **Actions**: Minimal icons. "Send" button transforms based on state (Stop / Arrow).

### 3.3 The Content Canvas
*   **Concept**: Where "Artifacts" live.
*   **Behavior**: When AI generates a Plan, Code, or Preview, it pushes the Chat to the side (Split View) or opens a "Sheet".
*   **Cards**: Artifacts appear as "Cards" in the stream. Clicking them "Expands" them to the Canvas.

### 3.4 Command Palette (Primary Nav)
*   **Trigger**: `Cmd+K`.
*   **Design**: Centered, floating glass modal.
*   **Items**: Rich rows with icons (Lucide).
*   **Recents**: Top section is always "Recent Sessions" or "Context".

---

## 4. Motion & Micro-interactions

*   **Principle**: "Physics-based". No linear ease. Use springs (stiff/damping).
*   **Transitions**:
    *   **Page**: Fade + Scale (0.98 -> 1.00).
    *   **Sheet/Sidebar**: Slide (Spring).
    *   **List Items**: Layout ID animation (Framer Motion style).
*   **Hover**: Hovering elements should "lift" (scale 1.02) or "glow".

## 5. Implementation Guide (Tailwind v4)

```css
/* Theme Tokens */
:root {
  --radius-window: 12px;
  --radius-card: 12px;
  --radius-button: 8px;
  
  --glass-panel: rgba(255, 255, 255, 0.05);
  --glass-border: rgba(255, 255, 255, 0.08);
  --blur-panel: 24px;
}

.glass {
  background: var(--glass-panel);
  backdrop-filter: blur(var(--blur-panel));
  border: 1px solid var(--glass-border);
}

.shimmer {
  /* Animated gradient background */
}
```

## 6. Checklist for "Dia/Arc" Feel
1.  [ ] **Remove 50% of the borders.** Use whitespace and background distinction instead.
2.  [ ] **Add Motion.** Every state change (hover, click, load) must have a transition.
3.  [ ] **Rounded Corners.** Aggressive rounding on windows/cards (12px-16px).
4.  [ ] **"Grain".** Add a subtle SVG noise overlay to the background to reduce "digital harshness".
5.  [ ] **Vibrant Dark Mode.** Don't use `#000000`. Use `#050505` or deeply saturated dark colors (Midnight Blue/Gray).
