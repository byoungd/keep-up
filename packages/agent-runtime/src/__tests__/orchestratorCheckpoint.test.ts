import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CheckpointManager } from "../checkpoint";
import type { EventLogManager } from "../checkpoint/eventLog";
import { generateStableToolCallId } from "../checkpoint/replayEngine";
import {
  createCompletionToolServer,
  createFileToolServer,
  createMockLLM,
  createOrchestrator,
  createToolRegistry,
} from "../index";

describe("Orchestrator Checkpoint & Event Log Integration", () => {
  let llm: ReturnType<typeof createMockLLM>;
  let registry: ReturnType<typeof createToolRegistry>;
  let checkpointManagerMock: CheckpointManager;
  let eventLogMock: EventLogManager;

  beforeEach(async () => {
    llm = createMockLLM();
    registry = createToolRegistry();
    await registry.register(createCompletionToolServer());
    await registry.register(createFileToolServer());

    // Mock CheckpointManager
    checkpointManagerMock = {
      create: vi.fn().mockResolvedValue({ id: "ckpt_test" }),
      save: vi.fn().mockResolvedValue(undefined),
      addMessage: vi.fn().mockResolvedValue(undefined),
      addPendingToolCall: vi.fn().mockResolvedValue(undefined),
      completeToolCall: vi.fn().mockResolvedValue(undefined),
      advanceStep: vi.fn().mockResolvedValue(1),
      updateStatus: vi.fn().mockResolvedValue(undefined),
      updateMetadata: vi.fn().mockResolvedValue(undefined),
    } as unknown as CheckpointManager;

    // Mock EventLogManager
    eventLogMock = {
      append: vi.fn().mockResolvedValue({}),
    } as unknown as EventLogManager;
  });

  it("should create checkpoint and emit turn events during execution", async () => {
    llm.setDefaultResponse({
      content: "Task complete.",
      finishReason: "tool_use",
      toolCalls: [{ name: "completion:complete_task", arguments: { summary: "Task complete." } }],
    });

    const agent = createOrchestrator(llm, registry, {
      components: {
        checkpointManager: checkpointManagerMock,
        runtimeEventLog: eventLogMock,
      },
    });

    await agent.run("Hello!");

    // Verify turn events
    expect(eventLogMock.append).toHaveBeenCalledWith(
      expect.objectContaining({ type: "turn_start" })
    );

    // Verify checkpoint creation and message recording
    expect(checkpointManagerMock.create).toHaveBeenCalledWith(
      expect.objectContaining({ task: "Hello!" })
    );
    expect(checkpointManagerMock.addMessage).toHaveBeenCalledWith(
      "ckpt_test",
      expect.objectContaining({ role: "system" })
    );
    expect(checkpointManagerMock.addMessage).toHaveBeenCalledWith(
      "ckpt_test",
      expect.objectContaining({ role: "user", content: "Hello!" })
    );
    expect(checkpointManagerMock.advanceStep).toHaveBeenCalled();
    expect(checkpointManagerMock.updateStatus).toHaveBeenCalledWith(
      "ckpt_test",
      "completed",
      undefined
    );
  });

  it("should emit tool call events and checkpoints", async () => {
    // LLM sequence: 1. call file:list, 2. call completion
    let callCount = 0;
    llm.complete = async () => {
      callCount++;
      if (callCount === 1) {
        return {
          content: "Listing files.",
          toolCalls: [{ name: "file:list", arguments: { path: "/tmp" } }],
          finishReason: "tool_use",
        };
      }
      return {
        content: "Done.",
        toolCalls: [{ name: "completion:complete_task", arguments: { summary: "Done." } }],
        finishReason: "tool_use",
      };
    };

    const agent = createOrchestrator(llm, registry, {
      components: {
        checkpointManager: checkpointManagerMock,
        runtimeEventLog: eventLogMock,
      },
    });

    await agent.run("List files");

    // Check for tool call events
    expect(eventLogMock.append).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "tool_call_start",
        payload: expect.objectContaining({ toolName: "file:list" }),
      })
    );
    expect(eventLogMock.append).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "tool_call_end",
        payload: expect.objectContaining({ toolName: "file:list", success: true }),
      })
    );

    const expectedToolCallId = generateStableToolCallId("file:list", { path: "/tmp" }, 1, 0);
    expect(checkpointManagerMock.addPendingToolCall).toHaveBeenCalledWith(
      "ckpt_test",
      expect.objectContaining({ id: expectedToolCallId, name: "file:list" })
    );
    expect(checkpointManagerMock.completeToolCall).toHaveBeenCalledWith(
      "ckpt_test",
      expect.objectContaining({ callId: expectedToolCallId, name: "file:list", success: true })
    );
  });

  it("should emit error event on failure", async () => {
    // Make LLM fail or throw error loop
    llm.complete = async () => {
      throw new Error("Simulated LLM Failure");
    };

    const agent = createOrchestrator(llm, registry, {
      components: {
        checkpointManager: checkpointManagerMock,
        runtimeEventLog: eventLogMock,
      },
    });

    try {
      await agent.run("Fail me");
    } catch (_e) {
      // Expected
    }

    expect(eventLogMock.append).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
        payload: expect.objectContaining({
          error: expect.stringContaining("Simulated LLM Failure"),
        }),
      })
    );
    expect(checkpointManagerMock.updateStatus).toHaveBeenCalledWith(
      "ckpt_test",
      "failed",
      expect.objectContaining({
        message: expect.stringContaining("Simulated LLM Failure"),
      })
    );
  });
});
