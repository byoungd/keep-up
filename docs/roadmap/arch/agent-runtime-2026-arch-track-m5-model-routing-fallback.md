# Track M5: Model Routing Fallback and Health

Owner: Runtime Architect + Runtime Developer
Status: Ready
Date: 2026-01-19
Timeline: Week 4+

## Objective
Add health-aware fallback routing to the model router so runtime can automatically recover from
model failures and degraded latency without breaking existing routing policy.

## Dependencies
- docs/roadmap/agent-runtime-2026-track-l-architecture.md
- docs/architecture/agent-runtime-module-decomposition-rfc.md
- `@ku0/agent-runtime-core`
- `@ku0/agent-runtime-execution`
- `@ku0/agent-runtime-telemetry`

## Scope
- Track model health signals (error rate, latency, timeouts).
- Extend routing decisions with health-aware fallbacks.
- Emit routing decisions to telemetry for observability.

## Non-Goals
- Changing model catalogs or cost policies beyond fallback logic.
- Replacing existing routing rules or heuristics.

## Responsibilities
- Architect: define health thresholds and fallback priority.
- Dev: implement health tracking and fallback selection.
- QA: validate fallback behavior on simulated failures.

## Key Deliverables
- Health tracking in model router or capability cache.
- Fallback selection based on health metrics.
- Telemetry events for routing decisions and fallbacks.

## Tasks
1. Add health signals to routing data structures (error/latency/timeouts).
2. Update model router to downgrade unhealthy models and select fallback.
3. Emit routing decision metrics via telemetry hook.
4. Add tests for fallback selection and health decay/recovery.

## Acceptance Criteria
- Router selects fallback model when primary is unhealthy.
- Health metrics decay back to normal on recovery.
- Routing decisions are observable via telemetry.
- No cross-plane imports outside core interfaces.

## Required Tests
- Unit tests for routing fallback and health scoring.
- Telemetry emission test for routing decisions.

## Branch and PR Workflow
- Create branch: `feature/agent-runtime-2026-track-m5-model-routing-fallback`
- Run required tests, commit, open PR with routing notes
