# Task Prompt — AI Gateway E2E Binding & Conflict Handling (Agent B)

## Context
We now have a Loro-backed `GatewayDocumentProvider` and a `createLoroAIGateway` factory. The missing piece is wiring this into the actual AI request pipeline so conflicts (frontier/hash/verified) return **409** and the UI can rebase/relocate/retry. This must be stable before any major UI work proceeds.

## Scope (This Task Owns)
- End-to-end AI Gateway binding (request → pipeline → apply_plan → conflict check).
- Conflict/409 propagation to the client (UI-visible error handling).
- Minimal rebase/relocation (Level 1 exact hash) wiring so retry can proceed.

## Out of Scope (Owned by Agent A)
- UI contract enforcement migrations unrelated to AI Gateway.
- Virtualized views and debug overlays.

## Goals
1. Use the Loro-backed gateway (`createLoroAIGateway` or `createDefaultGatewayConfig`) in the real AI request path.
2. Ensure conflict checks (frontier/hash/verified) are executed and **409** is returned and surfaced to the UI.
3. Provide minimal relocation/rebase support (exact hash) so the UI can retry.
4. Add targeted tests for conflict paths and apply_plan handoff.

## Requirements
- TypeScript only (no new `.js` files).
- No `any` types; prefer explicit types or `unknown`.
- Loro only (no Yjs).
- Keep changes deterministic and LFCC-compliant.
- If code runs in the browser, avoid Node-only APIs (e.g., `node:crypto`) or guard usage carefully.

## Suggested Plan
1. **Bind gateway** in the AI request handler path used by the app (identify the actual request flow and connect `createLoroAIGateway`).
2. **Conflict propagation**: map 409 responses to UI-visible error handling (do not silently swallow).
3. **Retry hooks**:
   - Implement a minimal `RebaseProvider` / relocation Level 1 (`findByContextHash`) backed by the document provider.
4. **Tests**:
   - Unit tests around conflict results (frontier mismatch, hash mismatch, unverified).
   - A smoke test of apply_plan → bridge apply path if available.

## Key Files
- `packages/lfcc-bridge/src/facade/loroDocumentProvider.ts`
- `packages/lfcc-bridge/src/facade/index.ts`
- `packages/core/src/gateway/*`
- `apps/reader/app/api/ai/*` (or the actual AI request entry point)
- `apps/reader/src/components/editor/AIContextMenu.tsx` (if UI must handle 409)

## Deliverables
- Gateway bound to the real request path with conflict checks enabled.
- 409 responses passed to UI with actionable info (frontier + failed preconditions).
- Minimal retry hooks for exact-hash relocation.
- Targeted tests and verification notes.

## Acceptance Criteria
- 409 is returned on stale frontier or hash mismatch and is visible to the UI.
- apply_plan remains gated by conflict checks.
- Tests for the conflict path pass.
