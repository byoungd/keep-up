import type { Node as PMNode } from "prosemirror-model";
import { EditorState, TextSelection } from "prosemirror-state";
import { describe, expect, it } from "vitest";

import { absoluteFromAnchor } from "@keepup/core";
import { type BlockNode, serializeAttrs, writeBlockTree } from "../crdt/crdtSchema";
import { pmSchema } from "../pm/pmSchema";
import { createLoroRuntime } from "../runtime/loroRuntime";
import { pmSelectionToSpanList, spanListToPmRanges } from "../selection/selectionMapping";

const createParagraph = (blockId: string, text: string) => {
  const content = text.length > 0 ? pmSchema.text(text) : null;
  return pmSchema.nodes.paragraph.create({ block_id: blockId }, content);
};

const createBlocks = (blocks: Array<{ id: string; text: string }>): BlockNode[] =>
  blocks.map((block) => ({
    id: block.id,
    type: "paragraph",
    attrs: serializeAttrs({}),
    text: block.text,
    children: [],
  }));

const createRuntimeWithBlocks = (blocks: BlockNode[]) => {
  const runtime = createLoroRuntime({ peerId: "1" });
  writeBlockTree(runtime.doc, blocks);
  return runtime;
};

const getBlockContentStarts = (doc: PMNode): Map<string, number> => {
  const starts = new Map<string, number>();
  doc.descendants((node, pos) => {
    const blockId = node.attrs?.block_id;
    if (node.isTextblock && typeof blockId === "string") {
      starts.set(blockId, pos + 1);
    }
  });
  return starts;
};

