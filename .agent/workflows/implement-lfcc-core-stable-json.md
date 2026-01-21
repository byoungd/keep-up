---
description: Implement LFCC core stable JSON acceleration
---

# LFCC Core Stable JSON Acceleration

> Dependencies: Shared Infra (optional)
> Estimated Time: 1-2 weeks
> Reference: `docs/roadmap/phase-6-rust-native/README.md`

---

## Scope
- Target: `packages/core/src/kernel/policy/stableStringify.ts`
- Integration: `packages/json-accel-rs`

---

## Steps
1. Wire `@ku0/json-accel-rs` stableStringify into core.
2. Add feature flag + fallback to TS stableStringify.
3. Add golden tests for policy hash stability.

---

## Acceptance
- Deterministic serialization unchanged for all fixtures.
- TS fallback available and verified.
