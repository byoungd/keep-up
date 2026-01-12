# Task Prompt — UI Contract Stabilization (Agent A)

## Context
The UI ↔ LFCC Bridge contract is frozen (`docs/architecture/UI_CONTRACT.md`). UI code must not access Loro internals. The current enforcement script exists (`scripts/check-ui-contract.sh`) with a small exception allowlist that should be reduced over time. This task focuses on stabilizing the UI boundary before new UI feature work begins.

## Scope (This Task Owns)
- UI contract enforcement scope and UI-layer migrations.
- UI-facing accessors on Bridge/Facade to remove direct `runtime.doc.*` access.
- Virtualized read-only UI components (e.g., `VirtualizedDocView`).
- UI debugging overlays (e.g., `LfccDebugOverlay`).

## Out of Scope (Owned by Agent B)
- AI Gateway request/response binding and 409 handling.
- Conflict/retry logic and gateway pipeline integration.

## Goals
1. Remove direct Loro access from UI components by routing through Bridge/Facade APIs.
2. Shrink or eliminate exceptions in `scripts/check-ui-contract.sh` where possible.
3. Make enforcement cover the full UI surface (components + app routes) without false positives.
4. Keep the contract docs in sync with any scope or exception changes.

## Requirements
- TypeScript only (no new `.js` files).
- No `any` types; prefer explicit types or `unknown`.
- Keep Loro as the only CRDT (no Yjs).
- Follow `CODING_STANDARDS.md` (incl. no Framer Motion in ProseMirror editor NodeViews).
- Documentation updates must be in English.

## Suggested Plan
1. **Add bridge/facade accessors** needed by UI (e.g., peerId/diagnostics) so UI does not touch `runtime.doc.*`.
2. **Migrate UI components**:
   - `apps/reader/src/components/lfcc/VirtualizedDocView.tsx` → `DocumentFacade` (`getBlocks`, `subscribe`).
   - `apps/reader/src/components/lfcc/DebugOverlay/LfccDebugOverlay.tsx` → Bridge/Facade accessor.
3. **Tighten enforcement**:
   - Update `scripts/check-ui-contract.sh` allowlist to remove migrated exceptions.
   - If expanding scope beyond `apps/reader/src/components`, update contract docs accordingly.
4. **Update docs**:
   - `docs/architecture/UI_CONTRACT.md` exception table + migration table.
5. **Verification**:
   - Run `bash scripts/check-ui-contract.sh`.
   - Add/adjust unit tests if needed (keep it targeted).

## Key Files
- `docs/architecture/UI_CONTRACT.md`
- `scripts/check-ui-contract.sh`
- `apps/reader/src/components/lfcc/VirtualizedDocView.tsx`
- `apps/reader/src/components/lfcc/DebugOverlay/LfccDebugOverlay.tsx`
- `packages/lfcc-bridge/src/facade/*`
- `packages/lfcc-bridge/src/bridge/bridgeController.ts`

## Deliverables
- UI components no longer directly use `runtime.doc.*`, `readBlockTree`, or `getRootBlocks`.
- Reduced exception list in `scripts/check-ui-contract.sh`.
- Contract documentation updated to match actual enforcement.
- Targeted verification steps recorded in `walkthrough.md` if you follow the project workflow.

## Acceptance Criteria
- `bash scripts/check-ui-contract.sh` passes without exceptions for migrated components.
- UI components compile without direct Loro access.
- No change to AI Gateway integration logic (reserved for Agent B).
