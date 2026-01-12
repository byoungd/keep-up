import { anchorFromAbsolute } from "@keepup/core";
import { LoroDoc } from "loro-crdt";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createAnnotation,
  deleteAnnotation,
  readAllAnnotations,
  readAnnotation,
  removeAnnotation,
  spanListToStored,
  storedToSpanList,
  updateAnnotationState,
} from "../annotations/annotationSchema";
import type { SpanList } from "../selection/selectionMapping";

describe("Annotation Schema", () => {
  let doc: LoroDoc;

  beforeEach(() => {
    doc = new LoroDoc();
  });

  describe("spanListToStored / storedToSpanList", () => {
    it("should convert span list without anchors", () => {
      const spanList: SpanList = [
        { blockId: "b1", start: 0, end: 5 },
        { blockId: "b2", start: 2, end: 10 },
      ];

      const stored = spanListToStored(spanList);
      expect(stored).toHaveLength(2);
      expect(stored[0].blockId).toBe("b1");
      expect(stored[0].start).toBe(0);
      expect(stored[0].end).toBe(5);
      expect(stored[0].startAnchor).toBeUndefined();

      const restored = storedToSpanList(stored);
      expect(restored).toEqual(spanList);
    });

    it("should convert span list with anchors", () => {
      const startAnchor = anchorFromAbsolute("b1", 0, "after");
      const endAnchor = anchorFromAbsolute("b1", 5, "before");
      const spanList: SpanList = [
        {
          blockId: "b1",
          start: 0,
          end: 5,
          startAnchor: { anchor: startAnchor, bias: "after" },
          endAnchor: { anchor: endAnchor, bias: "before" },
        },
      ];

      const stored = spanListToStored(spanList);
      expect(stored[0].startAnchor).toBeDefined();
      expect(stored[0].startAnchor?.bias).toBe("after");
      expect(typeof stored[0].startAnchor?.anchor).toBe("string"); // base64

      const restored = storedToSpanList(stored);
      expect(restored[0].startAnchor?.bias).toBe("after");
      expect(restored[0].startAnchor?.anchor).toBe(startAnchor);
    });
  });

  describe("createAnnotation", () => {
    it("should create and persist annotation", () => {
      const spanList: SpanList = [{ blockId: "b1", start: 0, end: 10 }];

      const record = createAnnotation(doc, {
        id: "ann-1",
        spanList,
        chain: { policy: { kind: "required_order", maxInterveningBlocks: 0 }, order: ["b1"] },
        content: "Test annotation",
        color: "yellow",
      });

      expect(record.id).toBe("ann-1");
      expect(record.content).toBe("Test annotation");
      expect(record.color).toBe("yellow");
      expect(record.storedState).toBe("active");
      expect(record.spans).toHaveLength(1);
      expect(record.chain.order).toEqual(["b1"]);
    });

    it("should persist to Loro doc", () => {
      createAnnotation(doc, {
        id: "ann-1",
        spanList: [{ blockId: "b1", start: 0, end: 5 }],
        chain: { policy: { kind: "required_order", maxInterveningBlocks: 0 }, order: ["b1"] },
        content: "Hello",
      });

      doc.commit({ origin: "test" });

      const read = readAnnotation(doc, "ann-1");
      expect(read).not.toBeNull();
      expect(read?.content).toBe("Hello");
    });
  });

  describe("readAnnotation", () => {
    it("should return null for non-existent annotation", () => {
      const result = readAnnotation(doc, "non-existent");
      expect(result).toBeNull();
    });

    it("should read existing annotation", () => {
      createAnnotation(doc, {
        id: "ann-1",
        spanList: [{ blockId: "b1", start: 0, end: 5 }],
        chain: { policy: { kind: "required_order", maxInterveningBlocks: 0 }, order: ["b1"] },
        content: "Test",
      });

      const result = readAnnotation(doc, "ann-1");
      expect(result?.id).toBe("ann-1");
      expect(result?.content).toBe("Test");
    });
  });

  describe("readAllAnnotations", () => {
    it("should return empty array for empty doc", () => {
      const result = readAllAnnotations(doc);
      expect(result).toEqual([]);
    });

    it("should return all non-deleted annotations", () => {
      createAnnotation(doc, {
        id: "ann-1",
        spanList: [{ blockId: "b1", start: 0, end: 5 }],
        chain: { policy: { kind: "required_order", maxInterveningBlocks: 0 }, order: ["b1"] },
        content: "First",
      });

      createAnnotation(doc, {
        id: "ann-2",
        spanList: [{ blockId: "b2", start: 0, end: 10 }],
        chain: { policy: { kind: "required_order", maxInterveningBlocks: 0 }, order: ["b2"] },
        content: "Second",
      });

      const result = readAllAnnotations(doc);
      expect(result).toHaveLength(2);
      expect(result.map((r) => r.id).sort()).toEqual(["ann-1", "ann-2"]);
    });

    it("should exclude deleted annotations", () => {
      createAnnotation(doc, {
        id: "ann-1",
        spanList: [{ blockId: "b1", start: 0, end: 5 }],
        chain: { policy: { kind: "required_order", maxInterveningBlocks: 0 }, order: ["b1"] },
        content: "First",
      });

      createAnnotation(doc, {
        id: "ann-2",
        spanList: [{ blockId: "b2", start: 0, end: 10 }],
        chain: { policy: { kind: "required_order", maxInterveningBlocks: 0 }, order: ["b2"] },
        content: "Second",
      });

      deleteAnnotation(doc, "ann-1");

      const result = readAllAnnotations(doc);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("ann-2");
    });
  });

  describe("updateAnnotationState", () => {
    it("should update state and timestamp", () => {
      createAnnotation(doc, {
        id: "ann-1",
        spanList: [{ blockId: "b1", start: 0, end: 5 }],
        chain: { policy: { kind: "required_order", maxInterveningBlocks: 0 }, order: ["b1"] },
        content: "Test",
      });

      const before = readAnnotation(doc, "ann-1");
      expect(before?.storedState).toBe("active");

      updateAnnotationState(doc, "ann-1", "active_partial");

      const after = readAnnotation(doc, "ann-1");
      expect(after?.storedState).toBe("active_partial");
      expect(after?.updatedAtMs).toBeGreaterThanOrEqual(before?.updatedAtMs ?? 0);
    });
  });

  describe("deleteAnnotation", () => {
    it("should soft delete by setting state to deleted", () => {
      createAnnotation(doc, {
        id: "ann-1",
        spanList: [{ blockId: "b1", start: 0, end: 5 }],
        chain: { policy: { kind: "required_order", maxInterveningBlocks: 0 }, order: ["b1"] },
        content: "Test",
      });

      deleteAnnotation(doc, "ann-1");

      const result = readAnnotation(doc, "ann-1");
      expect(result?.storedState).toBe("deleted");
    });
  });

  describe("removeAnnotation", () => {
    it("should hard delete from CRDT", () => {
      createAnnotation(doc, {
        id: "ann-1",
        spanList: [{ blockId: "b1", start: 0, end: 5 }],
        chain: { policy: { kind: "required_order", maxInterveningBlocks: 0 }, order: ["b1"] },
        content: "Test",
      });

      removeAnnotation(doc, "ann-1");

      const result = readAnnotation(doc, "ann-1");
      expect(result).toBeNull();
    });
  });

  describe("replication", () => {
    it("should converge between two clients", () => {
      const doc1 = new LoroDoc();
      doc1.setPeerId("1");

      const doc2 = new LoroDoc();
      doc2.setPeerId("2");

      // Client 1 creates annotation
      createAnnotation(doc1, {
        id: "ann-1",
        spanList: [{ blockId: "b1", start: 0, end: 5 }],
        chain: { policy: { kind: "required_order", maxInterveningBlocks: 0 }, order: ["b1"] },
        content: "From client 1",
      });
      doc1.commit({ origin: "client1" });

      // Client 2 creates different annotation
      createAnnotation(doc2, {
        id: "ann-2",
        spanList: [{ blockId: "b2", start: 0, end: 10 }],
        chain: { policy: { kind: "required_order", maxInterveningBlocks: 0 }, order: ["b2"] },
        content: "From client 2",
      });
      doc2.commit({ origin: "client2" });

      // Sync
      const update1 = doc1.export({ mode: "snapshot" });
      const update2 = doc2.export({ mode: "snapshot" });

      doc1.import(update2);
      doc2.import(update1);

      // Both should have both annotations
      const annotations1 = readAllAnnotations(doc1);
      const annotations2 = readAllAnnotations(doc2);

      expect(annotations1).toHaveLength(2);
      expect(annotations2).toHaveLength(2);
      expect(annotations1.map((a) => a.id).sort()).toEqual(["ann-1", "ann-2"]);
      expect(annotations2.map((a) => a.id).sort()).toEqual(["ann-1", "ann-2"]);
    });
  });
});
