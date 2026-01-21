# Phase 6: Rust Native Integration

> **Status**: Planning
> **Owner**: Agent Runtime Team
> **Dependencies**: Phase 1-5 complete, agent-runtime stable

---

## Overview

Phase 6 introduces Rust as an "accelerator/isolator" for the TypeScript runtime, focusing on:
- High-risk system boundaries (sandbox/process isolation)
- High-throughput CPU-intensive subsystems (compression/indexing)
- System-level capabilities (OS-native isolation)

**Core Principle**: TypeScript continues to handle control/orchestration layers; Rust is only used for subsystems with quantifiable benefits.

---

## Track Index

| Track | Focus | Priority | Status | Document |
|-------|-------|----------|--------|----------|
| **AD** | Sandbox Sidecar | 🔴 P0 | Planning | [track-ad-sandbox-sidecar.md](./track-ad-sandbox-sidecar.md) |
| **AE** | Storage Engine | 🟡 P1 | Planning | [track-ae-storage-engine.md](./track-ae-storage-engine.md) |
| **AF** | Tokenizer & Compression | 🟡 P1 | Planning | [track-af-tokenizer-compression.md](./track-af-tokenizer-compression.md) |
| **AG** | LSP Indexer | 🟢 P2 | Planning | [track-ag-lsp-indexer.md](./track-ag-lsp-indexer.md) |

---

## Implementation Phases

```
Phase 0: Baseline & Profiling
├── Measure token counting latency
├── Measure checkpoint write P99
└── Measure spooler memory peaks

Phase 1: Sandbox Sidecar (Track AD)
├── Rust daemon (Unix socket/gRPC)
├── Path normalization + symlink escape prevention
└── TypeScript adapter layer

Phase 2: Storage Engine (Track AE)
├── Rust event log + checkpoint
├── Replace msgpack implementation
└── mmap + fast replay

Phase 3: Tokenizer/Compression (Track AF)
├── Rust tiktoken + Zstd
├── Replace countTokens hotspots
└── N-API bindings

Phase 4: LSP Indexer (Track AG)
├── Inverted/trigram index
└── Streaming output processing
```

---

## Non-Goals

The following modules will **NOT** be migrated to Rust:
- Orchestrator/Policy/Model routing (tightly coupled with TS ecosystem)
- @openai/agents, mem0ai, chokidar integration layers

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Sandbox startup | ~500ms (Docker) | <10ms (OS native) |
| Event log P99 | ~15ms | <5ms |
| Token counting | ~10ms/10K tokens | <1ms |
| Symbol query | ~50ms (full scan) | <5ms (indexed) |

---

## References

- [Rust Accelerator Roadmap](../../architecture/rust-accelerator-roadmap.md)
- [TypeScript vs Rust Analysis](../../architecture/typescript-vs-rust-analysis.md)
- Codex Rust reference: `.tmp/analysis/codex/codex-rs/`
