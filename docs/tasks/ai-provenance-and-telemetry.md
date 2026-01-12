# Task Prompt: End-to-End AI Provenance & Telemetry

## Goal
Propagate `request_id`, `agent_id`, `intent`, and provenance consistently from UI → API → gateway → CRDT commits, and emit unified telemetry so conflicts/idempotency can be audited.

## Background
- `apps/reader/app/api/ai/chat/route.ts` and friends generate a `requestId` but the value is not persisted into `EnhancedDocument` AI context or ProseMirror/Loro commit origins.
- `packages/lfcc-bridge/src/security/aiGatewayWrite.ts` tags transactions, yet the data never reaches the UI history or `packages/core` gateway diagnostics, making replay/idempotency verification difficult.
- `packages/agent-runtime/src/bridge/streamBridge.ts` supports `requestId` and `aiMeta` but downstream consumers ignore it.

## Scope
- Wire request/provenance fields through streaming flows:
  - API routes should return `request_id`/confidence/provenance in SSE and non-stream responses.
  - `useStreamingDocument`/`useAIPanelController` should attach the ids + `aiMeta` onto `EnhancedDocument` blocks (aiContext/meta) and surface them in the message list.
  - `applyAIGatewayWrite` and Loro commit origins should include the `request_id`/`agent_id` so remote replicas can audit source.
- Emit telemetry and audit events:
  - Add a small event publisher (shared between `packages/core` gateway and `packages/collab-server` gateway) that records timing, idempotency hits, conflicts, and sanitization rejects.
  - Hook UI logging/analytics to display request ids and conflict reasons for AI writes.
- Provide retry-safe storage: keep the last N request ids per document to de-duplicate late retries in the reader client before they hit the gateway.

## Deliverables
- Request/provenance fields visible in UI history and stored on message blocks.
- Gateway/bridge layers log structured events for idempotency, conflicts, and sanitization results.
- Optional local de-dupe cache to drop duplicate retries on the client.

## Testing
- Unit: add coverage for provenance propagation in `packages/lfcc-bridge` (commit origin metadata) and `apps/reader` hooks (message meta).
- Gateway: extend `packages/core/src/gateway/__tests__/gateway.test.ts` to assert telemetry hooks fire with request ids and conflict codes.
- E2E: targeted `pnpm test:e2e:features` (AI gateway) to verify request ids appear in the AI panel and remain stable across refresh.
