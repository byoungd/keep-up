# Task Prompt: Model Catalog & Provider Alignment (Post-LFCC Merge)

## Goal
Adopt the merged LFCC branch model/catalog expectations by using a single resolver across ai-core, collab-server, and reader so defaults, aliases, and provider routing stay deterministic.

## Background
- The merged branch adds env-driven defaults and multi-provider routing hooks; current code still keeps separate catalogs in `@keepup/ai-core`, reader API routes, and collab-server gateway.
- UI selectors and API validators hardcode aliases/capabilities independently, risking drift from the canonical list and from provider capability flags (vision/tools/streaming).
- Provider fallbacks for missing env defaults are inconsistent between collab-server and reader routes.

## Scope
- Expand `@keepup/ai-core` catalog/resolver to be the single source (aliases, provider metadata, capability checks, env default resolution) and export a helper for request validation.
- Replace duplicated model/alias maps in reader (`app/api/ai/*`, `src/lib/ai/models.ts`, panel selectors) with imports from the shared resolver; keep UI label mapping centralized.
- Update collab-server gateway to use the same resolver for default model selection and provider routing, including env fallback behavior and capability enforcement.
- Add guardrails for capability-required requests (attachments/vision/tools) and consistent error messaging when a model/provider is unavailable.

## Deliverables
- Canonical catalog/resolver in ai-core reused by reader routes/UI and collab-server; no local hardcoded lists remain.
- Env default handling and provider routing behave the same in reader and collab-server; friendly labels still render from one mapping.
- Drift tests guard against catalog divergence and capability mismatches.

## Testing
- Unit: resolver/alias/capability tests in ai-core; reader API validation tests for capability errors and env default fallback.
- Integration: collab-server gateway test covering resolver-driven defaults + provider selection without env keys.
- E2E: `pnpm test:e2e:features` (AI features) to confirm model selection UI and provider routing still work.
