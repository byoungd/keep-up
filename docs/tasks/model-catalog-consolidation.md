# Task Prompt: Model Catalog Consolidation

## Goal
Use a single model catalog/resolver across the stack to prevent drift in capabilities, defaults, and provider routing.

## Background
- `apps/reader/src/lib/ai/models.ts` duplicates the catalog from `packages/ai-core/src/catalog/models.ts`; the two can drift (ids, provider labels, defaults).
- Model resolution logic is spread across `apps/reader/app/api/ai/modelResolver.ts`, `providerResolver.ts`, and `packages/collab-server/src/ai/gateway.ts` without shared validation of capabilities (vision/tools/thinking).
- UI model selectors and API routes hardcode aliases separately from the ai-core catalog.

## Scope
- Expose a reusable catalog/resolver module from `@keepup/ai-core` that includes aliases, provider metadata, and capability checks.
- Replace the duplicated `MODEL_CAPABILITIES`/alias maps in reader with imports from the shared module; keep UI labels in one place (short/long labels).
- Update collab-server gateway to consume the shared resolver for default model selection and provider routing, eliminating local hardcoded lists.
- Add guardrails to prevent serving a model that lacks required capabilities (e.g., attachments/vision) by reusing the shared capability check.

## Deliverables
- Single catalog + resolver exported from ai-core; reader and collab-server routes use it.
- Removed or minimized duplicate model lists/aliases; UI still renders friendly labels.
- Tests to catch drift (snapshots or equality checks) between UI catalog and ai-core catalog removed.

## Testing
- Unit: add coverage in ai-core for the resolver (aliases + capability filtering) and reader API routes for model validation errors.
- Integration: add a small test ensuring provider routing falls back correctly when env overrides are missing.
- E2E: run `pnpm test:e2e:features` (AI features) to confirm model selection UI still works.
