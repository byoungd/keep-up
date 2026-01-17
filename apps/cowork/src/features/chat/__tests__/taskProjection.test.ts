import type { Message } from "@ku0/shell";
import { describe, expect, it } from "vitest";
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
});
