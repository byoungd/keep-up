---
description: Implement LFCC text normalization accelerator
---

# LFCC Text Normalization + Canonical Hash Accelerator

> Dependencies: Shared Infra (optional)
> Estimated Time: 1-2 weeks
> Reference: `docs/roadmap/phase-6-rust-native/README.md`

---

## Scope
- Target: `packages/core/src/text/normalization.ts`

---

## Steps
1. Implement canonicalizeText and computeCanonicalHash in Rust.
2. Add N-API + WASM bindings and TS adapter.
3. Wire feature flag + fallback to TS normalization.
4. Add fixtures for block/doc hash stability.

---

## Acceptance
- Canonical blocks and hashes match TS exactly.
- TS fallback available and verified.
