import type { CoworkRiskTag, CoworkTask } from "@ku0/agent-runtime";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type CoworkApproval,
  listApprovals,
  listTasks,
  resolveApproval,
} from "../../../api/coworkApi";
import { apiUrl, config } from "../../../lib/config";
import {
  ArtifactPayloadSchema,
  PlanStepSchema,
  RiskLevel,
  type TaskGraph,
  type TaskNode,
  TaskStatus,
} from "../types";

const RISK_TAGS = new Set<CoworkRiskTag>(["delete", "overwrite", "network", "connector", "batch"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function formatStatus(value: string): string {
  return value.replace(/_/g, " ");
}

function mapTaskStatus(status?: string): TaskStatus | null {
  switch (status) {
    case "queued":
    case "planning":
    case "ready":
      return TaskStatus.PLANNING;
    case "running":
      return TaskStatus.RUNNING;
    case "awaiting_confirmation":
      return TaskStatus.AWAITING_APPROVAL;
    case "completed":
      return TaskStatus.COMPLETED;
    case "failed":
    case "cancelled":
      return TaskStatus.FAILED;
    default:
      return null;
  }
}

function extractRiskTags(value: unknown): CoworkRiskTag[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (tag): tag is CoworkRiskTag => typeof tag === "string" && RISK_TAGS.has(tag as CoworkRiskTag)
  );
}

function mapRiskLevel(riskTags: CoworkRiskTag[]): RiskLevel {
  if (riskTags.some((tag) => tag === "delete" || tag === "overwrite")) {
    return RiskLevel.HIGH;
  }
  if (riskTags.length > 0) {
    return RiskLevel.MEDIUM;
  }
  return RiskLevel.LOW;
}

function appendNode(nodes: TaskNode[], next: TaskNode): TaskNode[] {
  if (nodes.some((node) => node.id === next.id)) {
    return nodes;
  }
  return [...nodes, next];
}

function buildTaskNodes(tasks: CoworkTask[]): TaskNode[] {
  return [...tasks]
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((task) => ({
      id: `task-${task.taskId}-${task.updatedAt}`,
      type: "thinking" as const,
      content: `${task.title} · ${formatStatus(task.status)}`,
      timestamp: new Date(task.updatedAt).toISOString(),
    }));
}

export function useTaskStream(sessionId: string) {
  const [graph, setGraph] = useState<TaskGraph>({
    sessionId,
    status: TaskStatus.PLANNING,
    nodes: [],
    artifacts: {},
  });

  const [isConnected, setIsConnected] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const graphRef = useRef(graph);
  const lastEventIdRef = useRef<string | null>(null);
  const seenEventIdsRef = useRef(new Set<string>());
  const taskTitleRef = useRef(new Map<string, string>());

  useEffect(() => {
    graphRef.current = graph;
  }, [graph]);

  useEffect(() => {
    setGraph({
      sessionId,
      status: TaskStatus.PLANNING,
      nodes: [],
      artifacts: {},
    });
    lastEventIdRef.current = null;
    seenEventIdsRef.current = new Set();
    taskTitleRef.current.clear();
  }, [sessionId]);

  useEffect(() => {
    let isActive = true;

    async function loadInitialState() {
      if (!sessionId || sessionId === "undefined") {
        return;
      }
      try {
        const [tasks, approvals] = await Promise.all([
          listTasks(sessionId),
          listApprovals(sessionId),
        ]);
        if (!isActive) {
          return;
        }

        setGraph((prev) => deriveInitialState(prev, tasks, approvals, taskTitleRef.current));
      } catch (error) {
        if (isActive) {
          console.error("Failed to load initial session state", error);
        }
      }
    }

    loadInitialState();

    return () => {
      isActive = false;
    };
  }, [sessionId]);

  const handleEvent = useCallback((id: string, type: string, data: unknown) => {
    if (seenEventIdsRef.current.has(id)) {
      return;
    }
    seenEventIdsRef.current.add(id);
    lastEventIdRef.current = id;

    setGraph((prev) =>
      reduceGraph(prev, id, type, data, new Date().toISOString(), taskTitleRef.current)
    );
  }, []);

  type EventHandler = (
    prev: TaskGraph,
    id: string,
    data: unknown,
    now: string,
    taskTitles: Map<string, string>
  ) => TaskGraph;

  const EVENT_HANDLERS: Record<string, EventHandler> = {
    "task.created": handleTaskUpdate,
    "task.updated": handleTaskUpdate,
    "approval.required": handleApprovalRequired,
    "approval.resolved": handleApprovalResolved,
    "agent.think": handleAgentThink,
    "agent.tool.call": handleToolCall,
    "agent.tool.result": handleToolResult,
    "agent.plan": handlePlanUpdate,
    "agent.artifact": handleArtifactUpdate,
  };

  function handleApprovalRequired(
    prev: TaskGraph,
    _id: string,
    data: unknown,
    now: string
  ): TaskGraph {
    if (!isRecord(data)) {
      return prev;
    }
    const approvalId = typeof data.approvalId === "string" ? data.approvalId : undefined;
    if (!approvalId) {
      return prev;
    }
    const action = typeof data.action === "string" ? data.action : "tool";
    const riskTags = extractRiskTags(data.riskTags);

    return {
      ...prev,
      status: TaskStatus.AWAITING_APPROVAL,
      pendingApprovalId: approvalId,
      nodes: appendNode(prev.nodes, {
        id: `approval-${approvalId}`,
        type: "tool_call",
        toolName: action,
        args: { action, riskTags },
        requiresApproval: true,
        approvalId,
        riskLevel: mapRiskLevel(riskTags),
        timestamp: now,
      }),
    };
  }

  function handleApprovalResolved(
    prev: TaskGraph,
    id: string,
    data: unknown,
    now: string
  ): TaskGraph {
    if (!isRecord(data)) {
      return prev;
    }
    const approvalId = typeof data.approvalId === "string" ? data.approvalId : undefined;
    const status = typeof data.status === "string" ? data.status : "resolved";

    return {
      ...prev,
      pendingApprovalId: prev.pendingApprovalId === approvalId ? undefined : prev.pendingApprovalId,
      status: prev.status === TaskStatus.AWAITING_APPROVAL ? TaskStatus.RUNNING : prev.status,
      nodes: appendNode(prev.nodes, {
        id: `event-${id}`,
        type: "thinking",
        content: `Approval ${approvalId ? approvalId.slice(0, 8) : ""} ${formatStatus(status)}.`,
        timestamp: now,
      }),
    };
  }

  function handleAgentThink(prev: TaskGraph, id: string, data: unknown, now: string): TaskGraph {
    if (!isRecord(data) || typeof data.content !== "string") {
      return prev;
    }
    return {
      ...prev,
      nodes: appendNode(prev.nodes, {
        id: `think-${id}`,
        type: "thinking",
        content: data.content,
        timestamp: now,
      }),
    };
  }

  function handleToolCall(prev: TaskGraph, id: string, data: unknown, now: string): TaskGraph {
    if (!isRecord(data) || typeof data.tool !== "string") {
      return prev;
    }
    const riskLevel =
      typeof data.riskLevel === "string" &&
      Object.values(RiskLevel).includes(data.riskLevel as RiskLevel)
        ? (data.riskLevel as RiskLevel)
        : undefined;

    return {
      ...prev,
      nodes: appendNode(prev.nodes, {
        id: `call-${id}`,
        type: "tool_call",
        toolName: data.tool,
        args: isRecord(data.args) ? data.args : {},
        timestamp: now,
        requiresApproval:
          typeof data.requiresApproval === "boolean" ? data.requiresApproval : undefined,
        approvalId: typeof data.approvalId === "string" ? data.approvalId : undefined,
        riskLevel,
      }),
    };
  }

  function handleToolResult(prev: TaskGraph, id: string, data: unknown, now: string): TaskGraph {
    if (!isRecord(data)) {
      return prev;
    }
    return {
      ...prev,
      nodes: appendNode(prev.nodes, {
        id: `out-${id}`,
        type: "tool_output",
        callId: typeof data.callId === "string" ? data.callId : "unknown",
        output: data.result,
        isError: typeof data.isError === "boolean" ? data.isError : undefined,
        timestamp: now,
      }),
    };
  }

  function handlePlanUpdate(prev: TaskGraph, id: string, data: unknown, now: string): TaskGraph {
    if (!isRecord(data)) {
      return prev;
    }
    const parsedPlan = PlanStepSchema.array().safeParse(data.plan);
    if (!parsedPlan.success) {
      return prev;
    }
    const artifactId = typeof data.artifactId === "string" ? data.artifactId : "plan";

    return {
      ...prev,
      artifacts: {
        ...prev.artifacts,
        [artifactId]: { type: "plan", steps: parsedPlan.data },
      },
      nodes: appendNode(prev.nodes, {
        id: `plan-${id}`,
        type: "plan_update",
        plan: { type: "plan", steps: parsedPlan.data },
        timestamp: now,
      }),
    };
  }

  function handleArtifactUpdate(prev: TaskGraph, _id: string, data: unknown): TaskGraph {
    if (!isRecord(data)) {
      return prev;
    }
    const parsedArtifact = ArtifactPayloadSchema.safeParse(data.artifact);
    if (!parsedArtifact.success || typeof data.id !== "string") {
      return prev;
    }
    return {
      ...prev,
      artifacts: {
        ...prev.artifacts,
        [data.id]: parsedArtifact.data,
      },
    };
  }

  function handleTaskUpdate(
    prev: TaskGraph,
    id: string,
    data: unknown,
    now: string,
    taskTitles: Map<string, string>
  ): TaskGraph {
    if (!isRecord(data)) {
      return prev;
    }
    const taskId = typeof data.taskId === "string" ? data.taskId : undefined;
    const statusValue = typeof data.status === "string" ? data.status : undefined;

    const title = resolveTaskTitle(taskId, data.title, taskTitles);
    const nodeId = taskId ? `task-${taskId}-${id}` : `event-${id}`;

    return {
      ...prev,
      status: (statusValue ? mapTaskStatus(statusValue) : null) ?? prev.status,
      nodes: appendNode(prev.nodes, {
        id: nodeId,
        type: "thinking",
        content: `${title} · ${statusValue ? formatStatus(statusValue) : "updated"}`,
        timestamp: now,
      }),
    };
  }

  function resolveTaskTitle(
    taskId: string | undefined,
    dataTitle: unknown,
    taskTitles: Map<string, string>
  ): string {
    const title =
      typeof dataTitle === "string" ? dataTitle : taskId ? taskTitles.get(taskId) : undefined;
    if (taskId && title) {
      taskTitles.set(taskId, title);
    }
    return title ?? (taskId ? `Task ${taskId.slice(0, 8)}` : "Task");
  }

  function deriveInitialState(
    prev: TaskGraph,
    tasks: CoworkTask[],
    approvals: CoworkApproval[],
    taskTitles: Map<string, string>
  ): TaskGraph {
    const nodes = buildTaskNodes(tasks);
    for (const task of tasks) {
      taskTitles.set(task.taskId, task.title);
    }

    const pendingApprovals = approvals.filter((a) => a.status === "pending");
    const approvalNodes = pendingApprovals.map((approval) => ({
      id: `approval-${approval.approvalId}`,
      type: "tool_call" as const,
      toolName: approval.action,
      args: { action: approval.action, riskTags: approval.riskTags, reason: approval.reason },
      requiresApproval: true,
      approvalId: approval.approvalId,
      riskLevel: mapRiskLevel(approval.riskTags),
      timestamp: new Date(approval.createdAt).toISOString(),
    }));

    const latestTask = [...tasks].sort((a, b) => b.updatedAt - a.updatedAt)[0];
    const mappedStatus = latestTask ? mapTaskStatus(latestTask.status) : null;
    const latestApproval = pendingApprovals.sort((a, b) => b.createdAt - a.createdAt)[0];

    return {
      ...prev,
      status: mappedStatus ?? prev.status,
      nodes: approvalNodes.reduce(
        (acc, node) => appendNode(acc, node),
        nodes.reduce((acc, node) => appendNode(acc, node), prev.nodes)
      ),
      pendingApprovalId: latestApproval?.approvalId,
    };
  }

  function reduceGraph(
    prev: TaskGraph,
    id: string,
    type: string,
    data: unknown,
    now: string,
    taskTitles: Map<string, string>
  ): TaskGraph {
    const handler = EVENT_HANDLERS[type];
    if (handler) {
      return handler(prev, id, data, now, taskTitles);
    }
    return prev;
  }

  useEffect(() => {
    let retryTimeout: ReturnType<typeof setTimeout> | undefined;

    async function connect(lastEventId?: string | null) {
      const abortController = setupAbortController(abortControllerRef);
      const signal = abortController.signal;

      try {
        const response = await fetchStream(sessionId, lastEventId, signal);
        if (response.ok) {
          setIsConnected(true);
          const reader = response.body?.getReader();
          if (reader) {
            await readStream(reader, handleEvent);
          }
        }
      } catch (error) {
        if (!signal.aborted) {
          console.error("Stream disconnected", error);
          setIsConnected(false);
          retryTimeout = setTimeout(
            () => connect(lastEventIdRef.current),
            config.sseReconnectDelay
          );
        }
      }
    }

    connect(lastEventIdRef.current);

    return () => {
      abortControllerRef.current?.abort();
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
      setIsConnected(false);
    };
  }, [sessionId, handleEvent]);

  const approveTool = useCallback(async (approvalId: string) => {
    try {
      await resolveApproval(approvalId, "approved");
      setGraph((prev) => ({ ...prev, pendingApprovalId: undefined }));
    } catch (error) {
      console.error("Failed to approve", error);
    }
  }, []);

  const rejectTool = useCallback(async (approvalId: string) => {
    try {
      await resolveApproval(approvalId, "rejected");
      setGraph((prev) => ({ ...prev, pendingApprovalId: undefined }));
    } catch (error) {
      console.error("Failed to reject", error);
    }
  }, []);

  return { graph, isConnected, approveTool, rejectTool };
}

function setupAbortController(
  ref: React.MutableRefObject<AbortController | null>
): AbortController {
  ref.current?.abort();
  const controller = new AbortController();
  ref.current = controller;
  return controller;
}

async function fetchStream(
  sessionId: string,
  lastEventId: string | null | undefined,
  signal: AbortSignal
) {
  const streamPath = `/api/sessions/${sessionId}/stream`;
  const fullUrl = apiUrl(streamPath);
  const url = new URL(fullUrl, window.location.origin);
  if (lastEventId) {
    url.searchParams.set("lastEventId", lastEventId);
  }

  return fetch(url.toString(), {
    headers: { Accept: "text/event-stream" },
    signal,
  });
}

function parseMessage(part: string): { id: string; event: string; data: string } | null {
  const lines = part.split("\n");
  let id = "";
  let eventType = "";
  let data = "";

  for (const line of lines) {
    if (line.startsWith("id: ")) {
      id = line.slice(4);
    } else if (line.startsWith("event: ")) {
      eventType = line.slice(7);
    } else if (line.startsWith("data: ")) {
      data = line.slice(6);
    }
  }

  if (id && eventType && data) {
    return { id, event: eventType, data };
  }
  return null;
}

function parseSSEChunk(buffer: string): {
  messages: Array<{ id: string; event: string; data: string }>;
  remaining: string;
} {
  const messages: Array<{ id: string; event: string; data: string }> = [];
  const parts = buffer.split("\n\n");
  const remaining = parts.pop() || "";

  for (const part of parts) {
    const msg = parseMessage(part);
    if (msg) {
      messages.push(msg);
    }
  }
  return { messages, remaining };
}

async function readStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onMessage: (id: string, event: string, data: unknown) => void
) {
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    const chunk = decoder.decode(value, { stream: true });
    buffer += chunk;

    const { messages, remaining } = parseSSEChunk(buffer);
    buffer = remaining;

    for (const msg of messages) {
      try {
        const parsedData = JSON.parse(msg.data);
        onMessage(msg.id, msg.event, parsedData);
      } catch (error) {
        console.error("Failed to parse SSE data", error);
      }
    }
  }
}
