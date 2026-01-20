# Track S: Graph Execution Runtime

Owner: Runtime Architect
Status: Completed
Priority: High
Timeline: Week 1-4
Dependencies: CheckpointManager baseline, Track P state/memory, Track L architecture
References: `docs/analysis/architecture-deep-dive.md`, LangGraph sources

---

## Objective

Deliver a graph execution runtime with typed state channels, retry policies, streaming outputs,
and checkpoint-backed durability for long-running agent flows.

---

## Source Analysis

- Pregel orchestration with channel reads/writes: `.tmp/analysis/langgraph/libs/langgraph/langgraph/pregel/main.py`.
- Checkpoint schema and saver interface: `.tmp/analysis/langgraph/libs/checkpoint/langgraph/checkpoint/base/__init__.py`.

---

## Tasks

### S1: Graph DSL + Typed State Channels
- Define a graph builder API with explicit channel subscriptions.
- Introduce typed channel read/write interfaces and reducer semantics.
- Wire graph definitions into `packages/agent-runtime/src/workflows`.

### S2: Execution Loop + Checkpoint Integration
- Build a graph runner that checkpoints at node boundaries.
- Support streaming output events and external interrupts.
- Add deterministic resume logic using existing CheckpointManager.

### S3: Retry + Cache Policies
- Provide per-node retry policies with backoff.
- Add optional node-level caching keyed by input and policy context.
- Emit telemetry events for retries, cache hits, and interruptions.

---

## Deliverables

- `packages/agent-runtime/src/graph/` runtime module.
- Graph integration tests for checkpointing and resume.
- Documentation updates describing graph DSL usage.

---

## Acceptance Criteria

- Graph builder exposes typed channels, reducers, and explicit subscriptions without `any`.
- Runner checkpoints at node boundaries and resumes deterministically from checkpoints.
- Retries and backoff policies are configurable per node and emit telemetry events.
- Streaming outputs and interrupts are propagated through the runtime event bus.
- Optional node-level caching keys include node input and policy context.

---

## Testing

- Unit tests for channel read/write semantics, reducers, and retry/backoff logic.
- Integration tests for checkpoint resume and deterministic replay.
- Suggested command: `pnpm --filter @ku0/agent-runtime test -- --grep "graph"`.
