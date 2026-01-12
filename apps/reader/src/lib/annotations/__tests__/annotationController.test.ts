import {
  type SpanList,
  createLoroRuntime,
  nextBlockId,
  pmSchema,
  projectLoroToPm,
  serializeAttrs,
  spanListToPmRanges,
  writeBlockTree,
} from "@keepup/lfcc-bridge";
import { EditorState, TextSelection } from "prosemirror-state";
import { beforeEach, describe, expect, it } from "vitest";

import { useAnnotationStore } from "../../kernel/store";
import { annotationController } from "../annotationController";

const resetStore = () => {
  useAnnotationStore.setState({ annotations: {}, focusedAnnotationId: null });
};

describe("annotationController", () => {
  beforeEach(() => {
    resetStore();
  });

  it("creates an annotation and persists it", () => {
    const spanList: SpanList = [{ blockId: "b1", start: 0, end: 5 }];

    const annotation = annotationController.createAnnotation({
      spanList,
      content: "Hello",
    });

    const stored = useAnnotationStore.getState().annotations[annotation.id];
    expect(stored).toBeDefined();
    expect(stored?.spans?.[0].blockId).toBe("b1");
    expect(stored?.displayState).toBe("active_unverified");
    expect(stored?.verified).toBe(false);
  });

  it("respects provided display state and verified flag", () => {
    const spanList: SpanList = [{ blockId: "b1", start: 2, end: 7 }];

    const annotation = annotationController.createAnnotation({
      spanList,
      content: "Hello",
      displayState: "active",
      verified: true,
    });

    expect(annotation.displayState).toBe("active");
    expect(annotation.verified).toBe(true);
  });

  it("updates annotation range across multiple blocks", () => {
    const runtime = createLoroRuntime({ peerId: "1" });
    const attrs = serializeAttrs({});
    const blockA = {
      id: nextBlockId(runtime.doc),
      type: "paragraph" as const,
      attrs,
      text: "Hello from block one",
      children: [],
    };
    const blockB = {
      id: nextBlockId(runtime.doc),
      type: "paragraph" as const,
      attrs,
      text: "Second block text",
      children: [],
    };
    writeBlockTree(runtime.doc, [blockA, blockB]);

    const pmDoc = projectLoroToPm(runtime.doc, pmSchema);
    const state = EditorState.create({ schema: pmSchema, doc: pmDoc });

    const annotation = annotationController.createAnnotation({
      spanList: [{ blockId: blockA.id, start: 0, end: 5 }],
      content: "Hello",
    });

    const updateSpans: SpanList = [
      { blockId: blockA.id, start: 6, end: 12 },
      { blockId: blockB.id, start: 0, end: 6 },
    ];
    const ranges = spanListToPmRanges(updateSpans, runtime, state);
    const selection = TextSelection.create(state.doc, ranges[0].from, ranges[ranges.length - 1].to);

    const result = annotationController.updateAnnotationRangeFromSelection({
      annotationId: annotation.id,
      selection,
      state,
      runtime,
      strict: true,
    });

    expect(result.ok).toBe(true);
    const stored = useAnnotationStore.getState().annotations[annotation.id];
    expect(stored.spans).toHaveLength(2);
    expect(stored.spans?.[0].blockId).toBe(blockA.id);
    expect(stored.spans?.[1].blockId).toBe(blockB.id);
    expect(stored.displayState).toBe("active");
    expect(stored.verified).toBe(true);
  });

  it("fail-closes updates for empty selections", () => {
    const runtime = createLoroRuntime({ peerId: "1" });
    const attrs = serializeAttrs({});
    const blockA = {
      id: nextBlockId(runtime.doc),
      type: "paragraph" as const,
      attrs,
      text: "Hello from block one",
      children: [],
    };
    writeBlockTree(runtime.doc, [blockA]);

    const pmDoc = projectLoroToPm(runtime.doc, pmSchema);
    const state = EditorState.create({ schema: pmSchema, doc: pmDoc });

    const annotation = annotationController.createAnnotation({
      spanList: [{ blockId: blockA.id, start: 0, end: 5 }],
      content: "Hello",
    });

    const selection = TextSelection.create(state.doc, 1, 1);
    const result = annotationController.updateAnnotationRangeFromSelection({
      annotationId: annotation.id,
      selection,
      state,
      runtime,
      strict: true,
    });

    expect(result.ok).toBe(false);
    const stored = useAnnotationStore.getState().annotations[annotation.id];
    expect(stored.spans?.[0]).toEqual({ blockId: blockA.id, start: 0, end: 5 });
  });

  it("fail-closes updates when strict mapping is unverified", () => {
    const runtime = createLoroRuntime({ peerId: "1" });
    const attrs = serializeAttrs({});
    const blockA = {
      id: nextBlockId(runtime.doc),
      type: "paragraph" as const,
      attrs,
      text: "Short text",
      children: [],
    };
    writeBlockTree(runtime.doc, [blockA]);

    const pmDoc = projectLoroToPm(runtime.doc, pmSchema);
    const state = EditorState.create({ schema: pmSchema, doc: pmDoc });

    const annotation = annotationController.createAnnotation({
      spanList: [{ blockId: blockA.id, start: 0, end: 5 }],
      content: "Short",
    });

    let blockPos = 0;
    let blockSize = 0;
    state.doc.descendants((node, pos) => {
      if (node.attrs?.block_id === blockA.id) {
        blockPos = pos;
        blockSize = node.content.size;
      }
    });

    const extendedState = state.apply(state.tr.insertText(" extended", blockPos + 1 + blockSize));

    let extendedBlockPos = 0;
    let extendedBlockSize = 0;
    extendedState.doc.descendants((node, pos) => {
      if (node.attrs?.block_id === blockA.id) {
        extendedBlockPos = pos;
        extendedBlockSize = node.content.size;
      }
    });

    const selection = TextSelection.create(
      extendedState.doc,
      extendedBlockPos + 1,
      extendedBlockPos + 1 + extendedBlockSize
    );
    const result = annotationController.updateAnnotationRangeFromSelection({
      annotationId: annotation.id,
      selection,
      state: extendedState,
      runtime,
      strict: true,
    });

    expect(result.ok).toBe(false);
    const stored = useAnnotationStore.getState().annotations[annotation.id];
    expect(stored.spans?.[0]).toEqual({ blockId: blockA.id, start: 0, end: 5 });
  });
});
