# Track 2: Component Material Refactor Plan

> **Goal**: Upgrade "Shadcn defaults" to "Cowork Signature" materials.
> **Reference Standards**: [`docs/specs/cowork/cowork-arc-dia-standards.md`](file:///Users/han/Documents/Code/Parallel/keep-up/docs/specs/cowork/cowork-arc-dia-standards.md) (Sections 2.2 & 5)

---

## 1. Input Physics & Aesthetics
*Target File: `apps/cowork/src/components/ui/input.tsx` & `ChatInput.tsx`*

- [ ] **Soft Input Field**
    - [ ] Remove default border (`border-input`).
    - [ ] Set background to `bg-surface-2`.
    - [ ] Implement `ring-1` + `ring-primary/20` on **focus-visible only**.
- [ ] **Input Morph (Chat)**
    - [ ] Animate height changes using Spring physics (matches Motion Spec).

## 2. Surface Flattening (Cards)
*Target File: `apps/cowork/src/components/ui/card.tsx` & `ArtifactCard.tsx`*

- [ ] **Borderless Cards**
    - [ ] Remove `border` class from default Card.
    - [ ] Set background to `bg-surface-1`.
- [ ] **Artifact Card Interactions**
    - [ ] **Idle**: Flat, no shadow.
    - [ ] **Hover**: `shadow-sm`, subtle color shift (`bg-surface-2`). **NO SCALE**.

## 3. Visual Grammar Enforcement
*Target File: `apps/cowork/src/components/ui/*`*

- [ ] **Iconography**
    - [ ] Create `Icon` wrapper or Config Provider to enforce `strokeWidth={2}`.
    - [ ] Audit usages:
        - [ ] Navigation/Chrome: `size-5` (20px).
        - [ ] Inline UI: `size-4` (16px).
- [ ] **Buttons**
    - [ ] Ensure `Button` component uses `text-ui` (13px) for Small/Medium variants.

---

## Verification Plan

### Manual Check
1.  **Input Focus**: Click an input. It should not jump; ring should appear smoothly.
2.  **Card Hover**: Hover an artifact. It should lift (shadow) but not zoom.
3.  **Icon Stroke**: Verify icons look "book weight" (regular), not thin.

### Automated Test
-   **Storybook**: Verify "Input" and "Card" stories against new standards.
