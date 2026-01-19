# Track L4: Facade Wiring and Dependency Enforcement

Owner: Runtime Architect + Runtime Developer
Status: Completed
Date: 2026-01-19
Timeline: Week 4+

## Objective
Wire the new plane packages into the `@ku0/agent-runtime` facade, preserve the public API, and
add dependency enforcement tooling to prevent regressions.

## Dependencies
- Track L1: Execution Plane Package Extraction
- Track L2: Persistence Plane Package Extraction
- Track L3: Tools Plane Package Extraction
- docs/roadmap/agent-runtime-2026-track-l-architecture.md
- docs/architecture/agent-runtime-module-decomposition-rfc.md

## Scope
- Update facade exports in `packages/agent-runtime` to re-export from new packages.
- Update composition root (`createRuntime`, `createOrchestrator`) to wire concrete implementations.
- Add dependency graph checks (madge or dependency-cruiser) and document usage.
- Update migration notes and Track L docs as needed.

## Non-Goals
- Moving execution/persistence/tools modules (handled in L1-L3).
- Changing runtime behavior, tool policies, or contracts.
- Introducing new features.

## Responsibilities
- Architect: approve facade export list and wiring boundaries.
- Dev: update composition root and re-exports.
- QA: run build and smoke tests.

## Key Deliverables
- Facade re-exports remain API-compatible.
- Composition root wiring uses the new plane packages only.
- Dependency checks enforced in CI or scripts.

## Tasks
1. Update `packages/agent-runtime/package.json` to depend on new plane packages.
2. Update `packages/agent-runtime/src/index.ts` re-exports to point at new packages.
3. Update composition root wiring in `packages/agent-runtime/src/kernel` (or equivalent) to
   create concrete implementations from the new packages.
4. Add dependency graph check script (madge or dependency-cruiser) and document invocation.
5. Update migration notes and Track L roadmap docs with final package layout.
6. Run build and smoke tests.

## Dependency Checks
- `pnpm check:circular` (runs `scripts/check-circular-deps.sh` across runtime packages)
- Optional ad-hoc: `pnpm madge --circular --extensions ts,tsx packages/agent-runtime/src/index.ts`

## Migration Notes
- `@ku0/agent-runtime-tools` now owns tools, browser automation, plugins, skills, and tool registry.
- `@ku0/agent-runtime` re-exports tool factories and subpaths (`/tools`, `/browser`, `/plugins`, `/skills`).

## Acceptance Criteria
- Facade API remains compatible with previous exports.
- `@ku0/agent-runtime` builds successfully using new packages.
- Dependency check passes with no cycles.
- Smoke tests for orchestrator startup and tool registry wiring pass.

## Required Tests
- `pnpm --filter @ku0/agent-runtime build`
- Workspace build or targeted runtime build suite
- Dependency check command defined in scripts

## Branch and PR Workflow
- Create branch: `feature/agent-runtime-2026-track-l4-facade`
- Run required tests, commit, open PR with compatibility notes
