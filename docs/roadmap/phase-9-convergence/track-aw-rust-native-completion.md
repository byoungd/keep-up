# Track AW: Rust Native Completion and Readiness

> Priority: P0
> Status: Completed (PR #259)
> Owner: Agent Runtime Team
> Dependencies: Phase 6 Rust Native baseline
> Source: docs/roadmap/phase-6-rust-native/README.md

---

## Objective

Close remaining Phase 6 gaps and complete readiness checklist items that block
Rust-native execution and performance goals.

---

## Completed (Reference Only)

These are already delivered and should not be re-implemented:
- canonicalizer-rs
- ai-sanitizer-rs
- anchor-relocation-rs
- policy-hash-rs
- ai-context-hash-rs
- anchor-codec-rs
- streaming-markdown-rs
- json-accel-rs

---

## Implementation Status (Verified 2026-01-24)

| Track | Status | Evidence | Notes |
| --- | --- | --- | --- |
| AD | Implemented (Cowork runtime) | `packages/sandbox-rs`, `apps/cowork/server/runtime/coworkTaskRuntime.ts` | OS parity + policy matrix still needed. |
| AE | Implemented | `packages/storage-engine-rs`, `packages/agent-runtime-persistence/src/checkpoint/rustCheckpointStorage.ts` | P99 targets not met yet (see baseline). |
| AF | Partially implemented | `packages/tokenizer-rs`, `packages/agent-runtime-execution/src/orchestrator/messageCompression.ts` | `compressPayloadZstd` not wired; perf targets unmet. |
| AG | Implemented | `packages/symbol-index-rs`, `packages/agent-runtime-execution/src/lsp/lspService.ts` | P99 target unmet. |
| AH | Implemented | `packages/diff-rs`, `packages/agent-runtime-tools/src/tools/code/editor.ts` | P99 target unmet. |
| AI | Implemented | `packages/vector-similarity-rs`, `packages/context-index/src/contextIndex.ts` | Perf tuning pending. |
| AJ | Implemented | `packages/json-accel-rs`, `packages/agent-runtime-execution/src/utils/json.ts` | Verify parity + coverage. |
| AK | Implemented | `packages/gitignore-rs`, `packages/context-index/src/scanner.ts` | Consider broader adoption beyond context index. |

## Scope (Remaining)

- Close performance gaps to Phase 6 targets (AE/AF/AG/AH/AI).
- Wire Zstd payload compression + thresholds (`compressPayloadZstd`) in hot paths.
- Finalize cross-platform sandbox policy matrix + approvals.
- Document N-API packaging strategy for all rust crates (macOS/Linux/Windows).
- Rollout plan and feature flags for progressive enablement.

---

## Readiness Checklist (Phase 6)

- Baseline benchmarks captured for TS paths.
- N-API binding strategy agreed.
- Cross-platform sandbox policy matrix approved.
- Rollout plan with feature flags defined.

---

## Implementation Spec (Executable)

1) Baseline and profiling
- Capture current TS benchmarks for token counting, checkpoints, and diff operations.
- Publish baseline report in docs/roadmap/phase-6-rust-native/progress/.

2) Sidecar and storage
- Implement sandbox sidecar (Track AD) with path normalization and escape prevention.
- Implement storage engine (Track AE) with event log + checkpoint replay.

3) Hot-path acceleration
- Tokenizer and compression (Track AF) with zstd and tiktoken.
- Diff engine (Track AH) with deterministic patch output.
- Vector similarity (Track AI) for semantic memory and retrieval.

4) Indexing and tooling
- LSP indexer (Track AG) and gitignore matcher (Track AK).
- Validate JSON acceleration integration (Track AJ) and close remaining gaps.

---

## Deliverables

- Rust sidecar and engine crates built and integrated into runtime.
- Benchmarks and KPI targets recorded.
- Feature flags and fallback paths validated on macOS/Linux/Windows.

---

## Acceptance Criteria

- Sandbox startup and token counting meet Phase 6 targets.
- Event log and checkpoint replay P99 meet Phase 6 targets.
- LSP indexer queries meet target latency.

---

## Validation

- Use track-level validation commands from Phase 6 docs.
- Run baseline benchmark suite before and after integration.


## Single-Doc Execution Checklist

1) Create feature branch
- git fetch origin
- git checkout main
- git pull --ff-only
- git checkout -b feat/track-<id>-<short-name>

2) Initialize required artifacts
- task.md: add checklist items from this track
- implementation_plan.md: summarize steps and dependencies
- walkthrough.md: add validation steps and test commands

3) Implement the scope
- Follow the Implementation Spec in this document only
- Keep changes minimal and within scope

4) Validate
- Run the commands listed under Validation in this document
- Run: pnpm biome check --write

5) Commit and PR
- git add -A
- git commit -m "feat: <track-id> <summary>"
- git push -u origin feat/track-<id>-<short-name>
- Open PR with the template below

### PR Template
- What changed and why
- Tests: <command(s)> or "Not run (docs-only)"
- Risks/known issues
- Spec sections satisfied (list exact headings)
