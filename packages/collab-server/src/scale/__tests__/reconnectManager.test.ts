/**
 * Reconnect Manager Tests
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReconnectManager, type ReconnectPersistenceAdapter } from "../reconnectManager";

describe("ReconnectManager", () => {
  let manager: ReconnectManager;
  let mockPersistence: ReconnectPersistenceAdapter;

  beforeEach(() => {
    mockPersistence = {
      getCurrentFrontierTag: vi.fn(),
      getUpdatesSince: vi.fn(),
      getSnapshot: vi.fn(),
    };

    manager = new ReconnectManager(mockPersistence, {
      maxIncrementalUpdates: 50,
      maxIncrementalAgeMs: 5 * 60 * 1000,
      timeoutMs: 5000,
    });
  });

  describe("up-to-date client", () => {
    it("should return none when client is up to date", async () => {
      vi.mocked(mockPersistence.getCurrentFrontierTag).mockResolvedValue("frontier-123");

      const result = await manager.handleReconnect("doc-1", "client-1", "frontier-123");

      expect(result.resyncType).toBe("none");
      expect(result.upToDate).toBe(true);
      expect(result.data).toBeUndefined();
    });
  });

  describe("incremental catch-up", () => {
    it("should use incremental when updates available", async () => {
      vi.mocked(mockPersistence.getCurrentFrontierTag).mockResolvedValue("frontier-456");
      vi.mocked(mockPersistence.getUpdatesSince).mockResolvedValue({
        data: new Uint8Array([1, 2, 3]),
        frontierTag: "frontier-456",
        count: 10,
      });

      const result = await manager.handleReconnect("doc-1", "client-1", "frontier-123");

      expect(result.resyncType).toBe("incremental");
      expect(result.upToDate).toBe(true);
      expect(result.updateCount).toBe(10);
      expect(result.data).toEqual(new Uint8Array([1, 2, 3]));
    });

    it("should fall back to snapshot when too many updates", async () => {
      vi.mocked(mockPersistence.getCurrentFrontierTag).mockResolvedValue("frontier-456");
      vi.mocked(mockPersistence.getUpdatesSince).mockResolvedValue({
        data: new Uint8Array([1, 2, 3]),
        frontierTag: "frontier-456",
        count: 100, // Exceeds maxIncrementalUpdates (50)
      });
      vi.mocked(mockPersistence.getSnapshot).mockResolvedValue({
        data: new Uint8Array([4, 5, 6]),
        frontierTag: "frontier-456",
      });

      const result = await manager.handleReconnect("doc-1", "client-1", "frontier-123");

      expect(result.resyncType).toBe("snapshot");
      expect(result.upToDate).toBe(true);
    });

    it("should fall back to snapshot when incremental fails", async () => {
      vi.mocked(mockPersistence.getCurrentFrontierTag).mockResolvedValue("frontier-456");
      vi.mocked(mockPersistence.getUpdatesSince).mockResolvedValue(null);
      vi.mocked(mockPersistence.getSnapshot).mockResolvedValue({
        data: new Uint8Array([4, 5, 6]),
        frontierTag: "frontier-456",
      });

      const result = await manager.handleReconnect("doc-1", "client-1", "frontier-123");

      expect(result.resyncType).toBe("snapshot");
    });
  });

  describe("snapshot fallback", () => {
    it("should use snapshot when incremental not available", async () => {
      vi.mocked(mockPersistence.getCurrentFrontierTag).mockResolvedValue("frontier-456");
      vi.mocked(mockPersistence.getUpdatesSince).mockResolvedValue(null);
      vi.mocked(mockPersistence.getSnapshot).mockResolvedValue({
        data: new Uint8Array([7, 8, 9]),
        frontierTag: "frontier-456",
      });

      const result = await manager.handleReconnect("doc-1", "client-1", "frontier-old");

      expect(result.resyncType).toBe("snapshot");
      expect(result.data).toEqual(new Uint8Array([7, 8, 9]));
      expect(result.frontierTag).toBe("frontier-456");
    });

    it("should return none when no data available", async () => {
      vi.mocked(mockPersistence.getCurrentFrontierTag).mockResolvedValue("frontier-456");
      vi.mocked(mockPersistence.getUpdatesSince).mockResolvedValue(null);
      vi.mocked(mockPersistence.getSnapshot).mockResolvedValue(null);

      const result = await manager.handleReconnect("doc-1", "client-1", "frontier-old");

      expect(result.resyncType).toBe("none");
      expect(result.upToDate).toBe(false);
    });
  });

  describe("error handling", () => {
    it("should track failed reconnects", async () => {
      vi.mocked(mockPersistence.getCurrentFrontierTag).mockRejectedValue(new Error("DB error"));

      await expect(manager.handleReconnect("doc-1", "client-1", "frontier-123")).rejects.toThrow(
        "DB error"
      );

      const metrics = manager.getMetrics();
      expect(metrics.failedReconnects).toBe(1);
    });
  });

  describe("metrics", () => {
    it("should track reconnect counts by type", async () => {
      // Up-to-date
      vi.mocked(mockPersistence.getCurrentFrontierTag).mockResolvedValue("frontier-123");
      await manager.handleReconnect("doc-1", "client-1", "frontier-123");

      // Incremental
      vi.mocked(mockPersistence.getCurrentFrontierTag).mockResolvedValue("frontier-456");
      vi.mocked(mockPersistence.getUpdatesSince).mockResolvedValue({
        data: new Uint8Array([1]),
        frontierTag: "frontier-456",
        count: 5,
      });
      await manager.handleReconnect("doc-1", "client-2", "frontier-123");

      // Snapshot
      vi.mocked(mockPersistence.getUpdatesSince).mockResolvedValue(null);
      vi.mocked(mockPersistence.getSnapshot).mockResolvedValue({
        data: new Uint8Array([2]),
        frontierTag: "frontier-456",
      });
      await manager.handleReconnect("doc-1", "client-3", "frontier-old");

      const metrics = manager.getMetrics();
      expect(metrics.totalReconnects).toBe(3);
      expect(metrics.reconnectsByType.none).toBe(1);
      expect(metrics.reconnectsByType.incremental).toBe(1);
      expect(metrics.reconnectsByType.snapshot).toBe(1);
    });

    it("should track duration metrics", async () => {
      vi.mocked(mockPersistence.getCurrentFrontierTag).mockResolvedValue("frontier-123");

      await manager.handleReconnect("doc-1", "client-1", "frontier-123");

      const metrics = manager.getMetrics();
      expect(metrics.avgDurationMs).toBeGreaterThanOrEqual(0);
    });

    it("should reset metrics", async () => {
      vi.mocked(mockPersistence.getCurrentFrontierTag).mockResolvedValue("frontier-123");
      await manager.handleReconnect("doc-1", "client-1", "frontier-123");

      manager.resetMetrics();

      const metrics = manager.getMetrics();
      expect(metrics.totalReconnects).toBe(0);
      expect(metrics.reconnectsByType.none).toBe(0);
    });
  });
});
