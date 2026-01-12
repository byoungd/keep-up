# Task Prompt: LFCC Merge Protocol Alignment (Envelope + Policy + Provenance)

## Goal
Align the merged LFCC branch protocol updates across core, collab-server, agent-runtime, and reader so the AI envelope, policy/context gating, and provenance/telemetry are deterministic and idempotent.

## Background
- The merged LFCC branch requires the v0.9.1 AI envelope (`request_id` required, `agent_id`/`intent` preferred, `doc_frontier` canonical) plus `policy_context` (`ai_native_policy` + `data_access`) on every AI write/read.
- Current stack still mixes legacy shapes (`doc_frontier_tag`, optional `client_request_id`, ad-hoc policy) and partial provenance (request ids not persisted to commit origins or SSE responses), making 409 retries and audit trails unreliable.
- Data-access redaction remains app-specific and not negotiated, leaving the gateway/agent-runtime unaware of the active policy profile.

## Scope
- **Canonical envelope + validators**
  - Export a single `AIEnvelopeV2` (request/response + 409 parsing + retry helpers) from `@keepup/core` and adopt it in `packages/core/src/gateway/*`, `packages/collab-server/src/ai/gateway.ts`, `apps/reader/app/api/ai/*`, and `packages/agent-runtime` builders.
  - Enforce required fields (`request_id`, `doc_frontier`) with backward-compatible aliases for `client_request_id`/`doc_frontier_tag`; normalize response echoes.
  - Align 409/422 payloads to merged spec (failed preconditions, relocation hints, sanitization diagnostics) and expose shared retry policy constants.
- **Policy + data access enforcement**
  - Wire `policy_context` (policy id, redaction profile) through envelope builders and gateway handlers; validate against `policy_manifest_v0.9.1`.
  - Replace ad-hoc redaction with a shared `DataAccessPolicy` helper (core export) used by reader context builders, agent-runtime LFCC tools, and collab-server RAG/digest paths; log omitted blocks.
- **Provenance + telemetry**
  - Persist `request_id`/`agent_id`/`intent`/`ai_meta` into commit origins, Loro metadata, and EnhancedDocument message meta; ensure SSE/REST responses echo them.
  - Add unified telemetry/audit hooks (latency, idempotency hits, conflicts, sanitization rejects) shared by core gateway and collab-server; surface request ids/conflict reasons in reader diagnostics.
- **Idempotency + de-dupe**
  - Add bounded request-id caches on client and gateway; drop late retries before write apply without breaking cross-replica determinism.

## Deliverables
- Single envelope/policy module in `@keepup/core` consumed by collab-server, reader API routes, and agent-runtime.
- Policy-aware context/redaction applied end-to-end; provenance fields stored in commit origins and surfaced in UI/history.
- Telemetry/audit events emitted with request ids and conflict codes; legacy envelope helpers removed or shimmed with tests.

## Testing
- Unit: gateway/envelope/relocation + policy/data-access helpers in `packages/core` and agent-runtime LFCC tool tests.
- Integration: reader API route test covering policy-aware context and 409/200 echoes for `request_id`.
- E2E: `pnpm test:e2e:features` (AI gateway/context) to validate no regressions in apply + redaction + provenance surfacing.
