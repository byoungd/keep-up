# LFCC v0.9.6 Performance Enhancement Proposal

**Status**: Draft Proposal (Extension-only)
**Date**: 2026-01-29
**Version**: 0.9.6
**Authors**: AI-Assisted
**Depends-On**: LFCC v0.9.5 Markdown Content Mode

---

## 1. Abstract

This proposal defines a deterministic, opt-in performance layer for LFCC Markdown Content Mode, focused on AI-native coding workflows. It introduces:

- Incremental semantic indexing with O(delta) updates
- Deterministic parallel resolution of independent operations
- Native Tree-sitter parsing for code fences
- Cache-aware hashing with fast keys and canonical verification
- Streaming operation pipeline for large documents

Target: 5-10x throughput improvement on typical AI editing workloads without changing document semantics.

---

## 2. Scope and Non-Goals

### 2.1 Scope

- Applies only to Markdown Content Mode in `packages/markdown-content-rs` and its TypeScript bindings.
- Improves performance of semantic index builds, operation resolution, and hashing.
- Preserves existing LFCC operation semantics and validation rules.

### 2.2 Non-Goals

- No changes to LFCC canonicalization rules or schema.
- No changes to CRDT or persistence format (Loro remains the only CRDT; no Yjs).
- No new user-facing features beyond performance.
- No behavioral changes to existing operation results.

---

## 3. Terminology and Invariants

### 3.1 Definitions

- **TotalLines**: Number of logical lines in the document. Empty document has `total_lines = 0`.
- **LineRange**: 1-based, inclusive. Used for block ranges and read/write ranges. `start <= end`. `line_count = end - start + 1`.
- **EditRange**: 1-based, inclusive with insertion support. Valid if `start <= end` (replace/delete) or `start == end + 1` (insert).
  - Insert before line `start`. Insert at end uses `start = total_lines + 1`, `end = total_lines`.
  - Insert into empty doc uses `start = 1`, `end = 0`.
- **Edit**: Replace lines `[start, end]` (EditRange) with `new_lines`.
- **delta_lines**: `new_lines.len() as i32 - removed_lines as i32`.
- **Block**: A Markdown Content Mode block (paragraph, heading, list item, code fence, etc.).
- **Semantic Index**: Mapping from blocks to line ranges and optional symbol data (code fences).
- **Affected Range**: The minimal LineRange that an operation reads or writes.

### 3.2 Determinism Rules

- Parallelism MUST NOT change output. All parallel stages are resolution-only; final application order is deterministic.
- Caches are performance-only. A cache miss or eviction MUST NOT alter correctness.

### 3.3 Safety and Fallbacks

- Any failure in a performance feature MUST fall back to v0.9.5 behavior for that feature only.
- Failures are logged with a feature-specific error code (see Section 9).

---

## 4. Problem Analysis

### 4.1 Current Bottlenecks

| Component | Current | Target | Bottleneck |
|----------|---------|--------|------------|
| Semantic index build | O(N) per edit | O(delta) | Full reparse on every change |
| Content hash | O(N) | O(1) amortized | No caching |
| Line operations | Sequential | Deterministic parallel | Single-threaded resolution |
| Code fence analysis | Regex-based | AST-based | No syntax tree |

### 4.2 AI Workload Characteristics (Observed)

- 10-50 edits per session
- 80%+ operations target code fences
- 1,000-10,000 lines per document
- <50ms interaction latency required for good UX

### 4.3 PERF Requirements Gap

LFCC v0.9 RC defines:
- PERF-001: hot path <10ms for 10K blocks
- PERF-003: canonicalization 1K blocks/10ms, 10K blocks/100ms

Markdown Content Mode currently misses these targets for:
- Documents >5,000 lines
- Batch operations >10 ops/request
- Code-heavy docs (>50% code fences)

---

## 5. Design Goals

| Goal | Description | Priority |
|------|-------------|----------|
| G1 | Incremental updates O(delta) | P0 |
| G2 | Deterministic parallel resolution | P0 |
| G3 | <10ms semantic index update | P1 |
| G4 | <5ms single operation apply | P1 |
| G5 | Memory usage <2x document size | P2 |
| G6 | Zero-copy where possible | P2 |

---

## 6. Architecture Overview

Data flow per request:

