# Track 5: Reliability + Telemetry (Performance + Observability)

## Mission
Make chat and task streaming resilient, measurable, and fast enough for
top-tier product standards.

## Primary Goal
Guarantee stable streaming with strong reconnection logic, ordering safety,
and performance telemetry that matches the spec budgets.

## Scope
- Stream reconnection and resume with Last-Event-ID.
- Client-side buffering (rAF batching) to avoid flicker.
- Message ordering guarantees with client_request_id.
- Metrics capture: TTFB, TTFT, duration, fallback, tool error rate.
- Status surfaces for degraded connections and retry states.

## Non-Goals
- New provider routing policies.
- UI feature expansions beyond status indicators.

## Inputs and References
- `docs/specs/cowork/cowork-top-tier-agent-chat-spec.md`
- `apps/cowork/server/routes/stream.ts`
- `apps/cowork/src/features/tasks/hooks/useTaskStream.ts`
- `apps/cowork/src/features/chat/hooks/useChatSession.ts`

## Required Behavior
- Messages never reorder after send.
- Streaming resumes without duplicate messages.
- "Working..." appears after 2 seconds of no tokens.
- Telemetry events logged per message and task.

## Implementation Outline
1. Add client_request_id to message sends and persist server-side.
2. Implement stream resumption and dedupe by idempotency keys.
3. Add buffering and rAF batch updates for chat streaming.
4. Emit telemetry and store summary per session/task.
5. Expose metrics in dev logs or a diagnostics panel.

## Deliverables
- Stable streaming with reconnection and dedupe.
- Telemetry capture for latency and error metrics.
- UI status indicators for connection state.

## Acceptance Criteria
- No duplicate messages after reconnect.
- Metrics for TTFB and TTFT are recorded per message.
- UI shows stalled/working state reliably.

## Testing
- `pnpm test:e2e:smoke`
- Unit tests for dedupe and ordering logic.

## Dependencies
- Track 1 for message IDs and storage.
- Track 3 for task message integration.

## Owner Checklist
- Follow `CODING_STANDARDS.md` (TypeScript only, no `any`, no `var`).
- Update `task.md` progress markers for this track.
- Document manual verification steps in `walkthrough.md`.
