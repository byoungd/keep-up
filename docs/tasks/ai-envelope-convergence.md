# Task Prompt: AI Envelope Convergence

## Goal
Create a single, canonical AI envelope/request/response definition across `@keepup/core`, `@keepup/collab-server`, and `apps/reader` so idempotency, conflict handling, and policy hooks stay in sync.

## Background
- Two envelope shapes exist today: `packages/core/src/kernel/ai` (`AIRequestEnvelope`) and `packages/core/src/gateway` (`AIGatewayRequest`), plus a separate `packages/collab-server/src/ai/gateway.ts` layer and ad-hoc request ids in `apps/reader/app/api/ai/*`.
- Client flows (AI panel, agent-runtime) generate `requestId`/`agentId` but do not rely on one canonical builder/validator, increasing drift risk and making 409 retry logic hard to reuse.
- Policy manifest extensions (ai_native_policy, data_access) live in `packages/core/src/kernel/policy`, but gateway routes do not surface a consistent `policy_context`.

## Scope
- Define and export a single envelope module from `@keepup/core` (request/response types, builders, validators, idempotency helpers, conflict parsing) and consume it in:
  - `packages/core/src/gateway/*`
  - `packages/collab-server/src/ai/gateway.ts` (rename internal envelope wiring to use the shared module)
  - `apps/reader/app/api/ai/*` routes (chat/stream/research) for request id construction + response metadata.
- Standardize field names (`doc_frontier`, `doc_frontier_tag`, `request_id`, `agent_id`, `intent`, `ai_meta`) and remove duplicated aliases where possible; keep backwards compatibility via a thin adapter.
- Ensure `policy_context` (policy id + redaction profile) flows through the envelope and is validated against `packages/core/src/kernel/policy/schema.ts`.
- Add integration helpers for 409 retry flow (span relocation hooks) so UI/agents can share the same retry policy constants.

## Deliverables
- Single envelope source of truth exported from `@keepup/core`.
- Collab-server gateway and reader API routes use the shared builder/validator; legacy fields shimmed with tests.
- Updated docs/specs if field names change; remove stale envelope helpers.

## Testing
- Unit: `packages/core/src/gateway/__tests__/*` extended to cover the unified builder + alias shims.
- Integration: add a lightweight route test under `apps/reader` that builds a request via the shared module and asserts 409/200 responses echo `request_id`/`client_request_id`.
- E2E: `pnpm test:e2e:features` (AI gateway category) to ensure no regression in AI write enforcement.
