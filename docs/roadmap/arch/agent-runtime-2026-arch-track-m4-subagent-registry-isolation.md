# Track M4: Subagent Tool Registry Isolation

Owner: Runtime Architect + Runtime Developer
Status: Ready
Date: 2026-01-19
Timeline: Week 4+

## Objective
Ensure subagents operate with isolated tool registries and explicit allowlists to prevent
cross-agent tool leakage and to enforce scoped permissions.

## Dependencies
- docs/roadmap/agent-runtime-2026-track-l-architecture.md
- docs/architecture/agent-runtime-module-decomposition-rfc.md
- `@ku0/agent-runtime-core`
- `@ku0/agent-runtime-control`
- `@ku0/agent-runtime-tools`
- `@ku0/agent-runtime-execution`

## Scope
- Define registry isolation and allowlist rules per subagent.
- Create per-agent tool registries or filtered views of the global registry.
- Ensure subagent orchestration uses isolated registries by default.

## Non-Goals
- Changing tool schemas or tool server behavior.
- Changing agent SOP phases or policies (Track E/B).

## Responsibilities
- Architect: define isolation rules and default allowlists.
- Dev: implement registry isolation in agent manager and subagent orchestration.
- QA: validate that disallowed tools are blocked.

## Key Deliverables
- Registry isolation strategy (dedicated registry or filtered registry).
- Subagent spawn path uses isolated registry and scoped permissions.
- Tests for allowlist enforcement.

## Tasks
1. Define registry isolation contract in core (if missing).
2. Add registry factory or view in tools package.
3. Update agent manager/subagent orchestrator to use isolated registries.
4. Enforce allowlists for role-based and scoped subagents.
5. Add tests ensuring disallowed tools are rejected.

## Acceptance Criteria
- Subagents cannot access tools outside their allowlist.
- Parent registry remains unaffected by subagent registry changes.
- Isolation is deterministic and does not alter existing tool behavior.
- No cross-plane imports outside core interfaces.

## Required Tests
- Unit tests for registry isolation and allowlist enforcement.
- Subagent orchestration integration test.

## Branch and PR Workflow
- Create branch: `feature/agent-runtime-2026-track-m4-registry-isolation`
- Run required tests, commit, open PR with isolation rules
