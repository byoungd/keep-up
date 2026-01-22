---
description: Implement LFCC v0.9.4 AI Targeting Resilience using Rust (hashing, relocation, layered preconditions, auto-trim, delta reads).
---

# Workflow: Implement LFCC v0.9.4 AI Targeting Resilience (Rust)

## Inputs (local changes)

- `docs/specs/lfcc/proposals/LFCC_v0.9.4_AI_Targeting_Resilience.md`
- `docs/specs/lfcc/engineering/24_AI_Targeting_Extension.md`
- `docs/specs/lfcc/engineering/02_Policy_Manifest_Schema.md`
- `docs/specs/lfcc/engineering/06_AI_Envelope_Specification.md`
- `packages/conformance-kit/src/targeting/vectors.ts`

## Phase 1: Package scaffolding

1. Create `packages/ai-targeting-rs` if it does not exist.
2. Copy templates from `packages/native-bindings/templates/` into the new package.
3. Set `package.json` name to `@ku0/ai-targeting-rs`.
4. Add Rust dependencies: `sha2`, `napi`, `napi-derive`.

## Phase 2: Rust core algorithms

1. Hashing
   - Normalize CRLF to LF and strip control characters.
   - Implement `compute_window_hash`, `compute_neighbor_hash`, `compute_structure_hash`.
2. Candidate generation and ranking
   - Deterministic candidate ordering by `span_id`.
   - Match vector evaluation and lexicographic ranking.
3. Auto-retarget decision
   - Enforce hard signal matches and `min_soft_matches_for_retarget`.
   - Reject tied top candidates.
4. Layered preconditions
   - Process `strong` before `weak`.
   - Apply `on_mismatch` strategies and record `weak_recoveries`.
5. Auto-trim
   - Compute trimmed ranges from anchors (UTF-16 code units).
   - Enforce `min_preserved_ratio` and non-empty results.
6. Delta read helpers (optional Rust acceleration)
   - Compute `affected_spans` and neighbor expansion sets.
7. Diagnostics helpers
   - Map `AT-1000` subcodes and cap diagnostic size.
   - Emit hashes only (no raw text).

## Phase 3: N-API bindings and TypeScript wrapper

1. Expose Rust functions via `napi` with stable signatures.
2. Add TypeScript adapters in `packages/ai-targeting-rs/src/index.ts`.

## Phase 4: Gateway integration

1. Update policy negotiation to include `AiTargetingPolicyV1`.
2. Parse `targeting` and `layered_preconditions` in the LFCC gateway.
3. Add range-aware ops support for trimming.
4. Map diagnostics to AI envelope error codes and `AI_RATE_LIMIT`.

## Phase 5: Conformance and tests

1. Use `packages/conformance-kit/src/targeting/vectors.ts` for canonical strings and ranking.
2. Add Rust unit tests for hash canonicalization.
3. Update conformance tests to call Rust bindings.

## Phase 6: Build and verify

```bash
pnpm --filter @ku0/ai-targeting-rs build
pnpm --filter @ku0/conformance-kit test
pnpm biome check --write
```