describe("selection mapping", () => {
  it("maps cross-block selections to a span list", () => {
    const blocks = createBlocks([
      { id: "b1", text: "Hello" },
      { id: "b2", text: "World" },
    ]);
    const runtime = createRuntimeWithBlocks(blocks);

    const p1 = createParagraph("b1", "Hello");
    const p2 = createParagraph("b2", "World");
    const doc = pmSchema.nodes.doc.create(null, [p1, p2]);
    const state = EditorState.create({ schema: pmSchema, doc });

    const from = 1 + 1; // inside first paragraph
    const to = p1.nodeSize + 1 + 2; // inside second paragraph
    const selection = TextSelection.create(doc, from, to);

    const result = pmSelectionToSpanList(selection, state, runtime, { strict: true });
    expect(result.spanList).toHaveLength(2);
    expect(result.spanList[0].blockId).toBe("b1");
    expect(result.spanList[1].blockId).toBe("b2");
    expect(result.chain.order).toEqual(["b1", "b2"]);
    expect(result.verified).toBe(true);
  });

  it("returns chain policy metadata", () => {
    const blocks = createBlocks([
      { id: "b1", text: "Hello" },
      { id: "b2", text: "World" },
    ]);
    const runtime = createRuntimeWithBlocks(blocks);

    const doc = pmSchema.nodes.doc.create(null, [
      createParagraph("b1", "Hello"),
      createParagraph("b2", "World"),
    ]);
    const state = EditorState.create({ schema: pmSchema, doc });
    const selection = TextSelection.create(doc, 2, doc.child(0).nodeSize + 2);

    const chainPolicy = { kind: "strict_adjacency", maxInterveningBlocks: 0 } as const;
    const result = pmSelectionToSpanList(selection, state, runtime, {
      strict: true,
      chainPolicy,
    });

    expect(result.chain.policy).toEqual(chainPolicy);
  });

  it("encodes start/after and end/before anchor biases", () => {
    const blocks = createBlocks([{ id: "b1", text: "Hello" }]);
    const runtime = createRuntimeWithBlocks(blocks);

    const doc = pmSchema.nodes.doc.create(null, [createParagraph("b1", "Hello")]);
    const state = EditorState.create({ schema: pmSchema, doc });
    const selection = TextSelection.create(doc, 2, 4);

    const result = pmSelectionToSpanList(selection, state, runtime, { strict: true });
    const span = result.spanList[0];

    expect(span.startAnchor?.bias).toBe("after");
    expect(span.endAnchor?.bias).toBe("before");

    const startDecoded = span.startAnchor?.anchor
      ? absoluteFromAnchor(span.startAnchor.anchor)
      : null;
    const endDecoded = span.endAnchor?.anchor ? absoluteFromAnchor(span.endAnchor.anchor) : null;

    expect(startDecoded).not.toBeNull();
    expect(endDecoded).not.toBeNull();
    expect(startDecoded?.bias).toBe("after");
    expect(endDecoded?.bias).toBe("before");
  });

  it("throws in strict mode when selection cannot be verified", () => {
    const blocks = createBlocks([{ id: "b1", text: "Hi" }]);
    const runtime = createRuntimeWithBlocks(blocks);

    const doc = pmSchema.nodes.doc.create(null, [createParagraph("b1", "Hello")]);
    const state = EditorState.create({ schema: pmSchema, doc });
    const selection = TextSelection.create(doc, 1, 6);

    expect(() => pmSelectionToSpanList(selection, state, runtime, { strict: true })).toThrow(
      "Selection mapping is not fully verified"
    );
  });

  it("returns unverified spans in non-strict mode", () => {
    const blocks = createBlocks([{ id: "b1", text: "Hi" }]);
    const runtime = createRuntimeWithBlocks(blocks);

    const doc = pmSchema.nodes.doc.create(null, [createParagraph("b1", "Hello")]);
    const state = EditorState.create({ schema: pmSchema, doc });
    const selection = TextSelection.create(doc, 1, 6);

    const result = pmSelectionToSpanList(selection, state, runtime, { strict: false });
    expect(result.verified).toBe(false);
    expect(result.spanList[0].end).toBe(2);
  });

  it("maps three-block selections in order", () => {
    const blocks = createBlocks([
      { id: "b1", text: "One" },
      { id: "b2", text: "Two" },
      { id: "b3", text: "Three" },
    ]);
    const runtime = createRuntimeWithBlocks(blocks);

    const doc = pmSchema.nodes.doc.create(null, [
      createParagraph("b1", "One"),
      createParagraph("b2", "Two"),
      createParagraph("b3", "Three"),
    ]);
    const state = EditorState.create({ schema: pmSchema, doc });
    const starts = getBlockContentStarts(doc);
    const selection = TextSelection.create(
      doc,
      (starts.get("b1") ?? 1) + 1,
      (starts.get("b3") ?? doc.content.size) + 2
    );

    const result = pmSelectionToSpanList(selection, state, runtime, { strict: true });
    expect(result.spanList).toHaveLength(3);
    expect(result.chain.order).toEqual(["b1", "b2", "b3"]);
  });

  it("maps span ranges after reorder", () => {
    const blocks = createBlocks([
      { id: "b1", text: "Hello" },
      { id: "b2", text: "World" },
    ]);
    const runtime = createRuntimeWithBlocks(blocks);

    const p1 = createParagraph("b1", "Hello");
    const p2 = createParagraph("b2", "World");
    const doc = pmSchema.nodes.doc.create(null, [p1, p2]);
    const state = EditorState.create({ schema: pmSchema, doc });

    const selection = TextSelection.create(doc, 1, p1.nodeSize + 1 + 2);
    const result = pmSelectionToSpanList(selection, state, runtime, { strict: true });

    const swappedDoc = pmSchema.nodes.doc.create(null, [p2, p1]);
    const swappedState = EditorState.create({ schema: pmSchema, doc: swappedDoc });
    const ranges = spanListToPmRanges(result.spanList, runtime, swappedState);

    expect(ranges).toHaveLength(2);
    expect(ranges[0].from).toBeGreaterThan(ranges[1].from);
  });

  it("maps span ranges after three-block reorder", () => {
    const blocks = createBlocks([
      { id: "b1", text: "One" },
      { id: "b2", text: "Two" },
      { id: "b3", text: "Three" },
    ]);
    const runtime = createRuntimeWithBlocks(blocks);

    const doc = pmSchema.nodes.doc.create(null, [
      createParagraph("b1", "One"),
      createParagraph("b2", "Two"),
      createParagraph("b3", "Three"),
    ]);
    const state = EditorState.create({ schema: pmSchema, doc });
    const selection = TextSelection.create(doc, 2, doc.content.size - 1);
    const result = pmSelectionToSpanList(selection, state, runtime, { strict: true });

    const reorderedDoc = pmSchema.nodes.doc.create(null, [
      createParagraph("b3", "Three"),
      createParagraph("b1", "One"),
      createParagraph("b2", "Two"),
    ]);
    const reorderedState = EditorState.create({ schema: pmSchema, doc: reorderedDoc });
    const ranges = spanListToPmRanges(result.spanList, runtime, reorderedState);
    const starts = getBlockContentStarts(reorderedDoc);

    const expectedRanges = result.spanList.map((span) => ({
      from: (starts.get(span.blockId) ?? 0) + span.start,
      to: (starts.get(span.blockId) ?? 0) + span.end,
    }));

    expect(ranges).toEqual(expectedRanges);
  });

  it("drops missing blocks when mapping ranges", () => {
    const blocks = createBlocks([
      { id: "b1", text: "Hello" },
      { id: "b2", text: "World" },
    ]);
    const runtime = createRuntimeWithBlocks(blocks);

    const p1 = createParagraph("b1", "Hello");
    const p2 = createParagraph("b2", "World");
    const doc = pmSchema.nodes.doc.create(null, [p1, p2]);
    const state = EditorState.create({ schema: pmSchema, doc });

    const selection = TextSelection.create(doc, 1, p1.nodeSize + 1 + 2);
    const result = pmSelectionToSpanList(selection, state, runtime, { strict: true });

    const joinedDoc = pmSchema.nodes.doc.create(null, [p1]);
    const joinedState = EditorState.create({ schema: pmSchema, doc: joinedDoc });
    const ranges = spanListToPmRanges(result.spanList, runtime, joinedState);

    expect(ranges).toHaveLength(1);
  });

  it("returns empty spans for empty selection", () => {
    const blocks = createBlocks([{ id: "b1", text: "Hello" }]);
    const runtime = createRuntimeWithBlocks(blocks);

    const doc = pmSchema.nodes.doc.create(null, [createParagraph("b1", "Hello")]);
    const state = EditorState.create({ schema: pmSchema, doc });
    const selection = TextSelection.create(doc, 2, 2);

    const result = pmSelectionToSpanList(selection, state, runtime, { strict: true });
    expect(result.spanList).toHaveLength(0);
    expect(result.verified).toBe(true);
  });

  it("handles empty paragraph selection without errors", () => {
    const blocks = createBlocks([{ id: "b1", text: "" }]);
    const runtime = createRuntimeWithBlocks(blocks);

    const doc = pmSchema.nodes.doc.create(null, [createParagraph("b1", "")]);
    const state = EditorState.create({ schema: pmSchema, doc });
    const selection = TextSelection.create(doc, 1, 1);

    const result = pmSelectionToSpanList(selection, state, runtime, { strict: true });
    expect(result.spanList).toHaveLength(0);
    expect(result.verified).toBe(true);
  });

  it("maps cursor position when includeCursor is enabled", () => {
    const blocks = createBlocks([{ id: "b1", text: "Hello" }]);
    const runtime = createRuntimeWithBlocks(blocks);

    const doc = pmSchema.nodes.doc.create(null, [createParagraph("b1", "Hello")]);
    const state = EditorState.create({ schema: pmSchema, doc });
    const selection = TextSelection.create(doc, 3, 3);

    const result = pmSelectionToSpanList(selection, state, runtime, {
      strict: true,
      includeCursor: true,
    });
    expect(result.spanList).toHaveLength(1);
    const cursorOffset = selection.$from.parentOffset;
    expect(result.spanList[0].start).toBe(cursorOffset);
    expect(result.spanList[0].end).toBe(cursorOffset);
    expect(result.chain.order).toEqual(["b1"]);
    expect(result.verified).toBe(true);
  });
});

