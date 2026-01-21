---
description: Implement LFCC core canonicalizer accelerator
---

# LFCC Core Canonicalizer Accelerator

> Dependencies: Shared Infra (recommended)
> Estimated Time: 3-4 weeks
> Reference: `docs/roadmap/phase-6-rust-native/README.md`

---

## Scope
- Target: `packages/core/src/kernel/canonicalizer/*`
- Rust crate: `packages/canonicalizer-rs` (suggested)

---

## Steps
1. Capture canonicalizer fixtures and golden outputs from TS.
2. Implement deterministic canonicalization in Rust.
3. Add N-API + WASM bindings and TS adapter.
4. Wire feature flag + fallback to TS canonicalizer.
5. Add parity tests and perf benchmark.

---

## Acceptance
- Parity tests pass for all fixtures.
- Deterministic node IDs and mark ordering preserved.
- TS fallback available and verified.
