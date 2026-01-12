import { EditorState } from "prosemirror-state";
import { describe, expect, it } from "vitest";

import { classifyTransaction } from "../dirty/dirtyInfo";
import { pmSchema } from "../pm/pmSchema";

const createParagraph = (blockId: string, text: string) =>
  pmSchema.nodes.paragraph.create({ block_id: blockId }, pmSchema.text(text));

const createHeading = (blockId: string, text: string, level = 1) =>
  pmSchema.nodes.heading.create({ block_id: blockId, level }, pmSchema.text(text));

const createListItems = (items: Array<{ itemId: string; text: string }>) =>
  items.map((item) =>
    pmSchema.nodes.paragraph.create(
      { block_id: item.itemId, list_type: "bullet", indent_level: 0 },
      pmSchema.text(item.text)
    )
  );

const createTable = (
  tableId: string,
  rows: Array<{
    rowId: string;
    cellId: string;
    paragraphId: string;
    text: string;
  }>
) =>
  pmSchema.nodes.table.create(
    { block_id: tableId },
    rows.map((row) =>
      pmSchema.nodes.table_row.create(
        { block_id: row.rowId },
        pmSchema.nodes.table_cell.create(
          { block_id: row.cellId },
          createParagraph(row.paragraphId, row.text)
        )
      )
    )
  );