describe("selection mapping edge cases", () => {
  describe("edge bias", () => {
    it("should handle selection at block start", () => {
      const blocks: BlockNode[] = [
        { id: "b1", type: "paragraph", attrs: serializeAttrs({}), text: "Hello", children: [] },
      ];
      const runtime = createRuntimeWithBlocks(blocks);
      const p1 = createParagraph("b1", "Hello");
      const doc = pmSchema.nodes.doc.create(null, [p1]);
      const state = EditorState.create({ schema: pmSchema, doc });
      const selection = TextSelection.create(doc, 1, 3);
      const result = pmSelectionToSpanList(selection, state, runtime, { strict: true });
      expect(result.spanList).toHaveLength(1);
      expect(result.spanList[0].start).toBe(0);
    });

    it("should handle selection at block end", () => {
      const blocks: BlockNode[] = [
        { id: "b1", type: "paragraph", attrs: serializeAttrs({}), text: "Hello", children: [] },
      ];
      const runtime = createRuntimeWithBlocks(blocks);
      const p1 = createParagraph("b1", "Hello");
      const doc = pmSchema.nodes.doc.create(null, [p1]);
      const state = EditorState.create({ schema: pmSchema, doc });
      const selection = TextSelection.create(doc, 3, 6);
      const result = pmSelectionToSpanList(selection, state, runtime, { strict: true });
      expect(result.spanList).toHaveLength(1);
      expect(result.spanList[0].end).toBeLessThanOrEqual(5);
    });
  });

  describe("empty selection", () => {
    it("should return empty for collapsed selection", () => {
      const blocks: BlockNode[] = [
        { id: "b1", type: "paragraph", attrs: serializeAttrs({}), text: "Hello", children: [] },
      ];
      const runtime = createRuntimeWithBlocks(blocks);
      const p1 = createParagraph("b1", "Hello");
      const doc = pmSchema.nodes.doc.create(null, [p1]);
      const state = EditorState.create({ schema: pmSchema, doc });
      const selection = TextSelection.create(doc, 3, 3);
      const result = pmSelectionToSpanList(selection, state, runtime, { strict: true });
      expect(result.spanList).toHaveLength(0);
      expect(result.verified).toBe(true);
    });
  });

  describe("multi-block sequences", () => {
    it("should handle three consecutive blocks", () => {
      const blocks: BlockNode[] = [
        { id: "b1", type: "paragraph", attrs: serializeAttrs({}), text: "One", children: [] },
        { id: "b2", type: "paragraph", attrs: serializeAttrs({}), text: "Two", children: [] },
        { id: "b3", type: "paragraph", attrs: serializeAttrs({}), text: "Three", children: [] },
      ];
      const runtime = createRuntimeWithBlocks(blocks);
      const p1 = createParagraph("b1", "One");
      const p2 = createParagraph("b2", "Two");
      const p3 = createParagraph("b3", "Three");
      const doc = pmSchema.nodes.doc.create(null, [p1, p2, p3]);
      const state = EditorState.create({ schema: pmSchema, doc });
      const from = 2;
      const to = p1.nodeSize + p2.nodeSize + 3;
      const selection = TextSelection.create(doc, from, to);
      const result = pmSelectionToSpanList(selection, state, runtime, { strict: true });
      expect(result.spanList).toHaveLength(3);
      expect(result.chain.order).toEqual(["b1", "b2", "b3"]);
    });
  });

  describe("split and join", () => {
    it("should handle split block scenario", () => {
      const blocks: BlockNode[] = [
        {
          id: "b1",
          type: "paragraph",
          attrs: serializeAttrs({}),
          text: "HelloWorld",
          children: [],
        },
      ];
      const runtime = createRuntimeWithBlocks(blocks);
      const p1 = createParagraph("b1", "HelloWorld");
      const doc = pmSchema.nodes.doc.create(null, [p1]);
      const state = EditorState.create({ schema: pmSchema, doc });
      const selection = TextSelection.create(doc, 1, 11);
      const result = pmSelectionToSpanList(selection, state, runtime, { strict: true });
      expect(result.spanList).toHaveLength(1);
      expect(result.spanList[0].blockId).toBe("b1");
    });
  });
});

