---
description: Implement LFCC core policy hash accelerator
---

# LFCC Core Policy Hash Accelerator

> Dependencies: Shared Infra (optional)
> Estimated Time: 1-2 weeks
> Reference: `docs/roadmap/phase-6-rust-native/README.md`

---

## Scope
- Target: `packages/core/src/kernel/policy/hash.ts`

---

## Steps
1. Implement SHA-256 hashing in Rust with deterministic hex output.
2. Add N-API + WASM bindings and TS adapter.
3. Wire feature flag + fallback to TS hash.
4. Add golden tests for manifest hash stability.

---

## Acceptance
- Hash format and output match TS exactly.
- TS fallback available and verified.
