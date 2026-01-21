# Track AI: Vector Similarity Engine

> Priority: P1
> Status: Ready
> Owner: Agent Runtime Team
> Dependencies: None (can run in parallel with AD-AH)

---

## Overview

Implement a Rust-based vector similarity engine with SIMD acceleration (AVX2/NEON) to replace
linear JavaScript loops for cosine similarity calculations in memory and semantic search modules.

---

## Problem Definition

| Problem | Current Implementation | Impact |
| --- | --- | --- |
| Slow loop execution | JS `for` loop | CPU bottleneck in large searches |
| No SIMD usage | Scalar operations | Missed 4-8x speedup data parallelism |
| High call volume | 50+ call sites | Cumulative latency in RAG/Memory |

---

## Deliverables

### D1: Rust Vector Library
- Cosine similarity with SIMD.
- Euclidean distance with SIMD.
- Batch similarity calculation.

### D2: TypeScript Bindings
- N-API for Node runtime.
- Drop-in replacement for `cosineSimilarity` function.
- Type-safe buffer handling (Float32Array).

---

## Cross-Platform Requirements

- Provide prebuilt binaries for macOS/Linux/Windows.
- Runtime detection of AVX2/NEON support (optional, or compile-time flags).

---

## API Surface

```rust
pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32;
pub fn cosine_similarity_batch(query: &[f32], targets: &[&[f32]]) -> Vec<f32>;
```

---

## Implementation Plan

| Week | Deliverable | Tasks |
| --- | --- | --- |
| 1 | Crate scaffold | `packages/vector-similarity-rs`, N-API setup |
| 1 | SIMD Impl | Integrate `simsimd` or `ndarray` |
| 2 | TS integration | Replace `cosineSimilarity` in memory/types.ts |
| 2 | Benchmarking | Measure speedup vs JS implementation |

---

## Affected Code

| File | Change Type |
| --- | --- |
| `packages/agent-runtime-memory/src/types.ts` | Replace JS implementation |
| `packages/collab-server/dist/ai/extraction/embeddingService.js` | Update reference |
| `packages/vector-similarity-rs/` | New Rust crate |

---

## Acceptance Criteria

- [ ] Cosine similarity 10x faster than JS baseline.
- [ ] Batch operations support.
- [ ] Correctness verified against JS implementation.
- [ ] No regression in accuracy (f32 precision).

---

## References

- Current impl: `packages/agent-runtime-memory/src/types.ts`
- simsimd crate: https://crates.io/crates/simsimd
- ndarray crate: https://crates.io/crates/ndarray
