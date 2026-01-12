# Task Prompt: AI Data Access Policy Enforcement

## Goal
Enforce `DataAccessPolicy` consistently for all AI reads (UI prompts, agent-runtime tools, collab-server pipelines) using the policy manifest instead of ad-hoc redaction.

## Background
- `apps/reader/src/lib/ai/contextPrivacy.ts` performs regex-based redaction and truncation but ignores the `DataAccessPolicy` types and manifest defaults in `packages/core/src/kernel/policy`.
- `packages/agent-runtime/src/tools/lfcc/lfccServer.ts` applies policies only when the caller passes one; UI flows never supply a policy, and gateway routes do not enforce allow/deny lists.
- Policy negotiation (`ai_native_policy` + `data_access`) exists but is not wired to API routes or context builders.

## Scope
- Surface policy defaults from `packages/core/src/kernel/policy` into a shared helper (`@keepup/core` export) that can build an effective `DataAccessPolicy` from manifest + user consent.
- Update reader context builders to derive policy-aware context (selected text, visible content) using `applyDataAccessPolicy` instead of standalone regexes; preserve redaction summaries in UI.
- Ensure agent-runtime and collab-server AI read paths require a policy (fall back to defaults) and log when blocks are omitted/filtered.
- Add a small negotiation endpoint or helper so clients know which policy profile is active (e.g., redaction_profile id) before issuing AI calls.

## Deliverables
- Single policy derivation helper used by UI, agent-runtime LFCC tool, and collab-server RAG/digest pipelines.
- Context payloads and AI requests include `policy_context` and are filtered per policy.
- Docs updated to describe active policy knobs and redaction behavior.

## Testing
- Unit: add tests for policy derivation and application in `packages/core/src/kernel/ai/documentContext.test.ts` (new) and adjust agent-runtime LFCC tool tests.
- Integration: add a reader API test that asserts disallowed blocks are removed and `policy_context` is echoed.
- E2E: run `pnpm test:e2e:features` focusing on AI gateway/context to ensure redactions do not regress visible behavior.
