/**
 * Message Batcher Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CollabMessage } from "../../collabRelay";
import { type BatchedMessage, MessageBatcher } from "../messageBatcher";

describe("MessageBatcher", () => {
  let batcher: MessageBatcher;
  let deliveredBatches: Array<{ docId: string; batch: BatchedMessage }>;

  beforeEach(() => {
    vi.useFakeTimers();
    deliveredBatches = [];
    batcher = new MessageBatcher(
      (docId, batch) => {
        deliveredBatches.push({ docId, batch });
      },
      { batchWindowMs: 20, maxBatchSize: 5, maxBatchBytes: 1024 }
    );
  });

  afterEach(() => {
    batcher.clear();
    vi.useRealTimers();
  });

  const createMessage = (docId: string, senderId: string): CollabMessage => ({
    type: "CRDT_UPDATE",
    docId,
    senderId,
    ts: Date.now(),
    bytesB64: "dGVzdA==", // "test" in base64
  });

  describe("basic batching", () => {
    it("should batch messages within window", () => {
      batcher.queue("doc-1", createMessage("doc-1", "user-1"));
      batcher.queue("doc-1", createMessage("doc-1", "user-2"));

      expect(deliveredBatches).toHaveLength(0);

      vi.advanceTimersByTime(20);

      expect(deliveredBatches).toHaveLength(1);
      expect(deliveredBatches[0].batch.messages).toHaveLength(2);
    });

    it("should deliver batch after window expires", () => {
      batcher.queue("doc-1", createMessage("doc-1", "user-1"));

      vi.advanceTimersByTime(10);
      expect(deliveredBatches).toHaveLength(0);

      vi.advanceTimersByTime(10);
      expect(deliveredBatches).toHaveLength(1);
    });

    it("should batch messages per document", () => {
      batcher.queue("doc-1", createMessage("doc-1", "user-1"));
      batcher.queue("doc-2", createMessage("doc-2", "user-2"));

      vi.advanceTimersByTime(20);

      expect(deliveredBatches).toHaveLength(2);
      expect(deliveredBatches[0].docId).toBe("doc-1");
      expect(deliveredBatches[1].docId).toBe("doc-2");
    });
  });

  describe("size limits", () => {
    it("should flush when max batch size reached", () => {
      // Queue 5 messages (max batch size)
      for (let i = 0; i < 5; i++) {
        batcher.queue("doc-1", createMessage("doc-1", `user-${i}`));
      }

      // Not flushed yet - batch is at limit but not exceeded
      expect(deliveredBatches).toHaveLength(0);

      // Queue one more - this triggers flush of previous batch
      batcher.queue("doc-1", createMessage("doc-1", "user-5"));

      // Previous batch should have been flushed
      expect(deliveredBatches).toHaveLength(1);
      expect(deliveredBatches[0].batch.messages).toHaveLength(5);

      vi.advanceTimersByTime(20);

      // New batch with the 6th message
      expect(deliveredBatches).toHaveLength(2);
      expect(deliveredBatches[1].batch.messages).toHaveLength(1);
    });

    it("should flush when max bytes exceeded", () => {
      // Create a large message
      const largeMessage: CollabMessage = {
        type: "CRDT_UPDATE",
        docId: "doc-1",
        senderId: "user-1",
        ts: Date.now(),
        bytesB64: "x".repeat(600), // ~600 bytes
      };

      batcher.queue("doc-1", largeMessage);
      batcher.queue("doc-1", largeMessage);

      // Should have flushed after second message exceeds 1024 bytes
      expect(deliveredBatches.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("flush", () => {
    it("should flush all pending batches", () => {
      batcher.queue("doc-1", createMessage("doc-1", "user-1"));
      batcher.queue("doc-2", createMessage("doc-2", "user-2"));

      expect(deliveredBatches).toHaveLength(0);

      batcher.flush();

      expect(deliveredBatches).toHaveLength(2);
    });

    it("should not deliver empty batches", () => {
      batcher.flush();
      expect(deliveredBatches).toHaveLength(0);
    });
  });

  describe("metrics", () => {
    it("should track batch metrics", () => {
      batcher.queue("doc-1", createMessage("doc-1", "user-1"));
      batcher.queue("doc-1", createMessage("doc-1", "user-2"));

      vi.advanceTimersByTime(20);

      const metrics = batcher.getMetrics();
      expect(metrics.batchCount).toBe(1);
      expect(metrics.messageCount).toBe(2);
      expect(metrics.avgBatchSize).toBe(2);
    });

    it("should reset metrics", () => {
      batcher.queue("doc-1", createMessage("doc-1", "user-1"));
      vi.advanceTimersByTime(20);

      batcher.resetMetrics();

      const metrics = batcher.getMetrics();
      expect(metrics.batchCount).toBe(0);
      expect(metrics.messageCount).toBe(0);
    });
  });

  describe("clear", () => {
    it("should clear pending batches without delivering", () => {
      batcher.queue("doc-1", createMessage("doc-1", "user-1"));

      batcher.clear();

      vi.advanceTimersByTime(20);

      expect(deliveredBatches).toHaveLength(0);
    });
  });
});
