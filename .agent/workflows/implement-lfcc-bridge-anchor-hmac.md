---
description: Implement LFCC bridge anchor HMAC accelerator
---

# LFCC Bridge Anchor HMAC Accelerator

> Dependencies: Shared Infra (recommended)
> Estimated Time: 2-3 weeks
> Reference: `docs/roadmap/phase-6-rust-native/README.md`

---

## Scope
- Target: `packages/lfcc-bridge/src/anchors/loroAnchors.ts`

---

## Steps
1. Implement HMAC-SHA256 + base64 helpers in Rust.
2. Add N-API + WASM bindings and TS adapter.
3. Wire feature flag + fallback to TS implementation.
4. Add parity tests for encode/decode and integrity checks.

---

## Acceptance
- Encoded anchors round-trip correctly.
- Integrity checks match TS behavior.
- TS fallback available and verified.
