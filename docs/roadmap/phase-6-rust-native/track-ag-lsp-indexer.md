# Track AG: LSP Indexer

> Priority: P2
> Status: Planning
> Owner: Agent Runtime Team
> Dependencies: Tracks AD-AF (defer until P0/P1 stable)

---

## Overview

Replace the O(N) symbol scan with a Rust inverted/trigram index to reach sub-5ms symbol
queries in large repositories.

---

## Problem Definition

| Problem | Current Implementation | Impact |
| --- | --- | --- |
| O(N) query time | Full map scan + scoring | ~50ms in large repos |
| High memory usage | V8 map overhead | 2-3x symbol data size |
| No fuzzy index | Runtime trigram generation | Repeated computation |

---

## Deliverables

### D1: Rust Symbol Indexer
- Inverted index for symbol names.
- Trigram index for fuzzy search.
- Incremental updates.

### D2: Query Engine
- O(log N) lookup.
- Ranked results with scoring.
- Kind filtering.

### D3: Tool Output Streaming (Optional)
- Stream large tool outputs to disk.
- Chunk-based truncation.
- Avoid memory peaks.

---

## Cross-Platform Requirements

- Provide native binaries for macOS/Linux/Windows.
- Ensure index persistence uses portable file format.

---

## Technical Design

```
TypeScript LSP client
  -> Rust indexer (inverted + trigram index)
```

### Data Ingestion Strategy
1. LSP push (TS client sends symbols to Rust).
2. Optional future: Rust tree-sitter parsing for direct indexing.

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
| --- | --- | --- |
| 1 | Index design | Define schema, benchmark options |
| 2 | Inverted index | Basic symbol name indexing |
| 3 | Fuzzy search | Trigram index implementation |
| 4 | TS integration | N-API bindings, migration path |
| 5 | Tool streaming | Optional: stream large outputs |
| 6 | Performance tuning | Benchmark hot paths |

---

## Affected Code

| File | Change Type |
| --- | --- |
| `packages/agent-runtime/src/lsp/symbolGraph.ts` | Replace with Rust |
| `packages/agent-runtime/src/lsp/importGraph.ts` | Consider Rust |
| `packages/agent-runtime/src/spooling/toolOutputSpooler.ts` | Optional streaming |
| `packages/symbol-index-rs/` | New Rust crate |

---

## Acceptance Criteria

- [ ] Symbol query < 5ms for 100k symbols.
- [ ] Incremental update < 10ms per file.
- [ ] Memory usage 50% lower than JS map.
- [ ] Fuzzy search quality matches current.

---

## Alternatives Considered

### Hybrid TS + Binaries (Roo-Code)
- Pros: Fast to assemble using ripgrep and fzf.
- Cons: Process spawn overhead and inconsistent state.

### Pure JS Map (Current)
- Pros: Simple and predictable.
- Cons: GC pressure and linear query cost.

Decision: Rust indexer for deterministic, low-latency queries.

---

## References

- Current impl: `packages/agent-runtime/src/lsp/symbolGraph.ts`
- Tool spooler: `packages/agent-runtime/src/spooling/toolOutputSpooler.ts`
- UI latency target: `docs/PRD.md` (50ms event delivery)
- tantivy: https://github.com/quickwit-oss/tantivy
- fst: https://github.com/BurntSushi/fst
