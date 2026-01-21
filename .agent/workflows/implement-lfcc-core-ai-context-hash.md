---
description: Implement LFCC AI context hash accelerator
---

# LFCC AI Context Hash Accelerator

> Dependencies: Shared Infra (optional)
> Estimated Time: 1-2 weeks
> Reference: `docs/roadmap/phase-6-rust-native/README.md`

---

## Scope
- Target: `packages/core/src/kernel/ai/context.ts`

---

## Steps
1. Implement SHA-256 hashing with text normalization in Rust.
2. Add optional batch API for multiple inputs.
3. Add N-API + WASM bindings and TS adapter.
4. Wire feature flag + fallback to TS hash.
5. Add parity tests for compute/verify.

---

## Acceptance
- Hash outputs match TS normalization rules.
- Verify flow matches TS behavior.
- TS fallback available and verified.
