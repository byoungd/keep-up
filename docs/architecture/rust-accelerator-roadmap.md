# Rust Accelerator Entry Points

Date: 2026-01-21
Owner: Architecture Team
Status: RFC

---

## Positioning: Accelerator/Isolator, Not a Rewrite

This roadmap defines where Rust should augment the TypeScript runtime. The goal is to:
- Avoid replacing the orchestration layer.
- Focus on performance bottlenecks and system boundaries.
- Integrate via N-API for low latency or a sidecar for isolation.

---

## 1. Runtime Sandbox and Process Isolation (Priority: P0)

### Current State
| Module | Path | Role |
| --- | --- | --- |
| `sandbox` | `packages/agent-runtime/src/sandbox/index.ts` | Preflight and postflight decisions |
| `@ku0/agent-runtime-sandbox` | External package | Docker-based execution |

### Issues
- Docker startup latency (~500ms).
- No OS-native isolation on macOS/Linux.
- Permission boundaries depend on container setup.

### Rust Entry Point

```
TypeScript policy layer
  -> Rust sandbox (Seatbelt / Landlock / AppContainer)
```

**Reuse target**: Codex sandbox logic in `.tmp/analysis/codex/codex-rs/`.

### Platform Coverage
- macOS: Seatbelt sandbox.
- Linux: Landlock + seccomp + namespaces.
- Windows: AppContainer (fallback to Docker/WSL when unavailable).

Expected impact:
- Sandbox startup under 10ms.
- OS-level enforcement for file and network boundaries.

---

## 2. Symbol Index / LSP Acceleration (Priority: P1/P2)

### Current State
| Module | Path | Role |
| --- | --- | --- |
| `SymbolGraph` | `packages/agent-runtime/src/lsp/symbolGraph.ts` | Symbol search |
| `ImportGraph` | `packages/agent-runtime/src/lsp/importGraph.ts` | Dependency tracking |

### Issues
- O(N) scan for queries.
- High memory overhead in JS maps.

### Rust Entry Point
- Inverted or trigram index with incremental updates.
- RoaringBitmap and arena allocation for memory reduction.

Expected impact:
- Query latency under 5ms at 100k symbols.
- 50% lower memory footprint.

---

## 3. Context Compression and Diff (Priority: P1)

### Current State
| Module | Path | Role |
| --- | --- | --- |
| `ContextCompactor` | `packages/agent-runtime/src/context/ContextCompactor.ts` | Token estimation and compaction |
| `MessageCompressor` | `packages/agent-runtime/src/orchestrator/messageCompression.ts` | History compression |

### Issues
- Token estimation is CPU heavy in JS.
- Long text truncation produces GC pressure.

### Rust Entry Point
- Token counting via `tiktoken-rs`.
- Structured truncation and compression (Zstd).

Expected impact:
- Token counting under 1ms per 10k tokens.
- 5x faster compaction.

---

## 4. Sidecar Daemon (Priority: P2)

A Rust daemon can host sandbox + index + compression features.
This is recommended once the N-API footprint becomes too large.

```
TypeScript runtime -> gRPC/UDS -> Rust sidecar
```

---

## Implementation Phases

| Phase | Module | Integration | Timeline | Risk |
| --- | --- | --- | --- | --- |
| P0 | Sandbox | N-API | 4 weeks | Low |
| P1 | Storage Engine | N-API / UDS | 4 weeks | Medium |
| P1 | Tokenizer/Compression | N-API | 3-4 weeks | Low |
| P2 | LSP Indexer | N-API / gRPC | 6 weeks | Medium |
| P2 | Sidecar Daemon | gRPC / UDS | 6+ weeks | High |

---

## Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Binding for P0/P1 | N-API | Lowest latency, simplest integration |
| Isolation model | OS-native where available | Avoid container overhead |
| Compression | Zstd | Best speed/ratio tradeoff |
| Indexing | Inverted + trigram | Sub-5ms search target |

---

## References

- Codex sandbox references: `.tmp/analysis/codex/codex-rs/`
- Current runtime: `packages/agent-runtime/`
- Roadmap: `docs/roadmap/phase-6-rust-native/README.md`
