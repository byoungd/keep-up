import {
  type BlockNode,
  createLoroRuntime,
  nextBlockId,
  pmSchema,
  projectLoroToPm,
  serializeAttrs,
  writeBlockTree,
} from "@ku0/lfcc-bridge";
import { EditorState, TextSelection, type Transaction } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { describe, expect, it } from "vitest";

import { defaultSlashCommands } from "../slashCommands";

describe("Slash Commands", () => {
  it("Heading 1 command converts paragraph to H1", () => {
    const runtime = createLoroRuntime({ peerId: "1" });
    const attrs = serializeAttrs({});
    const blockA: BlockNode = {
      id: nextBlockId(runtime.doc),
      type: "paragraph",
      attrs,
      text: "Title",
      children: [],
    };
    writeBlockTree(runtime.doc, [blockA]);

    const pmDoc = projectLoroToPm(runtime.doc, pmSchema);
    let state = EditorState.create({ schema: pmSchema, doc: pmDoc });

    // Select inside block
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1)));

    // Mock View
    const dispatch = (tr: Transaction) => {
      state = state.apply(tr);
    };
    const view = { state, dispatch } as unknown as EditorView;

    // Find H1 command
    const cmd = defaultSlashCommands.find((c) => c.id === "heading1");
    expect(cmd).toBeDefined();
    if (!cmd) {
      throw new Error("Command not found");
    }

    // Execute
    const handled = cmd.execute(view);
    expect(handled).toBe(true);

    // Verify
    const newBlock = state.doc.child(0);
    expect(newBlock.type.name).toBe("heading");
    expect(newBlock.attrs.level).toBe(1);
    expect(newBlock.textContent).toBe("Title");
  });

  it("Text command converts H1 to paragraph", () => {
    const runtime = createLoroRuntime({ peerId: "1" });
    const attrs = serializeAttrs({ level: 1 });
    const blockA: BlockNode = {
      id: nextBlockId(runtime.doc),
      type: "heading",
      attrs,
      text: "Title",
      children: [],
    };
    writeBlockTree(runtime.doc, [blockA]);

    const pmDoc = projectLoroToPm(runtime.doc, pmSchema);
    let state = EditorState.create({ schema: pmSchema, doc: pmDoc });

    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1)));

    const dispatch = (tr: Transaction) => {
      state = state.apply(tr);
    };
    const view = { state, dispatch } as unknown as EditorView;

    const cmd = defaultSlashCommands.find((c) => c.id === "text");
    expect(cmd).toBeDefined();
    if (!cmd) {
      throw new Error("Command not found");
    }

    cmd.execute(view);

    const newBlock = state.doc.child(0);
    expect(newBlock.type.name).toBe("paragraph");
    expect(newBlock.attrs.level).toBeUndefined();
  });
});
