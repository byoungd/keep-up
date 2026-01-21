# Track 2: Component Material Refactor Plan

> **Goal**: Upgrade "Shadcn defaults" to "Cowork Signature" materials.
> **Reference Standards**: [`docs/specs/cowork/cowork-arc-dia-standards.md`](/docs/specs/cowork/cowork-arc-dia-standards.md) (Sections 2.2 & 5)

---

## 1. Input Physics & Aesthetics
*Target File: `packages/shell/src/components/ui/Input.tsx` & `packages/shell/src/components/chat/InputArea.tsx`*

- [x] **Soft Input Field**
    - [x] Remove default border (`border-input`).
    - [x] Set background to `bg-surface-2`.
    - [x] Implement `ring-1` + `ring-primary/20` on **focus-visible only**.
- [x] **Input Morph (Chat)**
    - [x] Animate height changes using Spring physics (matches Motion Spec).

## 2. Surface Flattening (Cards)
*Target File: `packages/shell/src/components/ui/Card.tsx`, `apps/cowork/src/components/ui/Card.tsx`, `packages/shell/src/components/chat/ArtifactCard.tsx`*

- [x] **Borderless Cards**
    - [x] Remove `border` class from default Card.
    - [x] Set background to `bg-surface-1`.
- [x] **Artifact Card Interactions**
    - [x] **Idle**: Flat, no shadow.
    - [x] **Hover**: `shadow-sm`, subtle color shift (`bg-surface-2`). **NO SCALE**.

## 3. Visual Grammar Enforcement
*Target File: `packages/shell/src/components/ui/Icon.tsx`, `packages/shell/src/components/layout/sidebar/*`, `packages/shell/src/components/ui/SearchInput.tsx`, `packages/shell/src/components/ui/Button.tsx`*

- [x] **Iconography**
    - [x] Create `Icon` wrapper or Config Provider to enforce `strokeWidth={2}`.
    - [x] Audit usages:
        - [x] Navigation/Chrome: `size-5` (20px).
        - [x] Inline UI: `size-4` (16px).
- [x] **Buttons**
    - [x] Ensure `Button` component uses `text-chrome` (13px) for Small/Medium variants.

---

## Verification Plan

### Manual Check
1.  **Input Focus**: Click an input. It should not jump; ring should appear smoothly.
2.  **Card Hover**: Hover an artifact. It should lift (shadow) but not zoom.
3.  **Icon Stroke**: Verify icons look "book weight" (regular), not thin.

### Automated Test
-   **Storybook**: Verify "Input" and "Card" stories against new standards.
