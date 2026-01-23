# Track AP: Workforce Orchestrator (Rust)

> Priority: P0
> Status: In Progress (prototype implemented)
> Owner: Agent Runtime Team
> Dependencies: Track AQ tool contracts, Track AU storage, Phase 6 sandbox
> Estimated Effort: 3 weeks

---

## Overview

Implement the multi-agent workforce engine in Rust. This includes planner and coordinator
roles, a task graph, a shared task channel, and deterministic scheduling for parallel work.

## Scope

- Task decomposition and planning API.
- Worker registry with capability matching.
- Shared task channel (publish and subscribe).
- Failure handling with retry, backoff, and escalation.

## Deliverables

- `packages/agent-workforce-rs/` crate with the core orchestrator.
- FFI bridge in `packages/agent-runtime-control/` for TypeScript to Rust calls.
- Deterministic event log schema in `packages/agent-runtime-core/`.
- Simulator CLI for multi-agent regression runs.

## Current Implementation

- Rust core engine with deterministic scheduler, failure policy, and task channel.
- N-API binding exposed via `@ku0/agent-workforce-rs` with Node loader.
- Control-plane wrapper in `packages/agent-runtime-control/src/workforce`.

## Technical Design

### Core Types

- `WorkforcePlan`, `TaskNode`, `Assignment`, `WorkerProfile`, `ResultEnvelope`.
- `TaskStatus`: queued | running | blocked | completed | failed | canceled.
- `FailurePolicy`: retry_count, backoff_ms, escalate_after.

### Execution Flow

1. Planner builds a task graph from the user goal.
2. Coordinator assigns nodes to workers by capability match.
3. Workers publish results to the shared task channel.
4. Scheduler commits deterministic ordering to the event log.

### Rust-First Boundary

- Rust owns task state transitions and scheduling.
- TypeScript receives events and renders UI.

## Implementation Plan

| Week | Focus | Outcomes |
| :--- | :--- | :--- |
| 1 | Core data model | Task graph, status machine, event log integration |
| 2 | Scheduling and assignment | Capability matching, deterministic ordering |
| 3 | Failure handling | retry, escalation, dead letter queue |

## Affected Code

- `packages/agent-runtime-core/`
- `packages/agent-runtime-execution/`
- `packages/agent-runtime-control/`
- `packages/agent-workforce-rs/` (new)

## Acceptance Criteria

- Task graph supports parallel execution with deterministic ordering.
- Coordinator reassigns failed tasks based on policy.
- Shared task channel retains outputs for downstream tasks.
- Runtime can replay a run with identical task ordering.

## Risks

- Interface drift between Rust core and TypeScript adapters.
- Deadlocks if task graph cycles are not detected.

## References

- `.tmp/analysis/eigent/docs/core/workforce.md`
- `.tmp/analysis/eigent/docs/core/concepts.md`
