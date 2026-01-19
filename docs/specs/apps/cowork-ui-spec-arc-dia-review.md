# Cowork UI Spec Arc/Dia Review

## Goal
Raise the Cowork UI spec to Arc/Dia-level visual quality while keeping the Novelty Budget discipline.

## What Changed (Global)
- Defined a global visual signature (frame/canvas separation, accent discipline, iconography, type ramp).
- Added density and breakpoint rules for composition across desktop, tablet, and mobile.
- Re-aligned motion to allow a single AI signature shimmer and shared element transitions.
- Added AI-only sheen tokens and clarified typography density tokens.
- Expanded quality gates with Arc/Dia signature audits.

## Updated Sources
- `docs/specs/apps/cowork-ui-spec.md`
- `docs/specs/cowork/cowork-visual-design-system.md`
- `docs/specs/cowork/cowork-design-tokens.md`
- `docs/specs/cowork/cowork-motion-spec.md`
- `docs/specs/cowork/cowork-ui-quality-gates.md`

## Remaining Implementation Work
- Implement `accent-ai-strong` and `accent-ai-sheen` in `packages/design-system/src/tokens.ts`.
- Add `text-ui` and `text-chat` tokens in `src/theme.css` and verify typography usage.
- Wire `ai-sheen-line` utility class for AI thinking and input states.
- Confirm layout breakpoints in the actual Cowork app shell.

## Visual QA Checklist
- Frame/canvas gap is visible at 6px on desktop.
- Violet appears only in AI surfaces and thinking states.
- At rest, only three surface tones are visible (frame, canvas, overlay).
- Chat line length stays within 72-80 characters on desktop.
- Peek -> Pin -> Split preserves scroll position and feels continuous.
