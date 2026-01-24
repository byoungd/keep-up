# Phase 6 Native Binding Strategy

Date: 2026-01-24
Owner: Agent Runtime Team
Status: Active

## Goals
- Standardize low-latency Rust integrations via N-API for Phase 6 tracks.
- Preserve the TypeScript control plane while allowing Rust acceleration.
- Provide explicit environment overrides and safe fallbacks.

## Binding Resolution Order
1) Explicit env override (per-crate `*_NATIVE_PATH`).
2) Packaged prebuilds in `dist/` (CI artifacts).
3) Local build artifacts (`target/release`, `target/debug`).
4) JS/WASM fallback when available.

## Conventions
- Prefer N-API for P0/P1 tracks; sidecar/UDS reserved for isolation-only paths.
- Support `*_DISABLE_NATIVE=1` where a JS fallback exists.
- Fail fast when a native binding is required (e.g., sandbox rust mode).

## Phase 6 Env Overrides

| Track | Package | Disable Flag | Native Path Override | Notes |
| --- | --- | --- | --- | --- |
| AD | `sandbox-rs` | N/A | `SANDBOX_RS_BINDING_PATH` | Required for rust sandbox mode. |
| AE | `storage-engine-rs` | N/A | `KU0_STORAGE_ENGINE_RS_NATIVE_PATH` | Rust binding required for native storage. |
| AF | `tokenizer-rs` | `TOKENIZER_RS_DISABLE_NATIVE=1` | `TOKENIZER_RS_NATIVE_PATH` | JS fallback available. |
| AG | `symbol-index-rs` | `KU0_SYMBOL_INDEX_DISABLE_NATIVE=1` | `KU0_SYMBOL_INDEX_NATIVE_PATH` | JS fallback index available. |
| AH | `diff-rs` | `KU0_DIFF_RS_DISABLE_NATIVE=1` | `KU0_DIFF_RS_NATIVE_PATH` | JS fallback via `diff` package. |
| AI | `vector-similarity-rs` | `KU0_VECTOR_SIMILARITY_DISABLE_NATIVE=1` | `KU0_VECTOR_SIMILARITY_NATIVE_PATH` | JS fallback available. |
| AJ | `json-accel-rs` | N/A | `JSON_ACCEL_RS_NATIVE_PATH` | JS fallback available. |
| AK | `gitignore-rs` | N/A | N/A | Native support is optional; JS traversal fallback used when unavailable. |

## Packaging Targets
- macOS: x64, arm64
- Linux: x64, arm64
- Windows: x64

Prebuilds should expose `*_rs.node` or `index.node` in `dist/` and package root.

## Rollback
- Disable individual crates via `*_DISABLE_NATIVE=1` where supported.
- Switch sandbox execution via `COWORK_SANDBOX_MODE=process|docker`.

## References
- `docs/architecture/rust-accelerator-roadmap.md`