/**
 * REGRESSION TESTS: Off-by-one bug fix in contentEnd calculation
 * Previous bug: contentEnd = pos + node.content.size (missing +1)
 * These tests verify that span length exactly matches selected text length
 */
describe("off-by-one regression tests", () => {
  it("single block full range: span length equals text length", () => {
    const text = "Hello";
    const blocks = createBlocks([{ id: "b1", text }]);
    const runtime = createRuntimeWithBlocks(blocks);

    const doc = pmSchema.nodes.doc.create(null, [createParagraph("b1", text)]);
    const state = EditorState.create({ schema: pmSchema, doc });

    // Select entire text content of block
    const from = 1; // start of content
    const to = 1 + text.length; // end of content
    const selection = TextSelection.create(doc, from, to);

    const result = pmSelectionToSpanList(selection, state, runtime, { strict: true });
    expect(result.spanList).toHaveLength(1);

    const span = result.spanList[0];
    const spanLength = span.end - span.start;

    // CRITICAL ASSERTION: span length must equal selected text length
    expect(spanLength).toBe(text.length);
    expect(span.start).toBe(0);
    expect(span.end).toBe(5);
  });

  it("single block last character only: span length equals 1", () => {
    const text = "Hello";
    const blocks = createBlocks([{ id: "b1", text }]);
    const runtime = createRuntimeWithBlocks(blocks);

    const doc = pmSchema.nodes.doc.create(null, [createParagraph("b1", text)]);
    const state = EditorState.create({ schema: pmSchema, doc });

    // Select only the last character "o"
    const from = 5; // before "o"
    const to = 6; // after "o"
    const selection = TextSelection.create(doc, from, to);

    const result = pmSelectionToSpanList(selection, state, runtime, { strict: true });
    expect(result.spanList).toHaveLength(1);

    const span = result.spanList[0];
    const spanLength = span.end - span.start;

    // CRITICAL ASSERTION: selecting 1 character should yield span length of 1
    expect(spanLength).toBe(1);
    expect(span.start).toBe(4);
    expect(span.end).toBe(5);
  });

  it("multi-block selection: no block loses its last character", () => {
    const blocks = createBlocks([
      { id: "b1", text: "abc" },
      { id: "b2", text: "def" },
    ]);
    const runtime = createRuntimeWithBlocks(blocks);

    const p1 = createParagraph("b1", "abc");
    const p2 = createParagraph("b2", "def");
    const doc = pmSchema.nodes.doc.create(null, [p1, p2]);
    const state = EditorState.create({ schema: pmSchema, doc });

    // Select from "b" in block1 through "e" in block2
    // Block 1: pos 0 = <p>, pos 1 = "a", pos 2 = "b", pos 3 = "c", pos 4 = </p>
    // Block 2: pos 5 = <p>, pos 6 = "d", pos 7 = "e", pos 8 = "f", pos 9 = </p>
    const from = 2; // "b" in block1
    const to = 8; // after "e" in block2
    const selection = TextSelection.create(doc, from, to);

    const result = pmSelectionToSpanList(selection, state, runtime, { strict: true });
    expect(result.spanList).toHaveLength(2);

    // Block 1: selected "bc" (from offset 1 to 3)
    const span1 = result.spanList[0];
    expect(span1.blockId).toBe("b1");
    expect(span1.end - span1.start).toBe(2); // "bc"
    expect(span1.end).toBe(3); // includes "c"

    // Block 2: selected "de" (from offset 0 to 2)
    const span2 = result.spanList[1];
    expect(span2.blockId).toBe("b2");
    expect(span2.end - span2.start).toBe(2); // "de"
    expect(span2.end).toBe(2); // includes "e"
  });

  it("selection ending at exact block boundary includes last char", () => {
    const text = "Word.";
    const blocks = createBlocks([{ id: "b1", text }]);
    const runtime = createRuntimeWithBlocks(blocks);

    const doc = pmSchema.nodes.doc.create(null, [createParagraph("b1", text)]);
    const state = EditorState.create({ schema: pmSchema, doc });

    // Select entire "Word." including the period
    const from = 1;
    const to = 1 + text.length; // 6
    const selection = TextSelection.create(doc, from, to);

    const result = pmSelectionToSpanList(selection, state, runtime, { strict: true });
    expect(result.spanList).toHaveLength(1);

    const span = result.spanList[0];

    // Must include the period
    expect(span.end).toBe(5);
    expect(span.end - span.start).toBe(5);

    // Verify content matches
    const selectedText = state.doc.textBetween(from, to);
    expect(selectedText).toBe("Word.");
    expect(span.end - span.start).toBe(selectedText.length);
  });
});
