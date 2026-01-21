# Track AE: Storage Engine

> **Priority**: 🟡 P1
> **Status**: Planning
> **Owner**: Agent Runtime Team
> **Dependencies**: Track AD (Sandbox Sidecar)

---

## Overview

Replace the TypeScript checkpoint and event log storage with a Rust storage engine to meet P99 < 5ms write latency requirements.

### Problem Definition

| Problem | Current Implementation | Impact |
|---------|----------------------|--------|
| High write latency | msgpack serialization + delta | P99 ~15ms, misses Track H target |
| GC pressure | Large JS objects | Memory spikes during checkpoints |
| Slow replay | Full deserialization | Time-travel debugging latency |

---

## Deliverables

### D1: Rust Storage Library
- Append-only event log with mmap (TaskGraph backing store)
- Delta compression (Zstd)
- Fast checkpoint serialization

### D2: API Surface
```rust
pub trait StorageEngine {
    fn save_checkpoint(&self, id: &str, data: &[u8]) -> Result<()>;
    fn load_checkpoint(&self, id: &str) -> Result<Vec<u8>>;
    fn append_event(&self, event: &Event) -> Result<u64>;
    fn replay_events(&self, from: u64) -> impl Iterator<Item = Event>;
    fn prune(&self, before: u64) -> Result<usize>;
}
```

### D3: TypeScript Bindings
- N-API or gRPC interface
- Drop-in replacement for `messagePackCheckpointStorage.ts`

---

## Technical Design

```
┌────────────────────────────────────────────────────────┐
│  TypeScript Layer                                      │
│  - Business object assembly                            │
│  - Checkpoint scheduling                               │
└──────────────────────┬─────────────────────────────────┘
                       │ N-API / Unix socket
                       ▼
┌────────────────────────────────────────────────────────┐
│  Rust Storage Engine                                   │
│  ┌─────────────┬─────────────┬─────────────┐          │
│  │ Event Log   │ Checkpoint  │ Compression │          │
│  │ (append)    │ (snapshot)  │ (Zstd)      │          │
│  └─────────────┴─────────────┴─────────────┘          │
│  - mmap for fast reads                                 │
│  - WAL for durability                                  │
│  - Compaction for space efficiency                     │
│  - TaskGraph Event Stream Support                      │
└────────────────────────────────────────────────────────┘
```

### Integration with TaskGraph
Current `TaskGraph` (Track H) writes heavily to `messagePackCheckpointStorage`. The Rust engine will become the backing store for:
1. **Event Append**: Fast, non-blocking writes for every tool execution.
2. **State Rehydration**: Rebuilding `TaskGraph` in-memory state from Rust event stream on startup.

---

## Implementation Plan

| Week | Deliverable | Tasks |
|------|-------------|-------|
| 1 | Storage API design | Define Rust trait, TypeScript interface |
| 2 | Event log impl | Append-only log with mmap |
| 3 | Checkpoint impl | Snapshot with Zstd compression |
| 4 | TS integration | N-API bindings, migration path |

---

## Affected Code

| File | Change Type |
|------|-------------|
| `packages/agent-runtime/src/checkpoint/messagePackCheckpointStorage.ts` | Replace with Rust |
| `packages/agent-runtime/src/tasks/taskGraph.ts` | Call Rust event log |
| `packages/storage-engine-rs/` | New Rust crate |

---

## Acceptance Criteria

- [ ] Event log write P99 < 5ms
- [ ] Checkpoint save/load 50% faster
- [ ] Replay 100K events in < 500ms
- [ ] Memory usage reduced by 40%

---

## Risks

| Risk | Mitigation |
|------|------------|
| Data migration | Versioned format, backward compat |
| Corruption recovery | WAL + checksums |
| Integration complexity | Feature flag for gradual rollout |

---

## References

- Current impl: `packages/agent-runtime/src/checkpoint/messagePackCheckpointStorage.ts`
- Track H requirements: `docs/roadmap/phase-1-foundation/core/track-h-optimization.md`
- Task graph: `packages/agent-runtime/src/tasks/taskGraph.ts`
