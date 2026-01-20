# Q4 Parallel Development Interface Freeze

Date: 2026-07-10
Owner: Tech Lead
Status: Completed
Dependencies: Q4 tracks AA/AB/AC

---

## Purpose

Enable parallel development by freezing shared contracts and clarifying
ownership. This document defines what each track can change without blocking
others, and the process for any breaking updates.

---

## Frozen Interfaces (Authoritative)

### Runtime Core Types

- `packages/agent-runtime-core/src/index.ts`
  - `ExecutionLease`
  - `WorkerStatus`
  - `ExecutionConfig`
  - `VisionConfig`
  - `ArtifactType` adds `LayoutGraph`, `VisualDiffReport`
  - `MCPTool.annotations.policyAction`

### Artifact Schemas

- `packages/agent-runtime/src/artifacts/`
  - `LayoutGraph@1`
  - `VisualDiffReport@1`

### Policy Engine

- `packages/agent-runtime/src/cowork/policy.ts`
  - Cowork policy DSL (version 1.0)
  - Rule evaluation order and glob semantics

### Gym Categories and CI

- `packages/agent-gym/src/types.ts`
  - Add categories: `execution-scale`, `visual-layout`, `visual-diff`, `policy-safety`
- `packages/agent-gym/src/cli/run.ts`
  - Add Q4 categories to `ALL_CATEGORIES`
- `packages/agent-gym/package.json`
  - Add `gym:q4:ci` script per `docs/roadmap/next-q4/benchmarks.md`

---

## Ownership

| Interface | Owner | Track |
| --- | --- | --- |
| ExecutionConfig, ExecutionLease, WorkerStatus | Runtime Architect | Track AA |
| VisionConfig, LayoutGraph, VisualDiffReport | Applied ML Engineer | Track AB |
| policyAction + policy DSL | Security Engineer | Track AC |
| Gym categories + CI gate | QA Engineer | Cross-track |

---

## Allowed Changes

- Adding new fields is allowed only if they are optional and defaulted.
- Removing or renaming fields is not allowed in Q4.
- Changing default values requires approval from all track owners.
- Artifact schema version changes require a new version (e.g., `LayoutGraph@2`).

---

## Change Control

For any breaking or cross-track change:
1. Open a short RFC in `docs/roadmap/next-q4/` with the proposed change.
2. Record approval from all three track owners.
3. Update this document and the affected track doc.

---

## Readiness Gate

Parallel execution begins when:
- All frozen interfaces are implemented as specified.
- Q4 Gym categories are wired in CLI and baselines exist.
- Cowork policy engine accepts `policyAction` from tool definitions.

---

## Out of Scope

- Runtime refactors not related to Q4 interfaces.
- Major changes to AI Envelope (LFCC) contracts.
