---
description: Implement LFCC AI sanitizer and dry-run parser accelerator
---

# LFCC AI Sanitizer + Dry-Run Parser Accelerator

> Dependencies: Shared Infra (recommended)
> Estimated Time: 3-4 weeks
> Reference: `docs/roadmap/phase-6-rust-native/README.md`

---

## Scope
- Targets:
  - `packages/core/src/kernel/ai/sanitizer.ts`
  - `packages/core/src/kernel/ai/dryRun.ts`

---

## Steps
1. Extract allowlist policy and build test vectors.
2. Implement sanitizer + HTML parsing core in Rust.
3. Add N-API + WASM bindings and TS adapter.
4. Wire feature flag + fallback to TS sanitizer/parser.
5. Add security regression tests and perf benchmark.

---

## Acceptance
- Allowlist semantics match TS implementation.
- Critical/unsafe URL handling matches existing behavior.
- Parity and security tests pass with fallback available.
