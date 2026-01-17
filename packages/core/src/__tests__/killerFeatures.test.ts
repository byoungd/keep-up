/**
 * Unit tests for LFCC v0.9 RC Killer Features
 *
 * Tests for:
 * - Liquid Refactoring (structure-aware AI edits)
 * - Ghost Collaborator (AI as CRDT peer)
 * - Semantic Time Travel (history query and Shadow Views)
 *
 * Updated for Linear-quality API with Result/Option types.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createGhostPeer,
  createGhostPresence,
  createGhostSession,
  GhostCollaborator,
  type GhostCursor,
} from "../kernel/ai/ghostCollaborator.js";
import {
  type AnnotationMigration,
  applyLiquidRefactoring,
  createLiquidInput,
  type LiquidOp,
  type LiquidRefactoringResult,
  planLiquidRefactoring,
  validateLiquidPlan,
} from "../kernel/ai/liquidRefactoring.js";
import { annotationId, blockId, snapshotId } from "../kernel/ai/primitives.js";
import {
  createResurrectionRequest,
  createSemanticTimeTravel,
  createShadowViewConfig,
  SemanticTimeTravel,
} from "../kernel/ai/semanticTimeTravel.js";
import type { HistoryState } from "../kernel/shadow/history.js";
import type { ShadowDocument } from "../kernel/shadow/types.js";

// ============================================
// Liquid Refactoring Tests
// ============================================

describe("Liquid Refactoring", () => {
  describe("planLiquidRefactoring", () => {
    it("generates OP_BLOCK_CONVERT for type changes", () => {
      const input = createLiquidInput({
        intent: "convert to formal document",
        sourceBlockIds: ["block-1", "block-2"],
        proposedStructure: [
          {
            sourceBlockId: "block-1",
            type: "heading",
            text: "Introduction",
            orderIndex: 0,
          },
          {
            sourceBlockId: "block-2",
            type: "paragraph",
            text: "Content here",
            orderIndex: 1,
          },
        ],
        annotations: [],
      });

      const result = planLiquidRefactoring(input);

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }

      expect(result.value.success).toBe(true);
      expect(result.value.ops.length).toBeGreaterThan(0);

      const convertOps = result.value.ops.filter((op) => op.opCode === "OP_BLOCK_CONVERT");
      expect(convertOps.length).toBe(2);
      expect(convertOps[0].targetType).toBe("heading");
      expect(convertOps[1].targetType).toBe("paragraph");
    });

    it("generates OP_REORDER for position changes", () => {
      const input = createLiquidInput({
        intent: "reorder sections",
        sourceBlockIds: ["block-1", "block-2", "block-3"],
        proposedStructure: [
          { sourceBlockId: "block-3", type: "paragraph", text: "Third", orderIndex: 0 },
          { sourceBlockId: "block-1", type: "paragraph", text: "First", orderIndex: 1 },
          { sourceBlockId: "block-2", type: "paragraph", text: "Second", orderIndex: 2 },
        ],
        annotations: [],
      });

      const result = planLiquidRefactoring(input);

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }

      expect(result.value.success).toBe(true);

      const reorderOps = result.value.ops.filter((op) => op.opCode === "OP_REORDER");
      expect(reorderOps.length).toBe(3); // All blocks moved from original positions
    });

    it("preserves annotations on blocks that survive refactoring", () => {
      const input = createLiquidInput({
        intent: "restructure",
        sourceBlockIds: ["block-1"],
        proposedStructure: [
          { sourceBlockId: "block-1", type: "heading", text: "Title", orderIndex: 0 },
        ],
        annotations: [
          {
            id: "anno-1",
            anchor: { blockId: "block-1", offset: 0, bias: "right" as const },
            content: "Important note",
          },
        ],
      });

      const result = planLiquidRefactoring(input);

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }

      expect(result.value.annotationMigrations.length).toBe(1);
      expect(result.value.annotationMigrations[0].method).toBe("exact");
      expect(result.value.annotationMigrations[0].confidence).toBe(1.0);
    });

    it("marks orphaned annotations for fuzzy relocation", () => {
      const input = createLiquidInput({
        intent: "remove section",
        sourceBlockIds: ["block-1", "block-2"],
        proposedStructure: [
          // block-1 is removed, only block-2 remains
          { sourceBlockId: "block-2", type: "paragraph", text: "Remaining", orderIndex: 0 },
        ],
        annotations: [
          {
            id: "anno-1",
            anchor: { blockId: "block-1", offset: 5, bias: "left" as const },
            content: "Orphaned note",
          },
        ],
      });

      const result = planLiquidRefactoring(input);

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }

      expect(result.value.annotationMigrations.length).toBe(1);
      expect(result.value.annotationMigrations[0].method).toBe("fuzzy");
      expect(result.value.annotationMigrations[0].confidence).toBe(0.0);
      expect(result.value.diagnostics.some((d) => d.kind === "orphan_annotation")).toBe(true);
    });

    it("handles new blocks with diagnostic", () => {
      const input = createLiquidInput({
        intent: "add summary",
        sourceBlockIds: ["block-1"],
        proposedStructure: [
          { sourceBlockId: "block-1", type: "paragraph", text: "Original", orderIndex: 0 },
          { sourceBlockId: null, type: "paragraph", text: "New summary", orderIndex: 1 },
        ],
        annotations: [],
      });

      const result = planLiquidRefactoring(input);

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }

      expect(result.value.diagnostics.some((d) => d.kind === "new_block")).toBe(true);
    });

    it("returns error for empty source blocks", () => {
      const input = createLiquidInput({
        intent: "empty",
        sourceBlockIds: [],
        proposedStructure: [],
        annotations: [],
      });

      const result = planLiquidRefactoring(input);

      expect(result.ok).toBe(false);
      if (result.ok) {
        return;
      }

      expect(result.error.code).toBe("EMPTY_SOURCE");
    });
  });

  describe("validateLiquidPlan", () => {
    it("returns valid for clean plans", () => {
      const result: LiquidRefactoringResult = {
        traceId: "test-trace" as ReturnType<typeof import("../kernel/ai/primitives.js").traceId>,
        success: true,
        ops: [],
        annotationMigrations: [
          {
            annotationId: annotationId("a1"),
            oldAnchor: { blockId: "b1", offset: 0, bias: "right" as const },
            newAnchor: { blockId: "b1", offset: 0, bias: "right" as const },
            confidence: 1.0,
            method: "exact" as const,
          },
        ],
        blockMapping: {
          mapOldToNew: () => null,
          derivedBlocksFrom: () => [],
        },
        affectedBlockIds: [],
        diagnostics: [],
        timingMs: 0,
      };

      const validation = validateLiquidPlan(result);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it("reports fuzzy migrations as warnings", () => {
      const result: LiquidRefactoringResult = {
        traceId: "test-trace" as ReturnType<typeof import("../kernel/ai/primitives.js").traceId>,
        success: true,
        ops: [],
        annotationMigrations: [
          {
            annotationId: annotationId("a1"),
            oldAnchor: { blockId: "b1", offset: 0, bias: "right" as const },
            newAnchor: { blockId: "b2", offset: 0, bias: "right" as const },
            confidence: 0.5,
            method: "fuzzy" as const,
          },
        ],
        blockMapping: {
          mapOldToNew: () => null,
          derivedBlocksFrom: () => [],
        },
        affectedBlockIds: [],
        diagnostics: [],
        timingMs: 0,
      };

      const validation = validateLiquidPlan(result);

      // Fuzzy migrations are now warnings, critical confidence (<0.5) are errors
      expect(validation.warnings.some((w) => w.code === "FUZZY_MIGRATIONS")).toBe(true);
    });

    it("reports critical confidence migrations as errors", () => {
      const result: LiquidRefactoringResult = {
        traceId: "test-trace" as ReturnType<typeof import("../kernel/ai/primitives.js").traceId>,
        success: true,
        ops: [],
        annotationMigrations: [
          {
            annotationId: annotationId("a1"),
            oldAnchor: { blockId: "b1", offset: 0, bias: "right" as const },
            newAnchor: { blockId: "b1", offset: 0, bias: "right" as const },
            confidence: 0.3, // Below LOW threshold (0.5)
            method: "mapped" as const,
          },
        ],
        blockMapping: {
          mapOldToNew: () => null,
          derivedBlocksFrom: () => [],
        },
        affectedBlockIds: [],
        diagnostics: [],
        timingMs: 0,
      };

      const validation = validateLiquidPlan(result);

      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.code === "CRITICAL_CONFIDENCE_MIGRATIONS")).toBe(true);
    });
  });

  describe("applyLiquidRefactoring", () => {
    it("applies operations in order with progress", async () => {
      const ops: LiquidOp[] = [
        {
          id: "op1" as ReturnType<typeof import("../kernel/ai/primitives.js").opId>,
          opCode: "OP_BLOCK_CONVERT",
          blockId: blockId("b1"),
          targetType: "heading",
          timestamp: 1,
        },
        {
          id: "op2" as ReturnType<typeof import("../kernel/ai/primitives.js").opId>,
          opCode: "OP_REORDER",
          blockId: blockId("b1"),
          newIndex: 0,
          timestamp: 2,
        },
      ];

      const migrations: AnnotationMigration[] = [
        {
          annotationId: annotationId("a1"),
          oldAnchor: { blockId: "b1", offset: 0, bias: "right" as const },
          newAnchor: { blockId: "b1", offset: 0, bias: "right" as const },
          confidence: 1.0,
          method: "exact",
        },
      ];

      const result: LiquidRefactoringResult = {
        traceId: "test-trace" as ReturnType<typeof import("../kernel/ai/primitives.js").traceId>,
        success: true,
        ops,
        annotationMigrations: migrations,
        blockMapping: { mapOldToNew: () => null, derivedBlocksFrom: () => [] },
        affectedBlockIds: [blockId("b1")],
        diagnostics: [],
        timingMs: 0,
      };

      const progressCalls: Array<{ progress: number; message: string }> = [];

      const applyResult = await applyLiquidRefactoring(result, {
        applyOp: vi.fn().mockResolvedValue(true),
        migrateAnnotation: vi.fn().mockResolvedValue(true),
        onProgress: (progress, message) => progressCalls.push({ progress, message }),
      });

      expect(applyResult.success).toBe(true);
      expect(applyResult.failedOps).toHaveLength(0);
      expect(applyResult.failedMigrations).toHaveLength(0);
      expect(progressCalls.length).toBe(3); // 2 ops + 1 migration
    });

    it("tracks failed operations", async () => {
      const result: LiquidRefactoringResult = {
        traceId: "test-trace" as ReturnType<typeof import("../kernel/ai/primitives.js").traceId>,
        success: true,
        ops: [
          {
            id: "op1" as ReturnType<typeof import("../kernel/ai/primitives.js").opId>,
            opCode: "OP_BLOCK_CONVERT" as const,
            blockId: blockId("b1"),
            timestamp: 1,
          },
        ],
        annotationMigrations: [],
        blockMapping: { mapOldToNew: () => null, derivedBlocksFrom: () => [] },
        affectedBlockIds: [],
        diagnostics: [],
        timingMs: 0,
      };

      const applyResult = await applyLiquidRefactoring(result, {
        applyOp: vi.fn().mockResolvedValue(false),
        migrateAnnotation: vi.fn().mockResolvedValue(true),
      });

      expect(applyResult.success).toBe(false);
      expect(applyResult.failedOps).toHaveLength(1);
    });
  });
});

// ============================================
// Ghost Collaborator Tests
// ============================================

describe("Ghost Collaborator", () => {
  describe("createGhostPeer", () => {
    it("creates peer with unique ID", () => {
      const peer1 = createGhostPeer({});
      const peer2 = createGhostPeer({});

      expect(String(peer1.peerId)).toMatch(/^ai-ghost-/);
      expect(String(peer2.peerId)).toMatch(/^ai-ghost-/);
      expect(peer1.peerId).not.toBe(peer2.peerId);
    });

    it("uses custom display name and model", () => {
      const peer = createGhostPeer({
        displayName: "Writing Assistant",
        model: "claude-3-haiku",
      });

      expect(peer.displayName).toBe("Writing Assistant");
      expect(peer.model).toBe("claude-3-haiku");
    });

    it("defaults to inactive state", () => {
      const peer = createGhostPeer({});

      expect(peer.isActive).toBe(false);
    });
  });

  describe("createGhostSession", () => {
    it("creates session with active peer", () => {
      const peer = createGhostPeer({});
      const frontier = "frontier-1";

      const session = createGhostSession(peer, frontier, "Write conclusion");

      expect(session.peer.isActive).toBe(true);
      expect(session.peer.currentTask).toBe("Write conclusion");
      expect(session.startFrontier).toEqual(frontier);
      expect(session.appliedOps).toHaveLength(0);
      expect(session.isPaused).toBe(false);
    });
  });

  describe("GhostCollaborator", () => {
    let collaborator: GhostCollaborator;
    let peer: ReturnType<typeof createGhostPeer>;
    const mockCallbacks = {
      onCursorMove: vi.fn(),
      onStreamStart: vi.fn(),
      onStreamChunk: vi.fn(),
      onStreamEnd: vi.fn(),
      onConflict: vi.fn(),
      onPause: vi.fn(),
      onResume: vi.fn(),
    };

    beforeEach(() => {
      vi.clearAllMocks();
      peer = createGhostPeer({ displayName: "Test AI" });
      collaborator = new GhostCollaborator(peer, mockCallbacks);
    });

    it("starts and ends sessions", () => {
      const frontier = "test-frontier";

      const session = collaborator.startSession(frontier, "Test task");
      expect(session).toBeDefined();

      const sessionOption = collaborator.getSession();
      expect(sessionOption.some).toBe(true);
      if (sessionOption.some) {
        expect(sessionOption.value.sessionId).toBe(session.sessionId);
      }

      const ops = collaborator.endSession();
      expect(ops).toHaveLength(0);
      expect(collaborator.getSession().some).toBe(false);
    });

    it("moves cursor and triggers callback", () => {
      collaborator.startSession("test-frontier", "Task");

      const result = collaborator.moveCursor(blockId("block-1"), 10);

      expect(result.ok).toBe(true);
      expect(mockCallbacks.onCursorMove).toHaveBeenCalled();
    });

    it("streams text chunks and records ops", () => {
      collaborator.startSession("test-frontier", "Task");

      const startResult = collaborator.startStreaming(blockId("block-1"), 0, "Preview");
      expect(startResult.ok).toBe(true);
      expect(mockCallbacks.onStreamStart).toHaveBeenCalled();

      const op1Result = collaborator.streamChunk(blockId("block-1"), "Hello ", 0.5);
      expect(op1Result.ok).toBe(true);
      if (op1Result.ok) {
        expect(op1Result.value.type).toBe("insert");
        expect(op1Result.value.text).toBe("Hello ");
      }
      expect(mockCallbacks.onStreamChunk).toHaveBeenCalled();

      const op2Result = collaborator.streamChunk(blockId("block-1"), "World", 1.0);
      expect(op2Result.ok).toBe(true);
      if (op1Result.ok && op2Result.ok) {
        expect(op2Result.value.opId).not.toBe(op1Result.value.opId);
      }

      collaborator.endStreaming(blockId("block-1"));
      expect(mockCallbacks.onStreamEnd).toHaveBeenCalled();

      const session = collaborator.getSession();
      expect(session.some).toBe(true);
      if (session.some) {
        expect(session.value.appliedOps).toHaveLength(2);
      }
    });

    it("detects conflicts on same block", () => {
      collaborator.startSession("test-frontier", "Task");

      const opResult = collaborator.streamChunk(blockId("block-1"), "AI text", 1.0);
      expect(opResult.ok).toBe(true);
      if (!opResult.ok) {
        return;
      }

      const conflict = collaborator.detectConflict(opResult.value, {
        blockId: blockId("block-1"),
        timestamp: Date.now(),
        type: "insert",
      });

      expect(conflict.some).toBe(true);
      if (conflict.some) {
        expect(conflict.value.resolution).toBe("merge");
      }
      expect(mockCallbacks.onConflict).toHaveBeenCalled();
    });

    it("returns None for non-conflicting ops", () => {
      collaborator.startSession("test-frontier", "Task");

      const opResult = collaborator.streamChunk(blockId("block-1"), "AI text", 1.0);
      expect(opResult.ok).toBe(true);
      if (!opResult.ok) {
        return;
      }

      const conflict = collaborator.detectConflict(opResult.value, {
        blockId: blockId("block-2"), // Different block
        timestamp: Date.now(),
        type: "insert",
      });

      expect(conflict.some).toBe(false);
    });

    it("pauses on structural conflicts", () => {
      collaborator.startSession("test-frontier", "Task");

      const opResult = collaborator.streamChunk(blockId("block-1"), "AI text", 1.0);
      expect(opResult.ok).toBe(true);
      if (!opResult.ok) {
        return;
      }

      const conflict = collaborator.detectConflict(opResult.value, {
        blockId: blockId("block-1"),
        timestamp: Date.now(),
        type: "convert",
      });

      expect(conflict.some).toBe(true);
      if (conflict.some) {
        expect(conflict.value.resolution).toBe("recontextualize");
      }
    });

    it("handles pause and resume", () => {
      collaborator.startSession("test-frontier", "Task");

      collaborator.pause("User editing same block");
      const pausedSession = collaborator.getSession();
      expect(pausedSession.some).toBe(true);
      if (pausedSession.some) {
        expect(pausedSession.value.isPaused).toBe(true);
      }
      expect(mockCallbacks.onPause).toHaveBeenCalledWith("User editing same block");

      collaborator.resume();
      const resumedSession = collaborator.getSession();
      expect(resumedSession.some).toBe(true);
      if (resumedSession.some) {
        expect(resumedSession.value.isPaused).toBe(false);
      }
      expect(mockCallbacks.onResume).toHaveBeenCalled();
    });

    it("creates valid envelope for ops", () => {
      const frontier = "frontier-5";
      collaborator.startSession(frontier, "Task");

      const opResult = collaborator.streamChunk(blockId("block-1"), "Test", 1.0);
      expect(opResult.ok).toBe(true);
      if (!opResult.ok) {
        return;
      }

      const envelopeResult = collaborator.createEnvelope([opResult.value]);

      expect(envelopeResult.ok).toBe(true);
      if (envelopeResult.ok) {
        expect(envelopeResult.value.doc_frontier).toEqual(frontier);
        expect(envelopeResult.value.ops_xml).toContain("ghost_ops");
        expect(envelopeResult.value.ops_xml).toContain(String(peer.peerId));
        expect(envelopeResult.value.ops_xml).toContain('type="insert"');
      }
    });
  });

  describe("createGhostPresence", () => {
    it("creates presence for UI rendering", () => {
      const peer = createGhostPeer({});
      const session = createGhostSession(peer, "test-frontier");
      const cursor: GhostCursor = {
        peerId: peer.peerId,
        blockId: blockId("b1"),
        offset: 5,
      };

      const presence = createGhostPresence(session, cursor);

      expect(presence.peer.isActive).toBe(true);
      expect(presence.cursor).toEqual(cursor);
    });
  });
});

// ============================================
// Semantic Time Travel Tests
// ============================================

describe("Semantic Time Travel", () => {
  // Mock data for tests
  const createMockHistoryState = (): HistoryState => ({
    undoStack: [
      {
        timestamp: 1000,
        blocks: new Map([
          ["block-1", { type: "paragraph", text: "Hello world" }],
          ["block-2", { type: "paragraph", text: "Original content about pricing" }],
        ]),
        blockOrder: ["block-1", "block-2"],
      },
      {
        timestamp: 2000,
        blocks: new Map([
          ["block-1", { type: "heading", text: "Hello World Title" }],
          ["block-2", { type: "paragraph", text: "Updated content about pricing strategy" }],
        ]),
        blockOrder: ["block-1", "block-2"],
      },
    ],
    redoStack: [],
  });

  const createMockCurrentDoc = (): ShadowDocument => ({
    block_order: ["block-1", "block-2"],
    blocks: new Map([
      ["block-1", { type: "heading", text: "Hello World Title" }],
      ["block-2", { type: "paragraph", text: "Final content about pricing" }],
    ]),
  });

  describe("createSemanticTimeTravel", () => {
    it("creates and indexes time travel instance", () => {
      const timeTravel = createSemanticTimeTravel(createMockHistoryState, createMockCurrentDoc);

      expect(timeTravel).toBeInstanceOf(SemanticTimeTravel);
      expect(timeTravel.isReady()).toBe(true);
    });
  });

  describe("query", () => {
    it("finds content by keyword search", () => {
      const timeTravel = createSemanticTimeTravel(createMockHistoryState, createMockCurrentDoc);

      const result = timeTravel.query({ query: "pricing strategy" });

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }

      expect(result.value.results.length).toBeGreaterThan(0);
      expect(result.value.results[0].text).toContain("pricing");
    });

    it("respects author filter", () => {
      const historyWithAuthors: HistoryState = {
        undoStack: [
          {
            timestamp: 1000,
            blocks: new Map([["block-1", { type: "paragraph", text: "Bob wrote about pricing" }]]),
            blockOrder: ["block-1"],
          },
        ],
        redoStack: [],
      };

      const timeTravel = createSemanticTimeTravel(() => historyWithAuthors, createMockCurrentDoc);

      const result = timeTravel.query({
        query: "pricing",
        authorId: "nonexistent-author",
      });

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }

      // Should find no results since author filter doesn't match
      expect(result.value.results.length).toBe(0);
    });

    it("respects time range filter", () => {
      const timeTravel = createSemanticTimeTravel(createMockHistoryState, createMockCurrentDoc);

      const result = timeTravel.query({
        query: "pricing",
        timeRange: { from: 1500, to: 2500 },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }

      // Should only find entry at timestamp 2000
      for (const r of result.value.results) {
        expect(r.timestamp).toBeGreaterThanOrEqual(1500);
        expect(r.timestamp).toBeLessThanOrEqual(2500);
      }
    });

    it("respects block type filter", () => {
      const timeTravel = createSemanticTimeTravel(createMockHistoryState, createMockCurrentDoc);

      const result = timeTravel.query({
        query: "Hello",
        blockTypes: ["heading"],
      });

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }

      for (const r of result.value.results) {
        expect(r.blockType).toBe("heading");
      }
    });

    it("limits results", () => {
      const timeTravel = createSemanticTimeTravel(createMockHistoryState, createMockCurrentDoc);

      const result = timeTravel.query({
        query: "content",
        limit: 1,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }

      expect(result.value.results.length).toBeLessThanOrEqual(1);
    });

    it("sorts results by relevance", () => {
      const timeTravel = createSemanticTimeTravel(createMockHistoryState, createMockCurrentDoc);

      const result = timeTravel.query({ query: "pricing strategy content" });

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }

      // Results should be sorted by relevance score descending
      for (let i = 1; i < result.value.results.length; i++) {
        const prevScore = result.value.results[i - 1].relevanceScore ?? 0;
        const currScore = result.value.results[i].relevanceScore ?? 0;
        expect(prevScore).toBeGreaterThanOrEqual(currScore);
      }
    });
  });

  describe("getShadowView", () => {
    it("returns evolution of a block", () => {
      const timeTravel = createSemanticTimeTravel(createMockHistoryState, createMockCurrentDoc);

      const config = createShadowViewConfig({ blockId: "block-1" });
      const result = timeTravel.getShadowView(config);

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }

      expect(String(result.value.blockId)).toBe("block-1");
      expect(result.value.snapshots.length).toBeGreaterThan(0);
      expect(result.value.isCurrentlyDeleted).toBe(false);
    });

    it("includes timespan information", () => {
      const timeTravel = createSemanticTimeTravel(createMockHistoryState, createMockCurrentDoc);

      const config = createShadowViewConfig({ blockId: "block-1" });
      const result = timeTravel.getShadowView(config);

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }

      expect(result.value.timespan.first).toBeLessThanOrEqual(result.value.timespan.last);
    });

    it("filters by time range", () => {
      const timeTravel = createSemanticTimeTravel(createMockHistoryState, createMockCurrentDoc);

      const config = createShadowViewConfig({
        blockId: "block-1",
        timeRange: { from: 1500, to: 2500 },
      });
      const result = timeTravel.getShadowView(config);

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }

      for (const snapshot of result.value.snapshots) {
        expect(snapshot.timestamp).toBeGreaterThanOrEqual(1500);
        expect(snapshot.timestamp).toBeLessThanOrEqual(2500);
      }
    });

    it("limits snapshots with even sampling", () => {
      // Create history with many entries
      const manyEntriesHistory: HistoryState = {
        undoStack: Array.from({ length: 20 }, (_, i) => ({
          timestamp: 1000 + i * 100,
          blocks: new Map([["block-1", { type: "paragraph", text: `Version ${i}` }]]),
          blockOrder: ["block-1"],
        })),
        redoStack: [],
      };

      const timeTravel = createSemanticTimeTravel(() => manyEntriesHistory, createMockCurrentDoc);

      const config = createShadowViewConfig({
        blockId: "block-1",
        maxSnapshots: 5,
      });
      const result = timeTravel.getShadowView(config);

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }

      expect(result.value.snapshots.length).toBeLessThanOrEqual(5);
    });

    it("shows current content for existing blocks", () => {
      const timeTravel = createSemanticTimeTravel(createMockHistoryState, createMockCurrentDoc);

      const config = createShadowViewConfig({ blockId: "block-1" });
      const result = timeTravel.getShadowView(config);

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }

      expect(result.value.currentContent).toBe("Hello World Title");
    });
  });

  describe("getSnapshot", () => {
    it("finds snapshot by ID", () => {
      const timeTravel = createSemanticTimeTravel(createMockHistoryState, createMockCurrentDoc);

      const queryResult = timeTravel.query({ query: "pricing" });
      expect(queryResult.ok).toBe(true);
      if (!queryResult.ok) {
        return;
      }

      if (queryResult.value.results.length > 0) {
        const targetSnapshotId = queryResult.value.results[0].snapshotId;
        const snapshot = timeTravel.getSnapshot(targetSnapshotId);

        expect(snapshot.some).toBe(true);
        if (snapshot.some) {
          expect(snapshot.value.snapshotId).toBe(targetSnapshotId);
        }
      }
    });

    it("returns None for non-existent snapshot", () => {
      const timeTravel = createSemanticTimeTravel(createMockHistoryState, createMockCurrentDoc);

      const snapshot = timeTravel.getSnapshot(snapshotId("non-existent-id"));

      expect(snapshot.some).toBe(false);
    });
  });

  describe("planResurrection", () => {
    it("plans resurrection of historical content", () => {
      const timeTravel = createSemanticTimeTravel(createMockHistoryState, createMockCurrentDoc);

      const queryResult = timeTravel.query({ query: "Original content" });
      expect(queryResult.ok).toBe(true);
      if (!queryResult.ok) {
        return;
      }

      if (queryResult.value.results.length > 0) {
        const request = createResurrectionRequest({
          snapshotId: String(queryResult.value.results[0].snapshotId),
          targetBlockId: "block-2",
          position: "after",
        });
        const result = timeTravel.planResurrection(request);

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.success).toBe(true);
          expect(result.value.content).toContain("Original");
        }
      }
    });

    it("returns error for non-existent snapshot", () => {
      const timeTravel = createSemanticTimeTravel(createMockHistoryState, createMockCurrentDoc);

      const request = createResurrectionRequest({
        snapshotId: "non-existent",
        targetBlockId: "block-1",
        position: "after",
      });
      const result = timeTravel.planResurrection(request);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("SNAPSHOT_NOT_FOUND");
      }
    });
  });

  describe("getDeletedBlocks", () => {
    it("finds blocks that no longer exist", () => {
      const historyWithDeleted: HistoryState = {
        undoStack: [
          {
            timestamp: 1000,
            blocks: new Map([
              ["block-1", { type: "paragraph", text: "Still exists" }],
              ["block-deleted", { type: "paragraph", text: "This was deleted" }],
            ]),
            blockOrder: ["block-1", "block-deleted"],
          },
        ],
        redoStack: [],
      };

      const currentDocWithoutBlock: ShadowDocument = {
        block_order: ["block-1"],
        blocks: new Map([["block-1", { type: "paragraph", text: "Still exists" }]]),
      };

      const timeTravel = createSemanticTimeTravel(
        () => historyWithDeleted,
        () => currentDocWithoutBlock
      );

      const deleted = timeTravel.getDeletedBlocks();

      expect(deleted.length).toBe(1);
      expect(String(deleted[0].blockId)).toBe("block-deleted");
      expect(deleted[0].isDeleted).toBe(true);
    });
  });

  describe("findSimilarContent", () => {
    it("finds semantically similar content", () => {
      const timeTravel = createSemanticTimeTravel(createMockHistoryState, createMockCurrentDoc);

      const similar = timeTravel.findSimilarContent("pricing information");

      expect(similar.length).toBeGreaterThan(0);
      // Results should have relevance scores
      for (const s of similar) {
        expect(s.relevanceScore).toBeGreaterThan(0);
      }
    });

    it("limits results", () => {
      const timeTravel = createSemanticTimeTravel(createMockHistoryState, createMockCurrentDoc);

      const similar = timeTravel.findSimilarContent("content", 2);

      expect(similar.length).toBeLessThanOrEqual(2);
    });

    it("sorts by similarity score", () => {
      const timeTravel = createSemanticTimeTravel(createMockHistoryState, createMockCurrentDoc);

      const similar = timeTravel.findSimilarContent("pricing strategy content");

      for (let i = 1; i < similar.length; i++) {
        const prevScore = similar[i - 1].relevanceScore ?? 0;
        const currScore = similar[i].relevanceScore ?? 0;
        expect(prevScore).toBeGreaterThanOrEqual(currScore);
      }
    });
  });
});
