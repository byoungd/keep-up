# Agent Runtime: TypeScript vs Rust Analysis

Date: 2026-01-21
Owner: Architecture Team
Status: RFC

---

## 1. Current State

### TypeScript Footprint (Approx.)
| Metric | Value |
| --- | --- |
| Files | ~912 |
| Lines of code | ~145,000 |
| Core modules | ~39 |
| Workspace dependencies | 15+ |

### Core Modules (Sample)
- `orchestrator/`: state machine, turn execution, planning.
- `streaming/`: token stream, backpressure, recovery.
- `execution/`: task pool and scheduling.
- `graph/`: graph runtime.
- `swarm/`: multi-agent collaboration.
- `checkpoint/`: checkpoint and shadow git.
- `security/`: policy and audit.

---

## 2. Codex (Rust) Comparison

### Rust Scale (codex-rs)
| Metric | Value |
| --- | --- |
| Crates | ~45 |
| codex-core size | ~180KB (~4,800 LOC) |
| Total LOC | ~300,000+ |

### Rust Advantages
| Capability | Rust | TypeScript |
| --- | --- | --- |
| OS sandbox | Seatbelt + Landlock | Docker-based |
| Memory safety | Compile-time | Runtime GC |
| Concurrency | Tokio | Node single-thread + workers |
| Type safety | Ownership + borrow checking | TypeScript (runtime bypass possible) |
| Performance | Near C/C++ | 10-100x slower for CPU paths |
| Startup time | Milliseconds | Seconds (Node cold start) |
| Packaging | Single binary | Node runtime required |

---

## 3. Migration Benefit Assessment

### Clear Wins
1. OS-level sandboxing for macOS/Linux, AppContainer on Windows.
2. CPU-heavy tasks (tokenization, indexing, compression).
3. Memory stability for long-running sessions.
4. Cross-platform distribution of isolated binaries.

### Risks
1. Rust learning curve and slower iteration (3-6 month ramp).
2. LLM SDK ecosystem is TS-first.
3. Long migration timeline for full rewrite (6-12 months).
4. Team capacity and maintenance overhead.

---

## 4. Recommended Strategy

### Option A: Full Rust Rewrite (Not Recommended)
- High risk, long freeze, duplicated SDK ecosystem.

### Option B: Hybrid (Recommended)

```
TypeScript layer (orchestrator, UI, SDKs)
  -> Rust accelerators (sandbox, storage, tokenizer, indexer)
```

### Option C: Rust-only for CLI Tools (Fallback)
- Only for standalone utilities if N-API or sidecar is blocked.

---

## 5. Decision

| Item | Recommendation |
| --- | --- |
| Full Rust rewrite | No |
| Rust accelerators | Yes |
| First target | Sandbox isolation |
| Binding | N-API first, gRPC later |

---

## 6. Next Actions

1. Define Phase 6 roadmap and platform support matrix.
2. Prototype N-API sandbox wrapper with OS-specific policies.
3. Benchmark checkpoint P99 and token counting.

---

## References

- Codex Rust: `.tmp/analysis/codex/codex-rs/`
- Runtime: `packages/agent-runtime/`
- Phase 6 roadmap: `docs/roadmap/phase-6-rust-native/README.md`
