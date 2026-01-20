import type { Message } from "@ku0/shell";
import { describe, expect, it } from "vitest";
import { apiUrl } from "../../../lib/config";
import {
  RiskLevel,
  type TaskGraph,
  TaskStatus,
  type TaskStatusNode,
  type ToolCallNode,
} from "../../tasks/types";
import { projectGraphToMessages } from "../utils/taskProjection";

function buildBaseGraph(nodes: TaskGraph["nodes"]): TaskGraph {
  return {
    sessionId: "session-1",
    status: TaskStatus.RUNNING,
    nodes,
    artifacts: {},
  };
}

describe("projectGraphToMessages", () => {
  it("reuses existing task messages without reordering by updated timestamp", () => {
    const baseMessage: Message = {
      id: "task-stream-task-1",
      role: "assistant",
      content: "",
      createdAt: 1000,
      status: "streaming",
      type: "task_stream",
      metadata: {
        task: {
          id: "task-1",
          label: "Initial Task",
          status: "running",
          progress: 0,
          steps: [],
          artifacts: [],
        },
      },
    };

    const taskNode: TaskStatusNode = {
      id: "task-task-1",
      type: "task_status",
      taskId: "task-1",
      title: "Updated Task",
      status: "running",
      mappedStatus: TaskStatus.RUNNING,
      timestamp: new Date(3000).toISOString(),
    };

    const result = projectGraphToMessages(buildBaseGraph([taskNode]), [baseMessage]);
    const taskMessage = result.find((msg) => msg.id === baseMessage.id);

    expect(taskMessage?.createdAt).toBe(1000);
    expect(taskMessage?.metadata?.task?.label).toBe("Updated Task");
  });

  it("embeds approval metadata inline and avoids separate ask messages for tasks", () => {
    const taskNode: TaskStatusNode = {
      id: "task-task-2",
      type: "task_status",
      taskId: "task-2",
      title: "Approval Task",
      status: "awaiting_confirmation",
      mappedStatus: TaskStatus.AWAITING_APPROVAL,
      timestamp: new Date(4000).toISOString(),
    };

    const toolCallNode: ToolCallNode = {
      id: "call-1",
      type: "tool_call",
      taskId: "task-2",
      toolName: "fs:delete",
      args: { path: "/tmp/example.txt" },
      requiresApproval: true,
      approvalId: "approval-1",
      riskLevel: RiskLevel.HIGH,
      activityLabel: "Delete temp file",
      timestamp: new Date(4100).toISOString(),
    };

    const result = projectGraphToMessages(buildBaseGraph([taskNode, toolCallNode]), []);
    const taskMessage = result.find((msg) => msg.type === "task_stream");

    expect(result.some((msg) => msg.type === "ask")).toBe(false);
    expect(taskMessage?.metadata?.task?.approvalMetadata).toEqual({
      approvalId: "approval-1",
      toolName: "fs:delete",
      args: { path: "/tmp/example.txt" },
      riskLevel: RiskLevel.HIGH,
      reason: "Delete temp file",
    });
  });

  it("records started and completed timestamps for terminal tasks", () => {
    const taskNode: TaskStatusNode = {
      id: "task-task-3",
      type: "task_status",
      taskId: "task-3",
      title: "Completed Task",
      status: "completed",
      mappedStatus: TaskStatus.COMPLETED,
      timestamp: new Date(5000).toISOString(),
    };

    const toolCallNode: ToolCallNode = {
      id: "call-2",
      type: "tool_call",
      taskId: "task-3",
      toolName: "tools:summary",
      args: {},
      timestamp: new Date(4500).toISOString(),
    };

    const result = projectGraphToMessages(buildBaseGraph([taskNode, toolCallNode]), []);
    const taskMessage = result.find((msg) => msg.type === "task_stream");
    const startedAt = taskMessage?.metadata?.task?.startedAt;
    const completedAt = taskMessage?.metadata?.task?.completedAt;

    expect(startedAt).toBeDefined();
    expect(completedAt).toBeDefined();
  });

  it("applies token usage from stream updates and metadata", () => {
    const graph = buildBaseGraph([]);
    graph.messageUsage = {
      "assistant-1": {
        inputTokens: 4,
        outputTokens: 2,
        totalTokens: 6,
        contextWindow: 100,
        utilization: 6,
      },
    };

    const baseMessages: Message[] = [
      {
        id: "assistant-1",
        role: "assistant",
        content: "Hello",
        createdAt: 100,
        status: "done",
        type: "text",
      },
      {
        id: "assistant-2",
        role: "assistant",
        content: "World",
        createdAt: 200,
        status: "done",
        type: "text",
        metadata: {
          usage: {
            inputTokens: 3,
            outputTokens: 1,
            totalTokens: 4,
            contextWindow: 50,
            utilization: 8,
          },
        },
      },
    ];

    const result = projectGraphToMessages(graph, baseMessages);
    const first = result.find((msg) => msg.id === "assistant-1");
    const second = result.find((msg) => msg.id === "assistant-2");

    expect(first?.tokenUsage?.totalTokens).toBe(6);
    expect(first?.tokenUsage?.contextWindow).toBe(100);
    expect(second?.tokenUsage?.totalTokens).toBe(4);
    expect(second?.tokenUsage?.contextWindow).toBe(50);
  });

  it("maps runtime card artifacts into task artifacts", () => {
    const taskNode: TaskStatusNode = {
      id: "task-task-4",
      type: "task_status",
      taskId: "task-4",
      title: "Artifact Task",
      status: "running",
      mappedStatus: TaskStatus.RUNNING,
      timestamp: new Date(6000).toISOString(),
    };

    const graph: TaskGraph = {
      sessionId: "session-1",
      status: TaskStatus.RUNNING,
      nodes: [taskNode],
      artifacts: {
        "plan-1": {
          type: "PlanCard",
          goal: "Ship updates",
          steps: [{ title: "Outline changes" }],
        },
        "diff-1": {
          type: "DiffCard",
          files: [{ path: "src/app.ts", diff: "+const foo = 1;" }],
        },
        "review-1": {
          type: "ReviewReport",
          summary: "Looks good",
          risks: ["Minor risk"],
        },
        "image-1": {
          type: "ImageArtifact",
          uri: "/tmp/render.png",
          mimeType: "image/png",
          byteSize: 128,
          contentHash: "hash-1",
        },
      },
    };

    const result = projectGraphToMessages(graph, []);
    const taskMessage = result.find((msg) => msg.type === "task_stream");
    const artifacts = taskMessage?.metadata?.task?.artifacts ?? [];

    expect(artifacts.find((artifact) => artifact.id === "plan-1")).toMatchObject({
      type: "plan",
      title: "Ship updates",
      content: "Outline changes",
    });
    expect(artifacts.find((artifact) => artifact.id === "diff-1")).toMatchObject({
      type: "diff",
      title: "Diff Summary",
      content: "src/app.ts",
    });
    expect(artifacts.find((artifact) => artifact.id === "review-1")).toMatchObject({
      type: "report",
      title: "Review Report",
      content: "Looks good",
    });
    const imageUrl = apiUrl("/api/artifacts/image-1/content");
    expect(artifacts.find((artifact) => artifact.id === "image-1")).toMatchObject({
      type: "image",
      url: imageUrl,
      previewUrl: imageUrl,
    });
  });
});
