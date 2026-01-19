# Arc/Dia Implementation Tracks (Parallelized)

> **Strategy**: Decompose the monolithic implementation plan into 3 independent tracks that can be executed in parallel.
> **Dependency**: Track 1 (Foundation) blocks the *final visual result* of Tracks 2 & 3, but development can occur concurrently using placeholders or existing tokens.

---

## 🏗️ Track 1: Foundation & Physics (The Shell)
**Owner**: Systems Engineer / Core UI
**Focus**: Global Tokens, Layout Structure, Resetting Defaults

### 1.1 Token System Upgrade
- [ ] **Semantic Type**: Add `.text-ui` (13/18) and `.text-chat` (15/24) to `tokens.ts`.
- [ ] **Layer Z-Index**: Define `layer-base` (0), `layer-canvas` (10), `layer-overlay` (50).
- [ ] **AI Accent**: Register `accent-ai-strong` and `accent-ai-sheen` tokens.

### 1.2 AppShell Layout Engine
- [ ] **6px Inset**: Implement responsive padding logic in `AppShell` (0px mobile -> 6px desktop).
- [ ] **Layering**: Ensure `main` (Canvas) sits on `z-10` with `shadow-soft` over `aside` (Sidebar) on `z-0`.
- [ ] **Background Tint**: Enable user-tintable `theme-base` on the Frame level.

### 1.3 The "Calm" Reset
- [ ] **Global CSS**: Remove default border strategies.
- [ ] **Sidebar**: Remove `border-r`. Verify visual separation via background tone (`surface-1` vs `canvas`).

---

## 🧩 Track 2: Component Material Refactor
**Owner**: Component Engineer
**Focus**: Visual Fidelity, Iconography, Input Physics

### 2.1 Input Physics
- [ ] **Refactor `Input` & `ChatInput`**:
    - Remove borders. Use `bg-surface-2`.
    - Add `ring-1` on focus only.
    - Implement "Morph" transition (height only).

### 2.2 Surface Flattening
- [ ] **Refactor `ArtifactCard`**:
    - Remove `border`.
    - Set base to `surface-1`.
    - Interactive state: Hover adds `shadow-sm` + `bg-surface-2` (No scale).

### 2.3 Iconography Audit
- [ ] **Global Icon Config**:
    - Set default `strokeWidth={2}` for all Lucide instances.
    - Audit Nav icons (20px) vs Action icons (16px).

---

## ⚡ Track 3: Motion & Experiential Signature
**Owner**: Motion Designer / Engineer
**Focus**: AI "Magic", Transitions, Optimistic UI

### 3.1 AI Signature
- [ ] **Sheen Line**: Create `ai-sheen-line` CSS utility (animated gradient).
- [ ] **Thinking State**: Apply sheen to `ThinkingNode` and `ChatInput` (processing).

### 3.2 Transition Physics
- [ ] **Artifact Open**: Implement Layout Projection (FLIP) for "Peek -> Pin".
- [ ] **Sidebar Spring**: Tune `framer-motion` spring to `stiffness: 400, damping: 30`.

### 3.3 Optimistic Polish
- [ ] **Click Response**: Remove "scale down" effects on buttons (too cartoonish). Replace with fast color shift.

---

## Execution Order

1.  **Immediate**: Start **Track 1.1** (Tokens) as it defines the vocab for everyone.
2.  **Parallel**: Once Tokens are merged, Tracks 1.2, 2, and 3 can run fully in parallel.
