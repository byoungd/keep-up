/**
 * DocumentFacade Unit Tests
 *
 * Tests for the single-authority document access layer.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createEmptyDoc } from "../../crdt/crdtSchema";
import { type LoroRuntime, createLoroRuntime } from "../../runtime/loroRuntime";
import { LoroDocumentFacade, createDocumentFacade } from "../documentFacade";
import type { FacadeChangeEvent } from "../types";

describe("DocumentFacade", () => {
  let runtime: LoroRuntime;
  let facade: LoroDocumentFacade;

  beforeEach(() => {
    runtime = createLoroRuntime({ docId: "test-doc" });
    createEmptyDoc(runtime.doc);
    runtime.commit("test-setup");
    facade = new LoroDocumentFacade(runtime);
  });

  describe("getBlocks", () => {
    it("returns empty array for new document", () => {
      const newRuntime = createLoroRuntime({ docId: "empty-doc" });
      const newFacade = createDocumentFacade(newRuntime);
      const blocks = newFacade.getBlocks();
      expect(blocks).toEqual([]);
    });

    it("returns blocks after initialization", () => {
      const blocks = facade.getBlocks();
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe("paragraph");
    });
  });

  describe("getBlock", () => {
    it("returns block by ID", () => {
      const blocks = facade.getBlocks();
      const blockId = blocks[0].id;
      const block = facade.getBlock(blockId);
      expect(block).toBeDefined();
      expect(block?.id).toBe(blockId);
    });

    it("returns undefined for non-existent block", () => {
      const block = facade.getBlock("non-existent");
      expect(block).toBeUndefined();
    });
  });

  describe("insertBlock", () => {
    it("inserts block at root level", () => {
      const blockId = facade.insertBlock({
        parentId: null,
        index: 0,
        type: "heading",
        text: "Test Heading",
      });

      expect(blockId).toBeDefined();
      const blocks = facade.getBlocks();
      expect(blocks[0].type).toBe("heading");
      expect(blocks[0].text).toBe("Test Heading");
    });

    it("inserts block at specific index", () => {
      // Insert at end
      facade.insertBlock({
        parentId: null,
        index: 1,
        type: "paragraph",
        text: "Second",
      });

      const blocks = facade.getBlocks();
      expect(blocks).toHaveLength(2);
      expect(blocks[1].text).toBe("Second");
    });
  });

  describe("updateBlockContent", () => {
    it("updates block text", () => {
      const blocks = facade.getBlocks();
      const blockId = blocks[0].id;

      facade.updateBlockContent({
        blockId,
        text: "Updated content",
      });

      const updated = facade.getBlock(blockId);
      expect(updated?.text).toBe("Updated content");
    });

    it("updates with text delta", () => {
      const blocks = facade.getBlocks();
      const blockId = blocks[0].id;

      // First set some content
      facade.updateBlockContent({
        blockId,
        text: "Hello World",
      });

      // Then update with delta
      facade.updateBlockContent({
        blockId,
        text: "Hello Updated World",
        textDelta: {
          start: 6,
          deleteCount: 5,
          insertText: "Updated",
        },
      });

      const updated = facade.getBlock(blockId);
      expect(updated?.text).toContain("Updated");
    });
  });

  describe("updateBlockAttrs", () => {
    it("merges attributes", () => {
      const blocks = facade.getBlocks();
      const blockId = blocks[0].id;

      facade.updateBlockAttrs({
        blockId,
        attrs: { level: 1 },
      });

      const attrs = facade.getBlockAttrs(blockId);
      expect(attrs.level).toBe(1);
    });
  });

  describe("deleteBlock", () => {
    it("removes block from document", () => {
      // First insert a block
      const blockId = facade.insertBlock({
        parentId: null,
        index: 1,
        type: "paragraph",
        text: "To be deleted",
      });

      expect(facade.getBlocks()).toHaveLength(2);

      // Delete it
      facade.deleteBlock({ blockId });

      expect(facade.getBlocks()).toHaveLength(1);
      expect(facade.getBlock(blockId)).toBeUndefined();
    });
  });

  describe("subscribe", () => {
    it("emits change events on mutations", () => {
      const events: FacadeChangeEvent[] = [];
      const unsubscribe = facade.subscribe((event) => {
        events.push(event);
      });

      facade.insertBlock({
        parentId: null,
        index: 0,
        type: "heading",
        text: "Test",
      });

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("block_inserted");
      expect(events[0].source).toBe("local");

      unsubscribe();
    });

    it("unsubscribe stops events", () => {
      const events: FacadeChangeEvent[] = [];
      const unsubscribe = facade.subscribe((event) => {
        events.push(event);
      });

      unsubscribe();

      facade.insertBlock({
        parentId: null,
        index: 0,
        type: "heading",
        text: "Test",
      });

      expect(events).toHaveLength(0);
    });
  });

  describe("applyAIPlan", () => {
    it("throws if requestId is missing", async () => {
      await expect(
        facade.applyAIPlan(
          { operations: [], affected_block_ids: [], estimated_size_bytes: 0 },
          { requestId: "", agentId: "test-agent" }
        )
      ).rejects.toThrow("requestId");
    });

    it("throws if agentId is missing", async () => {
      await expect(
        facade.applyAIPlan(
          { operations: [], affected_block_ids: [], estimated_size_bytes: 0 },
          { requestId: "req-123", agentId: "" }
        )
      ).rejects.toThrow("agentId");
    });

    it("emits event with AI source", async () => {
      const events: FacadeChangeEvent[] = [];
      facade.subscribe((event) => events.push(event));

      await facade.applyAIPlan(
        { operations: [], affected_block_ids: ["b1"], estimated_size_bytes: 0 },
        { requestId: "req-123", agentId: "test-agent" }
      );

      expect(events).toHaveLength(1);
      expect(events[0].source).toBe("ai");
      expect(events[0].metadata?.requestId).toBe("req-123");
      expect(events[0].metadata?.agentId).toBe("test-agent");
    });
  });

  describe("comments", () => {
    it("adds and retrieves comments", () => {
      const commentId = facade.addComment({
        annotationId: "ann-1",
        text: "Test comment",
        author: "Test User",
      });

      expect(commentId).toBeDefined();

      const comments = facade.getComments("ann-1");
      expect(comments).toHaveLength(1);
      expect(comments[0].text).toBe("Test comment");
      expect(comments[0].author).toBe("Test User");
    });

    it("deletes comments", () => {
      const commentId = facade.addComment({
        annotationId: "ann-1",
        text: "To be deleted",
      });

      facade.deleteComment({
        annotationId: "ann-1",
        commentId,
      });

      const comments = facade.getComments("ann-1");
      expect(comments).toHaveLength(0);
    });

    it("returns empty array for no comments", () => {
      const comments = facade.getComments("non-existent");
      expect(comments).toEqual([]);
    });
  });

  describe("utility", () => {
    it("isDegraded returns runtime state", () => {
      expect(facade.isDegraded()).toBe(false);
      runtime.setDegraded(true);
      expect(facade.isDegraded()).toBe(true);
    });

    it("docId returns runtime docId", () => {
      expect(facade.docId).toBe("test-doc");
    });
  });

  describe("destroy", () => {
    it("clears subscribers", () => {
      const events: FacadeChangeEvent[] = [];
      facade.subscribe((event) => events.push(event));

      facade.destroy();

      facade.insertBlock({
        parentId: null,
        index: 0,
        type: "heading",
        text: "Test",
      });

      expect(events).toHaveLength(0);
    });
  });
});

describe("createDocumentFacade", () => {
  it("creates a facade instance", () => {
    const runtime = createLoroRuntime({ docId: "factory-test" });
    const facade = createDocumentFacade(runtime);
    expect(facade).toBeDefined();
    expect(facade.docId).toBe("factory-test");
  });
});