1. Parse or reuse semantic index
2. Resolve operations (possibly in parallel) against a stable snapshot
3. Apply resolved operations deterministically
4. Update semantic index incrementally
5. Update caches and telemetry

The performance layer never changes the observable behavior of operation application.

---

## 7. Technical Design

### 7.1 Incremental Semantic Indexing

#### 7.1.1 Data Structures

```rust
/// Incremental index with dirty region tracking
pub struct IncrementalSemanticIndex {
    snapshot: SemanticIndexSnapshot,
    edit_log: Vec<EditRecord>,
    dirty_regions: IntervalSet<u32>,
    block_map: HashMap<BlockId, LineRange>,
    line_offsets: LineOffsetIndex,
    line_hash_cache: LruCache<LineRange, String>,
}

pub struct SemanticIndexSnapshot {
    pub blocks: Vec<SemanticBlock>,
    pub symbols: Vec<CodeSymbol>,
    pub content_hash: String,
}

pub struct EditRecord {
    timestamp_ms: u64,
    affected_range: LineRange,
    delta_lines: i32,
    invalidated_blocks: Vec<BlockId>,
}

pub struct LineOffsetIndex {
    // line_start_offsets[i] = byte offset for line (i+1), dense cache
    line_start_offsets: Vec<u32>,
    // Fenwick tree of per-line delta bytes for O(log L) updates
    fenwick: FenwickTree<i32>,
}
```

**Invariants**:
- `block_map` ranges do not overlap and cover all blocks in `snapshot.blocks`.
- `line_start_offsets.len() == total_lines`.
- `line_start_offsets` is strictly increasing.
- `fenwick.len() == total_lines`.

#### 7.1.2 Edit Model

```rust
pub struct LineEdit {
    pub start_line: u32,
    pub end_line: u32,
    pub new_lines: Vec<String>,
}

pub fn edit_removed_lines(edit: &LineEdit) -> u32 {
    if edit.start_line == edit.end_line + 1 {
        0
    } else {
        edit.end_line - edit.start_line + 1
    }
}

pub fn edit_delta_lines(edit: &LineEdit) -> i32 {
    edit.new_lines.len() as i32 - edit_removed_lines(edit) as i32
}
```

#### 7.1.3 Update Algorithm (Deterministic)

Inputs:
- `index`: pre-edit snapshot
- `edit`: line numbers refer to pre-edit content
- `content_lines`: post-edit content

1. **Normalize**:
   - `start_line` in `[1, total_lines + 1]`, `end_line` in `[0, total_lines]`.
   - Valid if `start_line <= end_line` or `start_line == end_line + 1` (insert).
   - If invalid, return `IndexUpdateError::InvalidEdit` (do not fallback).
2. **Mark Dirty Region (pre-edit coordinates)**:
   - If replace/delete: initial dirty range = `[start_line, end_line]`.
   - If insert: initial dirty range = `[max(1, start_line - 1), min(total_lines, start_line)]`.
3. **Expand Semantically** (pre-edit snapshot; deterministic rules):
   - **Code fence**: expand to the full fence block if the dirty range intersects any fence line.
   - **Frontmatter**: if the dirty range intersects the first block and it is YAML/TOML frontmatter (`---` or `+++` on its own line), expand to the entire frontmatter block.
   - **Heading**: if the dirty range intersects a heading line, expand to the section defined by that heading up to (but not including) the next heading of same or higher level.
4. **Convert to Post-Edit Range**:
   - `dirty_post.start = dirty_pre.start`
   - `dirty_post.end = dirty_pre.end + delta_lines`
   - Clamp to `[1, total_lines_after]`, ensure `start <= end` (if not, set `start = end`).
5. **Update Line Offsets**: apply `delta_lines` to `line_start_offsets` for all lines after `end_line` (or after `start_line` for insert).
6. **Reparse Dirty Slice**: parse markdown blocks only within `dirty_post` on `content_lines`.
7. **Merge**: remove old blocks in `dirty_pre`, insert new blocks with post-edit ranges, update `block_map`.
8. **Update Snapshot Hash**: update content hash using cache (Section 7.4).

`expand_dirty_region` MAY encapsulate steps 2-4 and MUST return the post-edit dirty range.

