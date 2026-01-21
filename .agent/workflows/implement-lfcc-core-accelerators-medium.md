---
description: Medium-yield LFCC/Core Rust accelerators (parallelizable with Phase 6)
---

# LFCC/Core Medium-Yield Rust Accelerators (Parallelizable)

> Scope: `@ku0/core` + `@ku0/lfcc-bridge`
> Parallelism: Can run alongside Phase 6 tracks and high-yield accelerators
> Reference: `docs/roadmap/phase-6-rust-native/README.md`

---

## Prerequisites

Before starting, verify:
- [ ] Rust toolchain installed
- [ ] N-API + WASM targets installed

// turbo
```bash
rustup target add wasm32-unknown-unknown
cargo install wasm-pack
```

---

## Parallel Work Breakdown (Recommended)

Each slice should ship with:
- TS fallback + feature flag (or runtime toggle)
- Parity tests vs current TS output
- Micro benchmark where relevant

### Shared Infra (Cross-cutting)
- Common binding template + loader fallback.
- Golden fixture helpers for deterministic outputs.

### Workstream M1: Core Anchor Codec + Checksums
**Slices**
1. Codec fixtures + golden outputs (HMAC/CRC32/Adler32).
2. Rust codec core.
3. N-API/WASM bindings + TS adapter.
4. Parity tests + negative cases.

### Workstream M2: Policy Hash Utilities
**Slices**
1. Rust hash core + hex formatting.
2. N-API/WASM bindings + TS adapter.
3. Golden tests for manifest hash stability.

### Workstream M3: AI Context Hash Utilities
**Slices**
1. Rust hash core (async + batch API).
2. N-API/WASM bindings + TS adapter.
3. Parity tests for optimistic hash + verify flow.

### Workstream M4: Text Normalization + Canonical Hash
**Slices**
1. Rust normalize + hash core.
2. N-API/WASM bindings + TS adapter.
3. Fixture tests for stable block/doc hashes.

### Workstream M5: Bridge Canonicalizer Serialization
**Slices**
1. Wire to `@ku0/json-accel-rs` stableStringify (or Rust helper).
2. Golden tests for checksum inputs.

---

## Per-Workstream Workflow Files

Use these for `/implement <task>` execution:

- `.agent/workflows/implement-lfcc-core-anchor-codec.md`
- `.agent/workflows/implement-lfcc-core-policy-hash.md`
- `.agent/workflows/implement-lfcc-core-ai-context-hash.md`
- `.agent/workflows/implement-lfcc-core-text-normalization.md`
- `.agent/workflows/implement-lfcc-bridge-canonicalizer-serialization.md`

---

## Workstream M1: Core Anchor Codec + Checksums

**Targets**
- `packages/core/src/anchors/codec.ts`

**Deliverables**
- Rust codec for HMAC/CRC32/Adler32 with deterministic output.
- N-API + WASM bindings and parity tests for encode/decode.
- Feature flag to fall back to current TS implementation.

---

## Workstream M2: Policy Hash Utilities

**Targets**
- `packages/core/src/kernel/policy/hash.ts`

**Deliverables**
- Rust SHA-256 hashing with deterministic hex output.
- TS adapter that preserves current manifest hash format.
- Golden tests to verify policy hash stability.
 - Feature flag + fallback.

---

## Workstream M3: AI Context Hash Utilities

**Targets**
- `packages/core/src/kernel/ai/context.ts`

**Deliverables**
- Rust SHA-256 for optimistic hash computation.
- Optional batch API for multiple spans/contexts.
- Parity tests against current JS output.
 - Feature flag + fallback.

---

## Workstream M4: Text Normalization + Canonical Hash (Ingest)

**Targets**
- `packages/core/src/text/normalization.ts`

**Deliverables**
- Rust canonicalizeText + computeCanonicalHash implementation.
- WASM fallback for browser contexts.
- Fixture tests to ensure stable hashes.
 - Feature flag + fallback.

---

## Workstream M5: Bridge Checksum Canonicalizer Serialization

**Targets**
- `packages/lfcc-bridge/src/security/canonicalizer.ts`

**Deliverables**
- Deterministic serialization (reuse `@ku0/json-accel-rs` or new Rust helper).
- Parity tests for canonical output and checksum inputs.
 - Feature flag + fallback.
