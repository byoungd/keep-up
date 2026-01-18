/**
 * SQLite Checkpoint Storage Tests
 */

import { beforeEach, describe, expect, it } from "vitest";
import type { Checkpoint } from "../checkpoint";
import {
  createSQLiteCheckpointStorage,
  type SQLiteCheckpointStorage,
} from "../checkpoint/sqliteCheckpointStorage";

describe("SQLiteCheckpointStorage", () => {
  let storage: SQLiteCheckpointStorage;

  beforeEach(() => {
    // Use in-memory database for testing
    storage = createSQLiteCheckpointStorage({ dbPath: ":memory:" });
  });

  const createTestCheckpoint = (overrides: Partial<Checkpoint> = {}): Checkpoint => ({
    id: `ckpt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    version: 1,
    createdAt: Date.now(),
    task: "Test task",
    agentType: "tester",
    agentId: "agent-123",
    status: "pending",
    messages: [],
    pendingToolCalls: [],
    completedToolCalls: [],
    currentStep: 0,
    maxSteps: 10,
    metadata: {},
    childCheckpointIds: [],
    ...overrides,
  });

  describe("save and load", () => {
    it("should save and load a checkpoint by ID", async () => {
      const checkpoint = createTestCheckpoint();

      await storage.save(checkpoint);
      const loaded = await storage.load(checkpoint.id);

      expect(loaded).not.toBeNull();
      expect(loaded?.id).toBe(checkpoint.id);
      expect(loaded?.task).toBe(checkpoint.task);
      expect(loaded?.agentType).toBe(checkpoint.agentType);
      expect(loaded?.status).toBe("pending");
    });

    it("should return null for non-existent checkpoint", async () => {
      const loaded = await storage.load("non-existent-id");
      expect(loaded).toBeNull();
    });

    it("should preserve messages in checkpoint", async () => {
      const checkpoint = createTestCheckpoint({
        messages: [
          { role: "user", content: "Hello", timestamp: Date.now() - 1000 },
          { role: "assistant", content: "Hi there!", timestamp: Date.now() },
        ],
      });

      await storage.save(checkpoint);
      const loaded = await storage.load(checkpoint.id);

      expect(loaded?.messages).toHaveLength(2);
      expect(loaded?.messages[0].content).toBe("Hello");
      expect(loaded?.messages[1].content).toBe("Hi there!");
    });

    it("should preserve tool calls in checkpoint", async () => {
      const checkpoint = createTestCheckpoint({
        pendingToolCalls: [
          { id: "call-1", name: "bash", arguments: { command: "ls" }, timestamp: Date.now() },
        ],
        completedToolCalls: [
          {
            callId: "call-0",
            name: "read_file",
            arguments: { path: "/test.txt" },
            result: "file content",
            success: true,
            durationMs: 50,
            timestamp: Date.now(),
          },
        ],
      });

      await storage.save(checkpoint);
      const loaded = await storage.load(checkpoint.id);

      expect(loaded?.pendingToolCalls).toHaveLength(1);
      expect(loaded?.pendingToolCalls[0].name).toBe("bash");
      expect(loaded?.completedToolCalls).toHaveLength(1);
      expect(loaded?.completedToolCalls[0].result).toBe("file content");
    });

    it("should handle errors correctly", async () => {
      const checkpoint = createTestCheckpoint({
        status: "failed",
        error: { message: "Rate limit exceeded", code: "RATE_LIMIT", recoverable: true },
      });

      await storage.save(checkpoint);
      const loaded = await storage.load(checkpoint.id);

      expect(loaded?.status).toBe("failed");
      expect(loaded?.error?.message).toBe("Rate limit exceeded");
      expect(loaded?.error?.recoverable).toBe(true);
    });
  });

  describe("loadByThreadAndStep", () => {
    it("should load checkpoint by threadId and step", async () => {
      const checkpoint = createTestCheckpoint({
        agentId: "thread-abc",
        currentStep: 5,
      });

      await storage.save(checkpoint);
      const loaded = await storage.loadByThreadAndStep("thread-abc", 5);

      expect(loaded).not.toBeNull();
      expect(loaded?.id).toBe(checkpoint.id);
      expect(loaded?.currentStep).toBe(5);
    });

    it("should enforce unique (threadId, step) constraint", async () => {
      const checkpoint1 = createTestCheckpoint({
        id: "ckpt-1",
        agentId: "thread-xyz",
        currentStep: 3,
      });

      const checkpoint2 = createTestCheckpoint({
        id: "ckpt-2",
        agentId: "thread-xyz",
        currentStep: 3,
        task: "Updated task",
      });

      await storage.save(checkpoint1);
      // This should replace due to UNIQUE constraint
      await storage.save(checkpoint2);

      const loaded = await storage.loadByThreadAndStep("thread-xyz", 3);
      expect(loaded?.id).toBe("ckpt-2");
      expect(loaded?.task).toBe("Updated task");
    });
  });

  describe("getLatestByThread", () => {
    it("should get the latest checkpoint for a thread", async () => {
      const agentId = "thread-latest";

      await storage.save(createTestCheckpoint({ id: "c1", agentId, currentStep: 1 }));
      await storage.save(createTestCheckpoint({ id: "c2", agentId, currentStep: 3 }));
      await storage.save(createTestCheckpoint({ id: "c3", agentId, currentStep: 2 }));

      const latest = await storage.getLatestByThread(agentId);

      expect(latest).not.toBeNull();
      expect(latest?.id).toBe("c2");
      expect(latest?.currentStep).toBe(3);
    });
  });

  describe("list", () => {
    it("should list all checkpoints", async () => {
      await storage.save(createTestCheckpoint({ id: "a1", agentId: "agent-a1" }));
      await storage.save(createTestCheckpoint({ id: "a2", agentId: "agent-a2" }));

      const list = await storage.list();
      expect(list).toHaveLength(2);
    });

    it("should filter by status", async () => {
      await storage.save(
        createTestCheckpoint({ id: "p1", agentId: "agent-p1", status: "pending" })
      );
      await storage.save(
        createTestCheckpoint({ id: "c1", agentId: "agent-c1", status: "completed" })
      );
      await storage.save(
        createTestCheckpoint({ id: "p2", agentId: "agent-p2", status: "pending" })
      );

      const pending = await storage.list({ status: "pending" });
      expect(pending).toHaveLength(2);

      const completed = await storage.list({ status: "completed" });
      expect(completed).toHaveLength(1);
    });

    it("should filter by agentType", async () => {
      await storage.save(
        createTestCheckpoint({ id: "w1", agentId: "agent-w1", agentType: "worker" })
      );
      await storage.save(
        createTestCheckpoint({ id: "r1", agentId: "agent-r1", agentType: "researcher" })
      );

      const workers = await storage.list({ agentType: "worker" });
      expect(workers).toHaveLength(1);
      expect(workers[0].agentType).toBe("worker");
    });

    it("should limit results", async () => {
      for (let i = 0; i < 10; i++) {
        await storage.save(createTestCheckpoint({ id: `c${i}`, agentId: `agent-${i}` }));
      }

      const limited = await storage.list({ limit: 5 });
      expect(limited).toHaveLength(5);
    });
  });

  describe("delete", () => {
    it("should delete a checkpoint", async () => {
      const checkpoint = createTestCheckpoint();
      await storage.save(checkpoint);

      const deleted = await storage.delete(checkpoint.id);
      expect(deleted).toBe(true);

      const loaded = await storage.load(checkpoint.id);
      expect(loaded).toBeNull();
    });

    it("should return false for non-existent checkpoint", async () => {
      const deleted = await storage.delete("non-existent");
      expect(deleted).toBe(false);
    });
  });

  describe("prune", () => {
    it("should prune old checkpoints", async () => {
      const oldCheckpoint = createTestCheckpoint({
        id: "old",
        agentId: "agent-old",
        currentStep: 1,
        createdAt: Date.now() - 10 * 24 * 60 * 60 * 1000, // 10 days ago
      });
      const newCheckpoint = createTestCheckpoint({
        id: "new",
        agentId: "agent-new",
        currentStep: 1,
        createdAt: Date.now(),
      });

      await storage.save(oldCheckpoint);
      await storage.save(newCheckpoint);

      // Prune checkpoints older than 7 days
      const pruned = await storage.prune(7 * 24 * 60 * 60 * 1000);
      expect(pruned).toBe(1);

      expect(await storage.load("old")).toBeNull();
      expect(await storage.load("new")).not.toBeNull();
    });
  });
});
