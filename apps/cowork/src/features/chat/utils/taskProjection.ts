import type { ActionItem, AgentTask, ArtifactItem, Message, TaskStep } from "@ku0/shell";
import type {
  ArtifactPayload,
  PlanUpdateNode,
  TaskGraph,
  TaskStatusNode,
  ToolCallNode,
  ToolOutputNode,
} from "../../tasks/types";

/**
 * Projects the raw TaskGraph into a list of normalized UI Messages.
 * Emits task stream cards plus completion results for deliverables.
 */
interface ProjectionContext {
  existingPrompts: Set<string>;
  normalizedPrompts: Set<string>;
  promptedTaskIds: Set<string>;
  taskMessageMap: Map<string, Message>;
}

export function projectGraphToMessages(
  graph: TaskGraph,
  baseChatMessages: Message[] = []
): Message[] {
  const messages: Message[] = [...baseChatMessages];
  const context = buildProjectionContext(messages);

  for (const node of graph.nodes) {
    if (node.type === "task_status") {
      processTaskStatusNode(node as TaskStatusNode, graph, messages, context);
    } else if (node.type === "tool_call") {
      processToolCallNode(node as ToolCallNode, messages);
    }
  }

  return messages.sort((a, b) => {
    const timeDiff = (a.createdAt || 0) - (b.createdAt || 0);
    if (timeDiff !== 0) {
      return timeDiff;
    }
    // Stable secondary sort by ID when timestamps are equal
    return a.id.localeCompare(b.id);
  });
}

function buildProjectionContext(messages: Message[]): ProjectionContext {
  const existingPrompts = new Set(
    messages.filter((m) => m.role === "user").map((m) => m.content.trim())
  );
  const normalizedPrompts = new Set([...existingPrompts].map((p) => p.toLowerCase()));
  const promptedTaskIds = new Set<string>();
  const taskMessageMap = new Map<string, Message>();

  for (const message of messages) {
    if (message.id.startsWith("user-prompt-")) {
      promptedTaskIds.add(message.id.replace("user-prompt-", ""));
    }
    const taskId = message.metadata?.task?.id;
    if (taskId) {
      taskMessageMap.set(taskId, message);
    } else if (message.id.startsWith("task-stream-")) {
      taskMessageMap.set(message.id.replace("task-stream-", ""), message);
    }
  }

  return { existingPrompts, normalizedPrompts, promptedTaskIds, taskMessageMap };
}

function processTaskStatusNode(
  node: TaskStatusNode,
  graph: TaskGraph,
  messages: Message[],
  context: ProjectionContext
) {
  let timestamp = new Date(node.timestamp).getTime();
  if (Number.isNaN(timestamp)) {
    timestamp = Date.now();
  }

  handleUserPrompt(node, messages, context);

  const msg = getOrCreateTaskMessage(node.taskId, timestamp, messages, context.taskMessageMap);

  const agentTask = buildAgentTaskFromGraph(node, graph);
  msg.status =
    agentTask.status === "running" ? "streaming" : agentTask.status === "failed" ? "error" : "done";

  // Handle integrated approval if task is paused
  if (agentTask.status === "paused") {
    injectApprovalMetadata(agentTask, graph, node.taskId);
  }

  msg.type = "task_stream";
  msg.metadata = { ...msg.metadata, task: agentTask };
}

function handleUserPrompt(node: TaskStatusNode, messages: Message[], context: ProjectionContext) {
  const prompt = (node.prompt ?? "").trim();
  // Skip empty prompts to prevent ghost user messages
  if (!prompt) {
    return;
  }

  const normalizedPrompt = prompt.toLowerCase();
  let timestamp = new Date(node.timestamp).getTime();
  if (Number.isNaN(timestamp)) {
    timestamp = Date.now();
  }

  if (!context.normalizedPrompts.has(normalizedPrompt)) {
    messages.push({
      id: `user-prompt-${node.taskId}`,
      role: "user",
      content: prompt,
      createdAt: timestamp - 1,
      status: "done",
      type: "text",
    });
    context.normalizedPrompts.add(normalizedPrompt);
  }
  context.promptedTaskIds.add(node.taskId);
}

function injectApprovalMetadata(agentTask: AgentTask, graph: TaskGraph, taskId: string) {
  const approvalNode = graph.nodes.find(
    (n) =>
      n.type === "tool_call" &&
      (n as ToolCallNode).taskId === taskId &&
      (n as ToolCallNode).requiresApproval
  ) as ToolCallNode | undefined;

  if (approvalNode?.approvalId) {
    agentTask.approvalMetadata = {
      approvalId: approvalNode.approvalId,
      toolName: approvalNode.toolName,
      args: approvalNode.args,
      riskLevel: approvalNode.riskLevel,
      reason: resolveApprovalReason(approvalNode),
    };
  }
}

