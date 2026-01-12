import { LoroDoc } from "loro-crdt";
import { describe, expect, it, vi } from "vitest";
import { createAnnotation, readAnnotation } from "../annotations/annotationSchema";
import {
  createRemoteSyncHandler,
  createVerificationReducer,
  resolveStateConflict,
  verifyAnnotationSpans,
} from "../annotations/verificationSync";
import { createLoroRuntime } from "../runtime/loroRuntime";

describe("Verification Sync", () => {
  describe("createVerificationReducer", () => {
    it("should transition from active to orphan", () => {
      const runtime = createLoroRuntime({ peerId: "1" });

      createAnnotation(runtime.doc, {
        id: "ann-1",
        spanList: [{ blockId: "b1", start: 0, end: 5 }],
        chain: { policy: { kind: "required_order", maxInterveningBlocks: 0 }, order: ["b1"] },
        content: "Test",
        storedState: "active",
      });
      runtime.commit("test");

      const reducer = createVerificationReducer(runtime);
      const result = reducer.processVerification("ann-1", {
        status: "orphan",
        reason: "Block deleted",
      });

      expect(result).toBe("orphan");

      const updated = readAnnotation(runtime.doc, "ann-1");
      expect(updated?.storedState).toBe("orphan");
    });

    it("should transition from active to active_partial", () => {
      const runtime = createLoroRuntime({ peerId: "1" });

      createAnnotation(runtime.doc, {
        id: "ann-1",
        spanList: [
          { blockId: "b1", start: 0, end: 5 },
          { blockId: "b2", start: 0, end: 10 },
        ],
        chain: { policy: { kind: "required_order", maxInterveningBlocks: 0 }, order: ["b1", "b2"] },
        content: "Test",
        storedState: "active",
      });
      runtime.commit("test");

      const reducer = createVerificationReducer(runtime);
      const result = reducer.processVerification("ann-1", {
        status: "active_partial",
        resolvedSpans: [{ blockId: "b1", start: 0, end: 5 }],
        missingBlockIds: ["b2"],
      });

      expect(result).toBe("active_partial");
    });

    it("should not change state if already same", () => {
      const runtime = createLoroRuntime({ peerId: "1" });

      createAnnotation(runtime.doc, {
        id: "ann-1",
        spanList: [{ blockId: "b1", start: 0, end: 5 }],
        chain: { policy: { kind: "required_order", maxInterveningBlocks: 0 }, order: ["b1"] },
        content: "Test",
        storedState: "active",
      });
      runtime.commit("test");

      const reducer = createVerificationReducer(runtime);
      const result = reducer.processVerification("ann-1", {
        status: "active",
        resolvedSpans: [{ blockId: "b1", start: 0, end: 5 }],
      });

      expect(result).toBeNull();
    });

    it("should not change deleted annotations", () => {
      const runtime = createLoroRuntime({ peerId: "1" });

      createAnnotation(runtime.doc, {
        id: "ann-1",
        spanList: [{ blockId: "b1", start: 0, end: 5 }],
        chain: { policy: { kind: "required_order", maxInterveningBlocks: 0 }, order: ["b1"] },
        content: "Test",
        storedState: "deleted",
      });
      runtime.commit("test");

      const reducer = createVerificationReducer(runtime);
      const result = reducer.processVerification("ann-1", {
        status: "active",
        resolvedSpans: [{ blockId: "b1", start: 0, end: 5 }],
      });

      expect(result).toBeNull();
    });

    it("should call onStateChange callback", () => {
      const runtime = createLoroRuntime({ peerId: "1" });
      const onStateChange = vi.fn();

      createAnnotation(runtime.doc, {
        id: "ann-1",
        spanList: [{ blockId: "b1", start: 0, end: 5 }],
        chain: { policy: { kind: "required_order", maxInterveningBlocks: 0 }, order: ["b1"] },
        content: "Test",
        storedState: "active",
      });
      runtime.commit("test");

      const reducer = createVerificationReducer(runtime, { onStateChange });
      reducer.processVerification("ann-1", { status: "orphan", reason: "test" });

      expect(onStateChange).toHaveBeenCalledWith("ann-1", "active", "orphan");
    });

    // S-01: Fail-closed conflict resolution tests
    it("should NOT downgrade from orphan to active (fail-closed)", () => {
      const runtime = createLoroRuntime({ peerId: "1" });

      createAnnotation(runtime.doc, {
        id: "ann-1",
        spanList: [{ blockId: "b1", start: 0, end: 5 }],
        chain: { policy: { kind: "required_order", maxInterveningBlocks: 0 }, order: ["b1"] },
        content: "Test",
        storedState: "orphan", // Already marked orphan
      });
      runtime.commit("test");

      const reducer = createVerificationReducer(runtime);
      // Remote tries to set it back to active - should be rejected
      const result = reducer.processVerification("ann-1", {
        status: "active",
        resolvedSpans: [{ blockId: "b1", start: 0, end: 5 }],
      });

      expect(result).toBeNull(); // Rejected, no change

      const updated = readAnnotation(runtime.doc, "ann-1");
      expect(updated?.storedState).toBe("orphan"); // Still orphan
    });

    it("should allow upgrade from active to orphan (safety upgrade)", () => {
      const runtime = createLoroRuntime({ peerId: "1" });

      createAnnotation(runtime.doc, {
        id: "ann-1",
        spanList: [{ blockId: "b1", start: 0, end: 5 }],
        chain: { policy: { kind: "required_order", maxInterveningBlocks: 0 }, order: ["b1"] },
        content: "Test",
        storedState: "active",
      });
      runtime.commit("test");

      const reducer = createVerificationReducer(runtime);
      const result = reducer.processVerification("ann-1", {
        status: "orphan",
        reason: "Block deleted",
      });

      expect(result).toBe("orphan");

      const updated = readAnnotation(runtime.doc, "ann-1");
      expect(updated?.storedState).toBe("orphan");
    });
  });

  describe("verifyAnnotationSpans", () => {
    it("should return active when all blocks exist", () => {
      const doc = new LoroDoc();
      const annotation = {
        id: "ann-1",
        spans: [
          { blockId: "b1", start: 0, end: 5 },
          { blockId: "b2", start: 0, end: 10 },
        ],
        chain: {
          policy: { kind: "required_order" as const, maxInterveningBlocks: 0 },
          order: ["b1", "b2"],
        },
        content: "Test",
        storedState: "active" as const,
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
      };

      const blockExists = (id: string) => ["b1", "b2"].includes(id);
      const result = verifyAnnotationSpans(doc, annotation, blockExists);

      expect(result.status).toBe("active");
      if (result.status === "active") {
        expect(result.resolvedSpans).toHaveLength(2);
      }
    });

    it("should return active_partial when some blocks missing", () => {
      const doc = new LoroDoc();
      const annotation = {
        id: "ann-1",
        spans: [
          { blockId: "b1", start: 0, end: 5 },
          { blockId: "b2", start: 0, end: 10 },
        ],
        chain: {
          policy: { kind: "required_order" as const, maxInterveningBlocks: 0 },
          order: ["b1", "b2"],
        },
        content: "Test",
        storedState: "active" as const,
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
      };

      const blockExists = (id: string) => id === "b1";
      const result = verifyAnnotationSpans(doc, annotation, blockExists);

      expect(result.status).toBe("active_partial");
      if (result.status === "active_partial") {
        expect(result.resolvedSpans).toHaveLength(1);
        expect(result.missingBlockIds).toEqual(["b2"]);
      }
    });

    it("should return orphan when all blocks missing", () => {
      const doc = new LoroDoc();
      const annotation = {
        id: "ann-1",
        spans: [{ blockId: "b1", start: 0, end: 5 }],
        chain: {
          policy: { kind: "required_order" as const, maxInterveningBlocks: 0 },
          order: ["b1"],
        },
        content: "Test",
        storedState: "active" as const,
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
      };

      const blockExists = () => false;
      const result = verifyAnnotationSpans(doc, annotation, blockExists);

      expect(result.status).toBe("orphan");
    });

    it("should return orphan when no spans", () => {
      const doc = new LoroDoc();
      const annotation = {
        id: "ann-1",
        spans: [],
        chain: { policy: { kind: "required_order" as const, maxInterveningBlocks: 0 }, order: [] },
        content: "Test",
        storedState: "active" as const,
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
      };

      const blockExists = () => true;
      const result = verifyAnnotationSpans(doc, annotation, blockExists);

      expect(result.status).toBe("orphan");
    });
  });

  describe("resolveStateConflict", () => {
    it("should prefer deleted over all states", () => {
      expect(resolveStateConflict("deleted", "active")).toBe("deleted");
      expect(resolveStateConflict("active", "deleted")).toBe("deleted");
      expect(resolveStateConflict("deleted", "orphan")).toBe("deleted");
    });

    it("should prefer hidden over active states", () => {
      expect(resolveStateConflict("hidden", "active")).toBe("hidden");
      expect(resolveStateConflict("active", "hidden")).toBe("hidden");
      expect(resolveStateConflict("hidden", "orphan")).toBe("hidden");
    });

    it("should prefer orphan over active_partial", () => {
      expect(resolveStateConflict("orphan", "active_partial")).toBe("orphan");
      expect(resolveStateConflict("active_partial", "orphan")).toBe("orphan");
    });

    it("should prefer active_partial over active", () => {
      expect(resolveStateConflict("active_partial", "active")).toBe("active_partial");
      expect(resolveStateConflict("active", "active_partial")).toBe("active_partial");
    });
  });

  describe("createRemoteSyncHandler", () => {
    it("should ignore local writes echoing back", () => {
      const runtime = createLoroRuntime({ peerId: "1" });
      const onRemoteStateChange = vi.fn();

      createAnnotation(runtime.doc, {
        id: "ann-1",
        spanList: [{ blockId: "b1", start: 0, end: 5 }],
        chain: { policy: { kind: "required_order", maxInterveningBlocks: 0 }, order: ["b1"] },
        content: "Test",
        storedState: "active",
      });
      runtime.commit("test");

      const handler = createRemoteSyncHandler(runtime, onRemoteStateChange);

      // Mark as local write
      handler.markLocalWrite("ann-1");

      // Simulate echo
      const applied = handler.handleRemoteChange("ann-1", "orphan");

      expect(applied).toBe(false);
      expect(onRemoteStateChange).not.toHaveBeenCalled();
    });

    it("should notify on genuine remote changes", () => {
      const runtime = createLoroRuntime({ peerId: "1" });
      const onRemoteStateChange = vi.fn();

      createAnnotation(runtime.doc, {
        id: "ann-1",
        spanList: [{ blockId: "b1", start: 0, end: 5 }],
        chain: { policy: { kind: "required_order", maxInterveningBlocks: 0 }, order: ["b1"] },
        content: "Test",
        storedState: "active",
      });
      runtime.commit("test");

      const handler = createRemoteSyncHandler(runtime, onRemoteStateChange);

      // No local write marker - this is a remote change
      const applied = handler.handleRemoteChange("ann-1", "orphan");

      expect(applied).toBe(true);
      expect(onRemoteStateChange).toHaveBeenCalledWith("ann-1", "orphan");
    });
  });

  describe("replication convergence", () => {
    it("should converge verification state between clients", () => {
      const runtime1 = createLoroRuntime({ peerId: "1" });
      const runtime2 = createLoroRuntime({ peerId: "2" });

      // Both clients create same annotation
      createAnnotation(runtime1.doc, {
        id: "ann-1",
        spanList: [{ blockId: "b1", start: 0, end: 5 }],
        chain: { policy: { kind: "required_order", maxInterveningBlocks: 0 }, order: ["b1"] },
        content: "Test",
        storedState: "active",
      });
      runtime1.commit("client1");

      // Sync to client 2
      const update1 = runtime1.exportSnapshot();
      runtime2.importBytes(update1);

      // Client 1 marks as orphan
      const reducer1 = createVerificationReducer(runtime1);
      reducer1.processVerification("ann-1", { status: "orphan", reason: "Block deleted" });

      // Sync to client 2
      const update2 = runtime1.exportUpdate();
      runtime2.importBytes(update2);

      // Both should have orphan state
      const ann1 = readAnnotation(runtime1.doc, "ann-1");
      const ann2 = readAnnotation(runtime2.doc, "ann-1");

      expect(ann1?.storedState).toBe("orphan");
      expect(ann2?.storedState).toBe("orphan");
    });
  });
});
