import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CheckpointManager } from "../checkpoint";
import type { EventLogManager } from "../checkpoint/eventLog";
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
      // Add other required methods if accessed, but mostly create is used
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

    // Verify checkpoint creation (at turn boundaries and tool execution)
    expect(checkpointManagerMock.create).toHaveBeenCalled();
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

    // Checkpoint should be created after tool execution
    expect(checkpointManagerMock.create).toHaveBeenCalled();
    // At least: Turn 1 start, Tool call (maybe), Turn 1 end, Turn 2 start, Completion, Turn 2 end...
    // Actually our implementation calls createCheckpoint at turn end and after tool execution.
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
  });
});
