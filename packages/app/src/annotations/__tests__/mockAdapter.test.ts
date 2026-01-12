/**
 * LFCC v0.9 RC - Mock Adapter Tests
 */

import { describe, expect, it, vi } from "vitest";
import { createMockAdapter } from "../mockAdapter.js";
import type { AnnotationListItem } from "../types.js";

describe("Mock Adapter", () => {
  describe("createMockAdapter", () => {
    it("should create adapter with default data", () => {
      const adapter = createMockAdapter();
      expect(adapter.getData().length).toBeGreaterThan(0);
    });

    it("should create adapter with custom data", () => {
      const customData: AnnotationListItem[] = [
        {
          annotation_id: "test-1",
          kind: "comment",
          status: "active",
          updated_at_ms: Date.now(),
          span_count: 1,
        },
      ];
      const adapter = createMockAdapter(customData);
      expect(adapter.getData().length).toBe(1);
    });
  });

  describe("listThreads", () => {
    it("should return all annotations", async () => {
      const adapter = createMockAdapter();
      adapter.setDelay(0);
      const threads = await adapter.listThreads();
      expect(threads.length).toBeGreaterThan(0);
    });
  });

  describe("openThread", () => {
    it("should call callback", async () => {
      const onOpenThread = vi.fn();
      const adapter = createMockAdapter([], { onOpenThread });
      adapter.setDelay(0);

      await adapter.openThread("anno-1");
      expect(onOpenThread).toHaveBeenCalledWith("anno-1");
    });
  });

  describe("scrollToAnnotation", () => {
    it("should call callback", async () => {
      const onScrollTo = vi.fn();
      const adapter = createMockAdapter([], { onScrollTo });
      adapter.setDelay(0);

      await adapter.scrollToAnnotation("anno-1");
      expect(onScrollTo).toHaveBeenCalledWith("anno-1");
    });
  });

  describe("requestVerify", () => {
    it("should call callback", async () => {
      const onRequestVerify = vi.fn();
      const adapter = createMockAdapter([], { onRequestVerify });
      adapter.setDelay(0);

      await adapter.requestVerify("anno-1");
      expect(onRequestVerify).toHaveBeenCalledWith("anno-1");
    });

    it("should update status from unverified to active", async () => {
      const data: AnnotationListItem[] = [
        {
          annotation_id: "anno-1",
          kind: "comment",
          status: "active_unverified",
          updated_at_ms: Date.now(),
          span_count: 1,
        },
      ];
      const adapter = createMockAdapter(data);
      adapter.setDelay(0);

      await adapter.requestVerify("anno-1");
      expect(adapter.getData()[0].status).toBe("active");
    });
  });

  describe("resolveAnnotation", () => {
    it("should mark as resolved", async () => {
      const data: AnnotationListItem[] = [
        {
          annotation_id: "anno-1",
          kind: "comment",
          status: "active",
          updated_at_ms: Date.now(),
          span_count: 1,
        },
      ];
      const adapter = createMockAdapter(data);
      adapter.setDelay(0);

      await adapter.resolveAnnotation?.("anno-1");
      expect(adapter.getData()[0].is_resolved).toBe(true);
    });
  });

  describe("deleteAnnotation", () => {
    it("should remove annotation", async () => {
      const data: AnnotationListItem[] = [
        {
          annotation_id: "anno-1",
          kind: "comment",
          status: "active",
          updated_at_ms: Date.now(),
          span_count: 1,
        },
        {
          annotation_id: "anno-2",
          kind: "comment",
          status: "active",
          updated_at_ms: Date.now(),
          span_count: 1,
        },
      ];
      const adapter = createMockAdapter(data);
      adapter.setDelay(0);

      await adapter.deleteAnnotation?.("anno-1");
      expect(adapter.getData().length).toBe(1);
      expect(adapter.getData()[0].annotation_id).toBe("anno-2");
    });
  });

  describe("setData", () => {
    it("should replace data", () => {
      const adapter = createMockAdapter();
      const newData: AnnotationListItem[] = [
        {
          annotation_id: "new-1",
          kind: "highlight",
          status: "active",
          updated_at_ms: Date.now(),
          span_count: 1,
        },
      ];

      adapter.setData(newData);
      expect(adapter.getData().length).toBe(1);
      expect(adapter.getData()[0].annotation_id).toBe("new-1");
    });
  });

  describe("addAnnotation", () => {
    it("should add annotation", () => {
      const adapter = createMockAdapter([]);
      adapter.addAnnotation({
        annotation_id: "new-1",
        kind: "comment",
        status: "active",
        updated_at_ms: Date.now(),
        span_count: 1,
      });

      expect(adapter.getData().length).toBe(1);
    });
  });

  describe("updateStatus", () => {
    it("should update status", () => {
      const data: AnnotationListItem[] = [
        {
          annotation_id: "anno-1",
          kind: "comment",
          status: "active",
          updated_at_ms: Date.now(),
          span_count: 1,
        },
      ];
      const adapter = createMockAdapter(data);

      adapter.updateStatus("anno-1", "orphan");
      expect(adapter.getData()[0].status).toBe("orphan");
    });
  });

  describe("setDelay", () => {
    it("should set delay", async () => {
      const adapter = createMockAdapter([]);
      adapter.setDelay(50);

      const start = Date.now();
      await adapter.listThreads();
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(40);
    });
  });
});
