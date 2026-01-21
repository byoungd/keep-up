# Track AJ: JSON Content Acceleration

> Priority: P2
> Status: Planning
> Owner: Agent Runtime Team
> Dependencies: None

---

## Overview

Implement a Rust-based JSON serialization/deserialization accelerator using `simd-json` to reduce
overhead in high-volume IPC and tool output processing.

---

## Problem Definition

| Problem | Current Implementation | Impact |
| --- | --- | --- |
| Serialization bottleneck | V8 `JSON.stringify` | High latency in large tool outputs |
| IPC overhead | JSON over stdio | CPU spikes during agent-runtime sync |
| Cache key generation | `JSON.stringify` for keys | Cache miss/latency costs |

---

## Deliverables

### D1: Rust JSON Library
- SIMD-accelerated serialization (`simd-json`).
- Stable key sorting for cache keys.
- Safe parsing for large inputs.

### D2: TypeScript Bindings
- N-API bindings.
- Drop-in replacement helpers for `runtime-utils`.

---

## Cross-Platform Requirements

- Fallback to standard `serde_json` if SIMD extensions unavailable.
- Prebuilt binaries for all targets.

---

## API Surface

```rust
pub fn stringify(value: JsUnknown) -> Result<String>;
pub fn parse(text: String) -> Result<JsUnknown>;
pub fn stable_stringify(value: JsUnknown) -> Result<String>; // For cache keys
```

---

## Implementation Plan

| Week | Deliverable | Tasks |
| --- | --- | --- |
| 1 | Crate setyp | `packages/json-accel-rs`, N-API |
| 1 | Core Logic | Integrate `simd-json` |
| 2 | Cache Optimization | Implement stable sorting for keys |
| 2 | Benchmark | Validate >2x speedup or discard |

---

## Affected Code

| File | Change Type |
| --- | --- |
| `packages/agent-runtime/src/utils/cache.ts` | Use stable stringify |
| `packages/agent-runtime/src/spooling/` | Use fast stringify |
| `packages/json-accel-rs/` | New Rust crate |

---

## Acceptance Criteria

- [ ] Serialization 2x faster than `JSON.stringify` for objects > 100KB.
- [ ] Stable stringify produces deterministic outputs.
- [ ] Parsing safe against denial-of-service (deeply nested).

---

## References

- simd-json: https://crates.io/crates/simd-json
- serde_json: https://crates.io/crates/serde_json
