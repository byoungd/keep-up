import { type SpanList, createLoroRuntime, ensureBlockMap } from "@keepup/lfcc-bridge";
import { describe, expect, it } from "vitest";
import { buildReferenceAnchors, resolveReferenceInBlock } from "../referenceAnchors";

type TextContainer = { update: (value: string) => void; toString: () => string };

function setBlockText(blockMap: ReturnType<typeof ensureBlockMap>, value: string) {
  const rawText = blockMap.get("text");
  if (rawText && typeof rawText === "object" && "update" in rawText) {
    (rawText as TextContainer).update(value);
  }
}

describe("referenceAnchors", () => {
  it("resolves anchors when text is unchanged", () => {
    const runtime = createLoroRuntime({ peerId: 1 });
    const blockId = "b_test_1";
    const blockMap = ensureBlockMap(runtime.doc, blockId);
    setBlockText(blockMap, "Hello world");

    const spans: SpanList = [{ blockId, start: 0, end: 5 }];
    const anchors = buildReferenceAnchors(spans, runtime, "doc-1");
    const resolved = resolveReferenceInBlock(anchors[0], "Hello world");
    expect(resolved.status).toBe("resolved");
  });

  it("remaps when text shifts but exact span still exists", () => {
    const runtime = createLoroRuntime({ peerId: 1 });
    const blockId = "b_test_2";
    const blockMap = ensureBlockMap(runtime.doc, blockId);
    setBlockText(blockMap, "Hello world");

    const spans: SpanList = [{ blockId, start: 6, end: 11 }];
    const anchors = buildReferenceAnchors(spans, runtime, "doc-1");
    const resolved = resolveReferenceInBlock(anchors[0], "Intro Hello world");
    expect(resolved.status).toBe("remapped");
  });

  it("does not resolve when span content changes", () => {
    const runtime = createLoroRuntime({ peerId: 1 });
    const blockId = "b_test_3";
    const blockMap = ensureBlockMap(runtime.doc, blockId);
    setBlockText(blockMap, "Hello world");

    const spans: SpanList = [{ blockId, start: 0, end: 5 }];
    const anchors = buildReferenceAnchors(spans, runtime, "doc-1");
    const resolved = resolveReferenceInBlock(anchors[0], "Hallo world");
    expect(resolved.status).toBe("unresolved");
  });
});
