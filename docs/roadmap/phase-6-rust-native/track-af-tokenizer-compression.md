# Track AF: Tokenizer & Compression

> **Priority**: 🟡 P1
> **Status**: Planning
> **Owner**: Agent Runtime Team
> **Dependencies**: None (can parallel with AD/AE)

---

## Overview

Move token counting, JSON size estimation, and context compression out of JavaScript hot paths into Rust for significant CPU reduction.

### Problem Definition

| Problem | Current Implementation | Impact |
|---------|----------------------|--------|
| Slow token counting | JS string operations | ~10ms per 10K tokens |
| High CPU for compression | JS-based truncation | Context build latency |
| Memory overhead | V8 string copying | GC pressure |

---

## Deliverables

### D1: Rust Tokenizer
- tiktoken-rs for accurate token counting
- Batch tokenization support
- JSON size estimation

### D2: Context Compressor
- Structured truncation (preserve tool calls)
- Zstd compression
- Token-aware chunking

### D3: TypeScript Bindings
- N-API for synchronous calls
- WASM fallback for browser

---

## Technical Design

```
┌────────────────────────────────────────────────────────┐
│  TypeScript Layer                                      │
│  - Compression strategy decisions                      │
│  - Message selection policy                            │
└──────────────────────┬─────────────────────────────────┘
                       │ N-API (sync)
                       ▼
┌────────────────────────────────────────────────────────┐
│  Rust Tokenizer/Compressor                             │
│  ┌─────────────┬─────────────┬─────────────┐          │
│  │ tiktoken-rs │ Zstd        │ Truncator   │          │
│  └─────────────┴─────────────┴─────────────┘          │
│  - SIMD-optimized counting                             │
│  - Zero-copy where possible                            │
│  - Arena allocation                                    │
└────────────────────────────────────────────────────────┘
```

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
|------|-------------|-------|
| 1 | Tokenizer scaffold | tiktoken-rs integration, N-API setup |
| 2 | Batch tokenization | Optimize for multiple strings |
| 3 | Compressor impl | Structured truncation logic |
| 4 | TS integration | Replace `countTokens` calls |

---

## Affected Code

| File | Change Type |
|------|-------------|
| `packages/agent-runtime/src/context/ContextCompactor.ts` | Call Rust compressor |
| `packages/agent-runtime/src/orchestrator/messageCompression.ts` | Call Rust tokenizer |
| `packages/agent-runtime-tools/src/utils/tokenCounter.ts` | Replace with Rust |
| `packages/tokenizer-rs/` | New Rust crate |

---

## Acceptance Criteria

- [ ] Token counting < 1ms per 10K tokens
- [ ] Context compression 5x faster
- [ ] Accurate token counts (match tiktoken)
- [ ] Memory usage reduced by 30%

---

## Risks

| Risk | Mitigation |
|------|------------|
| tiktoken model updates | Pin version, periodic sync |
| N-API thread safety | Use tokio for async ops |
| WASM bundle size | Tree-shake unused encodings |

---

## References

- Current impl: `packages/agent-runtime/src/context/ContextCompactor.ts`
- Message compression: `packages/agent-runtime/src/orchestrator/messageCompression.ts`
- tiktoken-rs: https://github.com/zurawiki/tiktoken-rs
