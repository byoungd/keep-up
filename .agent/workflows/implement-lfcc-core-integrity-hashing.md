---
description: Implement LFCC integrity hashing accelerator
---

# LFCC Integrity Hashing Accelerator

> Dependencies: Shared Infra (recommended)
> Estimated Time: 2-3 weeks
> Reference: `docs/roadmap/phase-6-rust-native/README.md`

---

## Scope
- Targets:
  - `packages/core/src/kernel/integrity/hash.ts`
  - `packages/core/src/kernel/integrity/scanner.ts`

---

## Steps
1. Implement SHA-256 + batch hashing in Rust.
2. Add N-API + WASM bindings and TS adapter.
3. Wire feature flag + fallback to TS hashing.
4. Add parity tests for context and chain hashes.

---

## Acceptance
- Hash outputs are byte-for-byte identical to TS.
- Batch hashing improves scan performance.
- TS fallback available and verified.
