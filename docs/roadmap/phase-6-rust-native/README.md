# Phase 6: Rust Native Integration

> Status: Ready
> Owner: Agent Runtime Team
> Dependencies: Phase 1-5 complete, agent-runtime stable
> Timeline: Q1-Q2 2027 (tentative)

---

## Overview

Phase 6 introduces Rust as an accelerator/isolator for the TypeScript runtime. The intent is to
push OS-level isolation and CPU-heavy subsystems into Rust while keeping orchestration and
LLM integrations in TypeScript.

Core principle: TypeScript stays the control plane; Rust is used only when there is a
quantifiable performance or safety benefit.

---

## Platform Scope

All tracks must support macOS, Linux, and Windows with explicit fallbacks:
- macOS: Seatbelt-based sandboxing.
- Linux: Landlock + seccomp + namespaces.
- Windows: AppContainer (fallback to Docker/WSL if AppContainer not available).

---

## Track Index

| Track | Focus | Priority | Status | Document |
| --- | --- | --- | --- | --- |
| AD | Sandbox Sidecar | P0 | Ready | [track-ad-sandbox-sidecar.md](./track-ad-sandbox-sidecar.md) |
| AE | Storage Engine | P1 | Ready (blocked by AD) | [track-ae-storage-engine.md](./track-ae-storage-engine.md) |
| AF | Tokenizer and Compression | P1 | Ready | [track-af-tokenizer-compression.md](./track-af-tokenizer-compression.md) |
| AG | LSP Indexer | P2 | Planning | [track-ag-lsp-indexer.md](./track-ag-lsp-indexer.md) |
| AH | Diff Engine | P1 | Ready | [track-ah-diff-engine.md](./track-ah-diff-engine.md) |
| AI | Vector Similarity | P1 | Ready | [track-ai-vector-similarity.md](./track-ai-vector-similarity.md) |

---

## Implementation Phases

```
Phase 0: Baseline and Profiling
- Measure token counting latency
- Measure checkpoint write P99
- Measure spooler memory peaks

Phase 1: Sandbox Sidecar (Track AD)
- Rust daemon (N-API or UDS)
- Path normalization + symlink escape prevention
- TypeScript adapter layer

Phase 2: Storage Engine (Track AE)
- Rust event log + checkpoint
- Replace msgpack implementation
- mmap + fast replay

Phase 3: Tokenizer and Compression (Track AF)
- Rust tiktoken + Zstd
- Replace countTokens hotspots
- N-API bindings with WASM fallback

Phase 4: LSP Indexer (Track AG)
- Inverted/trigram index
- Optional tool output streaming
```

---

## Readiness Checklist

- [ ] Baseline benchmarks captured for current TS paths.
- [ ] N-API binding strategy agreed (per track).
- [ ] Cross-platform sandbox policy matrix approved.
- [ ] Rollout plan with feature flags defined.

---

## Non-Goals

The following modules are not migrated to Rust:
- Orchestrator, policy, model routing.
- @openai/agents, mem0ai, chokidar integration layers.

---

## Success Metrics

| Metric | Current | Target |
| --- | --- | --- |
| Sandbox startup | ~500ms (Docker) | <10ms |
| Event log P99 | ~15ms | <5ms |
| Token counting | ~10ms/10k tokens | <1ms |
| Symbol query | ~50ms (full scan) | <5ms |

---

## References

- [Rust Accelerator Roadmap](../../architecture/rust-accelerator-roadmap.md)
- [TypeScript vs Rust Analysis](../../architecture/typescript-vs-rust-analysis.md)
- Codex Rust reference: `.tmp/analysis/codex/codex-rs/`
