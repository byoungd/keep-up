/**
 * LFCC v0.9 RC - Shadow Model Tests
 */

import { describe, expect, it } from "vitest";
import { DEFAULT_POLICY_MANIFEST } from "../policy/index.js";
import {
  type EditorEvent,
  type TypedOp,
  addBlock,
  applyOp,
  classifyEvent,
  createHistoryState,
  createShadowDocument,
  getBlock,
  isStructuralOp,
  processHistoryRestore,
  pushHistory,
  redo,
  undo,
} from "../shadow/index.js";

describe("Shadow Model", () => {
  describe("createShadowDocument", () => {
    it("should create empty document with root", () => {
      const doc = createShadowDocument();
      expect(doc.root_id).toBeTruthy();
      expect(doc.blocks.size).toBe(1);
      expect(doc.block_order).toEqual([]);
    });
  });

  describe("addBlock", () => {
    it("should add block to document", () => {
      const doc = createShadowDocument();
      const { doc: newDoc, blockId } = addBlock(
        doc,
        { type: "paragraph", attrs: {}, text: "Hello", parent_id: null, children_ids: [] },
        doc.root_id
      );

      expect(newDoc.blocks.size).toBe(2);
      expect(newDoc.block_order).toContain(blockId);

      const block = getBlock(newDoc, blockId);
      expect(block?.text).toBe("Hello");
      expect(block?.type).toBe("paragraph");
    });
  });

  describe("applyOp - TEXT_EDIT", () => {
    it("should apply text insertion", () => {
      const doc = createShadowDocument();
      const { doc: doc2, blockId } = addBlock(
        doc,
        { type: "paragraph", attrs: {}, text: "Hello", parent_id: null, children_ids: [] },
        doc.root_id
      );

      const op: TypedOp = {
        code: "OP_TEXT_EDIT",
        block_id: blockId,
        offset: 5,
        delete_count: 0,
        insert: " World",
      };

      const { doc: doc3, result, dirty } = applyOp(doc2, op);

      const block = getBlock(doc3, blockId);
      expect(block?.text).toBe("Hello World");
      expect(dirty.touchedBlocks).toContain(blockId);
      expect(result.block_id_decisions[0].decision).toBe("KEEP_ID");
    });

    it("should apply text deletion", () => {
      const doc = createShadowDocument();
      const { doc: doc2, blockId } = addBlock(
        doc,
        { type: "paragraph", attrs: {}, text: "Hello World", parent_id: null, children_ids: [] },
        doc.root_id
      );

      const op: TypedOp = {
        code: "OP_TEXT_EDIT",
        block_id: blockId,
        offset: 5,
        delete_count: 6,
        insert: "",
      };

      const { doc: doc3 } = applyOp(doc2, op);

      const block = getBlock(doc3, blockId);
      expect(block?.text).toBe("Hello");
    });
  });

  describe("applyOp - BLOCK_SPLIT", () => {
    it("should split block at offset", () => {
      const doc = createShadowDocument();
      const { doc: doc2, blockId } = addBlock(
        doc,
        { type: "paragraph", attrs: {}, text: "HelloWorld", parent_id: null, children_ids: [] },
        doc.root_id
      );

      const op: TypedOp = {
        code: "OP_BLOCK_SPLIT",
        block_id: blockId,
        offset: 5,
      };

      const { doc: doc3, result, mapping } = applyOp(doc2, op);

      // Left block keeps ID
      const leftBlock = getBlock(doc3, blockId);
      expect(leftBlock?.text).toBe("Hello");

      // Right block has new ID
      expect(result.new_blocks).toHaveLength(1);
      const rightBlock = result.new_blocks[0];
      expect(rightBlock.text).toBe("World");

      // Block order updated
      expect(doc3.block_order).toHaveLength(2);

      // Mapping works
      const mapped = mapping.mapOldToNew(blockId, 3);
      expect(mapped?.newBlockId).toBe(blockId);
      expect(mapped?.newAbsInBlock).toBe(3);

      const mappedRight = mapping.mapOldToNew(blockId, 7);
      expect(mappedRight?.newBlockId).toBe(rightBlock.id);
      expect(mappedRight?.newAbsInBlock).toBe(2);
    });

    it("should reject split in the middle of a surrogate pair", () => {
      const doc = createShadowDocument();
      const { doc: doc2, blockId } = addBlock(
        doc,
        { type: "paragraph", attrs: {}, text: "A😊B", parent_id: null, children_ids: [] },
        doc.root_id
      );

      // "😊" occupies indices 1 (high) and 2 (low) in UTF-16. Splitting at 2 is mid-pair.
      const op: TypedOp = {
        code: "OP_BLOCK_SPLIT",
        block_id: blockId,
        offset: 2,
      };

      const { doc: doc3, result, dirty, mapping } = applyOp(doc2, op);

      // No change should occur
      const block = getBlock(doc3, blockId);
      expect(block?.text).toBe("A😊B");
      expect(result.block_id_decisions).toHaveLength(0);
      expect(dirty.touchedBlocks).toHaveLength(0);
      // Mapping should be empty (no transforms)
      expect(mapping.derivedBlocksFrom(blockId)).toEqual([]);
    });
  });

  describe("applyOp - BLOCK_JOIN", () => {
    it("should join two blocks", () => {
      const doc = createShadowDocument();
      const { doc: doc2, blockId: leftId } = addBlock(
        doc,
        { type: "paragraph", attrs: {}, text: "Hello", parent_id: null, children_ids: [] },
        doc.root_id
      );
      const { doc: doc3, blockId: rightId } = addBlock(
        doc2,
        { type: "paragraph", attrs: {}, text: " World", parent_id: null, children_ids: [] },
        doc2.root_id
      );

      const op: TypedOp = {
        code: "OP_BLOCK_JOIN",
        left_block_id: leftId,
        right_block_id: rightId,
      };

      const { doc: doc4, result } = applyOp(doc3, op);

      // Left block has joined content
      const leftBlock = getBlock(doc4, leftId);
      expect(leftBlock?.text).toBe("Hello World");

      // Right block is retired
      expect(getBlock(doc4, rightId)).toBeUndefined();
      expect(result.retired_blocks).toContain(rightId);

      // Block order updated
      expect(doc4.block_order).toHaveLength(1);
      expect(doc4.block_order[0]).toBe(leftId);
    });
  });
});

