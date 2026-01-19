# Track 1: Foundation & Physics Implementation Plan

> **Goal**: Establish the "Arc/Dia" physical universe (Tokens, Layers, Layout) so components inherit quality by default.
> **Reference Standards**: [`docs/specs/cowork/cowork-arc-dia-standards.md`](file:///Users/han/Documents/Code/Parallel/keep-up/docs/specs/cowork/cowork-arc-dia-standards.md) (Sections 1 & 2.1)

---

## 1. Token System Upgrade
*Target File: `packages/design-system/src/tokens.ts` & `theme.css`*

We must first expand the vocabulary of the design system to support Arc/Dia concepts.

- [ ] **Semantic Typography**
    - [ ] Add `.text-ui`: `13px` / `18px line-height` (for Sidebar, Headers, Buttons).
    - [ ] Add `.text-chat`: `15px` / `24px line-height` (for Chat Content).
    - [ ] Add `.text-meta`: `12px` / `16px line-height` (for Timestamps, Captions).
- [ ] **AI Accent Tokens**
    - [ ] `accent-ai-strong`: `violet-600` (Active states).
    - [ ] `accent-ai-sheen`: `linear-gradient(...)` (Thinking states).
- [ ] **Layer Z-Index Constants**
    - [ ] `layer-base`: `0`
    - [ ] `layer-canvas`: `10`
    - [ ] `layer-overlay`: `50`

---

## 2. Layout Engine (The 6px Rule)
*Target File: `apps/cowork/src/components/layout/AppShell.tsx`*

The "Application Frame" feel comes from the precise gap between the window and the work surface.

- [ ] **Implement Responsive Inset**
    - [ ] **Mobile (<1024px)**: `0px` inset (Full bleed).
    - [ ] **Desktop (>=1024px)**: `6px` padding on the root container.
- [ ] **Canvas Elevation**
    - [ ] Apply `rounded-lg` (12px) to the main content area.
    - [ ] Apply `shadow-soft` to lift Canvas off the Frame.
    - [ ] Ensure `clip-path` handles corner radius correctly for scrollbars.

---

## 3. The "Calm Chrome" Reset
*Target File: `apps/cowork/src/styles/globals.css`*

Remove "noisy" defaults to achieve curated minimalism.

- [ ] **Border Purge**
    - [ ] Remove default `border-r` from Sidebar components.
    - [ ] Visually separate Sidebar from Canvas using purely `bg-surface-1` (Sidebar) vs `bg-canvas` (Canvas) contrast.
- [ ] **Background Tinting**
    - [ ] Enable `var(--color-theme-base)` on the `<body>` or root `div` to support user tinting.

---

## Verification Plan

### Manual Check
1.  **Inspector Audit**: Check `text-ui` class applies `font-size: 13px`.
2.  **Ruler Check**: Measure the 6px gap between the window edge and the white canvas on a desktop viewport.
3.  **Layer Check**: Verify Canvas `z-index` is 10 and Frame is 0.

### Automated Test
-   **Snapshot**: Update `AppShell` snapshots to reflect new padding structure.
