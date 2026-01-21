# Track L2: Persistence Plane Package Extraction

Owner: Runtime Architect + Runtime Developer
Status: Active
Date: 2026-01-21
Timeline: Week 4+

## Objective
Extract persistence-plane modules into `@ku0/agent-runtime-persistence` with zero behavior change,
aligned to Track L architecture and the dependency rules.

## Dependencies
- docs/roadmap/phase-1-foundation/core/track-l-architecture.md
- docs/architecture/agent-runtime-module-decomposition-rfc.md
- `@ku0/agent-runtime-core`
- `@ku0/agent-runtime-telemetry`

## Scope
- Move persistence modules from `packages/agent-runtime/src/`:
  - `checkpoint/`
  - `artifacts/`
- Update imports to use core interfaces and telemetry adapters.
- Ensure persistence modules do not import execution or tools directly.

## Non-Goals
- Moving execution or tools modules (Tracks L1/L3).
- Introducing new event log features.
- Facade re-exports and wiring (Track L4).

## Responsibilities
- Architect: confirm persistence surface and interfaces.
- Dev: package scaffolding, module moves, import updates.
- QA: targeted tests for checkpoint and artifacts.

## Key Deliverables
- `packages/agent-runtime-persistence` scaffolded and built.
- Checkpoint and artifact modules moved with updated imports.
- Updated tests passing.

## Progress Snapshot (2026-01-21)
- `packages/agent-runtime-persistence` exists with checkpoint threads and shadow git helpers.
- Artifacts still live under `packages/agent-runtime/src/artifacts`.
- `@ku0/agent-runtime` still uses the monolith checkpoint manager in kernel wiring.

## Remaining Work
- Move artifacts + checkpoint manager into `agent-runtime-persistence`.
- Update facade exports to use persistence package implementations.

## Tasks
1. Scaffold `packages/agent-runtime-persistence` (package.json, tsconfig, src/index.ts).
2. `git mv` `checkpoint/` and `artifacts/` into the new package.
3. Update imports to use `@ku0/agent-runtime-core` interfaces.
4. Update telemetry/logging imports to `@ku0/agent-runtime-telemetry`.
5. Ensure no direct imports from execution or tools packages.
6. Move or update unit tests under the new package path.
7. Document any facade re-export requirements for Track L4.

## Acceptance Criteria
- `@ku0/agent-runtime-persistence` builds successfully.
- Checkpoint and artifacts behavior unchanged (unit tests pass).
- No circular dependencies reported for the persistence package.

## Required Tests
- `pnpm --filter @ku0/agent-runtime-persistence build`
- Targeted checkpoint and artifact unit tests
- Optional: `pnpm dlx madge packages/agent-runtime-persistence/src --circular --extensions ts,tsx`

## Branch and PR Workflow
- Create branch: `feature/track-l2-persistence`
- Run required tests, commit, open PR with migration notes and moved module list