describe("classifyTransaction", () => {
  it("classifies split as OP_BLOCK_SPLIT", () => {
    const text = "hello";
    const doc = pmSchema.nodes.doc.create(null, [createParagraph("b1", text)]);
    const state = EditorState.create({ schema: pmSchema, doc });

    const splitPos = 1 + Math.floor(text.length / 2);
    const tr = state.tr.split(splitPos);

    const result = classifyTransaction(tr);
    expect(result.opCodes).toContain("OP_BLOCK_SPLIT");
    expect(result.structural).toBe(true);
  });

  it("classifies split via block count delta for headings", () => {
    const beforeDoc = pmSchema.nodes.doc.create(null, [createHeading("h1", "Heading")]);
    const afterDoc = pmSchema.nodes.doc.create(null, [
      createHeading("h1", "Head"),
      createHeading("h2", "ing"),
    ]);

    const state = EditorState.create({ schema: pmSchema, doc: beforeDoc });
    const tr = state.tr.replaceWith(0, state.doc.content.size, afterDoc.content);

    const result = classifyTransaction(tr);
    expect(result.opCodes).toContain("OP_BLOCK_SPLIT");
    expect(result.structural).toBe(true);
  });

  it("classifies join as OP_BLOCK_JOIN", () => {
    const doc = pmSchema.nodes.doc.create(null, [
      createParagraph("b1", "hello"),
      createParagraph("b2", "world"),
    ]);
    const state = EditorState.create({ schema: pmSchema, doc });

    const joinPos = doc.child(0).nodeSize;
    const tr = state.tr.join(joinPos);

    const result = classifyTransaction(tr);
    expect(result.opCodes).toContain("OP_BLOCK_JOIN");
    expect(result.structural).toBe(true);
  });

  it("classifies join via block count delta for mixed blocks", () => {
    const beforeDoc = pmSchema.nodes.doc.create(null, [
      createHeading("h1", "Title"),
      createParagraph("b1", "Body"),
    ]);
    const afterDoc = pmSchema.nodes.doc.create(null, [createHeading("h1", "Title Body")]);

    const state = EditorState.create({ schema: pmSchema, doc: beforeDoc });
    const tr = state.tr.replaceWith(0, state.doc.content.size, afterDoc.content);

    const result = classifyTransaction(tr);
    expect(result.opCodes).toContain("OP_BLOCK_JOIN");
    expect(result.structural).toBe(true);
  });

  it("classifies reorder as OP_REORDER", () => {
    const first = createParagraph("b1", "hello");
    const second = createParagraph("b2", "world");
    const doc = pmSchema.nodes.doc.create(null, [first, second]);
    const state = EditorState.create({ schema: pmSchema, doc });

    const swapped = pmSchema.nodes.doc.create(null, [second, first]);
    const tr = state.tr.replaceWith(0, state.doc.content.size, swapped.content);

    const result = classifyTransaction(tr);
    expect(result.opCodes).toContain("OP_REORDER");
    expect(result.structural).toBe(true);
  });

  it("classifies multi-move reorder", () => {
    const first = createParagraph("b1", "one");
    const second = createParagraph("b2", "two");
    const third = createParagraph("b3", "three");
    const doc = pmSchema.nodes.doc.create(null, [first, second, third]);
    const state = EditorState.create({ schema: pmSchema, doc });

    const movedDoc = pmSchema.nodes.doc.create(null, [third, first, second]);
    const tr = state.tr.replaceWith(0, state.doc.content.size, movedDoc.content);

    const result = classifyTransaction(tr);
    expect(result.opCodes).toContain("OP_REORDER");
    expect(result.structural).toBe(true);
  });

  it("classifies reorder within list items", () => {
    const listItems = createListItems([
      { itemId: "li1", text: "Alpha" },
      { itemId: "li2", text: "Beta" },
      { itemId: "li3", text: "Gamma" },
    ]);
    const doc = pmSchema.nodes.doc.create(null, listItems);
    const state = EditorState.create({ schema: pmSchema, doc });

    const reorderedListItems = createListItems([
      { itemId: "li1", text: "Alpha" },
      { itemId: "li3", text: "Gamma" },
      { itemId: "li2", text: "Beta" },
    ]);
    const reorderedDoc = pmSchema.nodes.doc.create(null, reorderedListItems);
    const tr = state.tr.replaceWith(0, state.doc.content.size, reorderedDoc.content);

    const result = classifyTransaction(tr);
    expect(result.opCodes).toContain("OP_REORDER");
    expect(result.structural).toBe(true);
  });

  it("classifies reorder within table rows", () => {
    const table = createTable("table-1", [
      { rowId: "r1", cellId: "c1", paragraphId: "b1", text: "Row1" },
      { rowId: "r2", cellId: "c2", paragraphId: "b2", text: "Row2" },
    ]);
    const doc = pmSchema.nodes.doc.create(null, [table]);
    const state = EditorState.create({ schema: pmSchema, doc });

    const reorderedTable = createTable("table-1", [
      { rowId: "r2", cellId: "c2", paragraphId: "b2", text: "Row2" },
      { rowId: "r1", cellId: "c1", paragraphId: "b1", text: "Row1" },
    ]);
    const reorderedDoc = pmSchema.nodes.doc.create(null, [reorderedTable]);
    const tr = state.tr.replaceWith(0, state.doc.content.size, reorderedDoc.content);

    const result = classifyTransaction(tr);
    expect(result.opCodes).toContain("OP_REORDER");
    expect(result.structural).toBe(true);
  });

  it("asserts structural scan for reorder without throwing", () => {
    const first = createParagraph("b1", "one");
    const second = createParagraph("b2", "two");
    const doc = pmSchema.nodes.doc.create(null, [first, second]);
    const state = EditorState.create({ schema: pmSchema, doc });

    const swappedDoc = pmSchema.nodes.doc.create(null, [second, first]);
    const tr = state.tr.replaceWith(0, state.doc.content.size, swappedDoc.content);

    expect(() => classifyTransaction(tr, { assertStructural: true })).not.toThrow();
  });

  it("asserts structural scan for text edits without throwing", () => {
    const doc = pmSchema.nodes.doc.create(null, [createParagraph("b1", "hello")]);
    const state = EditorState.create({ schema: pmSchema, doc });
    const tr = state.tr.insertText("!", 1);

    expect(() => classifyTransaction(tr, { assertStructural: true })).not.toThrow();
  });

  // P-01: Fast path test - text-only edits should be fast and non-structural
  it("classifies text insert as fast path (non-structural)", () => {
    const doc = pmSchema.nodes.doc.create(null, [createParagraph("b1", "hello")]);
    const state = EditorState.create({ schema: pmSchema, doc });
    const tr = state.tr.insertText(" world", 6); // Insert at end of text

    const result = classifyTransaction(tr);
    expect(result.opCodes).toContain("OP_TEXT_EDIT");
    expect(result.structural).toBe(false);
    expect(result.unknownSteps).toHaveLength(0);
  });

  it("classifies mark add as fast path (non-structural)", () => {
    const doc = pmSchema.nodes.doc.create(null, [createParagraph("b1", "hello")]);
    const state = EditorState.create({ schema: pmSchema, doc });
    const tr = state.tr.addMark(1, 4, pmSchema.marks.bold.create());

    const result = classifyTransaction(tr);
    expect(result.opCodes).toContain("OP_MARK_EDIT");
    expect(result.structural).toBe(false);
  });

  // S-02: Delimiter safety test - block IDs containing | should work
  it("detects reorder correctly when block IDs contain pipe character", () => {
    const first = createParagraph("block|one", "hello");
    const second = createParagraph("block|two", "world");
    const doc = pmSchema.nodes.doc.create(null, [first, second]);
    const state = EditorState.create({ schema: pmSchema, doc });

    const swapped = pmSchema.nodes.doc.create(null, [second, first]);
    const tr = state.tr.replaceWith(0, state.doc.content.size, swapped.content);

    const result = classifyTransaction(tr);
    expect(result.opCodes).toContain("OP_REORDER");
    expect(result.structural).toBe(true);
  });
});
