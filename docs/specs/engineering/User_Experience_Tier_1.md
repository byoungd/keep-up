# Top-Tier UX & Design Specification (Phase 5)

**Goal:** Elevate the editor from "Functional Prototype" to "World-Class Product" (Reference: Notion, Linear, Superhuman).
**Core Philosophy:** "Fluid, Fast, Focused."

## 1. Motion Design System (`framer-motion`)

The editor should feel "alive" but not "bouncy". Motion implies physics and continuity.

### 1.1 Physics Constants
Use consistent springs for all interactions.
```typescript
export const SPRINGS = {
  // Snappy, for small interactions (buttons, toggles)
  micro: { type: "spring", stiffness: 500, damping: 30 },
  // Smooth, for layout changes (list reordering, panel open)
  layout: { type: "spring", stiffness: 350, damping: 35 },
  // Heavy, for large page transitions
  page: { type: "spring", stiffness: 200, damping: 25 },
};
```

### 1.2 Layout Projection
Everything that changes position must animate to its new place.
- **Lists:** Wrap `BlockList` items in `<Reorder.Item>` or use `layout` prop. When a block is deleted, the blocks below slide up (don't snap).
- **Drag Reorder:** Dragged items should lift (scale: 1.02, shadow-lg) and displace siblings smoothly.

### 1.3 Micro-Interactions
- **Buttons:** `whileTap={{ scale: 0.98 }}`.
- **Toggles:** Smooth background color transition with layout projection for the handle.

## 2. Command Architecture (Slash Menu)

Instead of hardcoded menus, implemented a centralized **Command Registry**.

### 2.1 Technology
- **Engine:** `cmdk` (Radix UI Primitive) for accessible, compostable combobox.
- **Trigger:** Type `/` at the start of an empty text block.

### 2.2 Command Schema
```typescript
interface Command {
  id: string;
  label: string;
  icon: React.ReactNode;
  keywords: string[]; // for fuzzy search
  perform: (editor: EditorController) => void;
  section: "Basic" | "Media" | "AI" | "Advanced";
}
```

### 2.3 Required Commands
- **Text:** Heading 1/2/3, Bullet List, Ordered List, Check List, Quote, Code.
- **Insert:** Divider, Image (placeholder), Table.
- **AI:** "Improve Writing", "Summarize", "Translate".

## 3. Canvas Physics & Interaction

### 3.1 Magical Block Handles
The "Drag Handle" is the primary affordance for structural manipulation.
- **Visibility:** Fade in on hover (delay: 50ms).
- **Position:** Relative `-left-4` or `-left-8` depending on nesting.
- **Interaction:**
  - **Click:** Select block (blue border).
  - **Drag:** Instantly creates a "Ghost" of the block text.
  - **Drop Indicator:** A 2px solid blue line that snaps between blocks.

### 3.2 Focus Mode (Zen)
- **Trigger:** `Cmd+\` or View Menu.
- **Effect:**
  - Fade out Top Bar, Sidebar, and Status Bar.
  - Center content max-width.
  - `AnimatePresence` for smooth exit/entry of chrome.

### 3.3 Markdown Shortcuts (Auto-format)
Typing specific patterns triggers instant state changes (no raw markdown left behind).
- `# ` → Heading 1
- `## ` → Heading 2
- `- ` → Bullet List
- `[] ` → Check List
- `> ` → Blockquote
- `---` → Divider (Horizontal Rule)

## 4. Visual Polish (The "Last 10%")

### 4.1 Typography
- **Vertical Rhythm:** Base line-height `1.5` or `1.6` for paragraphs. Headings `1.2`.
- **Spacing:** `margin-top` on headings should be `2.5x` the `margin-bottom` to visually group with content below.

### 4.2 Glassmorphism & Depth
- **Overlays:** (Command Menu, Toolbar) use `backdrop-filter: blur(12px)` + `bg-white/80` (or `bg-black/80`).
- **Shadows:** Multi-layer shadows for depth.
  - `shadow-sm`: Buttons.
  - `shadow-xl` + `ring-1`: Floating Menus.

### 4.3 Cursor & Caret
- Ensure custom caret color matches the brand (Indigo-500).
- Selection color: `bg-indigo-500/20` (not default browser blue).

## 5. Implementation Roadmap (Granular)

1.  **Dependencies**: Install `framer-motion`, `cmdk`, `clsx`, `tailwind-merge`.
2.  **Core UI**: Build `<CommandMenu />` component implementing the Registry.
3.  **Editor Integration**: Hook `keyDown` to detect `/` and open menu.
4.  **Motion Wrap**: Refactor `BlockList` to use `AnimatePresence`.
5.  **Polish**: Apply "Inter" font features (ss01, cv05) and fine-tune spacing.