function processToolCallNode(node: ToolCallNode, messages: Message[]) {
  if (!node.requiresApproval || node.taskId) {
    return;
  }

  const askId = `tool-${node.id}`;
  if (messages.some((m) => m.id === askId)) {
    return;
  }

  let toolTime = new Date(node.timestamp).getTime();
  if (Number.isNaN(toolTime)) {
    toolTime = Date.now();
  }

  if (node.taskId) {
    const taskMessage = messages.find((message) => message.metadata?.task?.id === node.taskId);
    if (taskMessage?.createdAt) {
      toolTime = Math.max(toolTime, taskMessage.createdAt + 1);
    }
  }

  messages.push({
    id: askId,
    role: "assistant",
    content: `Approval required for **${node.toolName}**.`,
    createdAt: toolTime,
    status: "pending",
    type: "ask",
    suggested_action: "confirm_browser_operation",
    metadata: {
      toolName: node.toolName,
      args: node.args,
      riskLevel: node.riskLevel,
      approvalId: node.approvalId,
    },
  });
}

function getOrCreateTaskMessage(
  taskId: string,
  timestamp: number,
  messages: Message[],
  taskMessageMap: Map<string, Message>
): Message {
  let msg = taskMessageMap.get(taskId);
  if (!msg) {
    const msgId = `task-stream-${taskId}`;
    msg = messages.find((m) => m.id === msgId);
    if (!msg) {
      msg = {
        id: msgId,
        role: "assistant",
        content: "",
        createdAt: timestamp,
        status: "streaming",
        type: "task_stream",
        metadata: { task: null },
      };
      messages.push(msg);
    }
    taskMessageMap.set(taskId, msg);
  } else {
    msg.type = "task_stream";
  }
  return msg;
}

// --- Logic Helpers ---

function buildAgentTaskFromGraph(taskNode: TaskStatusNode, graph: TaskGraph): AgentTask {
  const { taskId, title, status, modelId, providerId, fallbackNotice } = taskNode;
  const taskCount = graph.nodes.filter((node) => node.type === "task_status").length;
  const scopedNodes = filterNodesForTask(graph.nodes, taskId, taskCount);
  // Extract Steps & Actions
  const planNodes = scopedNodes.filter((n) => n.type === "plan_update") as PlanUpdateNode[];
  const validPlans = planNodes.filter((n) => n.plan.type === "plan");
  const latestPlan = validPlans[validPlans.length - 1];

  let steps: TaskStep[] = [];
  if (latestPlan && latestPlan.plan.type === "plan") {
    steps = latestPlan.plan.steps.map((s) => ({
      id: s.id,
      label: s.label,
      status: mapStepStatus(s.status),
      actions: extractActionsForStep(scopedNodes, s.id),
    }));
  }

  if (steps.length === 0) {
    steps = buildFallbackSteps(status, scopedNodes);
  }

  // Extract Artifacts
  const allArtifacts = extractArtifactsFromGraph(graph.artifacts);
  const artifacts =
    taskCount <= 1
      ? allArtifacts
      : allArtifacts.filter(
          (artifact) => artifact.taskId === taskId || artifact.id.includes(taskId)
        );

  const progress =
    steps.length > 0
      ? Math.round((steps.filter((s) => s.status === "completed").length / steps.length) * 100)
      : 0;

  const taskTimestamp = parseTimestamp(taskNode.timestamp) ?? Date.now();
  const { startedAt, completedAt } = resolveTaskTimestamps(scopedNodes, taskTimestamp);

  return {
    id: taskId,
    label: title,
    status: mapCoworkStatus(status),
    progress,
    steps,
    artifacts,
    modelId,
    providerId,
    fallbackNotice,
    startedAt,
    completedAt: isTerminalStatus(status) ? completedAt : undefined,
    goal: taskNode.prompt,
  };
}

function extractActionsForStep(nodes: TaskGraph["nodes"], stepId: string): ActionItem[] {
  return nodes
    .filter((n) => n.taskId === stepId && (n.type === "tool_call" || n.type === "tool_output"))
    .map((n): ActionItem | null => {
      if (n.type === "tool_call") {
        return {
          id: n.id,
          label: formatToolCallLabel(n),
          toolName: n.toolName,
          args: n.args as Record<string, unknown>,
          status: "running" as const,
          startTime: new Date(n.timestamp).getTime(),
        } as ActionItem;
      }
      return null;
    })
    .filter((a): a is ActionItem => a !== null);
}

function mapStepStatus(status: string): TaskStep["status"] {
  if (status === "in_progress") {
    return "running";
  }
  return status as TaskStep["status"];
}

function mapCoworkStatus(status: string): AgentTask["status"] {
  switch (status) {
    case "planning":
    case "running":
      return "running";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "awaiting_confirmation":
    case "awaiting_approval":
      return "paused";
    default:
      return "queued";
  }
}

function buildFallbackSteps(status: string, nodes: TaskGraph["nodes"]): TaskStep[] {
  const activitySteps = buildActivitySteps(nodes, status);
  if (activitySteps.length > 0) {
    return activitySteps;
  }

  const stepStatus = mapTaskStatusToStepStatus(status);
  if (!stepStatus) {
    return [];
  }

  return [
    {
      id: `status-${status}`,
      label: formatStatusLabel(status),
      status: stepStatus,
    },
  ];
}

