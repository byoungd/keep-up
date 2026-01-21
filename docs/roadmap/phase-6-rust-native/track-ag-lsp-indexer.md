# Track AG: LSP Indexer

> **Priority**: 🟢 P2
> **Status**: Planning
> **Owner**: Agent Runtime Team
> **Dependencies**: Tracks AD-AF (lower priority, can defer)

---

## Overview

Replace the O(N) full-scan symbol search with a Rust-based inverted/trigram index for sub-5ms symbol queries in large repositories.

### Problem Definition

| Problem | Current Implementation | Impact |
|---------|----------------------|--------|
| O(N) query time | Full Map scan + scoring | ~50ms in large repos |
| High memory usage | V8 Map overhead | 2-3x symbol data size |
| No fuzzy index | Runtime trigram generation | Repeated computation |

---

## Deliverables

### D1: Rust Symbol Indexer
- Inverted index for symbol names
- Trigram index for fuzzy search
- Incremental updates

### D2: Query Engine
- O(log N) lookup
- Ranked results with scoring
- Kind filtering

### D3: Tool Output Streaming (Bonus)
- Stream large tool outputs to disk
- Chunk-based truncation
- Avoid memory peaks

---

## Technical Design

```
┌────────────────────────────────────────────────────────┐
│  TypeScript Layer                                      │
│  - LSP client coordination                             │
│  - Symbol update scheduling                            │
└──────────────────────┬─────────────────────────────────┘
                       │ N-API / gRPC
                       ▼
┌────────────────────────────────────────────────────────┐
│  Rust Symbol Indexer                                   │
│  ┌─────────────┬─────────────┬─────────────┐          │
│  │ Inverted    │ Trigram     │ Tree-sitter │          │
│  │ Index       │ Index       │ Parser(opt) │          │
│  └─────────────┴─────────────┴─────────────┘          │
│  - RoaringBitmap for positions                         │
│  - Arena allocator for symbols                         │
│  - mmap for persistence                                │
└────────────────────────────────────────────────────────┘
```

### Data Ingestion Strategy
1. **LSP Push**: Continue using TS-side LSP clients to push symbol data to Rust index (easiest integration).
2. **Direct Parsing (Future)**: Use Rust-native `tree-sitter` parsers for faster, parallel file indexing without waiting for full LSP server warmup.

---

## API Surface

```rust
pub struct SymbolIndex { ... }

impl SymbolIndex {
    pub fn update_file(&mut self, path: &str, symbols: &[Symbol]);
    pub fn remove_file(&mut self, path: &str);
    pub fn query(&self, query: &str, opts: QueryOptions) -> Vec<SymbolResult>;
    pub fn stats(&self) -> IndexStats;
}
```

---

## Implementation Plan

| Week | Deliverable | Tasks |
|------|-------------|-------|
| 1 | Index design | Define schema, benchmark options |
| 2 | Inverted index | Basic symbol name indexing |
| 3 | Fuzzy search | Trigram index implementation |
| 4 | TS integration | N-API bindings, migration path |
| 5 | Tool streaming | Bonus: stream large outputs |
| 6 | Performance tuning | Benchmark, optimize hot paths |

---

## Affected Code

| File | Change Type |
|------|-------------|
| `packages/agent-runtime/src/lsp/symbolGraph.ts` | Replace with Rust |
| `packages/agent-runtime/src/lsp/importGraph.ts` | Consider Rust |
| `packages/agent-runtime/src/spooling/toolOutputSpooler.ts` | Stream via Rust |
| `packages/symbol-index-rs/` | New Rust crate |

---

## Acceptance Criteria

- [ ] Symbol query < 5ms for 100K symbols
- [ ] Incremental update < 10ms per file
- [ ] Memory usage 50% lower than JS Map
- [ ] Fuzzy search quality matches current

---

## Risks

| Risk | Mitigation |
|------|------------|
| Index complexity | Start with inverted, add trigram later |
| Persistence format | Version schema, migration tools |
| Large repo edge cases | Benchmark on real monorepos |

---

## Alternatives Considered

### 1. Hybrid TS + Binaries (Roo-Code)
- **Architecture**: Spawns `ripgrep` for file listing, uses `fzf` (JS) for scoring, separate Vector DB (Qdrant).
- **Pros**: Quick to assemble from off-the-shelf tools.
- **Cons**: Overhead of spawning processes; "Frankenstein" architecture difficult to sync; strict dependency on binary paths.
- **Decision**: Rust Native Indexer offers unified memory model and sub-5ms query without process spawn overhead.

### 2. Pure In-Memory JS Map (Current)
- **Pros**: Simplest implementation.
- **Cons**: Garbage collection pauses; memory usage scales linearly (2-3x raw size); startup deserialization slow.
- **Decision**: Unsustainable for repos > 10k files.

---

## References

- Current impl: `packages/agent-runtime/src/lsp/symbolGraph.ts`
- Tool spooler: `packages/agent-runtime/src/spooling/toolOutputSpooler.ts`
- UI latency target: `docs/specs/PRD.md` (50ms event delivery)
- tantivy: https://github.com/quickwit-oss/tantivy
- fst: https://github.com/BurntSushi/fst
