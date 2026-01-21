# Track L3: Tools Plane Package Extraction

Owner: Runtime Architect + Runtime Developer
Status: Completed
Date: 2026-01-21
Timeline: Week 4+

## Objective
Extract tool-related modules into `@ku0/agent-runtime-tools` with zero behavior change, aligned
with Track L architecture and dependency rules.

## Dependencies
- docs/roadmap/phase-1-foundation/core/track-l-architecture.md
- docs/architecture/agent-runtime-module-decomposition-rfc.md
- `@ku0/agent-runtime-core`
- `@ku0/agent-runtime-control`
- `@ku0/agent-runtime-telemetry`

## Scope
- Move tooling modules from `packages/agent-runtime/src/`:
  - `tools/`
  - `plugins/`
  - `skills/`
  - `browser/`
- Update imports to use core interfaces and control-plane policies.
- Preserve tool registry behavior and MCP tool servers.

## Non-Goals
- Moving execution or persistence modules (Tracks L1/L2).
- Changing tool policies, schemas, or MCP contracts.
- Facade re-exports and wiring (Track L4).

## Responsibilities
- Architect: confirm tool package boundaries and core interfaces.
- Dev: package scaffolding, module moves, import updates.
- QA: targeted tool server and registry tests.

## Key Deliverables
- `packages/agent-runtime-tools` scaffolded and built.
- Tool registry, servers, plugins, and skills moved with updated imports.
- Updated tests passing.

## Progress Snapshot (2026-01-21)
- Tool registry, MCP server, plugins, skills, browser, hooks, and coordinator live in `agent-runtime-tools`.
- `agent-runtime` exports tools via facade modules (`tools`, `plugins`, `skills`, `browser`).

## Tasks
1. Scaffold `packages/agent-runtime-tools` (package.json, tsconfig, src/index.ts).
2. `git mv` `tools/`, `plugins/`, `skills/`, and `browser/` into the new package.
3. Replace monolith imports with `@ku0/agent-runtime-core` and `@ku0/agent-runtime-control` interfaces.
4. Update telemetry/logging imports to `@ku0/agent-runtime-telemetry`.
5. Ensure tools do not directly import execution or persistence modules.
6. Move or update unit tests under the new package path.
7. Document any facade re-export requirements for Track L4.

## Acceptance Criteria
- `@ku0/agent-runtime-tools` builds successfully.
- Tool registry and servers behave the same (targeted tests pass).
- No circular dependencies reported for the tools package.

## Required Tests
- `pnpm --filter @ku0/agent-runtime-tools build`
- Targeted tool registry/server unit tests
- Optional: `pnpm dlx madge packages/agent-runtime-tools/src --circular --extensions ts,tsx`

## Branch and PR Workflow
- Create branch: `feature/track-l3-tools`
- Run required tests, commit, open PR with migration notes and moved module list
