# Track AZ: Cowork UI Convergence and Runtime Integration

> Priority: P1
> Status: In Progress (Delta Finish)
> Owner: Cowork UI Team
> Dependencies: UI Cowork tracks (merged), Phase 7 Tauri shell (merged), Track AY/AX (merged)
> Source: docs/roadmap/ui-cowork/README.md

---

## Objective

Finalize Cowork UI tracks and integrate with the converged runtime (TS + Rust),
without redoing Phase 7 shell work.

---

## Current Code Reality (Main)

The majority of Track AZ scope is already implemented in `apps/cowork` and `packages/shell`.
These are the main areas already in place:

- **Shell/Sidebar**: `packages/shell/src/components/layout/AppShell.tsx`,
  `packages/shell/src/components/layout/ResizableThreePaneLayout.tsx`,
  `apps/cowork/src/app/layouts/RootLayout.tsx`,
  `apps/cowork/src/components/sidebar/CoworkSidebarSections.tsx`
- **Chat/Canvas**: `apps/cowork/src/features/chat/ChatThread.tsx`,
  `packages/shell/src/components/chat/MessageBubble.tsx`,
  `packages/shell/src/components/chat/InputArea.tsx`
- **Controls/Approvals**: `packages/shell/src/components/chat/AIPanel.tsx`,
  `packages/shell/src/components/ai/ApprovalCard.tsx`,
  `apps/cowork/src/features/tasks/components/TaskTimeline.tsx`
- **Agentic surfaces + runtime wiring**:
  `apps/cowork/src/features/tasks/hooks/useTaskStream.ts`,
  `apps/cowork/src/features/tasks/components/TaskNode.tsx`,
  `apps/cowork/src/features/context/CheckpointsPanelContent.tsx`,
  `apps/cowork/server/routes/checkpoints.ts`

---

## Remaining Gaps (Delta Work)

The original gaps are now implemented in main. Validation still required.

1) **Command Palette** (Completed)
- Implemented in `apps/cowork/src/components/CommandPalette.tsx`.
- Wired in `apps/cowork/src/app/layouts/RootLayout.tsx` with `Cmd+K` open/close behavior.

2) **Input Auto-Focus** (Completed)
- Safe auto-focus implemented in `apps/cowork/src/features/chat/hooks/useSafeAutoFocus.ts`.
- Used by `apps/cowork/src/features/chat/CoworkAIPanel.tsx` and `apps/cowork/src/features/chat/ChatThread.tsx`.

3) **Session Status Indicators** (Completed)
- Status UI in `apps/cowork/src/components/session/SessionStatusIndicator.tsx`.
- Connected via `apps/cowork/src/features/tasks/hooks/useTaskStream.ts`.

4) **Reduced-Motion Compliance** (Completed)
- Reduced-motion overrides in `apps/cowork/src/styles/animations.css` and `packages/design-system/src/animations.css`.
- Per-component handling in `packages/shell/src/components/chat/AIPanelHeader.tsx` and `packages/shell/src/components/chat/InputArea.tsx`.

---

## Scope

- UI Track 1: Workspace shell and sidebar.
- UI Track 2: Chat and canvas.
- UI Track 3: Controls and approvals.
- Cowork Track 16: Agentic capabilities surface.
- Runtime wiring for approvals, sessions, and checkpoints.

---

## Exclusions (Already Delivered)

- Desktop shell migration (Phase 7).
- Direct UI streams plumbing (Phase 7).

---

## Implementation Spec (Executable)

1) UI completion
- Close remaining UI gaps (Command Palette + input auto-focus).
- Verify UI-cowork acceptance criteria against current main; update any mismatches.
- Ensure reduced-motion compliance (single loop: AI sheen).

2) Runtime integration
- Confirm approval modal uses policy decision metadata from AY schema when available.
- Confirm checkpoints/timeline remain backed by event streams (already wired).
- Add session status indicators driven by stable workspace event IDs.

3) Agentic surfaces
- Keep existing agent status/tool activity/task lineage surfaces.
- Add missing status affordances where necessary (session state, escalation).

---

## Deliverables

- Command Palette + keyboard shortcuts fully functional.
- Chat input auto-focus behavior aligned with UX spec.
- Session status indicators backed by runtime events.
- Reduced-motion compliance verified.

---

## Acceptance Criteria

- UI tracks meet UI-cowork acceptance criteria (validate against main).
- Approval + checkpoint flows operate end-to-end with runtime data.
- Session status is visible and updates from runtime events.
- No regressions in existing Cowork panels and navigation.

---

## Validation

- Run UI smoke tests and typecheck.
- Execute basic runtime integration flow in `apps/cowork`:
  - approval required -> approve/reject
  - checkpoint created/restored
  - session event updates visible


## Single-Doc Execution Checklist

1) Create feature branch
- git fetch origin
- git checkout main
- git pull --ff-only
- git checkout -b feat/track-<id>-<short-name>

2) Initialize required artifacts
- task.md: add checklist items from this track
- implementation_plan.md: summarize steps and dependencies
- walkthrough.md: add validation steps and test commands

3) Implement the scope
- Follow the Implementation Spec in this document only
- Keep changes minimal and within scope

4) Validate
- Run the commands listed under Validation in this document
- Run: pnpm biome check --write

5) Commit and PR
- git add -A
- git commit -m "feat: <track-id> <summary>"
- git push -u origin feat/track-<id>-<short-name>
- Open PR with the template below

### PR Template
- What changed and why
- Tests: <command(s)> or "Not run (docs-only)"
- Risks/known issues
- Spec sections satisfied (list exact headings)
