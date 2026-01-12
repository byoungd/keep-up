import {
  type BlockNode,
  createLoroRuntime,
  nextBlockId,
  pmSchema,
  projectLoroToPm,
  serializeAttrs,
  writeBlockTree,
} from "@keepup/lfcc-bridge";
import { EditorState, TextSelection, type Transaction } from "prosemirror-state";
import { describe, expect, it } from "vitest";

import { handleEnter } from "../blockBehaviors";

describe("Block Behaviors", () => {
  it("handleEnter: splits paragraph and assigns new block_id", () => {
    const runtime = createLoroRuntime({ peerId: "1" });
    const attrs = serializeAttrs({});
    const blockA: BlockNode = {
      id: nextBlockId(runtime.doc),
      type: "paragraph",
      attrs,
      text: "Hello World",
      children: [],
    };
    writeBlockTree(runtime.doc, [blockA]);

    const pmDoc = projectLoroToPm(runtime.doc, pmSchema);
    let state = EditorState.create({ schema: pmSchema, doc: pmDoc });

    // Set selection after "Hello" (pos 6: start(1) + 5 = 6)
    // <doc> <p> Hello World </p> </doc>
    // p start = 0 (block). content start = 1. "Hello" (5). 1+5 = 6.
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 6)));

    const dispatch = (tr: Transaction) => {
      state = state.apply(tr);
    };

    // Execute Enter
    const cmd = handleEnter(runtime);
    const result = cmd(state, dispatch);

    expect(result).toBe(true);

    // Verify state: 2 blocks
    expect(state.doc.childCount).toBe(2);

    // First block "Hello"
    const firstBlock = state.doc.child(0);
    expect(firstBlock.textContent).toBe("Hello");
    expect(firstBlock.attrs.block_id).toBe(blockA.id);

    // Second block " World" (note space)
    const secondBlock = state.doc.child(1);
    expect(secondBlock.textContent).toBe(" World");
    expect(secondBlock.attrs.block_id).not.toBe(blockA.id); // Should be new
    expect(secondBlock.attrs.block_id).toBeTruthy(); // Should exist
  });

  it("handleEnter: convert Heading to Paragraph on split", () => {
    const runtime = createLoroRuntime({ peerId: "1" });
    const attrs = serializeAttrs({ level: 1 });
    const blockA: BlockNode = {
      id: nextBlockId(runtime.doc),
      type: "heading",
      attrs,
      text: "Title Split",
      children: [],
    };
    writeBlockTree(runtime.doc, [blockA]);

    const pmDoc = projectLoroToPm(runtime.doc, pmSchema);
    let state = EditorState.create({ schema: pmSchema, doc: pmDoc });

    // Split at end of title
    const endPos = (blockA.text || "").length + 1; // 1 + 11 = 12
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, endPos)));

    const dispatch = (tr: Transaction) => {
      state = state.apply(tr);
    };

    handleEnter(runtime)(state, dispatch);

    // Verify: 2 blocks. First is H1, second is Paragraph.
    expect(state.doc.childCount).toBe(2);
    expect(state.doc.child(0).type.name).toBe("heading");
    expect(state.doc.child(1).type.name).toBe("paragraph");
    expect(state.doc.child(1).attrs.block_id).not.toBe(blockA.id);
  });
});
