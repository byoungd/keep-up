---
description: Implement LFCC core anchor codec accelerator
---

# LFCC Core Anchor Codec Accelerator

> Dependencies: Shared Infra (recommended)
> Estimated Time: 2-3 weeks
> Reference: `docs/roadmap/phase-6-rust-native/README.md`

---

## Scope
- Target: `packages/core/src/anchors/codec.ts`

---

## Steps
1. Implement HMAC, CRC32, and Adler32 helpers in Rust.
2. Add N-API + WASM bindings and TS adapter.
3. Wire feature flag + fallback to TS codec.
4. Add parity tests for all codec versions.

---

## Acceptance
- Encoded anchors match TS for all versions.
- Decode validates checksums identically to TS.
- TS fallback available and verified.
