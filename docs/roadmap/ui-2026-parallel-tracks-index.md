# UI 2026 Parallel Tracks Index

**Date**: 2026-01-19
**Status**: Active
**Philosophy**: Parallel, independent tracks that other agents can execute end-to-end.

---

## Track Overview

| Track | Name | Branch | Dependencies | Priority |
|-------|------|--------|--------------|----------|
| UI-A | Controls & Approvals | `feature/ui-2026-track-a-controls` | None | P0 |
| UI-B | Chat Features | `feature/ui-2026-track-b-chat` | None | P0 |
| UI-C | Runtime Visualization | `feature/ui-2026-track-c-runtime-viz` | UI-A (pattern) | P1 |
| UI-D | Design Polish | `feature/ui-2026-track-d-polish` | None (merge last) | P1 |

---

## Parallelization Matrix

```
Week 1-2                    Week 3-4
┌─────────────────┐        ┌─────────────────┐
│ Track UI-A      │───────▶│                 │
│ (Controls)      │        │                 │
└─────────────────┘        │   Integration   │
┌─────────────────┐        │   & QA          │
│ Track UI-B      │───────▶│                 │
│ (Chat)          │        │                 │
└─────────────────┘        └─────────────────┘
┌─────────────────┐                │
│ Track UI-C      │────────────────┘
│ (Runtime Viz)   │
└─────────────────┘
┌─────────────────┐
│ Track UI-D      │──────▶ (Merge Last)
│ (Polish)        │
└─────────────────┘
```

---

## Track Documents

1. **[Track UI-A: Controls and Approvals](ui-2026-track-a-controls-approvals.md)**
   - ApprovalCard component
   - Risk level display
   - Approve/Reject wiring

2. **[Track UI-B: Chat Features](ui-2026-track-b-chat-features.md)**
   - Message actions (edit, retry, branch, copy)
   - Session management (search, rename, delete)
   - Export functionality

3. **[Track UI-C: Runtime Visualization](ui-2026-track-c-runtime-visualization.md)**
   - ModelBadge component
   - TaskTimeline component
   - CostMeter wiring
   - BackgroundTaskIndicator

4. **[Track UI-D: Design Polish](ui-2026-track-d-design-polish.md)**
   - Token audit and compliance
   - Animation integration
   - Typography standardization
   - Dark mode verification

---

## Agent Execution Guide

Each track document is self-contained with:
- ✅ Objective and scope
- ✅ Reference documents
- ✅ Specific files to modify
- ✅ Code snippets and patterns
- ✅ Acceptance criteria
- ✅ Required tests
- ✅ Branch and PR workflow
- ✅ Definition of done

### How to Execute a Track

1. Read the track document completely
2. Create branch as specified
3. Implement each task in order
4. Run `pnpm typecheck` and tests
5. Commit with specified message format
6. Open PR with track title

---

## Merge Order

1. **UI-A** and **UI-B** can merge simultaneously (independent)
2. **UI-C** merges after UI-A (uses ApprovalCard pattern)
3. **UI-D** merges last (final polish pass)

---

## Conflict Avoidance

Tracks are designed to minimize conflicts:

| File | UI-A | UI-B | UI-C | UI-D |
|------|------|------|------|------|
| `ChatThread.tsx` | ⚠️ | ⚠️ | ⚠️ | ⚠️ |
| `AIPanel.tsx` | ✓ | - | - | - |
| `MessageBubble.tsx` | - | - | ✓ | ✓ |
| `CoworkSidebarSections.tsx` | - | ✓ | - | - |
| `base.css` | - | - | - | ✓ |

**Note**: `ChatThread.tsx` is touched by multiple tracks. Coordinate merges carefully or designate one track as the primary modifier.

---

## Reference Documents

- `docs/specs/cowork/cowork-top-tier-agent-chat-spec.md` - Target UX spec
- `docs/specs/agent-runtime-spec-2026.md` - Runtime contracts
- `docs/design-system/design-system.md` - Design tokens
- `packages/design-system/src/theme.css` - CSS variables
