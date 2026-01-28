# Track CJ: Checkpoint & Recovery

> Priority: P2
> Status: Proposed
> Owner: Runtime Persistence
> Dependencies: Tracks CA, CE, Phase 10 Track BI
> Source: docs/roadmap/phase-11-gateway-surfaces/README.md

---

## Objective

Complete checkpoint and recovery from Phase 10 Track BI with Gateway-level
checkpoint management, time-travel workflows, and session persistence.

---

## Scope (Merged from Phase 10 BI)

- Gateway checkpoint storage and management
- CLI commands: list/checkpoint/restore/replay
- Session DB for long-running histories
- Cowork endpoints for checkpoint browsing

---

## Out of Scope

- Context compaction (Track CI)
- IDE integration (Track CK)

---

## Implementation Spec

1) Gateway checkpoint management
- Add Gateway methods for checkpoint list/create/restore
- Persist checkpoints in Gateway state

2) CLI recovery UX
- Wire CLI commands to Gateway checkpoint API
- Safety guardrails (block restore while running)

3) Session database
- Integrate SQLite or native store for history
- Migration and cleanup utilities

4) Cowork integration
- API routes for checkpoint list/restore

---

## Deliverables

- Gateway checkpoint endpoints
- CLI checkpoint commands
- Session persistence backend
- Cowork checkpoint UI

---

## Acceptance Criteria

- Checkpoints listed and restored via Gateway
- Session state survives restart
- Recovery blocked if task running

---

## Validation

```bash
pnpm --filter @ku0/gateway test
# Manual: create and restore checkpoint
```
