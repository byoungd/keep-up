# Track 3: Motion & Signature Implementation Plan

> **Goal**: Implement the "feel" of intelligence and the "expansive" nature of Arc.
> **Reference Standards**: [`docs/specs/cowork/cowork-arc-dia-standards.md`](file:///Users/han/Documents/Code/Parallel/keep-up/docs/specs/cowork/cowork-arc-dia-standards.md) (Sections 3 & 4)

---

## 1. The AI Signature (Magic Loop)
*Target File: `packages/design-system/src/animations.css`*

The **only** allowed loop in the UI.

- [ ] **Sheen Animation**
    - [ ] Define `@keyframes ai-sheen` (gradient translateX).
    - [ ] Create `.ai-sheen-line` utility: `h-[1px]`, `background: var(--accent-ai-sheen)`, `animation: ai-sheen 2s linear infinite`.
- [ ] **Application**
    - [ ] **Chat Input**: Add sheen line to bottom edge when `state === 'processing'`.
    - [ ] **Thinking Node**: Add sheen line to top edge of the thinking block.

## 2. Layout Projection (The "Expansive" Feel)
*Target File: `apps/cowork/src/components/features/Artifact/*`*

Opening an artifact should feel like it *grows* from the chat, not a new page load.

- [ ] **Shared Layout IDs**
    - [ ] Assign `layoutId={`artifact-${id}`}` to the Chat Link.
    - [ ] Assign `layoutId={`artifact-${id}`}` to the Split View container.
- [ ] **Transition Physics**
    - [ ] Configure `transition={{ duration: 0.2, ease: "easeOut" }}`.
    - [ ] Ensure `AnimatePresence` handles the cross-dissolve of content.

## 3. Sidebar Physics (Calm Firmness)
*Target File: `apps/cowork/src/components/layout/Sidebar.tsx`*

- [ ] **Spring Tuning**
    - [ ] Set `stiffness: 400`, `damping: 30` (Fast but no bounce).
    - [ ] Remove any `opacity` fade on the sidebar container itself; let the width drive the motion.

---

## Verification Plan

### Manual Check
1.  **Sheen Test**: Send a message. Does the purple line glide smoothly? Is it the *only* thing moving?
2.  **Artifact Open**: Click a citation. Does the panel *grow* out of the link?
3.  **Sidebar**: Toggle sidebar. Does it feel "solid" (mechanical) or "floaty"? (Should be solid).

### Automated Test
-   **Storybook**: Add an "Interactive / Transition" story if possible, or reliable manual QA.
