# Phase 9: Convergence and Productionization

> Date: 2026-01-24
> Status: Proposed
> Owner: Agent Runtime Team
> Dependencies: Phase 4 Cognition, Phase 6 Rust Native, Phase 7 Desktop Sovereignty, Phase 8 Rust-First Capabilities, UI Cowork tracks
> Sources: docs/roadmap/*, docs/roadmap/progress/progress-2026-01-23.md

---

## Overview

Phase 9 consolidates and productizes the roadmap work that remains incomplete or only partially
implemented across phases 4-8. The focus is execution convergence: finish cognition, close the
Rust native readiness gaps, deliver Rust-first agent capabilities, and unify policy/ops and UI
surfaces with the runtime.

This phase is explicitly parallelized to avoid blocking cross-team delivery. Each track has
clear dependencies and excludes work already delivered in Phase 7 and Phase 8.

---

## De-duplication Guardrails

Do not re-plan or re-implement items explicitly marked as delivered in Phase 7 and the Phase 6
accelerator list. Phase 9 tracks must be scoped to:

- Completion, hardening, or integration work not yet shipped.
- Convergence between TypeScript and Rust planes.
- Gaps noted in readiness checklists or progress updates.

---

## Already Delivered (Excluded From Phase 9)

These items are explicitly excluded from Phase 9 scope and should not be re-planned:

- Phase 7 (Completed): Tauri migration (AL), native security enclave (AM), direct UI streams (AN),
  local vector store (AO).
- Phase 6 Accelerators delivered (from progress-2026-01-23): canonicalizer, sanitizer, relocation,
  policy hash, context hash, anchor codec, streaming markdown, JSON acceleration.
- Phase 8 partials already implemented (do not re-scope; only harden/integrate):
  - Track AP prototype (workforce orchestrator) is already in progress.

---

## Track Index (Parallelizable)

| Track | Focus | Priority | Dependencies | Document |
| --- | --- | --- | --- | --- |
| AV | Cognition Delivery (Phase 4 X/Y/Z completion) | P0 | Phase 3 graph runtime, Track AW | track-av-cognition-delivery.md |
| AW | Rust Native Completion and Readiness | P0 | Phase 6 baseline | track-aw-rust-native-completion.md |
| AX | Rust-First Capabilities Delivery (Phase 8 AP-AU) | P0 | Track AW, Phase 7 | track-ax-rust-first-capabilities.md |
| AY | Policy and Ops Parity (TS <-> Rust) | P1 | Phase 5 AC, Track AX | track-ay-policy-ops-parity.md |
| AZ | Cowork UI Convergence and Runtime Integration | P1 | UI Cowork tracks, Phase 7 | track-az-cowork-ui-convergence.md |

---

## Parallelization Strategy

- AV (Cognition) runs in parallel with AW (Rust Native) if AW delivers vector similarity and
  LSP indexer early for memory and perception components.
- AX depends on AW and Phase 7 completion but can run in parallel with AY and AZ once shared
  Rust interfaces are frozen.
- AY starts after AX exposes tool/MCP gateway contracts.
- AZ can proceed in parallel using mocked adapters until Rust services stabilize.

---

## Shared Interfaces (Phase 9 Week 1)

Before parallel execution, freeze the following interfaces and publish in agent-runtime-core:

- Tool execution contract (inputs, outputs, audit envelope).
- Model routing contract (provider config, redaction policy).
- Workspace session contract (terminal/browser/file session events).
- Policy decision schema (allow/deny/ask_user with reason codes).

---

## Definition of Done (All Tracks)

- Track-specific acceptance criteria met and documented.
- Targeted unit/integration tests executed per track docs.
- No regressions in runtime orchestration, policy enforcement, or audit logs.
- Roadmap progress updated with evidence (tests, benchmarks, or PRs).

---

## References

- Phase 4: docs/roadmap/phase-4-cognition/README.md
- Phase 6: docs/roadmap/phase-6-rust-native/README.md
- Phase 7: docs/roadmap/phase-7-desktop-sovereignty/README.md
- Phase 8: docs/roadmap/phase-8-rust-agent-capabilities/README.md
- UI Cowork: docs/roadmap/ui-cowork/README.md
- Progress: docs/roadmap/progress/progress-2026-01-23.md

