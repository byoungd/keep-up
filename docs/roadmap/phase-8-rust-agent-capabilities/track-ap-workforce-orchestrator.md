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

## Architecture Context

- Product context: Open Wrap. This track targets the agent runtime layer, not `apps/cowork`.
- Runtime boundary: Rust owns scheduling/state; TypeScript reads snapshots and events.
- Persistence: not required here (Track AU owns durable storage).

## Scope

- Task decomposition and planning API.
- Worker registry with capability matching.
- Shared task channel (publish and subscribe).
- Failure handling with retry, backoff, and escalation.

## Out of Scope

- UI changes in `apps/cowork`.
- LFCC document mutations or editor integrations.
- Long-term persistence or replay storage (Track AU).
- Distributed scheduling across multiple processes.

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

## Implementation Spec (Executable)

This section is the authoritative execution guide. Follow it exactly to implement Track AP.

### 1) Data Model and Serialization

All JSON payloads use `camelCase` fields. Enums are serialized as `snake_case`.

Rust types (serialize/deserialize with `serde`):

- `WorkforcePlanInput { plan_id, goal?, tasks[] }`
- `WorkforceTaskInput { task_id, title, required_capabilities?, depends_on?, priority?, metadata? }`
- `WorkforceWorkerRegistration { worker_id, capabilities[], capacity, state? }`
- `WorkforceResultEnvelope { task_id, worker_id, status, output?, error?, metadata? }`
- `WorkforceAssignment { task_id, worker_id }`
- `WorkforceEvent { sequence, event_version, run_id, type, task_id?, worker_id?, logical_time?, payload? }`
- `TaskChannelMessage { sequence, type, task_id, payload }`
- `WorkforceSnapshot { run_id, plan_id?, goal?, tasks[], workers[], event_cursor, channel_cursor }`

Enum values:

- `TaskStatus`: queued | running | blocked | completed | failed | canceled
- `TaskBlockReason`: dependencies | backoff | escalated
- `WorkerState`: idle | busy | draining
- `WorkforceResultStatus`: completed | failed | canceled
- `WorkforceEventType`:
  plan_created, task_queued, task_assigned, task_started, task_blocked, task_completed,
  task_failed, task_canceled, task_retry_scheduled, task_escalated, task_dead_lettered,
  worker_registered, result_published, scheduler_tick
- `TaskChannelMessageType`: task | result

TypeScript types MUST mirror the Rust shapes in `packages/agent-runtime-core/src/index.ts`.

### 2) Engine Behavior (Deterministic Rules)

Plan load:
- Reject duplicate task IDs.
- Reject missing dependency IDs.
- Reject cycles (DFS with visiting/visited).
- Tasks with no dependencies start as `queued`; otherwise `blocked` with `dependencies`.
- Record a `plan_created` event and emit `task_queued` or `task_blocked` per task.
- Publish queued tasks to the channel as `task` messages.

Worker registration:
- Capabilities are sorted and deduped.
- Capacity minimum is 1.
- Default state is `idle`.
- Record `worker_registered` event.

Scheduling:
- Scheduler ticks always record `scheduler_tick` with logical time.
- Ready tasks are `queued` and all dependencies are `completed`.
- Task order: priority asc, then plan sequence asc, then task ID asc.
- Worker order: active_count asc, then worker_id asc.
- A worker can accept a task if required capabilities are a subset of its capabilities.
- For each assignment:
  - Set task to `running`, clear blocked fields, set `assigned_worker_id`, increment `attempt`.
  - Record `task_assigned` and `task_started` events at the same logical time.
  - Increment worker `active_count`, update worker state.

Results:
- Only the assigned worker can submit results.
- `completed`: set status to completed, store output, clear assignment, publish result.
- `failed`: increment `failure_count`; apply retry/backoff or escalation:
  - If `attempt <= retry_count`: block with `backoff`, set `blocked_until`.
  - Else if `escalate_after > 0` and failure_count >= escalate_after: block with `escalated`.
  - Else: set status failed and add to dead-letter list.
- `canceled`: set status canceled and record error.
- Always record a `result_published` event and push to channel as a `result` message.
- When a task completes, any dependents with all dependencies completed move to `queued` and emit
  `task_queued` with reason `dependencies_resolved`.

Time:
- `logical_time` is monotonic. If `now_ms` is provided and is less than current, return an error.
- If `now_ms` is absent, increment logical time by 1.

Snapshots:
- `list_tasks` and `list_workers` must be stable-sorted by ID (and priority for tasks).
- `get_snapshot` returns stable ordering and includes event/channel cursors.

### 3) FFI Boundary (Rust <-> Node)

Rust exposes a single N-API class: `WorkforceOrchestrator` with methods:

- `loadPlan(plan)`
- `registerWorker(worker)`
- `registerWorkers(workers[])`
- `schedule(nowMs?) -> assignments[]`
- `submitResult(result, nowMs?)`
- `cancelTask(taskId, reason?)`
- `listTasks() -> task[]`
- `listWorkers() -> worker[]`
- `drainEvents(after?, limit?) -> events[]`
- `listChannelMessages(after?, limit?) -> messages[]`
- `getSnapshot() -> snapshot`
- `reset()`

Node loader:
- `@ku0/agent-workforce-rs/node` uses `@ku0/native-bindings` and the shared flag store.
- Env overrides: `KU0_AGENT_WORKFORCE_NATIVE_PATH` and `KU0_AGENT_WORKFORCE_DISABLE_NATIVE=1`.
- Required export: `WorkforceOrchestrator`.

### 4) Control-Plane Wrapper (TypeScript)

Expose a wrapper in `packages/agent-runtime-control/src/workforce/index.ts` that:
- Resolves native bindings once and caches them.
- Throws a clear error if native binding is unavailable.
- Mirrors the same method signatures as the Rust class.

### 5) Simulator CLI

Binary: `packages/agent-workforce-rs/src/bin/workforce-simulator.rs`

Scenario JSON schema:
```
{
  "config": { "runId": "...", "eventVersion": 1, "failurePolicy": { "retryCount": 2, "backoffMs": 1000, "escalateAfter": 3 } },
  "plan": { "planId": "plan-1", "goal": "string", "tasks": [...] },
  "workers": [ ... ],
  "actions": [
    { "type": "schedule", "nowMs": 10 },
    { "type": "result", "result": { ... }, "nowMs": 15 },
    { "type": "cancel", "taskId": "task-1", "reason": "string" }
  ]
}
```

Output:
- Print each assignment batch as JSON.
- Print final JSON summary with `snapshot`, `events`, `channel`.

### 6) Tests (Required)

Rust unit tests:
- Cycle detection rejects invalid plans.
- Deterministic scheduling yields stable assignments.
- Failure policy backoff and escalation.
- Results are published to the channel.

TypeScript validation:
- `packages/agent-runtime-core` builds cleanly.
- `packages/agent-runtime-control` typecheck passes.

### 7) Validation Commands

- `cargo test` (in `packages/agent-workforce-rs`)
- `pnpm -C packages/agent-workforce-rs build:debug`
- `pnpm -C packages/agent-runtime-core build`
- `pnpm -C packages/agent-runtime-control typecheck`
- `pnpm biome check --write`

### 8) Definition of Done

- Rust crate builds and tests pass.
- Node binding loads and is callable from `agent-runtime-control`.
- Event log and task channel are deterministic and replayable.
- Types are available in `agent-runtime-core`.
- CLI can replay a scenario and emit deterministic output.

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
