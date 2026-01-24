# Track AF: Tokenizer and Compression

> Priority: P1
> Status: Ready
> Owner: Agent Runtime Team
> Dependencies: None (can run in parallel with AD/AE)

---

## Overview

Move token counting, JSON size estimation, and context compression out of JavaScript hot paths
into Rust to reduce CPU and GC overhead.

---

## Problem Definition

| Problem | Current Implementation | Impact |
| --- | --- | --- |
| Slow token counting | JS string operations | ~10ms per 10k tokens |
| High CPU for compression | JS truncation | Context build latency |
| Memory overhead | V8 string copies | GC pressure |

---

## Deliverables

### D1: Rust Tokenizer
- `tiktoken-rs` for accurate token counting.
- Batch tokenization support.
- JSON size estimation.

### D2: Context Compressor
- Structured truncation (preserve tool calls).
- Zstd compression for large payloads.
- Token-aware chunking.

### D3: TypeScript Bindings
- N-API for Node runtime.
- WASM fallback for browser contexts.

---

## Cross-Platform Requirements

- Provide prebuilt binaries for macOS/Linux/Windows.
- WASM fallback when native bindings unavailable.
- Support env override `TOKENIZER_RS_DISABLE_NATIVE=1` to force JS fallback when needed.

---

## API Surface

```rust
pub fn count_tokens(text: &str, model: &str) -> u32;
pub fn count_tokens_batch(texts: &[&str], model: &str) -> Vec<u32>;
pub fn estimate_json_tokens(value: &serde_json::Value) -> u32;
pub fn compress_context(
    messages: &[Message],
    max_tokens: u32,
    preserve_last_n: usize,
) -> CompressedContext;
```

---

## Implementation Plan

| Week | Deliverable | Tasks |
| --- | --- | --- |
| 1 | Tokenizer scaffold | tiktoken-rs integration, N-API setup |
| 2 | Batch tokenization | Optimize for multiple strings |
| 3 | Compressor impl | Structured truncation logic |
| 4 | TS integration | Replace countTokens calls |

---

## Affected Code

| File | Change Type |
| --- | --- |
| `packages/agent-runtime/src/context/ContextCompactor.ts` | Call Rust compressor |
| `packages/agent-runtime/src/orchestrator/messageCompression.ts` | Call Rust tokenizer |
| `packages/agent-runtime/src/utils/tokenCounter.ts` | Replace with Rust |
| `packages/tokenizer-rs/` | New Rust crate |

---

## Acceptance Criteria

- [ ] Token counting < 1ms per 10k tokens.
- [ ] Context compression 5x faster.
- [ ] Accurate token counts (match tiktoken).
- [ ] Memory usage reduced by 30%.

---

## Risks

| Risk | Mitigation |
| --- | --- |
| tiktoken model updates | Pin version and sync quarterly |
| N-API thread safety | Use synchronous APIs or dedicated worker |
| WASM bundle size | Tree-shake unused encodings |

---

## References

- Current impl: `packages/agent-runtime/src/context/ContextCompactor.ts`
- Message compression: `packages/agent-runtime/src/orchestrator/messageCompression.ts`
- tiktoken-rs: https://github.com/zurawiki/tiktoken-rs
