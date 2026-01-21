---
description: Implement LFCC bridge canonicalizer serialization accelerator
---

# LFCC Bridge Canonicalizer Serialization Accelerator

> Dependencies: Shared Infra (optional)
> Estimated Time: 1-2 weeks
> Reference: `docs/roadmap/phase-6-rust-native/README.md`

---

## Scope
- Target: `packages/lfcc-bridge/src/security/canonicalizer.ts`

---

## Steps
1. Wire deterministic serialization to `@ku0/json-accel-rs` or Rust helper.
2. Add feature flag + fallback to TS serialization.
3. Add golden tests for checksum input stability.

---

## Acceptance
- Canonical JSON output unchanged for fixtures.
- TS fallback available and verified.
