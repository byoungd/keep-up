# Track M2: Turn Checkpoint Integration

Owner: Runtime Architect + Runtime Developer
Status: Ready
Date: 2026-01-19
Timeline: Week 4+

## Objective
Integrate turn-boundary checkpoints into the execution loop so every turn and tool result is
recoverable, aligned to the new module boundaries.

## Dependencies
- docs/roadmap/agent-runtime-2026-track-l-architecture.md
- docs/architecture/agent-runtime-module-decomposition-rfc.md
- `@ku0/agent-runtime-core`
- `@ku0/agent-runtime-execution`
- `@ku0/agent-runtime-persistence`

## Scope
- Define core checkpoint interfaces if missing.
- Wire `CheckpointManager` into the orchestrator/turn executor lifecycle.
- Capture messages, tool calls, tool results, and errors per turn.
- Emit checkpoint events for observability.

## Non-Goals
- Implementing a new event log store (Track C).
- Changing tool execution semantics.

## Responsibilities
- Architect: confirm checkpoint boundary definitions and recovery semantics.
- Dev: integrate checkpoint creation/update into execution loop.
- QA: verify recoverable checkpoints and event emission.

## Key Deliverables
- Core checkpoint interfaces and types (if missing).
- Orchestrator integrates checkpoint creation/update per turn.
- Persistence package owns checkpoint storage implementation.
- Event stream emits checkpoint create/update events.

## Tasks
1. Add checkpoint interfaces/types to `agent-runtime-core` (if missing).
2. Ensure `agent-runtime-persistence` exports `CheckpointManager` implementing the interface.
3. Inject checkpoint manager into orchestrator components.
4. Create checkpoint at turn start; update on tool call/result; finalize on turn end.
5. Emit checkpoint events for observability.
6. Add targeted integration tests for turn-boundary checkpoints.

## Acceptance Criteria
- Every turn creates a checkpoint with tool call/result history.
- Failures update checkpoint status with error details.
- Recovery reads checkpoint without loss of tool call sequence.
- No direct cross-plane imports outside core interfaces.

## Required Tests
- Unit tests for checkpoint creation and updates.
- Orchestrator integration test covering turn start/end.

## Branch and PR Workflow
- Create branch: `feature/agent-runtime-2026-track-m2-turn-checkpoints`
- Run required tests, commit, open PR with migration notes
