# Track CI: Context Compaction & Memory

> Priority: P2
> Status: Proposed
> Owner: Runtime Cognition
> Dependencies: Track CA, Phase 10 Track BH
> Source: docs/roadmap/phase-11-gateway-surfaces/README.md

---

## Objective

Complete context compaction from Phase 10 Track BH with auto-compaction
thresholds, session continuity, and Gateway-level telemetry.

---

## Scope (Merged from Phase 10 BH)

- Integrate `ContextCompactor` into orchestrator/runtime loop
- Auto-compaction thresholds with configurable policies
- Persist summary and restore across session resumes
- Gateway telemetry for compression metrics

---

## Out of Scope

- Checkpoint recovery (Track CJ)
- Skills system (Track CC)

---

## Implementation Spec

1) Runtime integration
- Call `ContextCompactor.checkThreshold` before LLM calls
- Apply compaction and store summary in session

2) Gateway configuration
- Expose config via Gateway for max tokens, threshold
- Surface config in CLI and Cowork UI

3) Session continuity
- Load compaction summaries on session resume
- Append compaction notes to context metadata

4) Observability
- Emit compression metrics via Gateway telemetry

---

## Deliverables

- Auto-compaction in runtime loop
- Gateway config + telemetry
- Session continuity support

---

## Acceptance Criteria

- Long sessions auto-compact near token limits
- Summaries persist across resumes
- Compression metrics visible in Gateway

---

## Validation

```bash
pnpm --filter @ku0/agent-runtime-execution test
# Manual: long session with compaction trigger
```
