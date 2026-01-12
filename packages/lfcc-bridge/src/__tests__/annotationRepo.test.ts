import { anchorFromAbsolute } from "@keepup/core";
import { describe, expect, it } from "vitest";
import {
  type AnnotationRecord,
  createAnnotationRepo,
  decodeSpanList,
  encodeSpanList,
} from "../annotations/annotationRepo";
import { createLoroRuntime } from "../runtime/loroRuntime";
import type { SpanList } from "../selection/selectionMapping";

describe("AnnotationRepo", () => {
  describe("encodeSpanList / decodeSpanList", () => {
    it("should round-trip span list", () => {
      const spanList: SpanList = [
        { blockId: "b1", start: 0, end: 5 },
        { blockId: "b2", start: 2, end: 10 },
      ];

      const encoded = encodeSpanList(spanList);
      expect(encoded).toBeInstanceOf(Uint8Array);

      const decoded = decodeSpanList(encoded);
      expect(decoded).toHaveLength(2);
      expect(decoded[0].blockId).toBe("b1");
      expect(decoded[1].blockId).toBe("b2");
    });

    it("should handle span list with anchors", () => {
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

      const encoded = encodeSpanList(spanList);
      const decoded = decodeSpanList(encoded);

      expect(decoded[0].startAnchor?.bias).toBe("after");
      expect(decoded[0].endAnchor?.bias).toBe("before");
    });
  });

  describe("CRUD operations", () => {
    it("should create and list annotations", () => {
      const runtime = createLoroRuntime({ peerId: "1" });
      const repo = createAnnotationRepo(runtime);

      const record: AnnotationRecord = {
        annotationId: "ann-1",
        kind: "highlight",
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
        spanList: [{ blockId: "b1", start: 0, end: 5 }],
        chainPolicy: { mode: "required_order" },
        verificationState: "active",
        content: "Test annotation",
        color: "yellow",
      };

      repo.create(record);

      const list = repo.list();
      expect(list).toHaveLength(1);
      expect(list[0].annotationId).toBe("ann-1");
      expect(list[0].content).toBe("Test annotation");
    });

    it("should get annotation by ID", () => {
      const runtime = createLoroRuntime({ peerId: "1" });
      const repo = createAnnotationRepo(runtime);

      repo.create({
        annotationId: "ann-1",
        kind: "highlight",
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
        spanList: [{ blockId: "b1", start: 0, end: 5 }],
        chainPolicy: { mode: "required_order" },
        verificationState: "active",
      });

      const found = repo.get("ann-1");
      expect(found).not.toBeNull();
      expect(found?.annotationId).toBe("ann-1");

      const notFound = repo.get("non-existent");
      expect(notFound).toBeNull();
    });

    it("should update annotation state", () => {
      const runtime = createLoroRuntime({ peerId: "1" });
      const repo = createAnnotationRepo(runtime);

      repo.create({
        annotationId: "ann-1",
        kind: "highlight",
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
        spanList: [{ blockId: "b1", start: 0, end: 5 }],
        chainPolicy: { mode: "required_order" },
        verificationState: "active",
      });

      repo.update("ann-1", { verificationState: "orphan" });

      const updated = repo.get("ann-1");
      expect(updated?.verificationState).toBe("orphan");
    });

    it("should update color and content", () => {
      const runtime = createLoroRuntime({ peerId: "1" });
      const repo = createAnnotationRepo(runtime);

      repo.create({
        annotationId: "ann-1",
        kind: "highlight",
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
        spanList: [{ blockId: "b1", start: 0, end: 5 }],
        chainPolicy: { mode: "required_order" },
        verificationState: "active",
        content: "Before",
        color: "yellow",
      });

      repo.update("ann-1", { content: "After", color: "green" });

      const updated = repo.get("ann-1");
      expect(updated?.content).toBe("After");
      expect(updated?.color).toBe("green");
    });

    it("should delete annotation", () => {
      const runtime = createLoroRuntime({ peerId: "1" });
      const repo = createAnnotationRepo(runtime);

      repo.create({
        annotationId: "ann-1",
        kind: "highlight",
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
        spanList: [{ blockId: "b1", start: 0, end: 5 }],
        chainPolicy: { mode: "required_order" },
        verificationState: "active",
      });

      repo.delete("ann-1");

      const list = repo.list();
      expect(list).toHaveLength(0);
    });
  });

  describe("replication", () => {
    it("should converge between two clients", () => {
      const runtime1 = createLoroRuntime({ peerId: "1" });
      const runtime2 = createLoroRuntime({ peerId: "2" });
      const repo1 = createAnnotationRepo(runtime1);
      const repo2 = createAnnotationRepo(runtime2);

      repo1.create({
        annotationId: "ann-1",
        kind: "highlight",
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
        spanList: [{ blockId: "b1", start: 0, end: 5 }],
        chainPolicy: { mode: "required_order" },
        verificationState: "active",
      });

      repo2.create({
        annotationId: "ann-2",
        kind: "comment",
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
        spanList: [{ blockId: "b2", start: 0, end: 10 }],
        chainPolicy: { mode: "required_order" },
        verificationState: "active",
      });

      // Sync
      const update1 = runtime1.exportSnapshot();
      const update2 = runtime2.exportSnapshot();
      runtime1.importBytes(update2);
      runtime2.importBytes(update1);

      // Both should have both annotations
      const list1 = repo1.list();
      const list2 = repo2.list();

      expect(list1).toHaveLength(2);
      expect(list2).toHaveLength(2);
      expect(list1.map((a) => a.annotationId).sort()).toEqual(["ann-1", "ann-2"]);
      expect(list2.map((a) => a.annotationId).sort()).toEqual(["ann-1", "ann-2"]);
    });

    it("should survive snapshot round-trip", () => {
      const runtime1 = createLoroRuntime({ peerId: "1" });
      const repo1 = createAnnotationRepo(runtime1);

      repo1.create({
        annotationId: "ann-1",
        kind: "highlight",
        createdAtMs: 1000,
        updatedAtMs: 1000,
        spanList: [{ blockId: "b1", start: 0, end: 5 }],
        chainPolicy: { mode: "required_order" },
        verificationState: "active",
        content: "Persisted",
      });

      // Export snapshot
      const snapshot = runtime1.exportSnapshot();

      // Create new runtime and import
      const runtime2 = createLoroRuntime({ peerId: "2" });
      runtime2.importBytes(snapshot);
      const repo2 = createAnnotationRepo(runtime2);

      // Annotation should be preserved
      const list = repo2.list();
      expect(list).toHaveLength(1);
      expect(list[0].annotationId).toBe("ann-1");
      expect(list[0].content).toBe("Persisted");
    });
  });

  describe("stable ordering", () => {
    it("should list annotations in stable order", () => {
      const runtime = createLoroRuntime({ peerId: "1" });
      const repo = createAnnotationRepo(runtime);

      // Create in non-chronological order
      repo.create({
        annotationId: "ann-3",
        kind: "highlight",
        createdAtMs: 3000,
        updatedAtMs: 3000,
        spanList: [{ blockId: "b1", start: 0, end: 5 }],
        chainPolicy: { mode: "required_order" },
        verificationState: "active",
      });

      repo.create({
        annotationId: "ann-1",
        kind: "highlight",
        createdAtMs: 1000,
        updatedAtMs: 1000,
        spanList: [{ blockId: "b1", start: 0, end: 5 }],
        chainPolicy: { mode: "required_order" },
        verificationState: "active",
      });

      repo.create({
        annotationId: "ann-2",
        kind: "highlight",
        createdAtMs: 2000,
        updatedAtMs: 2000,
        spanList: [{ blockId: "b1", start: 0, end: 5 }],
        chainPolicy: { mode: "required_order" },
        verificationState: "active",
      });

      const list = repo.list();
      expect(list.map((a) => a.annotationId)).toEqual(["ann-1", "ann-2", "ann-3"]);
    });

    // D-01: Tie-breaker test - same timestamp should sort by ID
    it("should use ID as tie-breaker when timestamps match", () => {
      const runtime = createLoroRuntime({ peerId: "1" });
      const repo = createAnnotationRepo(runtime);
      const sameTimestamp = 1000;

      // Create with different IDs but same timestamp
      repo.create({
        annotationId: "zzzz",
        kind: "highlight",
        createdAtMs: sameTimestamp,
        updatedAtMs: sameTimestamp,
        spanList: [{ blockId: "b1", start: 0, end: 5 }],
        chainPolicy: { mode: "required_order" },
        verificationState: "active",
      });

      repo.create({
        annotationId: "aaaa",
        kind: "highlight",
        createdAtMs: sameTimestamp,
        updatedAtMs: sameTimestamp,
        spanList: [{ blockId: "b2", start: 0, end: 5 }],
        chainPolicy: { mode: "required_order" },
        verificationState: "active",
      });

      repo.create({
        annotationId: "mmmm",
        kind: "highlight",
        createdAtMs: sameTimestamp,
        updatedAtMs: sameTimestamp,
        spanList: [{ blockId: "b3", start: 0, end: 5 }],
        chainPolicy: { mode: "required_order" },
        verificationState: "active",
      });

      const list = repo.list();
      // Should be sorted by ID when timestamps are equal
      expect(list.map((a) => a.annotationId)).toEqual(["aaaa", "mmmm", "zzzz"]);
    });
  });
});
