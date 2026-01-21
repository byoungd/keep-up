---
description: Implement LFCC anchor relocation accelerator
---

# LFCC Anchor Relocation + Similarity Accelerator

> Dependencies: Shared Infra (recommended)
> Estimated Time: 3-5 weeks
> Reference: `docs/roadmap/phase-6-rust-native/README.md`

---

## Scope
- Targets:
  - `packages/core/src/kernel/mapping/relocate.ts`
  - `packages/core/src/kernel/mapping/fuzzyRelocate.ts`

---

## Steps
1. Implement similarity algorithms (hash, n-gram, Levenshtein) in Rust.
2. Add batch APIs for block scans to reduce O(n^2) hot paths.
3. Add N-API + WASM bindings and TS adapter.
4. Wire feature flag + fallback to TS relocation.
5. Add parity tests and perf benchmarks on large blocks.

---

## Acceptance
- Relocation confidence and methods match TS behavior.
- Batch API reduces scan latency in benchmarks.
- TS fallback available and verified.
