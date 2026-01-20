# Track AA: Elastic Execution and Scale

Owner: Runtime Architect
Status: Completed
Priority: Critical
Timeline: Month 1-2
Dependencies: Q3 Gym baseline, Q2 Graph Runtime, Checkpoint Manager
References: .tmp/analysis/gemini-cli/packages/a2a-server/src/agent/executor.ts, .tmp/analysis/autogen/python/packages/autogen-core/src/autogen_core/_single_threaded_agent_runtime.py, .tmp/analysis/langgraph/libs/langgraph/langgraph/pregel/_runner.py

---

## Objective

Scale the runtime from single-session execution to a multi-workload, multi-worker
execution plane with deterministic checkpoints, fast resume, and safe
cancellation.

---

## Source Analysis

- Gemini CLI task execution loop demonstrates cancellation on socket close and
  multi-step tool batching: `.tmp/analysis/gemini-cli/packages/a2a-server/src/agent/executor.ts`.
- AutoGen runtime models deterministic message delivery and queue-based processing:
  `.tmp/analysis/autogen/python/packages/autogen-core/src/autogen_core/_single_threaded_agent_runtime.py`.
- LangGraph runner shows task scheduling and commit semantics for concurrent tasks:
  `.tmp/analysis/langgraph/libs/langgraph/langgraph/pregel/_runner.py`.

---

## Tasks

### AA1: Execution Pool and Worker Registry
- Introduce a worker registry with leases and heartbeats.
- Add a scheduler that assigns tasks to workers based on capacity.
- Expose a runtime API for task submission and status introspection.

### AA2: Checkpoint Recovery and Resume
- Persist execution state at task boundaries.
- Support resume and replay after process or worker failure.
- Enforce deterministic replay with stable event ordering.

### AA3: Scheduling, Backpressure, and Quotas
- Add queue backpressure with priority lanes.
- Integrate per-model and per-tool quotas.
- Emit telemetry for queue depth, wait time, and preemption events.

---

## Data Model (Authoritative)

Execution lease:
- `leaseId` (uuid)
- `taskId`
- `workerId`
- `status`: `running` | `completed` | `failed` | `canceled`
- `acquiredAt` (ms epoch)
- `expiresAt` (ms epoch)
- `lastHeartbeatAt` (ms epoch)
- `attempt` (number)

Worker status:
- `workerId`
- `state`: `idle` | `busy` | `draining`
- `capacity`: number
- `inFlight`: number
- `lastSeenAt` (ms epoch)

---

## Scheduling Rules (Deterministic)

- Worker selection: least `inFlight`, then oldest `lastSeenAt`.
- Queue priority: `interactive` > `normal` > `batch`.
- Backpressure:
  - if queue depth >= 1000, reject all new submissions.
  - else if queue depth >= 500, reject only `batch` submissions.
- Cancellation: immediate state transition to `canceled` and tool cleanup hook invoked.
- Heartbeat refreshes `expiresAt = now + leaseTTL`.
- Expired leases are requeued with `attempt + 1`.

---

## Queue Classification (Authoritative)

- `interactive`: direct user-triggered actions (chat/run buttons).
- `normal`: agent-internal follow-up work.
- `batch`: scheduled or automated runs (pipelines, timers).

---

## Defaults (Configurable)

- Lease TTL: 30s
- Heartbeat interval: 5s
- Scheduler tick: 100ms
- Max in-flight tasks per worker: 4
- Queue depth hard limit: 1000

---

## Configuration Surface

Add `ExecutionConfig` to `packages/agent-runtime-core/src/index.ts`:
- `leaseTtlMs`
- `heartbeatIntervalMs`
- `schedulerTickMs`
- `maxInFlightPerWorker`
- `queueDepthLimit`
- `batchBackpressureThreshold`
- `quotaConfig` (optional)

Defaults match the values above.

---

## Quota Rules (Authoritative)

- If `quotaConfig` is unset, no quotas are enforced.
- If set, quotas are evaluated before scheduling.
- A task that exceeds quota is rejected with a `quota_exceeded` reason and logged.

---

## Deliverables

- `packages/agent-runtime/src/execution/` with scheduler, worker registry, and task queue.
- `packages/agent-runtime-persistence/` extensions for execution leases and replay state.
- Updated runtime events for task lifecycle transitions.
- `packages/agent-gym/benchmarks/q4/` scenarios tagged `execution-scale`.
- `packages/agent-runtime-core/src/index.ts` additions for `ExecutionLease` and `WorkerStatus`.

---

## Scope and Non-Goals

In scope:
- Local worker pool with deterministic scheduling and backpressure.
- Fast resume with checkpointed execution state.

Not in scope:
- Cross-region autoscaling and distributed consensus.
- Speculative execution or model-based task prediction.

---

## Acceptance Criteria

- Execution-scale benchmarks complete 100 concurrent tasks with zero loss and stable ordering metadata.
- Resume from checkpoint within 1 second for at least 95 percent of benchmark tasks.
- Cancellation stops tool execution and finalizes state without leaks.
- Backpressure prevents overload while maintaining deterministic behavior.

---

## Integration Points

- `packages/agent-runtime-core/` task lifecycle and event bus.
- `packages/agent-runtime-persistence/` lease and replay state storage.
- `packages/agent-runtime-telemetry/` scheduler and queue metrics.

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Head-of-line blocking | Latency spikes | Priority lanes and preemption |
| Non-deterministic replay | Invalid resumes | Stable event ordering and hashing |
| Cancellation leaks | Resource bloat | Mandatory tool cleanup hooks |

---

## Testing

- Unit tests for scheduler decisions, leases, and cancellation tokens.
- Integration tests for resume and replay using checkpoint fixtures.
- Runtime tests: `pnpm --filter @ku0/agent-runtime test -- --grep "execution"`.
- Gym suite: `pnpm --filter @ku0/agent-gym gym:run -- --suite easy --category execution-scale --benchmarks packages/agent-gym/benchmarks/q4 --report packages/agent-gym/reports/q4-execution-scale.json`.
