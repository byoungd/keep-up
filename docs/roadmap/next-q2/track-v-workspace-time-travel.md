# Track V: Workspace Time Travel

Owner: Runtime Developer
Status: Proposed
Priority: Medium
Timeline: Week 2-4
Dependencies: Track P state/memory, CheckpointManager
References: `docs/analysis/architecture-deep-dive.md`, Roo-Code

---

## Objective

Add workspace-level time travel with git-backed shadow checkpoints and context integrity
so edits remain safe after external file changes.

---

## Source Analysis

- Shadow git checkpoints and diffing: `.tmp/analysis/Roo-Code/src/services/checkpoints/ShadowCheckpointService.ts`.
- Per-task checkpoint directories: `.tmp/analysis/Roo-Code/src/services/checkpoints/RepoPerTaskCheckpointService.ts`.
- Rewind-safe message cleanup: `.tmp/analysis/Roo-Code/src/core/message-manager/index.ts`.
- File context tracking and stale detection: `.tmp/analysis/Roo-Code/src/core/context-tracking/FileContextTracker.ts`.

---

## Tasks

### V1: Shadow Checkpoint Service
- Implement per-task shadow git repository with sanitized environment.
- Add checkpoint save/restore APIs with diff retrieval.
- Store checkpoint metadata alongside runtime checkpoints.

### V2: Rewind and Time-Travel Integration
- Add message rewind utilities that clean summaries and truncation markers.
- Wire rewind into task cancellation, checkpoint restore, and history edits.
- Emit audit events for time-travel operations.

### V3: File Context Integrity
- Track files in context and mark stale on external edits.
- Require reload before tool-based edits to stale files.
- Expose stale-file warnings in the runtime UI layer.

---

## Deliverables

- `packages/agent-runtime/src/checkpoint/shadow/` module.
- Integration tests for checkpoint diff and restore.
- Documentation for time-travel and stale-context behavior.

---

## Acceptance Criteria

- Shadow checkpoints support save/restore and diff with sanitized git env.
- Rewind operations clean summaries and truncation markers deterministically.
- Stale-file tracking blocks unsafe edits until reloaded.
- Time-travel actions emit audit events and checkpoint metadata.

---

## Testing

- Unit tests for shadow checkpoint save/restore and diff output.
- Integration tests for rewind + history cleanup behavior.
- Suggested command: `pnpm --filter @ku0/agent-runtime test -- --grep "checkpoint|rewind"`.
