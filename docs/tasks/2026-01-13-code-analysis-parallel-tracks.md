# Codebase Analysis & Parallel Optimization Tracks
**Date:** 2026-01-13
**Status:** Proposed (analysis + two parallel tracks)

## 1. Analysis Snapshot (Multi-Angle)

### Architecture & Boundaries
- **Strong modularization**: clear package boundaries across `packages/agent-runtime`, `packages/ai-core`, `packages/lfcc-bridge`, and `apps/reader`.
- **Cross-layer duplication risk**: caching exists in both `packages/agent-runtime/src/orchestrator/requestCache.ts` and `packages/ai-core/src/performance/cache.ts` with different strategies and telemetry hooks, increasing divergence risk.
- **Facade pattern present**: `packages/lfcc-bridge/src/facade/documentFacade.ts` provides a single entry point for doc edits, but its current implementation recomputes the block tree per read.

### Performance & Scalability
- **Repeated full-tree reads**: `LoroDocumentFacade.getBlocks()` re-reads the entire tree every call; `getBlock/getBlockText` call into it, causing O(n) per access with large documents (`packages/lfcc-bridge/src/facade/documentFacade.ts`).
- **Ordered list numbering**: `BlockNodeView` computes ordered list numbers via `doc.nodesBetween` per block render, producing O(n^2) behavior for long lists (`apps/reader/src/lib/editor/BlockNodeView.tsx`).
- **Snapshot-only persistence**: `docPersistence.saveDoc` writes full snapshots; import pipeline uses full snapshots without incremental updates (`apps/reader/src/lib/persistence/docPersistence.ts`, `apps/reader/src/lib/import/ingestToLoro.ts`).
- **Cache key collisions**: `RequestCache` hashes only the first 200 chars of message content, which can produce collisions or stale hits (`packages/agent-runtime/src/orchestrator/requestCache.ts`).

### Correctness & Robustness
- **MoveBlock correctness risk**: `moveBlock` deletes before reading, then re-inserts with a comment noting the implementation is simplified, risking data loss with children/attrs (`packages/lfcc-bridge/src/facade/documentFacade.ts`).
- **Doc ID collisions**: `generateDocId` uses a simple FNV hash over URL without collision handling (`apps/reader/src/lib/import/ingestToLoro.ts`).
- **AI provenance gaps**: UI mappings drop confidence/provenance (`apps/reader/src/hooks/useAIPanelController.ts`).

### Observability & Product Quality
- **Telemetry stubs**: analytics/telemetry are placeholders (`apps/reader/src/lib/analytics/track.ts`, `apps/reader/src/lib/import/telemetry.ts`).
- **Performance metrics present, not wired**: `PerfMetrics` exists but no upstream plumbing into analytics or runtime telemetry (`apps/reader/src/lib/perf/perfMetrics.ts`).

## 2. Optimization Opportunities (Prioritized)
1. **Document read hot paths**: introduce cached block trees with invalidation and a blockId index to eliminate repeated full reads.
2. **Editor list numbering**: compute ordered list numbers once per transaction in a plugin state or decoration layer.
3. **MoveBlock correctness**: preserve block data and children before deletion; consider a move operation that updates parent list without delete-reinsert.
4. **Hashing and dedupe**: strengthen request cache keys and import doc IDs to avoid collisions.
5. **Provenance pipeline**: persist and surface AI confidence/provenance end-to-end.
6. **Telemetry plumbing**: add a production-grade telemetry adapter and wire existing perf metrics into it.

---

## 3. Parallel Development Tracks

### 🛤️ Track A: Editor + Document Pipeline Performance (Frontend/Core)
**Goal:** Reduce editor latency and document access overhead while fixing move correctness.
**Scope:** `packages/lfcc-bridge`, `apps/reader/src/lib/editor`, `apps/reader/src/lib/persistence`

#### Task A1: DocumentFacade Caching + Block Index
- **Description**: Cache the block tree, invalidate on mutations, and add a blockId -> node index for constant-time lookups.
- **Acceptance Criteria**:
  - `getBlock` and `getBlockText` avoid full `readBlockTree` calls when cache is valid.
  - Introduce tests for cache invalidation and index accuracy in `packages/lfcc-bridge`.
  - Large-doc access drops to O(1) for repeated lookups (bench or perf counter).

#### Task A2: MoveBlock Correctness
- **Description**: Preserve block data (type, attrs, children, richText) before deletion and reinsert atomically, or implement a non-destructive move in Loro lists.
- **Acceptance Criteria**:
  - Moving a block with children preserves structure and text.
  - Unit tests cover move with nested blocks and with annotations.

#### Task A3: Ordered List Numbering Optimization
- **Description**: Move list numbering into an editor plugin state or decoration pass that recalculates once per transaction.
- **Acceptance Criteria**:
  - No `doc.nodesBetween` per block render in `BlockNodeView`.
  - Render time for 1k ordered list items improves measurably (baseline + target recorded in tests or perf logs).

---

### 🛤️ Track B: Runtime + AI Reliability & Observability (Backend/AI)
**Goal:** Strengthen cache correctness, provenance, and telemetry across the AI stack.
**Scope:** `packages/agent-runtime`, `packages/ai-core`, `apps/reader/src/hooks`

#### Task B1: Request Cache Key Hardening
- **Description**: Replace truncated message hashing with a stable full-content hash (including tool schemas + system prompt) and add collision tests.
- **Acceptance Criteria**:
  - Cache key incorporates full message content (not just 200 chars) and tool signatures.
  - Tests cover collisions and verify no false hits with different prompts.

#### Task B2: AI Provenance & Confidence Plumbing
- **Description**: Extend AI context types to include confidence/provenance and store/display them end-to-end (AI core -> runtime -> UI).
- **Acceptance Criteria**:
  - `AIContext` includes confidence + provenance fields.
  - `useAIPanelController` persists and renders these values.
  - Unit tests cover presence of provenance in stored messages.

#### Task B3: Telemetry Adapter + Perf Wiring
- **Description**: Introduce a telemetry adapter interface and wire `PerfMetrics` + import analytics to it.
- **Acceptance Criteria**:
  - Telemetry interface supports dev console + production provider.
  - Perf metrics (decode/render/fps) emit into telemetry pipeline.
  - Import analytics events are routed through the same adapter.

---

## 4. Track Boundaries (Collision Avoidance)
- **Track A** should not modify `packages/agent-runtime` or `packages/ai-core`.
- **Track B** should not modify `packages/lfcc-bridge` or `apps/reader/src/lib/editor`.

## 5. Suggested Next Steps
- Pick a track and create an `implementation_plan.md` slice for just that track.
- Confirm any perf baselines (document size, list length, and latency targets).
