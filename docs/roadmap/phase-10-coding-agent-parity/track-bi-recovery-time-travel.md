# Track BI: Persistence, Recovery, and Time Travel

> Priority: P2
> Status: Proposed
> Owner: Runtime Persistence
> Dependencies: Tracks BA, BG
> Source: docs/roadmap/phase-10-coding-agent-parity/README.md

---

## Objective

Expose checkpoint persistence, recovery, and time-travel workflows to CLI/TUI
users, matching the reliability expectations of top-tier agents.

---

## Scope

- Enable checkpoint storage in CLI runtime
- CLI commands: list/checkpoint/restore/replay
- Session DB (SQLite or native store) for long-running histories
- Cowork endpoints for checkpoint browsing and restore

---

## Out of Scope

- Context compaction (Track BH)
- IDE integration (Track BJ)

---

## Implementation Spec (Executable)

1) Checkpoint enablement
- Wire `createCheckpointManager` into CLI runtime initialization.
- Persist checkpoints to user state directory.

2) CLI recovery UX
- Add `keepup checkpoint list/show/restore/replay` commands.
- Provide safety guardrails (cannot restore while running).

3) Session database
- Integrate `SQLiteExecutionStateStore` or native store for session history.
- Add migration/cleanup utilities for stale sessions.

4) Cowork integration
- Add API routes for checkpoint list/restore (server + UI).

---

## Deliverables

- CLI checkpoint commands + output
- Session persistence backend and migrations
- Cowork endpoints for checkpoint recovery

---

## Acceptance Criteria

- CLI can list and restore checkpoints reliably.
- Session state survives restart without data loss.
- Recovery attempts are blocked if a task is running.

---

## Validation

- `pnpm --filter @ku0/agent-runtime-persistence test`
- `pnpm --filter @ku0/agent-runtime-execution test`
- Manual: create and restore a checkpoint in CLI

---

## Single-Doc Execution Checklist

1) Create feature branch
- git fetch origin
- git checkout main
- git pull --ff-only
- git checkout -b feat/track-bi-recovery-time-travel

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
- git commit -m "feat: track-bi recovery time travel"
- git push -u origin feat/track-bi-recovery-time-travel
- Open PR with the template below

### PR Template
- What changed and why
- Tests: <command(s)> or "Not run (docs-only)"
- Risks/known issues
- Spec sections satisfied (list exact headings)