```rust
fn incremental_update(
    index: &mut IncrementalSemanticIndex,
    edit: &LineEdit,
    content_lines: &[String],
) -> Result<(), IndexUpdateError> {
    // expand_dirty_region returns the post-edit dirty range
    let dirty = expand_dirty_region(index, edit)?;
    index.line_offsets.apply_delta(edit.start_line, edit_delta_lines(edit));

    let slice = lines_slice(content_lines, dirty.start, dirty.end);
    let new_blocks = parse_markdown_blocks(slice, dirty.start);

    index.remove_blocks_in_range(dirty);
    index.insert_blocks(new_blocks);
    index.update_content_hash(content_lines)?;
    Ok(())
}
```

#### 7.1.4 Complexity

- Dirty reparse: O(K) where K = blocks in dirty region
- Offset update: O(log L) using a Fenwick tree (prefix-sum)
- Merge: O(K log B)

`LineOffsetIndex` MUST use a Fenwick tree for `total_lines > 100_000`. For smaller documents, a dense vector is permitted, but the update path must still cap at O(L) with `L <= 100_000`.

#### 7.1.5 Failure and Fallback

- If dirty region expansion fails (invalid fences), fall back to full reparse.
- If incremental parse produces invalid blocks, fall back to full reparse.

---

### 7.2 Deterministic Parallel Operation Resolution

Parallelism is used only for **resolution**. **Application** is deterministic and sequential.

#### 7.2.1 Operation Model

Each operation exposes:

```rust
pub trait MarkdownOperationExt {
    fn read_range(&self) -> LineRange;   // context used for resolution
    fn write_range(&self) -> LineRange;  // lines modified
    fn delta_lines(&self) -> i32;        // line count change
}
```

#### 7.2.2 Dependency Rules

Define `overlaps_or_adjacent(a, b)` as true if `a` and `b` overlap or `a.end + 1 == b.start` or `b.end + 1 == a.start`.

Operation **A must precede B** if any of the following is true (all ranges computed on the same pre-apply snapshot):

- `overlaps_or_adjacent(A.write_range, B.write_range)`
- `overlaps_or_adjacent(A.write_range, B.read_range)`
- `overlaps_or_adjacent(A.read_range, B.write_range)`
- `A.delta_lines != 0` and `A.write_range.end < B.read_range.start` (line-shift dependency)

This rule is directional. Only edits above can shift ranges below.

```rust
fn must_precede(a: &MarkdownOperation, b: &MarkdownOperation) -> bool {
    if overlaps_or_adjacent(a.write_range(), b.write_range()) { return true; }
    if overlaps_or_adjacent(a.write_range(), b.read_range()) { return true; }
    if overlaps_or_adjacent(a.read_range(), b.write_range()) { return true; }
    if a.delta_lines() != 0 && a.write_range().end < b.read_range().start { return true; }
    false
}
```

#### 7.2.3 Dependency Graph

```rust
pub struct OpDependencyGraph {
    nodes: Vec<OpNode>,
    edges: Vec<(usize, usize)>,
}

impl OpDependencyGraph {
    pub fn from_ops(ops: &[MarkdownOperation]) -> Self {
        let mut graph = Self::new();
        for (i, op) in ops.iter().enumerate() {
            for j in 0..i {
                if ops[j].must_precede(op) {
                    graph.add_edge(j, i);
                }
            }
        }
        graph
    }

    pub fn parallel_batches(&self) -> Vec<Vec<usize>> {
        // Deterministic topological leveling.
    }
}
```

#### 7.2.4 Resolution and Application

```rust
// ResolvedOp MUST include op_index and start_byte computed on the batch snapshot.
#[cfg(not(target_arch = "wasm32"))]
use rayon::prelude::*;

pub fn apply_ops_parallel(
    content: &str,
    ops: &[MarkdownOperation],
    options: &ApplyOptions,
) -> Result<String, MarkdownOperationError> {
    let graph = OpDependencyGraph::from_ops(ops);
    let batches = graph.parallel_batches();

    let mut current = content.to_string();

    for batch in batches {
        let snapshot = current.clone();

        let mut resolutions: Vec<ResolvedOp> = {
            #[cfg(not(target_arch = "wasm32"))]
            { batch.par_iter().map(|&i| resolve_operation(&ops[i], &snapshot)).collect() }

            #[cfg(target_arch = "wasm32")]
            { batch.iter().map(|&i| resolve_operation(&ops[i], &snapshot)).collect() }
        };

        // Deterministic apply order: descending by start offset, stable by index
        resolutions.sort_by(|a, b| b.start_byte.cmp(&a.start_byte).then(a.op_index.cmp(&b.op_index)));

        for res in resolutions {
            current = apply_resolved_op(&current, &res)?;
        }
    }

    Ok(current)
}
```

