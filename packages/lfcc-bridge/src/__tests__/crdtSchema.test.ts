import { LoroDoc } from "loro-crdt";
import { describe, expect, it } from "vitest";

import {
  computeTextDelta,
  createEmptyDoc,
  diffRichTextSpans,
  readBlockTree,
  serializeAttrs,
  updateBlockText,
  writeBlockTree,
  writeBlockTreePartial,
} from "../crdt/crdtSchema";

describe("crdtSchema createEmptyDoc", () => {
  it("creates a canonical empty paragraph without filler text", () => {
    const doc = new LoroDoc();
    const blockId = createEmptyDoc(doc);

    const blocks = readBlockTree(doc);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.id).toBe(blockId);
    expect(blocks[0]?.type).toBe("paragraph");
    expect(blocks[0]?.text ?? "").toBe("");
    expect(blocks[0]?.children).toHaveLength(0);
  });

  it("accepts first input on an empty doc", () => {
    const doc = new LoroDoc();
    const blockId = createEmptyDoc(doc);

    updateBlockText(doc, blockId, "First input");
    const blocks = readBlockTree(doc);
    expect(blocks[0]?.text).toBe("First input");
  });
});

describe("crdtSchema text delta helpers", () => {
  it("computes a delta for middle insertion", () => {
    const delta = computeTextDelta("Hello", "Hello World");
    expect(delta).toEqual({
      start: 5,
      deleteCount: 0,
      insertText: " World",
    });
  });

  it("computes a delta for middle deletion", () => {
    const delta = computeTextDelta("Hello World", "Hello");
    expect(delta).toEqual({
      start: 5,
      deleteCount: 6,
      insertText: "",
    });
  });
});

describe("crdtSchema richText diff helpers", () => {
  it("computes a diff for span insertions", () => {
    const diff = diffRichTextSpans(
      [{ text: "A" }, { text: "B" }, { text: "C" }],
      [{ text: "A" }, { text: "B" }, { text: "X" }, { text: "C" }]
    );
    expect(diff).toEqual({
      start: 2,
      deleteCount: 0,
      insertSpans: [{ text: "X" }],
    });
  });

  it("computes a diff for span deletions", () => {
    const diff = diffRichTextSpans(
      [{ text: "A" }, { text: "B" }, { text: "C" }],
      [{ text: "A" }, { text: "C" }]
    );
    expect(diff).toEqual({
      start: 1,
      deleteCount: 1,
      insertSpans: [],
    });
  });
});

describe("crdtSchema partial writes", () => {
  it("updates container order when only a descendant is touched", () => {
    const doc = new LoroDoc();
    const attrs = serializeAttrs({});
    const blocks = [
      {
        id: "q1",
        type: "quote",
        attrs,
        children: [
          { id: "p1", type: "paragraph", attrs, text: "First", children: [] },
          { id: "p2", type: "paragraph", attrs, text: "Second", children: [] },
        ],
      },
    ];

    writeBlockTree(doc, blocks);

    const reordered = [
      {
        id: "q1",
        type: "quote",
        attrs,
        children: [
          { id: "p2", type: "paragraph", attrs, text: "Second", children: [] },
          { id: "p1", type: "paragraph", attrs, text: "First", children: [] },
        ],
      },
    ];

    writeBlockTreePartial(doc, reordered, new Set(["p2"]));

    const updated = readBlockTree(doc);
    expect(updated[0]?.children.map((child) => child.id)).toEqual(["p2", "p1"]);
  });
});
