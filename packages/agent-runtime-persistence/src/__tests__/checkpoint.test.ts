/**
 * Checkpoint Manager Tests
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  type Checkpoint,
  type CheckpointManager,
  createCheckpointManager,
  InMemoryCheckpointStorage,
} from "../checkpoint";

describe("CheckpointManager", () => {
  let storage: InMemoryCheckpointStorage;
  let manager: CheckpointManager;

  beforeEach(() => {
    storage = new InMemoryCheckpointStorage();
    manager = createCheckpointManager({ storage });
  });

  describe("checkpoint creation", () => {
    it("should create a checkpoint", async () => {
      const checkpoint = await manager.create({
        task: "Analyze documents",
        agentType: "researcher",
        agentId: "agent-1",
      });

      expect(checkpoint.id).toMatch(/^ckpt_/);
      expect(checkpoint.task).toBe("Analyze documents");
      expect(checkpoint.agentType).toBe("researcher");
      expect(checkpoint.status).toBe("pending");
      expect(checkpoint.currentStep).toBe(0);
      expect(checkpoint.messages).toHaveLength(0);
    });

    it("should save checkpoint to storage", async () => {
      const checkpoint = await manager.create({
        task: "Test task",
        agentType: "coder",
        agentId: "agent-2",
      });

      const loaded = await storage.load(checkpoint.id);
      expect(loaded).toBeDefined();
      expect(loaded?.task).toBe("Test task");
    });

    it("should support custom metadata", async () => {
      const checkpoint = await manager.create({
        task: "Task with metadata",
        agentType: "analyst",
        agentId: "agent-3",
        metadata: { priority: "high", tags: ["important"] },
      });

      expect(checkpoint.metadata).toEqual({
        priority: "high",
        tags: ["important"],
      });
    });

    it("should link parent and child checkpoints", async () => {
      const parent = await manager.create({
        task: "Parent task",
        agentType: "orchestrator",
        agentId: "parent-1",
      });

      const child = await manager.create({
        task: "Child task",
        agentType: "worker",
        agentId: "child-1",
        parentCheckpointId: parent.id,
      });

      expect(child.parentCheckpointId).toBe(parent.id);

      // Parent should have child reference
      const updatedParent = await storage.load(parent.id);
      expect(updatedParent?.childCheckpointIds).toContain(child.id);
    });
  });

  describe("message tracking", () => {
    it("should add messages to checkpoint", async () => {
      const checkpoint = await manager.create({
        task: "Chat task",
        agentType: "assistant",
        agentId: "agent-1",
      });

      await manager.addMessage(checkpoint.id, {
        role: "user",
        content: "Hello",
      });

      await manager.addMessage(checkpoint.id, {
        role: "assistant",
        content: "Hi there!",
      });

      const loaded = await storage.load(checkpoint.id);
      expect(loaded?.messages).toHaveLength(2);
      expect(loaded?.messages[0].role).toBe("user");
      expect(loaded?.messages[1].role).toBe("assistant");
    });
  });

  describe("tool call tracking", () => {
    it("should track pending tool calls", async () => {
      const checkpoint = await manager.create({
        task: "Tool task",
        agentType: "coder",
        agentId: "agent-1",
      });

      await manager.addPendingToolCall(checkpoint.id, {
        id: "call-1",
        name: "bash",
        arguments: { command: "ls" },
      });

      const loaded = await storage.load(checkpoint.id);
      expect(loaded?.pendingToolCalls).toHaveLength(1);
      expect(loaded?.pendingToolCalls[0].name).toBe("bash");
    });

    it("should complete tool calls", async () => {
      const checkpoint = await manager.create({
        task: "Tool task",
        agentType: "coder",
        agentId: "agent-1",
      });

      await manager.addPendingToolCall(checkpoint.id, {
        id: "call-1",
        name: "bash",
        arguments: { command: "ls" },
      });

      await manager.completeToolCall(checkpoint.id, {
        callId: "call-1",
        name: "bash",
        arguments: { command: "ls" },
        result: "file1.txt\nfile2.txt",
        success: true,
        durationMs: 50,
      });

      const loaded = await storage.load(checkpoint.id);
      expect(loaded?.pendingToolCalls).toHaveLength(0);
      expect(loaded?.completedToolCalls).toHaveLength(1);
      expect(loaded?.completedToolCalls[0].result).toBe("file1.txt\nfile2.txt");
    });
  });

  describe("step tracking", () => {
    it("should advance steps", async () => {
      const checkpoint = await manager.create({
        task: "Step task",
        agentType: "planner",
        agentId: "agent-1",
      });

      const step1 = await manager.advanceStep(checkpoint.id);
      const step2 = await manager.advanceStep(checkpoint.id);
      const step3 = await manager.advanceStep(checkpoint.id);

      expect(step1).toBe(1);
      expect(step2).toBe(2);
      expect(step3).toBe(3);

      const loaded = await storage.load(checkpoint.id);
      expect(loaded?.currentStep).toBe(3);
    });
  });

  describe("status management", () => {
    it("should update status to completed", async () => {
      const checkpoint = await manager.create({
        task: "Complete task",
        agentType: "worker",
        agentId: "agent-1",
      });

      await manager.updateStatus(checkpoint.id, "completed");

      const loaded = await storage.load(checkpoint.id);
      expect(loaded?.status).toBe("completed");
    });

    it("should record errors", async () => {
      const checkpoint = await manager.create({
        task: "Failing task",
        agentType: "worker",
        agentId: "agent-1",
      });

      await manager.updateStatus(checkpoint.id, "failed", {
        message: "Rate limit exceeded",
        code: "RATE_LIMIT",
        recoverable: true,
      });

      const loaded = await storage.load(checkpoint.id);
      expect(loaded?.status).toBe("failed");
      expect(loaded?.error?.message).toBe("Rate limit exceeded");
      expect(loaded?.error?.recoverable).toBe(true);
    });
  });

  describe("recovery", () => {
    it("should prepare recovery for pending checkpoint", async () => {
      const checkpoint = await manager.create({
        task: "Interrupted task",
        agentType: "researcher",
        agentId: "agent-1",
        maxSteps: 10,
      });

      // Simulate some progress
      await manager.advanceStep(checkpoint.id);
      await manager.advanceStep(checkpoint.id);
      await manager.advanceStep(checkpoint.id);

      // Prepare recovery
      const result = await manager.prepareRecovery(checkpoint.id);

      expect(result.success).toBe(true);
      expect(result.checkpoint.currentStep).toBe(3);
      expect(result.stepsToReplay).toBe(7);
    });

    it("should reject recovery for completed checkpoint", async () => {
      const checkpoint = await manager.create({
        task: "Done task",
        agentType: "worker",
        agentId: "agent-1",
      });

      await manager.updateStatus(checkpoint.id, "completed");

      const result = await manager.prepareRecovery(checkpoint.id);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Checkpoint already completed");
    });

    it("should reject recovery for non-recoverable errors", async () => {
      const checkpoint = await manager.create({
        task: "Fatal task",
        agentType: "worker",
        agentId: "agent-1",
      });

      await manager.updateStatus(checkpoint.id, "failed", {
        message: "Invalid API key",
        code: "AUTH_ERROR",
        recoverable: false,
      });

      const result = await manager.prepareRecovery(checkpoint.id);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Non-recoverable error");
    });

    it("should find recoverable checkpoints", async () => {
      // Create a recoverable failed checkpoint
      const checkpoint = await manager.create({
        task: "Retryable task",
        agentType: "worker",
        agentId: "agent-1",
      });

      await manager.updateStatus(checkpoint.id, "failed", {
        message: "Timeout",
        recoverable: true,
      });

      const recoverable = await manager.getRecoverableCheckpoints();

      expect(recoverable).toHaveLength(1);
      expect(recoverable[0].id).toBe(checkpoint.id);
    });
  });

  describe("querying", () => {
    it("should list checkpoints", async () => {
      await manager.create({
        task: "Task 1",
        agentType: "worker",
        agentId: "a1",
      });

      await manager.create({
        task: "Task 2",
        agentType: "researcher",
        agentId: "a2",
      });

      const list = await manager.list();
      expect(list).toHaveLength(2);
    });

    it("should filter by status", async () => {
      const c1 = await manager.create({
        task: "Pending",
        agentType: "worker",
        agentId: "a1",
      });

      const c2 = await manager.create({
        task: "Completed",
        agentType: "worker",
        agentId: "a2",
      });

      await manager.updateStatus(c2.id, "completed");

      const pending = await manager.list({ status: "pending" });
      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe(c1.id);
    });

    it("should filter by agent type", async () => {
      await manager.create({
        task: "Worker task",
        agentType: "worker",
        agentId: "a1",
      });

      await manager.create({
        task: "Research task",
        agentType: "researcher",
        agentId: "a2",
      });

      const researchers = await manager.list({ agentType: "researcher" });
      expect(researchers).toHaveLength(1);
      expect(researchers[0].task).toBe("Research task");
    });

    it("should get pending checkpoints", async () => {
      await manager.create({
        task: "Pending 1",
        agentType: "worker",
        agentId: "a1",
      });

      const c2 = await manager.create({
        task: "To complete",
        agentType: "worker",
        agentId: "a2",
      });

      await manager.updateStatus(c2.id, "completed");

      const pending = await manager.getPendingCheckpoints();
      expect(pending).toHaveLength(1);
    });
  });

  describe("cleanup", () => {
    it("should delete checkpoint", async () => {
      const checkpoint = await manager.create({
        task: "To delete",
        agentType: "worker",
        agentId: "a1",
      });

      const deleted = await manager.delete(checkpoint.id);
      expect(deleted).toBe(true);

      const loaded = await storage.load(checkpoint.id);
      expect(loaded).toBeNull();
    });

    it("should prune old checkpoints", async () => {
      // Create checkpoint with old timestamp (mock by direct storage)
      const oldCheckpoint: Checkpoint = {
        id: "old-ckpt",
        version: 1,
        createdAt: Date.now() - 10 * 24 * 60 * 60 * 1000, // 10 days ago
        task: "Old task",
        agentType: "worker",
        agentId: "a1",
        status: "completed",
        messages: [],
        pendingToolCalls: [],
        completedToolCalls: [],
        currentStep: 5,
        maxSteps: 10,
        metadata: {},
        childCheckpointIds: [],
      };

      await storage.save(oldCheckpoint);

      // Create new checkpoint
      await manager.create({
        task: "New task",
        agentType: "worker",
        agentId: "a2",
      });

      expect(storage.size).toBe(2);

      const pruned = await manager.prune();
      expect(pruned).toBe(1);
      expect(storage.size).toBe(1);
    });
  });

  describe("InMemoryCheckpointStorage", () => {
    it("should sort by createdAt desc by default", async () => {
      await storage.save({
        id: "c1",
        version: 1,
        createdAt: 1000,
        task: "First",
        agentType: "worker",
        agentId: "a1",
        status: "pending",
        messages: [],
        pendingToolCalls: [],
        completedToolCalls: [],
        currentStep: 0,
        maxSteps: 10,
        metadata: {},
        childCheckpointIds: [],
      });

      await storage.save({
        id: "c2",
        version: 1,
        createdAt: 3000,
        task: "Third",
        agentType: "worker",
        agentId: "a2",
        status: "pending",
        messages: [],
        pendingToolCalls: [],
        completedToolCalls: [],
        currentStep: 0,
        maxSteps: 10,
        metadata: {},
        childCheckpointIds: [],
      });

      await storage.save({
        id: "c3",
        version: 1,
        createdAt: 2000,
        task: "Second",
        agentType: "worker",
        agentId: "a3",
        status: "pending",
        messages: [],
        pendingToolCalls: [],
        completedToolCalls: [],
        currentStep: 0,
        maxSteps: 10,
        metadata: {},
        childCheckpointIds: [],
      });

      const list = await storage.list();
      expect(list[0].id).toBe("c2"); // 3000
      expect(list[1].id).toBe("c3"); // 2000
      expect(list[2].id).toBe("c1"); // 1000
    });

    it("should clear storage", async () => {
      await storage.save({
        id: "c1",
        version: 1,
        createdAt: Date.now(),
        task: "Task",
        agentType: "worker",
        agentId: "a1",
        status: "pending",
        messages: [],
        pendingToolCalls: [],
        completedToolCalls: [],
        currentStep: 0,
        maxSteps: 10,
        metadata: {},
        childCheckpointIds: [],
      });

      expect(storage.size).toBe(1);

      storage.clear();
      expect(storage.size).toBe(0);
    });
  });
});
