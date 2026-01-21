# Track M1: Runtime Message Bus Integration

Owner: Runtime Architect + Runtime Developer
Status: Completed
Date: 2026-01-21
Timeline: Week 4+

## Objective
Integrate the runtime message bus into the new module structure and wire it into orchestrator and
subagent flows for deterministic agent-to-agent envelopes (send/publish/respond).

## Dependencies
- docs/roadmap/phase-1-foundation/core/track-l-architecture.md
- docs/architecture/agent-runtime-module-decomposition-rfc.md
- `@ku0/agent-runtime-core`
- `@ku0/agent-runtime-control`
- `@ku0/agent-runtime-execution`

## Scope
- Define core interface and envelope types for `RuntimeMessageBus` if not already in core.
- Ensure control-plane bus implementation conforms to the core interface.
- Wire bus into orchestrator/subagent orchestration via dependency injection.
- Emit message-bus events into the runtime event stream.

## Non-Goals
- Adding new tool contracts or changing existing tool schemas.
- Changing agent behavior beyond message delivery and subscription.

## Responsibilities
- Architect: confirm message envelope schema and ordering guarantees.
- Dev: integrate bus into execution and control packages.
- QA: validate request/response and pub/sub flows.

## Key Deliverables
- Core interface for message bus (envelopes + handler contracts).
- Control-plane message bus implementation wired into runtime.
- Orchestrator/subagent access to bus via injected components.
- Event stream emits message-bus activity.

## Progress Snapshot (2026-01-21)
- `RuntimeMessageBus` lives in `agent-runtime-core` and implementation in `agent-runtime-control`.
- `A2A` adapter and tests exist in control plane.
- Kernel wiring accepts injected message bus in `packages/agent-runtime/src/kernel`.

## Tasks
1. Add message-bus interfaces/envelopes to `agent-runtime-core` (if missing).
2. Align `agent-runtime-control` message bus implementation to core interface.
3. Extend orchestrator components to accept a `RuntimeMessageBus` instance.
4. Wire subagent orchestration to publish and respond via the bus.
5. Emit message bus activity in the runtime event stream.
6. Add targeted unit tests for send/request/respond and pub/sub.

## Acceptance Criteria
- Deterministic message IDs and ordering for send/request/respond.
- Request/response timeouts are handled and surfaced to callers.
- Message events appear in runtime event stream with correlation IDs.
- No direct cross-plane imports outside core interfaces.

## Required Tests
- Unit tests for message bus contracts and orchestrator integration.
- Optional: event stream bridge test for message bus events.

## Branch and PR Workflow
- Create branch: `feature/track-m1-message-bus`
- Run required tests, commit, open PR with integration notes
