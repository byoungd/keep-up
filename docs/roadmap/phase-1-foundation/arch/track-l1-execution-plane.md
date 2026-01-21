# Track L1: Execution Plane Package Extraction

Owner: Runtime Architect + Runtime Developer
Status: Ready
Date: 2026-01-19
Timeline: Week 4+

## Objective
Extract execution-plane modules into `@ku0/agent-runtime-execution` with zero behavior change,
aligned to the Track L architecture and dependency rules.

## Dependencies
- docs/roadmap/phase-1-foundation/core/track-l-architecture.md
- docs/architecture/agent-runtime-module-decomposition-rfc.md
- `@ku0/agent-runtime-core`
- `@ku0/agent-runtime-control`
- `@ku0/agent-runtime-telemetry`

## Scope
- Move execution modules from `packages/agent-runtime/src/` to the new package:
  - `orchestrator/`, `executor/`, `context/`, `routing/`, `sop/`, `tasks/`
  - `reasoning/`, `knowledge/`, `prompts/`, `pipeline/`, `preflight/`
  - `workflows/`, `streaming/`, `swarm/`
- Update imports to depend on core interfaces and telemetry adapters.
- Preserve unit tests and test coverage.
- Ensure no direct imports from tools or persistence packages.

## Non-Goals
- Moving persistence or tools modules (Tracks L2/L3).
- Changing runtime behavior, policies, or external contracts.
- Facade re-exports and wiring (Track L4).

## Responsibilities
- Architect: confirm boundaries and public export surface.
- Dev: package scaffolding, module moves, import updates.
- QA: targeted tests and orchestrator smoke checks.

## Key Deliverables
- `packages/agent-runtime-execution` scaffolded and built.
- Execution modules moved with updated imports.
- Updated tests in the new package (or relocated paths).
- No circular dependencies in the execution package.

## Progress Snapshot (2026-01-21)
- Execution plane modules still live under `packages/agent-runtime/src/*`.
- `packages/agent-runtime-execution` does not exist yet.

## Tasks
1. Scaffold `packages/agent-runtime-execution` (package.json, tsconfig, src/index.ts).
2. `git mv` execution modules listed in Scope into the new package.
3. Replace monolith imports with `@ku0/agent-runtime-core` and `@ku0/agent-runtime-control` interfaces.
4. Update telemetry/logging imports to `@ku0/agent-runtime-telemetry`.
5. Ensure no imports from tools or persistence packages.
6. Move or update unit tests under the new package path.
7. Document any facade re-export requirements for Track L4.

## Acceptance Criteria
- `@ku0/agent-runtime-execution` builds successfully.
- Orchestrator and turn executor run without behavioral regressions (smoke test).
- No circular dependencies reported for the execution package.
- Updated tests pass.

## Required Tests
- `pnpm --filter @ku0/agent-runtime-execution build`
- Targeted runtime unit tests covering orchestrator/turn executor
- Optional: `pnpm dlx madge packages/agent-runtime-execution/src --circular --extensions ts,tsx`

## Branch and PR Workflow
- Create branch: `feature/track-l1-execution`
- Run required tests, commit, open PR with migration notes and moved module list
