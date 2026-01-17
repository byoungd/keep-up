import { Schema } from "prosemirror-model";
import { DecorationSet } from "prosemirror-view";
import { describe, expect, it } from "vitest";
import {
  type AnnotationSpan,
  type AnnotationWithRanges,
  buildDecorations,
  buildDeterministicDecorations,
  buildGapMarkers,
  decorationKeyForSpan,
  getColorClass,
  getGapClass,
  getStateClasses,
  StatefulAnnotationUIAdapter,
} from "../annotations/annotationUiAdapter";

const schema = new Schema({
  nodes: {
    doc: { content: "paragraph+" },
    paragraph: {
      content: "text*",
      attrs: { block_id: { default: "" } },
      toDOM: () => ["p", 0],
    },
    text: { inline: true },
  },
});

function createDoc(texts: string[]) {
  const paragraphs = texts.map((text, i) =>
    schema.nodes.paragraph.create({ block_id: `b${i + 1}` }, text ? schema.text(text) : null)
  );
  return schema.nodes.doc.create(null, paragraphs);
}

describe("Annotation UI Adapter", () => {
  describe("decorationKeyForSpan", () => {
    it("should generate deterministic key", () => {
      const span: AnnotationSpan = {
        annoId: "ann-1",
        spanId: "span-1",
        blockId: "b1",
        from: 0,
        to: 5,
        state: "active",
      };
      expect(decorationKeyForSpan(span)).toBe("anno:ann-1:span:span-1:block:b1");
    });
  });

  describe("getStateClasses", () => {
    it("should return classes for active", () => {
      expect(getStateClasses("active")).toBe("lfcc-annotation lfcc-annotation--active");
    });
    it("should return classes for partial", () => {
      expect(getStateClasses("active_partial")).toBe("lfcc-annotation lfcc-annotation--partial");
    });
    it("should return null for orphan", () => {
      expect(getStateClasses("orphan")).toBeNull();
    });
  });

  describe("getColorClass", () => {
    it("should return color class", () => {
      expect(getColorClass("yellow")).toBe("lfcc-annotation--yellow");
    });
    it("should return empty for undefined", () => {
      expect(getColorClass(undefined)).toBe("");
    });
  });

  describe("buildDeterministicDecorations", () => {
    it("should return empty for no spans", () => {
      const doc = createDoc(["Hello"]);
      expect(buildDeterministicDecorations([], doc)).toBe(DecorationSet.empty);
    });

    it("should create decorations for active", () => {
      const doc = createDoc(["Hello world"]);
      const spans: AnnotationSpan[] = [
        {
          annoId: "ann-1",
          spanId: "span-1",
          blockId: "b1",
          from: 1,
          to: 6,
          state: "active",
        },
      ];
      const result = buildDeterministicDecorations(spans, doc);
      expect(result.find(1, 6)).toHaveLength(1);
    });

    it("should skip orphan spans", () => {
      const doc = createDoc(["Hello world"]);
      const spans: AnnotationSpan[] = [
        {
          annoId: "ann-1",
          spanId: "span-1",
          blockId: "b1",
          from: 1,
          to: 6,
          state: "orphan",
        },
      ];
      expect(buildDeterministicDecorations(spans, doc)).toBe(DecorationSet.empty);
    });
  });

  describe("buildDecorations", () => {
    it("should build from annotations", () => {
      const doc = createDoc(["Hello world"]);
      const annotations: AnnotationWithRanges[] = [
        {
          id: "ann-1",
          state: "active",
          color: "yellow",
          ranges: [{ annoId: "ann-1", spanId: "span-1", blockId: "b1", from: 1, to: 6 }],
        },
      ];
      expect(buildDecorations(annotations, doc).find(1, 6)).toHaveLength(1);
    });

    it("should skip orphan annotations", () => {
      const doc = createDoc(["Hello world"]);
      const annotations: AnnotationWithRanges[] = [
        {
          id: "ann-1",
          state: "orphan",
          ranges: [{ annoId: "ann-1", spanId: "span-1", blockId: "b1", from: 1, to: 6 }],
        },
      ];
      expect(buildDecorations(annotations, doc)).toBe(DecorationSet.empty);
    });
  });

  describe("StatefulAnnotationUIAdapter", () => {
    it("should implement interface", () => {
      const adapter = new StatefulAnnotationUIAdapter();
      const doc = createDoc(["Hello"]);
      expect(adapter.buildDecorations([], doc)).toBe(DecorationSet.empty);
    });
  });
});

describe("Gap Visualization", () => {
  describe("buildGapMarkers", () => {
    it("should return empty for non-partial annotations", () => {
      const anno: AnnotationWithRanges = { id: "ann-1", state: "active", ranges: [] };
      expect(buildGapMarkers(anno, ["b1", "b2"])).toEqual([]);
    });

    it("should find gaps in partial annotations", () => {
      const anno: AnnotationWithRanges = {
        id: "ann-1",
        state: "active_partial",
        ranges: [
          { annoId: "ann-1", spanId: "s1", blockId: "b1", from: 1, to: 5 },
          { annoId: "ann-1", spanId: "s3", blockId: "b3", from: 10, to: 15 },
        ],
      };
      const gaps = buildGapMarkers(anno, ["b1", "b2", "b3"]);
      expect(gaps).toHaveLength(1);
      expect(gaps[0].afterBlockId).toBe("b1");
      expect(gaps[0].beforeBlockId).toBe("b2");
    });
  });

  describe("getGapClass", () => {
    it("should return gap classes", () => {
      expect(getGapClass("required_order")).toContain("lfcc-gap");
      expect(getGapClass("required_order", "prominent")).toContain("lfcc-gap--prominent");
      expect(getGapClass("required_order", "hidden")).toBe("");
    });
  });
});