**Determinism**:
- Resolutions always use the same snapshot per batch.
- Application order is stable and independent of thread scheduling.

**Fallback**:
- On any resolution error or apply failure, rerun sequential apply. If sequential apply fails, return error.

---

### 7.3 Tree-sitter Integration for Code Fences

#### 7.3.1 Fence Detection

- Reuse Markdown block parser to identify code fence blocks.
- Extract `info_string` and normalize (`trim`, lowercase, first token only).

#### 7.3.2 AST Parsing Rules

- Parse only if `content_bytes <= max_parse_bytes`.
- Unsupported languages skip AST parsing.
- Syntax errors yield no symbols but do not fail the request.

```rust
pub struct CodeFenceAst {
    tree: Tree,
    language: String,
    byte_to_line: Vec<(usize, u32)>,
}
```

#### 7.3.3 Supported Languages (Phase 1)

| Language | Tree-sitter Crate | Priority |
|----------|-------------------|----------|
| TypeScript/JavaScript | tree-sitter-typescript | P0 |
| Python | tree-sitter-python | P0 |
| Rust | tree-sitter-rust | P1 |
| Go | tree-sitter-go | P2 |
| Markdown (nested) | tree-sitter-markdown | P2 |

#### 7.3.4 AST Caching

- Cache key: `(block_id, content_hash)`
- Cache size: LRU, default 256 entries
- Invalidate on code fence hash change

#### 7.3.5 WASM Compatibility

- Use WASM builds of Tree-sitter languages for browser targets.
- The Rust build script in `packages/markdown-content-rs` must gate language compilation by target.

---

### 7.4 Cache-Aware Hashing

#### 7.4.1 Quick Hash

- Use xxHash64 for fast cache keys: `compute_quick_hash(text: &str) -> u64`.
- Quick hash is never used as the canonical content hash.

#### 7.4.2 Canonical Hash

- Use SHA-256 for canonical line and document hashes.
- Canonical hash must be computed on exact content bytes.

#### 7.4.3 Hash Cache

```rust
pub struct HashCache {
    // (start, end, quick_hash) -> sha256
    line_cache: Arc<RwLock<LruCache<(u32, u32, u64), String>>>,
    // (block_id, start, end, quick_hash) -> block_hash
    block_cache: Arc<RwLock<LruCache<(String, u32, u32, u64), String>>>,
    // (length, first_line_hash, last_line_hash, line_count) -> content_hash
    content_cache: Arc<RwLock<LruCache<ContentCacheKey, String>>>,
}
```

**Invalidation Rules** (using pre-edit `total_lines`):
- Define `invalidate_range` as:
  - If insert (`start_line == end_line + 1`): `[max(1, start_line - 1), min(total_lines, start_line)]`
  - Else: `[start_line, end_line]`
- Any cache entry whose range overlaps `invalidate_range` MUST be evicted.
- Content cache is only valid if `byte_length`, `line_count`, `first_line_hash`, `last_line_hash` match.

**Concurrency**:
- All caches use `RwLock` for read-mostly access.
- Cache miss computes canonical hash and inserts.

---

### 7.5 Streaming Operation Pipeline

#### 7.5.1 Chunking Rules

- Chunk size is in bytes, but boundaries MUST align to line breaks.
- Each chunk includes an optional `overlap_lines` margin for context (default 3 lines).
- If an operation's read/write ranges span multiple chunks, streaming MUST be disabled for the request and the in-memory path used.

#### 7.5.2 Algorithm

1. Build line offset table by streaming scan.
2. Partition content into chunks by `chunk_size_bytes` and line boundaries.
3. Assign operations to chunks based on union(`read_range`, `write_range`).
4. Process each chunk sequentially; within each chunk, use normal apply logic.

#### 7.5.3 Memory Bounds