function buildActivitySteps(nodes: TaskGraph["nodes"], status: string): TaskStep[] {
  const activityNodes = nodes.filter(
    (node) => node.type === "tool_call" || node.type === "tool_output"
  );
  if (activityNodes.length === 0) {
    return [];
  }

  return activityNodes.map((node, index) => {
    const isLast = index === activityNodes.length - 1;
    const isActive = isLast && status === "running";
    return {
      id: node.id,
      label: formatActivityLabel(node, nodes),
      status: isActive ? "running" : "completed",
    };
  });
}

function filterNodesForTask(
  nodes: TaskGraph["nodes"],
  taskId: string,
  taskCount: number
): TaskGraph["nodes"] {
  if (taskCount <= 1) {
    return nodes;
  }

  return nodes.filter((node) => {
    // Task status nodes: exact match
    if (node.type === "task_status") {
      return node.taskId === taskId;
    }
    // Other nodes: match taskId, or include if taskId is undefined and this is the only/latest task
    if (node.taskId === taskId) {
      return true;
    }
    // Include orphaned nodes (no taskId) only for the latest task
    if (!node.taskId) {
      // Get all task_status nodes sorted by timestamp
      const taskNodes = nodes
        .filter((n): n is TaskStatusNode => n.type === "task_status")
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      const latestTaskId = taskNodes[taskNodes.length - 1]?.taskId;
      return taskId === latestTaskId;
    }
    return false;
  });
}

function formatStatusLabel(status: string): string {
  const label = status.replace(/_/g, " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function mapTaskStatusToStepStatus(status: string): TaskStep["status"] | null {
  switch (status) {
    case "queued":
      return "pending";
    case "planning":
    case "awaiting_confirmation":
    case "running":
      return "running";
    case "completed":
      return "completed";
    case "failed":
    case "cancelled":
      return "failed";
    default:
      return null;
  }
}

function formatActivityLabel(
  node: TaskGraph["nodes"][number],
  allNodes: TaskGraph["nodes"]
): string {
  switch (node.type) {
    case "tool_call":
      return formatToolCallLabel(node);
    case "tool_output": {
      const activityLabel = resolveToolOutputLabel(node, allNodes);
      return node.isError ? `${activityLabel} failed` : `${activityLabel} completed`;
    }
    default:
      return "";
  }
}

function formatToolCallLabel(node: ToolCallNode): string {
  if (node.activityLabel) {
    return `${node.activityLabel}...`;
  }
  return `Calling ${formatToolName(node.toolName)}`;
}

function resolveToolOutputLabel(node: ToolOutputNode, allNodes: TaskGraph["nodes"]): string {
  if (node.activityLabel) {
    return node.activityLabel;
  }
  if (node.toolName) {
    return formatToolName(node.toolName);
  }
  const callNode = allNodes.find(
    (n): n is ToolCallNode => n.type === "tool_call" && n.id === node.callId
  );
  if (callNode?.activityLabel) {
    return callNode.activityLabel;
  }
  if (callNode?.toolName) {
    return formatToolName(callNode.toolName);
  }
  return "Tool";
}

function formatToolName(toolName: string): string {
  return toolName.replace(/[:_]/g, " ").trim();
}

function resolveApprovalReason(node: ToolCallNode): string {
  if (node.activityLabel) {
    return node.activityLabel;
  }
  return formatToolName(node.toolName);
}

function parseTimestamp(value: string): number | null {
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function resolveTaskTimestamps(
  nodes: TaskGraph["nodes"],
  fallback: number
): {
  startedAt: string;
  completedAt: string;
} {
  const timestamps = nodes
    .map((node) => parseTimestamp(node.timestamp))
    .filter((time): time is number => typeof time === "number");
  if (timestamps.length === 0) {
    const fallbackDate = new Date(fallback).toISOString();
    return { startedAt: fallbackDate, completedAt: fallbackDate };
  }
  const sorted = [...timestamps].sort((a, b) => a - b);
  return {
    startedAt: new Date(sorted[0]).toISOString(),
    completedAt: new Date(sorted[sorted.length - 1]).toISOString(),
  };
}

function isTerminalStatus(status: string): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

function extractArtifactsFromGraph(
  artifacts: Record<
    string,
    ArtifactPayload & {
      taskId?: string;
      status?: "pending" | "applied" | "reverted";
      appliedAt?: number;
    }
  >
): ArtifactItem[] {
  return Object.entries(artifacts).map(([id, payload]) => {
    const base: ArtifactItem = {
      id,
      type: "doc",
      title: "Artifact",
      taskId: payload.taskId,
      status: payload.status,
      appliedAt: payload.appliedAt ? new Date(payload.appliedAt).toISOString() : undefined,
    };
    switch (payload.type) {
      case "diff":
        return { ...base, type: "diff", title: payload.file, content: payload.diff };
      case "plan":
        return { ...base, type: "plan", title: "Plan", content: JSON.stringify(payload.steps) };
      case "markdown":
        return { ...base, type: "report", title: "Report", content: payload.content };
      case "preflight":
        return {
          ...base,
          type: "report",
          title: "Preflight Report",
          content: payload.report.riskSummary,
        };
      default:
        return base;
    }
  });
}
