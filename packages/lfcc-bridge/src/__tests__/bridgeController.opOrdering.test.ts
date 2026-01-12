import { type DirectEditorProps, EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { describe, expect, it } from "vitest";

import { BridgeController } from "../bridge/bridgeController";
import { serializeAttrs, writeBlockTree } from "../crdt/crdtSchema";
import { pmSchema } from "../pm/pmSchema";
import { LoroRuntime } from "../runtime/loroRuntime";

class HeadlessAdapter {
  schema = pmSchema;

  createState(doc?: Parameters<typeof EditorState.create>[0]["doc"]): EditorState {
    return EditorState.create({ schema: this.schema, doc });
  }

  createView(_mount: HTMLElement, props: DirectEditorProps): EditorView {
    const view: Partial<EditorView> & { state: EditorState } = {
      state: props.state,
      dispatchTransaction: props.dispatchTransaction,
      updateState(next) {
        this.state = next;
      },
    };
    return view as EditorView;
  }
}

describe("BridgeController structural op ordering wiring", () => {
  it("merges local and remote structural ops and emits telemetry", () => {
    const runtime = new LoroRuntime();
    const adapter = new HeadlessAdapter();
    const orderingEvents: unknown[] = [];

    const bridge = new BridgeController({
      runtime,
      adapter: adapter as never,
      enableDivergenceDetection: false,
      onStructuralOrdering: (event) => orderingEvents.push(event),
    });

    const view = bridge.createView({} as HTMLElement);

    const schema = adapter.schema;
    const newDoc = schema.node("doc", null, [
      schema.node("paragraph", { block_id: "b_local_1" }, [schema.text("A")]),
      schema.node("paragraph", { block_id: "b_local_2" }, [schema.text("B")]),
    ]);

    const trLocal = view.state.tr.replaceWith(0, view.state.doc.content.size, newDoc.content);
    (bridge as unknown as { handleTransaction: (tr: typeof trLocal) => void }).handleTransaction(
      trLocal
    );

    // Simulate a remote structural change (reorder)
    writeBlockTree(runtime.doc, [
      { id: "b_local_2", type: "paragraph", attrs: serializeAttrs({}), text: "B", children: [] },
      { id: "b_local_1", type: "paragraph", attrs: serializeAttrs({}), text: "A", children: [] },
    ]);
    runtime.commit("test-op-order");

    (bridge as unknown as { syncFromLoro: () => void }).syncFromLoro();

    expect(orderingEvents.length).toBeGreaterThan(0);
    const last = orderingEvents[orderingEvents.length - 1] as { phase: string; ordered: unknown[] };
    expect(last.phase).toBe("remote_apply");
    expect(last.ordered.length).toBeGreaterThan(0);
  });
});