| Document Size | Max Memory | Strategy |
|---------------|------------|----------|
| < 1 MB | 3x doc size | In-memory |
| 1-10 MB | 2x doc size | Chunked |
| > 10 MB | 1.5x doc size | Streaming |

---

## 8. Policy Extensions

```typescript
type PerformancePolicyV1 = {
  enabled: boolean;

  incremental_index: {
    enabled: boolean;
    max_edit_log_entries: number; // default 100, min 10, max 500
    dirty_region_merge_threshold: number; // lines, default 10
  };

  cache: {
    enabled: boolean;
    max_entries: number; // default 10000
    ttl_seconds?: number;
  };

  parallel: {
    enabled: boolean;
    max_threads: number; // default = num_cpus
    batch_threshold: number; // min ops for parallel, default 4
  };

  ast_parsing: {
    enabled: boolean;
    languages: string[]; // default ["typescript", "python"]
    max_parse_bytes: number; // default 1_048_576
  };

  streaming: {
    enabled: boolean;
    chunk_size_bytes: number; // default 65_536
    memory_limit_bytes: number; // default 104_857_600
    overlap_lines: number; // default 3
  };
};
```

Capability flags:

```typescript
type PerformanceCapabilities = {
  performance_incremental_index?: boolean;
  performance_parallel_ops?: boolean;
  performance_ast_parsing?: boolean;
  performance_streaming?: boolean;
  performance_cache?: boolean;
};
```

---

## 9. Telemetry and Error Codes

Record at least the following metrics per request:

- `perf.index.update_ms`
- `perf.ops.resolve_ms`
- `perf.ops.apply_ms`
- `perf.hash.hit_rate`
- `perf.ast.parse_ms`
- `perf.streaming.chunks`

Error codes (examples):
- `PERF_IDX_FALLBACK_FULL`
- `PERF_PAR_FALLBACK_SEQ`
- `PERF_AST_PARSE_FAIL`
- `PERF_STREAMING_DISABLED`

---

## 10. Benchmark Targets

### 10.1 Latency Targets

| Operation | Document Size | Current | Target | Improvement |
|-----------|---------------|---------|--------|-------------|
| Semantic index (full) | 1K lines | 15ms | 5ms | 3x |
| Semantic index (incr) | 1K lines | 15ms | 0.5ms | 30x |
| Single line op | 10K lines | 8ms | 2ms | 4x |
| Batch (10 ops) | 10K lines | 80ms | 10ms | 8x |
| Content hash | 10K lines | 5ms | 0.5ms | 10x |
| Code fence AST | 500 lines | N/A | 3ms | New |

### 10.2 Throughput Targets

| Workload | Current | Target |
|----------|---------|--------|
| Ops/sec (1K doc) | 120 | 1000 |
| Ops/sec (10K doc) | 12 | 100 |
| Concurrent sessions | 1 | 8 |

### 10.3 Benchmark Method

- Run on a fixed baseline machine class (documented in benchmark README).
- Use 10 warmup iterations, 50 measured iterations.
- Report median and p99.

---

## 11. Implementation Plan

### 11.1 Phase 1: Incremental Index + Hash Cache (Week 1-2)

```
packages/markdown-content-rs/src/
├── cache/
│   ├── mod.rs
│   ├── hash_cache.rs
│   └── lru.rs
├── incremental/
│   ├── mod.rs
│   ├── edit_log.rs
│   ├── dirty_region.rs
│   └── snapshot.rs
└── lib.rs
```

Deliverables:
- Incremental semantic index with deterministic dirty region expansion
- Hash cache with defined invalidation rules
- Benchmarks for cache hit rate and index update

### 11.2 Phase 2: Parallel Resolution (Week 3-4)

```
packages/markdown-content-rs/src/
├── parallel/
│   ├── mod.rs
│   ├── dependency_graph.rs
│   ├── batch_executor.rs
│   └── rayon_pool.rs
```

Deliverables:
- Conflict detection and dependency graph
- Deterministic batch resolution
- Sequential fallback

### 11.3 Phase 3: Tree-sitter Integration (Week 5-6)

```
packages/markdown-content-rs/src/
├── ast/
│   ├── mod.rs
│   ├── parser.rs
│   ├── symbols.rs
│   └── languages/
│       ├── typescript.rs
│       ├── python.rs
│       └── rust.rs
```

