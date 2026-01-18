/**
 * Replay Engine Tests
 */

import { describe, expect, it, vi } from "vitest";
import type { Checkpoint } from "../checkpoint";
import type { EventLogManager } from "../checkpoint/eventLog";
import {
  createReplayEngine,
  generateStableToolCallId,
  SIDE_EFFECTFUL_TOOLS,
} from "../checkpoint/replayEngine";

describe("ReplayEngine", () => {
  const createTestCheckpoint = (overrides: Partial<Checkpoint> = {}): Checkpoint => ({
    id: "ckpt-test",
    version: 1,
    createdAt: Date.now(),
    task: "Test task",
    agentType: "tester",
    agentId: "agent-123",
    status: "pending",
    messages: [],
    pendingToolCalls: [],
    completedToolCalls: [],
    currentStep: 5,
    maxSteps: 10,
    metadata: {},
    childCheckpointIds: [],
    ...overrides,
  });

  describe("generateStableToolCallId", () => {
    it("should generate deterministic IDs for same inputs", () => {
      const id1 = generateStableToolCallId("bash", { command: "ls" }, 1, 0);
      const id2 = generateStableToolCallId("bash", { command: "ls" }, 1, 0);

      expect(id1).toBe(id2);
    });

    it("should generate different IDs for different arguments", () => {
      const id1 = generateStableToolCallId("bash", { command: "ls" }, 1, 0);
      const id2 = generateStableToolCallId("bash", { command: "pwd" }, 1, 0);

      expect(id1).not.toBe(id2);
    });

    it("should generate different IDs for different turns", () => {
      const id1 = generateStableToolCallId("bash", { command: "ls" }, 1, 0);
      const id2 = generateStableToolCallId("bash", { command: "ls" }, 2, 0);

      expect(id1).not.toBe(id2);
    });

    it("should generate different IDs for different indexes", () => {
      const id1 = generateStableToolCallId("bash", { command: "ls" }, 1, 0);
      const id2 = generateStableToolCallId("bash", { command: "ls" }, 1, 1);

      expect(id1).not.toBe(id2);
    });

    it("should produce consistent hash regardless of object key order", () => {
      const id1 = generateStableToolCallId("tool", { a: 1, b: 2 }, 1, 0);
      const id2 = generateStableToolCallId("tool", { b: 2, a: 1 }, 1, 0);

      expect(id1).toBe(id2);
    });

    it("should produce consistent hash for nested objects", () => {
      const id1 = generateStableToolCallId("tool", { nested: { a: 1, b: 2 } }, 1, 0);
      const id2 = generateStableToolCallId("tool", { nested: { b: 2, a: 1 } }, 1, 0);

      expect(id1).toBe(id2);
    });
  });

  describe("prepareReplay", () => {
    it("should prepare a valid replay plan for pending checkpoint", () => {
      const engine = createReplayEngine();
      const checkpoint = createTestCheckpoint({
        status: "pending",
        pendingToolCalls: [
          { id: "call-1", name: "bash", arguments: { command: "ls" }, timestamp: Date.now() },
        ],
        completedToolCalls: [
          {
            callId: "call-0",
            name: "read_file",
            arguments: { path: "/test" },
            result: "content",
            success: true,
            durationMs: 50,
            timestamp: Date.now(),
          },
        ],
      });

      const result = engine.prepareReplay(checkpoint);

      expect(result.success).toBe(true);
      expect(result.plan).toBeDefined();
      expect(result.plan?.completedToolCallIds.has("call-0")).toBe(true);
      expect(result.plan?.pendingToolCallIds.has("call-1")).toBe(true);
      expect(result.plan?.resumeFromStep).toBe(5);
    });

    it("should reject replay for completed checkpoint", () => {
      const engine = createReplayEngine();
      const checkpoint = createTestCheckpoint({ status: "completed" });

      const result = engine.prepareReplay(checkpoint);

      expect(result.success).toBe(false);
      expect(result.error).toContain("completed");
    });

    it("should reject replay for cancelled checkpoint", () => {
      const engine = createReplayEngine();
      const checkpoint = createTestCheckpoint({ status: "cancelled" });

      const result = engine.prepareReplay(checkpoint);

      expect(result.success).toBe(false);
      expect(result.error).toContain("cancelled");
    });

    it("should identify side-effectful tools pending replay", () => {
      const engine = createReplayEngine();
      const checkpoint = createTestCheckpoint({
        pendingToolCalls: [
          { id: "call-1", name: "bash", arguments: {}, timestamp: Date.now() },
          { id: "call-2", name: "read_file", arguments: {}, timestamp: Date.now() },
          { id: "call-3", name: "file_write", arguments: {}, timestamp: Date.now() },
        ],
      });

      const result = engine.prepareReplay(checkpoint);

      expect(result.plan?.sideEffectfulToolsPending).toContain("bash");
      expect(result.plan?.sideEffectfulToolsPending).toContain("file_write");
      expect(result.plan?.sideEffectfulToolsPending).not.toContain("read_file");
    });
  });

  describe("shouldSkipToolCall", () => {
    it("should skip completed tool calls", () => {
      const engine = createReplayEngine();
      const checkpoint = createTestCheckpoint({
        completedToolCalls: [
          {
            callId: "call-done",
            name: "read_file",
            arguments: {},
            result: "cached result",
            success: true,
            durationMs: 50,
            timestamp: Date.now(),
          },
        ],
      });

      const { plan } = engine.prepareReplay(checkpoint);
      expect(plan).toBeDefined();
      if (!plan) {
        throw new Error("Plan should be defined");
      }
      const { skip, cachedResult } = engine.shouldSkipToolCall("call-done", plan);

      expect(skip).toBe(true);
      expect(cachedResult?.result).toBe("cached result");
    });

    it("should not skip pending tool calls", () => {
      const engine = createReplayEngine();
      const checkpoint = createTestCheckpoint({
        pendingToolCalls: [
          { id: "call-pending", name: "bash", arguments: {}, timestamp: Date.now() },
        ],
      });

      const { plan } = engine.prepareReplay(checkpoint);
      expect(plan).toBeDefined();
      if (!plan) {
        throw new Error("Plan should be defined");
      }
      const { skip, cachedResult } = engine.shouldSkipToolCall("call-pending", plan);

      expect(skip).toBe(false);
      expect(cachedResult).toBeUndefined();
    });
  });

  describe("requiresApproval", () => {
    it("should require approval for side-effectful tools", () => {
      const engine = createReplayEngine();

      expect(engine.requiresApproval("bash")).toBe(true);
      expect(engine.requiresApproval("run_command")).toBe(true);
      expect(engine.requiresApproval("file_write")).toBe(true);
      expect(engine.requiresApproval("write_file")).toBe(true);
    });

    it("should not require approval for read-only tools", () => {
      const engine = createReplayEngine();

      expect(engine.requiresApproval("read_file")).toBe(false);
      expect(engine.requiresApproval("search_code")).toBe(false);
      expect(engine.requiresApproval("list_dir")).toBe(false);
    });

    it("should require approval for all tools when option set", () => {
      const engine = createReplayEngine();

      expect(engine.requiresApproval("read_file", { requireApproval: true })).toBe(true);
    });

    it("should allow custom side-effectful tools list", () => {
      const engine = createReplayEngine({
        sideEffectfulTools: ["custom_write", "custom_delete"],
      });

      expect(engine.requiresApproval("custom_write")).toBe(true);
      expect(engine.requiresApproval("bash")).toBe(false); // Not in custom list
    });
  });

  describe("requestApproval", () => {
    it("should deny by default when no handler is set", async () => {
      const engine = createReplayEngine();

      const approved = await engine.requestApproval("bash", { command: "rm -rf /" });

      expect(approved).toBe(false);
    });

    it("should use approval handler when provided", async () => {
      const engine = createReplayEngine({
        approvalHandler: async (request) => {
          return request.toolName === "safe_tool";
        },
      });

      expect(await engine.requestApproval("safe_tool", {})).toBe(true);
      expect(await engine.requestApproval("bash", {})).toBe(false);
    });
  });

  describe("validateStableId", () => {
    it("should validate stable IDs correctly", () => {
      const engine = createReplayEngine();
      const stableId = generateStableToolCallId("bash", { cmd: "ls" }, 3, 0);

      expect(engine.validateStableId(stableId, "bash", { cmd: "ls" }, 3, 0)).toBe(true);
      expect(engine.validateStableId("wrong-id", "bash", { cmd: "ls" }, 3, 0)).toBe(false);
    });
  });

  describe("SIDE_EFFECTFUL_TOOLS", () => {
    it("should contain expected dangerous tools", () => {
      expect(SIDE_EFFECTFUL_TOOLS.has("bash")).toBe(true);
      expect(SIDE_EFFECTFUL_TOOLS.has("run_command")).toBe(true);
      expect(SIDE_EFFECTFUL_TOOLS.has("file_write")).toBe(true);
      expect(SIDE_EFFECTFUL_TOOLS.has("write_file")).toBe(true);
      expect(SIDE_EFFECTFUL_TOOLS.has("delete_file")).toBe(true);
    });
  });

  describe("executeReplay", () => {
    it("uses runId from checkpoint metadata when available", async () => {
      const append = vi.fn().mockResolvedValue({});
      const eventLog = { append } as unknown as EventLogManager;
      const engine = createReplayEngine({ eventLog });
      const checkpoint = createTestCheckpoint({
        metadata: { runId: "run-123" },
        pendingToolCalls: [],
      });

      const { plan } = engine.prepareReplay(checkpoint);
      if (!plan) {
        throw new Error("Plan should be defined");
      }

      const iterator = engine.executeReplay(plan, {}, async () => ({
        success: true,
        result: "ok",
      }));
      await iterator.next();

      expect(append).toHaveBeenCalledWith(expect.objectContaining({ runId: "run-123" }));
    });
  });
});
