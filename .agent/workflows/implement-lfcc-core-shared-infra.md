---
description: Shared infra for LFCC/Core Rust accelerators
---

# Shared Infra for LFCC/Core Rust Accelerators

> Dependencies: None
> Estimated Time: 1-2 weeks
> Reference: `docs/roadmap/phase-6-rust-native/README.md`

---

## Scope
- Common N-API + WASM binding template and loader fallback.
- Feature flag conventions for Rust accelerators.
- Parity test helpers and golden fixture format.
- Micro-benchmark harness for hot paths.

---

## Steps
1. Create a minimal binding template (N-API + WASM) with auto-detected fallback.
2. Define a shared feature-flag interface and naming convention.
3. Build parity test helpers to compare TS vs Rust outputs.
4. Add a micro-benchmark harness with example fixtures.

---

## Acceptance
- One shared loader API used by new accelerators.
- Parity helpers reused across workstreams.
- Bench harness runs in Node without browser dependencies.