Deliverables:
- AST parser wrapper
- Symbol extraction API
- Language gating and caching

### 11.4 Phase 4: Streaming + Benchmarks (Week 7-8)

Deliverables:
- Streaming pipeline with chunk assignment rules
- End-to-end performance benchmarks
- Documentation and conformance tests

---

## 12. Conformance Testing

```typescript
describe("PERF-v0.9.6 Conformance", () => {
  describe("Incremental Index", () => {
    it("updates in O(delta) time", async () => {
      const doc = generateDoc(10000);
      const index = await buildIndex(doc);

      const start = performance.now();
      await updateIndex(index, { range: { start: 100, end: 105 }, lines: ["new"] });
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(5);
    });
  });

  describe("Parallel Operations", () => {
    it("scales with thread count for independent ops", async () => {
      const doc = generateDoc(5000);
      const ops = generateNonOverlappingOps(20);

      const singleThread = await bench(() => applyOps(doc, ops, { threads: 1 }));
      const multiThread = await bench(() => applyOps(doc, ops, { threads: 4 }));

      expect(multiThread.median).toBeLessThan(singleThread.median * 0.5);
    });
  });
});
```

All existing v0.9.5 tests must pass with performance features enabled.

---

## 13. Migration and Rollout

### 13.1 Opt-in Policy

```typescript
const policy: PolicyManifest = {
  performance: {
    enabled: true,
    incremental_index: { enabled: true },
    cache: { enabled: true, max_entries: 10000 },
    parallel: { enabled: true, max_threads: 4 },
    ast_parsing: { enabled: true, languages: ["typescript", "python"] },
    streaming: { enabled: false },
  },
};
```

### 13.2 Fallback Behavior

- Incremental index failure -> full rebuild
- Parallel failure -> sequential execution
- Cache miss -> recompute
- AST parse failure -> skip symbols (no behavioral change)
- Streaming failure -> in-memory path

---

## 14. Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Non-deterministic parallelism | Deterministic apply order and per-batch snapshots |
| Incorrect dirty region expansion | Fallback to full reparse on invalid boundaries |
| Hash cache collisions | Quick hash is only a cache key; canonical hash verifies |
| AST parser instability | Parse failure is non-fatal and isolated |
| Memory growth from caches | Bounded LRU with configurable size |

---

## 15. Decisions (Resolved)

1. Thread pool sharing: No. Each LFCC instance uses its own pool.
2. Cache persistence: Session-only (no disk persistence in v0.9.6).
3. AST caching: LRU by `(block_id, content_hash)`.
4. WASM target: Supported with single-thread fallback.

---

## Appendix A: Benchmark Harness (Rust)

```rust
use std::time::Instant;

pub struct BenchResult {
    pub name: String,
    pub iterations: u32,
    pub min_ns: u64,
    pub max_ns: u64,
    pub median_ns: u64,
    pub p99_ns: u64,
}

pub fn bench<F: Fn()>(name: &str, iterations: u32, f: F) -> BenchResult {
    let mut times = Vec::with_capacity(iterations as usize);

    for _ in 0..10 {
        f();
    }

    for _ in 0..iterations {
        let start = Instant::now();
        f();
        times.push(start.elapsed().as_nanos() as u64);
    }

    times.sort_unstable();
    BenchResult {
        name: name.to_string(),
        iterations,
        min_ns: times[0],
        max_ns: times[times.len() - 1],
        median_ns: times[times.len() / 2],
        p99_ns: times[(times.len() as f64 * 0.99) as usize],
    }
}
```

---

## Appendix B: Memory Layout (Estimate)

```
IncrementalSemanticIndex Memory Layout:
+---------------------------------------+
| SemanticIndexSnapshot (~8 bytes/block)|
+---------------------------------------+
| EditLog (32 bytes/entry, max 100)     |
+---------------------------------------+
| DirtyRegions (16 bytes/interval)      |
+---------------------------------------+
| BlockMap (48 bytes/entry)             |
+---------------------------------------+
| HashCache (LRU, 80 bytes/entry)       |
+---------------------------------------+

Estimated overhead for 10K line document:
- Base index: ~80 KB
- Edit log: ~3.2 KB
- Cache: ~800 KB (10K entries)
- Total: ~1 MB (vs 10 MB document)
```
