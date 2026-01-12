import {
  type SpanChainPolicy,
  type SpanList,
  createLoroRuntime,
  nextBlockId,
  pmSchema,
  serializeAttrs,
  writeBlockTree,
} from "@keepup/lfcc-bridge";
import { EditorState } from "prosemirror-state";
import { describe, expect, it } from "vitest";

import { anchorFromAbsolute } from "../../kernel/anchors";
import type { Annotation } from "../../kernel/types";
import { resolveAnnotationRanges } from "../annotationResolution";

const makeParagraph = (blockId: string, text: string) =>
  pmSchema.nodes.paragraph.create({ block_id: blockId }, pmSchema.text(text));

const makeAnnotation = (id: string, spans: SpanList, policy: SpanChainPolicy): Annotation => {
  const first = spans[0];
  const last = spans[spans.length - 1];

  return {
    id,
    start: anchorFromAbsolute(first.blockId, first.start),
    end: anchorFromAbsolute(last.blockId, last.end),
    content: "demo",
    storedState: "active",
    displayState: "active",
    createdAtMs: 0,
    spans,
    chain: {
      policy,
      order: spans.map((span) => span.blockId),
    },
    verified: true,
  };
};

describe("resolveAnnotationRanges structural ops", () => {
  it("marks required_order annotations partial after reorder", () => {
    const runtime = createLoroRuntime({ peerId: "1" });
    const attrs = serializeAttrs({});
    const blockA = {
      id: nextBlockId(runtime.doc),
      type: "paragraph" as const,
      attrs,
      text: "Alpha block",
      children: [],
    };
    const blockB = {
      id: nextBlockId(runtime.doc),
      type: "paragraph" as const,
      attrs,
      text: "Bravo block",
      children: [],
    };
    writeBlockTree(runtime.doc, [blockA, blockB]);

    const pmDoc = pmSchema.nodes.doc.create(null, [
      makeParagraph(blockB.id, blockB.text),
      makeParagraph(blockA.id, blockA.text),
    ]);
    const state = EditorState.create({ schema: pmSchema, doc: pmDoc });

    const spans: SpanList = [
      { blockId: blockA.id, start: 0, end: 5 },
      { blockId: blockB.id, start: 0, end: 5 },
    ];

    const resolved = resolveAnnotationRanges(
      makeAnnotation("anno-reorder", spans, {
        kind: "required_order",
        maxInterveningBlocks: 0,
      }),
      runtime,
      state
    );

    expect(resolved.state).toBe("active_partial");
    expect(resolved.missingBlockIds).toEqual([]);
    expect(resolved.ranges).toHaveLength(2);
  });

  it("marks strict_adjacency annotations partial after a split", () => {
    const runtime = createLoroRuntime({ peerId: "1" });
    const attrs = serializeAttrs({});
    const blockA = {
      id: nextBlockId(runtime.doc),
      type: "paragraph" as const,
      attrs,
      text: "Alpha block",
      children: [],
    };
    const splitBlock = {
      id: nextBlockId(runtime.doc),
      type: "paragraph" as const,
      attrs,
      text: "Inserted block",
      children: [],
    };
    const blockB = {
      id: nextBlockId(runtime.doc),
      type: "paragraph" as const,
      attrs,
      text: "Bravo block",
      children: [],
    };
    writeBlockTree(runtime.doc, [blockA, splitBlock, blockB]);

    const pmDoc = pmSchema.nodes.doc.create(null, [
      makeParagraph(blockA.id, blockA.text),
      makeParagraph(splitBlock.id, splitBlock.text),
      makeParagraph(blockB.id, blockB.text),
    ]);
    const state = EditorState.create({ schema: pmSchema, doc: pmDoc });

    const spans: SpanList = [
      { blockId: blockA.id, start: 0, end: 5 },
      { blockId: blockB.id, start: 0, end: 5 },
    ];

    const resolved = resolveAnnotationRanges(
      makeAnnotation("anno-split", spans, {
        kind: "strict_adjacency",
        maxInterveningBlocks: 0,
      }),
      runtime,
      state
    );

    expect(resolved.state).toBe("active_partial");
    expect(resolved.missingBlockIds).toEqual([]);
    expect(resolved.ranges).toHaveLength(2);
  });

  it("marks annotations partial when a joined block is missing", () => {
    const runtime = createLoroRuntime({ peerId: "1" });
    const attrs = serializeAttrs({});
    const blockA = {
      id: nextBlockId(runtime.doc),
      type: "paragraph" as const,
      attrs,
      text: "Alpha block",
      children: [],
    };
    const blockB = {
      id: nextBlockId(runtime.doc),
      type: "paragraph" as const,
      attrs,
      text: "Bravo block",
      children: [],
    };
    writeBlockTree(runtime.doc, [blockA, blockB]);

    const pmDoc = pmSchema.nodes.doc.create(null, [makeParagraph(blockA.id, blockA.text)]);
    const state = EditorState.create({ schema: pmSchema, doc: pmDoc });

    const spans: SpanList = [
      { blockId: blockA.id, start: 0, end: 5 },
      { blockId: blockB.id, start: 0, end: 5 },
    ];

    const resolved = resolveAnnotationRanges(
      makeAnnotation("anno-join", spans, {
        kind: "required_order",
        maxInterveningBlocks: 0,
      }),
      runtime,
      state
    );

    expect(resolved.state).toBe("active_partial");
    expect(resolved.missingBlockIds).toEqual([blockB.id]);
    expect(resolved.ranges).toHaveLength(1);
  });
});
