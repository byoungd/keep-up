---
description: High-yield LFCC/Core Rust accelerators (parallelizable with Phase 6)
---

# LFCC/Core Rust Accelerators (Parallelizable)

> Scope: `@ku0/core` + `@ku0/lfcc-bridge`
> Parallelism: Can run alongside AD/AE/AF/AG/AH/AJ/AK
> Reference: `docs/roadmap/phase-6-rust-native/README.md`

---

## Prerequisites

Before starting, verify:
- [ ] Rust toolchain installed
- [ ] N-API + WASM targets installed

// turbo
```bash
rustup target add wasm32-unknown-unknown
cargo install wasm-pack
```

---

## Parallel Work Breakdown (Recommended)

Split into independent slices that can ship incrementally. Each slice should have:
- TS fallback + feature flag
- Parity tests vs current TS output
- Basic perf benchmark (token-scale, block-scale, or payload-scale)

### Shared Infra (Cross-cutting)
- Common N-API + WASM binding template (build, load, fallback).
- Parity test harness helpers (fixtures, golden outputs).
- Feature flag wiring and rollout notes.

### Workstream A: Canonicalizer Accelerator
**Slices**
1. Canonicalizer fixtures + golden outputs.
2. Rust core canonicalization.
3. N-API/WASM bindings + TS adapter.
4. Parity + perf tests.

### Workstream B: AI Sanitizer + Dry-Run Parser
**Slices**
1. Policy mapping + allowlist test vectors.
2. Rust sanitizer + HTML parsing core.
3. N-API/WASM bindings + TS adapter.
4. Security regressions + perf tests.

### Workstream C: Anchor Relocation + Text Similarity
**Slices**
1. Similarity algorithms (hash/ngram/Levenshtein).
2. Batch APIs for block scans.
3. N-API/WASM bindings + TS adapter.
4. Parity + perf tests (O(n) vs O(n^2) hot paths).

### Workstream D: Integrity Hashing
**Slices**
1. Rust SHA-256 + batch hashing.
2. N-API/WASM bindings + TS adapter.
3. Parity tests (context/chain hash).

### Workstream E: Bridge Anchor HMAC Encoding
**Slices**
1. Rust HMAC/CRC32 helpers.
2. Encode/decode parity tests.
3. N-API/WASM bindings + TS adapter.

### Workstream F: Streaming Markdown Parser
**Slices**
1. Streaming state machine + AST spec tests.
2. N-API/WASM bindings + TS adapter.
3. Perf tests under token streaming load.

### Workstream G: Stable JSON Serialization
**Slices**
1. Wire `@ku0/json-accel-rs` stableStringify into core policy hash.
2. Golden tests for policy hash stability.

---

## Per-Workstream Workflow Files

Use these for `/implement <task>` execution:

- `.agent/workflows/implement-lfcc-core-shared-infra.md`
- `.agent/workflows/implement-lfcc-core-canonicalizer.md`
- `.agent/workflows/implement-lfcc-core-ai-sanitizer.md`
- `.agent/workflows/implement-lfcc-core-anchor-relocation.md`
- `.agent/workflows/implement-lfcc-core-integrity-hashing.md`
- `.agent/workflows/implement-lfcc-bridge-anchor-hmac.md`
- `.agent/workflows/implement-lfcc-bridge-streaming-markdown.md`
- `.agent/workflows/implement-lfcc-core-stable-json.md`

---

## Workstream A: Canonicalizer Accelerator

**Targets**
- `packages/core/src/kernel/canonicalizer/*`

**Deliverables**
- New crate (suggested: `packages/canonicalizer-rs`) exposing deterministic canonicalization.
- N-API + WASM bindings with parity tests against existing canonicalizer outputs.
 - Feature flag + fallback to TS canonicalizer.

---

## Workstream B: AI Sanitizer + Dry-Run Parser

**Targets**
- `packages/core/src/kernel/ai/sanitizer.ts`
- `packages/core/src/kernel/ai/dryRun.ts`

**Deliverables**
- Rust HTML sanitizer + parser that preserves LFCC allowlist semantics.
- JS adapter with feature flag and fallback to current implementation.
 - Security regression suite for critical/unsafe URL handling.

---

## Workstream C: Anchor Relocation + Text Similarity

**Targets**
- `packages/core/src/kernel/mapping/relocate.ts`
- `packages/core/src/kernel/mapping/fuzzyRelocate.ts`

**Deliverables**
- Rust similarity engine (sliding window hash + n-gram/Levenshtein).
- Batch APIs for block-level scans to reduce O(n^2) hotspots.
 - TS adapter + parity/perf tests.

---

## Workstream D: Integrity Hashing

**Targets**
- `packages/core/src/kernel/integrity/hash.ts`
- `packages/core/src/kernel/integrity/scanner.ts`

**Deliverables**
- Rust SHA-256 + batch hashing for context/chain hashes.
- Deterministic output tests (match existing hash formats).
 - TS adapter + fallback.

---

## Workstream E: Anchor HMAC Encoding (Bridge)

**Targets**
- `packages/lfcc-bridge/src/anchors/loroAnchors.ts`

**Deliverables**
- Rust HMAC-SHA256 for anchor encoding/validation.
- Base64 encode/decode helper with parity tests.
 - TS adapter + fallback.

---

## Workstream F: Streaming Markdown Parser

**Targets**
- `packages/lfcc-bridge/src/streaming/streamingMarkdownParser.ts`

**Deliverables**
- Rust streaming parser to AST with incremental state.
- WASM fallback for browser environments.
 - TS adapter + perf tests.

---

## Workstream G: Stable JSON Serialization

**Targets**
- `packages/core/src/kernel/policy/stableStringify.ts`

**Deliverables**
- Wire to `packages/json-accel-rs` stableStringify (native + JS fallback).
- Golden tests to confirm deterministic policy hash inputs.
 - TS adapter (feature flag optional).