describe("Operation Classifier", () => {
  describe("classifyEvent", () => {
    it("should classify text events", () => {
      const event: EditorEvent = { type: "text_insert", block_id: "b1", offset: 0, text: "Hi" };
      expect(classifyEvent(event)).toEqual(["OP_TEXT_EDIT"]);
    });

    it("should classify enter key as split", () => {
      const event: EditorEvent = { type: "enter_key", block_id: "b1", offset: 5 };
      expect(classifyEvent(event)).toEqual(["OP_BLOCK_SPLIT"]);
    });

    it("should classify backspace at start as join", () => {
      const event: EditorEvent = { type: "backspace_at_start", block_id: "b1" };
      expect(classifyEvent(event)).toEqual(["OP_BLOCK_JOIN"]);
    });

    it("should classify undo as history restore", () => {
      const event: EditorEvent = { type: "undo" };
      expect(classifyEvent(event)).toContain("OP_HISTORY_RESTORE");
    });
  });

  describe("isStructuralOp", () => {
    it("should identify structural operations", () => {
      expect(isStructuralOp("OP_BLOCK_SPLIT")).toBe(true);
      expect(isStructuralOp("OP_BLOCK_JOIN")).toBe(true);
      expect(isStructuralOp("OP_TEXT_EDIT")).toBe(false);
      expect(isStructuralOp("OP_MARK_EDIT")).toBe(false);
    });
  });
});

describe("History Integration", () => {
  describe("pushHistory and undo", () => {
    it("should push and undo history", () => {
      const doc = createShadowDocument();
      let state = createHistoryState();

      // Push initial state
      state = pushHistory(state, doc, ["anno1"]);
      expect(state.undoStack).toHaveLength(1);

      // Modify doc
      const { doc: doc2 } = addBlock(
        doc,
        { type: "paragraph", attrs: {}, text: "New", parent_id: null, children_ids: [] },
        doc.root_id
      );

      // Undo
      const { state: state2, entry } = undo(state, doc2, ["anno1", "anno2"]);

      expect(entry).not.toBeNull();
      expect(state2.undoStack).toHaveLength(0);
      expect(state2.redoStack).toHaveLength(1);
    });

    it("should redo after undo", () => {
      const doc = createShadowDocument();
      let state = createHistoryState();

      state = pushHistory(state, doc, []);

      const { doc: doc2 } = addBlock(
        doc,
        { type: "paragraph", attrs: {}, text: "New", parent_id: null, children_ids: [] },
        doc.root_id
      );

      const { state: state2 } = undo(state, doc2, []);
      const { state: state3, entry } = redo(state2, doc, []);

      expect(entry).not.toBeNull();
      expect(state3.redoStack).toHaveLength(0);
      // After undo (1 entry) + redo pushes current to undo = 1 entry
      expect(state3.undoStack).toHaveLength(1);
    });
  });

  describe("processHistoryRestore", () => {
    it("should identify restored annotations", () => {
      const entry = {
        timestamp: Date.now(),
        blocks: new Map(),
        block_order: ["b1", "b2"],
        annotation_ids: ["anno1", "anno2", "anno3"],
      };

      const result = processHistoryRestore(
        entry,
        ["anno1"], // Only anno1 currently exists
        DEFAULT_POLICY_MANIFEST.history_policy
      );

      expect(result.restored_annotation_ids).toEqual(["anno2", "anno3"]);
      expect(result.should_verify).toBe(true);
      expect(result.skip_grace).toBe(true);
    });
  });
});
