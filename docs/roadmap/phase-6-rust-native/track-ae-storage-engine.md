# Track AE: Storage Engine

> Priority: P1
> Status: Ready (blocked by Track AD)
> Owner: Agent Runtime Team
> Dependencies: Track AD

---

## Overview

Replace TypeScript checkpoint and event log storage with a Rust engine to meet P99 < 5ms
write latency while reducing GC pressure.

---

## Problem Definition

| Problem | Current Implementation | Impact |
| --- | --- | --- |
| High write latency | msgpack + delta | P99 ~15ms |
| GC pressure | Large JS objects | Memory spikes |
| Slow replay | Full deserialization | Debug latency |

---

## Deliverables

### D1: Rust Storage Library
- Append-only event log with mmap (TaskGraph backing store).
- Delta compression (Zstd).
- Fast checkpoint serialization.

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
- N-API first; UDS option for isolated processes.
- Drop-in replacement for `messagePackCheckpointStorage.ts`.

---

## Cross-Platform Requirements

- File locking must work on macOS/Linux/Windows.
- Atomic writes must use platform-safe patterns.
- Path length and Unicode normalization should be handled by the Rust layer.

---

## Technical Design

```
TypeScript layer (business objects)
  -> Rust storage engine (event log + checkpoint)
```

### TaskGraph Integration
The Rust engine becomes the backing store for:
1. Event append for tool execution telemetry.
2. State rehydration by replaying event streams.

---

## Implementation Plan

| Week | Deliverable | Tasks |
| --- | --- | --- |
| 1 | Storage API design | Define Rust trait, TS interface |
| 2 | Event log impl | Append-only log with mmap |
| 3 | Checkpoint impl | Snapshot with Zstd compression |
| 4 | TS integration | N-API bindings, migration path |

---

## Affected Code

| File | Change Type |
| --- | --- |
| `packages/agent-runtime/src/checkpoint/messagePackCheckpointStorage.ts` | Replace with Rust |
| `packages/agent-runtime/src/tasks/taskGraph.ts` | Call Rust event log |
| `packages/storage-engine-rs/` | New Rust crate |

---

## Acceptance Criteria

- [ ] Event log write P99 < 5ms.
- [ ] Checkpoint save/load 50% faster.
- [ ] Replay 100k events in < 500ms.
- [ ] Memory usage reduced by 40%.
- [ ] Windows file lock and crash recovery tests pass.

---

## Risks

| Risk | Mitigation |
| --- | --- |
| Data migration | Versioned format and backward compat |
| Corruption recovery | WAL + checksums |
| Integration complexity | Feature flag for gradual rollout |

---

## References

- Current impl: `packages/agent-runtime/src/checkpoint/messagePackCheckpointStorage.ts`
- Track H requirements: `docs/roadmap/phase-1-foundation/core/track-h-optimization.md`
- TaskGraph: `packages/agent-runtime/src/tasks/taskGraph.ts`
