import type {
  ClarificationRequest,
  CoworkRiskTag,
  CoworkTask,
  CoworkTaskStatus,
  CoworkWorkspaceEvent,
  CoworkWorkspaceSession,
  ToolActivity,
} from "@ku0/agent-runtime";
import { useCallback, useEffect, useRef, useState } from "react";
import type { z } from "zod";
import {
  applyArtifact as applyArtifactRequest,
  type CoworkApproval,
  type CoworkArtifact,
  getSession,
  listApprovals,
  listClarifications,
  listSessionArtifacts,
  listTasks,
  listWorkspaceSessions,
  resolveApproval,
  revertArtifact as revertArtifactRequest,
  submitClarification,
} from "../../../api/coworkApi";
import { apiUrl, config } from "../../../lib/config";
import {
  ArtifactPayloadSchema,
  type EnrichedArtifact,
  PlanStepSchema,
  RiskLevel,
  type TaskGraph,
  type TaskNode,
  TaskStatus,
  type TaskStatusNode,
} from "../types";

const RISK_TAGS = new Set<CoworkRiskTag>(["delete", "overwrite", "network", "connector", "batch"]);
const MAX_WORKSPACE_EVENTS = 200;

// --- LocalStorage Persistence ---
const GRAPH_STORAGE_PREFIX = "cowork-task-graph-";

function getStorageKey(sessionId: string): string {
  return `${GRAPH_STORAGE_PREFIX}${sessionId}`;
}

function saveGraphToStorage(sessionId: string, graph: TaskGraph): void {
  if (!sessionId || sessionId === "undefined") {
    return;
  }
  try {
    const serializable = {
      ...graph,
      savedAt: Date.now(),
    };
    window.localStorage.setItem(getStorageKey(sessionId), JSON.stringify(serializable));
  } catch {
    // Ignore storage errors (quota exceeded, etc.)
  }
}

// Cache TTL: 7 days
const GRAPH_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function loadGraphFromStorage(sessionId: string): TaskGraph | null {
  if (!sessionId || sessionId === "undefined") {
    return null;
  }
  try {
    const stored = window.localStorage.getItem(getStorageKey(sessionId));
    if (!stored) {
      return null;
    }
    const parsed = JSON.parse(stored) as TaskGraph & { savedAt?: number };

    // Check cache expiration
    if (parsed.savedAt && Date.now() - parsed.savedAt > GRAPH_CACHE_TTL_MS) {
      window.localStorage.removeItem(getStorageKey(sessionId));
      return null;
    }

    // Validate basic structure
    if (!parsed.sessionId || !Array.isArray(parsed.nodes)) {
      return null;
    }
    return {
      sessionId: parsed.sessionId,
      status: parsed.status ?? TaskStatus.PLANNING,
      nodes: parsed.nodes,
      artifacts: parsed.artifacts ?? {},
      clarifications: parsed.clarifications ?? [],
      pendingApprovalId: parsed.pendingApprovalId,
      messageUsage: parsed.messageUsage ?? {},
      workspaceSessions: isRecord(parsed.workspaceSessions)
        ? (parsed.workspaceSessions as Record<string, CoworkWorkspaceSession>)
        : {},
      workspaceEvents: isRecord(parsed.workspaceEvents)
        ? (parsed.workspaceEvents as Record<string, CoworkWorkspaceEvent[]>)
        : {},
    };
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isClarificationRequest(value: unknown): value is ClarificationRequest {
  if (!isRecord(value)) {
    return false;
  }
  return typeof value.id === "string" && typeof value.question === "string";
}

function formatStatus(value: string): string {
  return value.replace(/_/g, " ");
}

function mapTaskStatus(status?: string): TaskStatus | null {
  switch (status) {
    case "queued":
      return TaskStatus.QUEUED;
    case "planning":
      return TaskStatus.PLANNING;
    case "ready":
      return TaskStatus.READY;
    case "running":
      return TaskStatus.RUNNING;
    case "awaiting_confirmation":
    case "awaiting_approval":
      return TaskStatus.AWAITING_APPROVAL;
    case "completed":
      return TaskStatus.COMPLETED;
    case "failed":
      return TaskStatus.FAILED;
    case "cancelled":
      return TaskStatus.CANCELLED;
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

function upsertNode(nodes: TaskNode[], next: TaskNode): TaskNode[] {
  const index = nodes.findIndex((node) => node.id === next.id);
  if (index === -1) {
    return [...nodes, next];
  }
  if (nodes[index] === next) {
    return nodes;
  }
  const updated = [...nodes];
  updated[index] = next;
  return updated;
}

const WORKSPACE_STATUSES: CoworkWorkspaceSession["status"][] = [
  "created",
  "active",
  "paused",
  "closed",
];

function mapWorkspaceSessions(
  sessions: CoworkWorkspaceSession[]
): Record<string, CoworkWorkspaceSession> {
  return Object.fromEntries(sessions.map((session) => [session.workspaceSessionId, session]));
}

function isWorkspaceSession(value: unknown): value is CoworkWorkspaceSession {
  return (
    isRecord(value) &&
    typeof value.workspaceSessionId === "string" &&
    typeof value.sessionId === "string" &&
    typeof value.kind === "string" &&
    typeof value.status === "string"
  );
}

function isWorkspaceEvent(value: unknown): value is CoworkWorkspaceEvent {
  return (
    isRecord(value) &&
    typeof value.workspaceSessionId === "string" &&
    typeof value.sequence === "number" &&
    typeof value.timestamp === "number" &&
    typeof value.kind === "string" &&
    isRecord(value.payload)
  );
}

function resolveWorkspaceStatus(
  payload: Record<string, unknown>
): CoworkWorkspaceSession["status"] | null {
  const status = typeof payload.status === "string" ? payload.status : undefined;
  if (!status || !WORKSPACE_STATUSES.includes(status as CoworkWorkspaceSession["status"])) {
    return null;
  }
  return status as CoworkWorkspaceSession["status"];
}

function upsertWorkspaceSession(prev: TaskGraph, session: CoworkWorkspaceSession): TaskGraph {
  return {
    ...prev,
    workspaceSessions: {
      ...(prev.workspaceSessions ?? {}),
      [session.workspaceSessionId]: session,
    },
  };
}

function appendWorkspaceEvent(prev: TaskGraph, event: CoworkWorkspaceEvent): TaskGraph {
  const workspaceEvents = { ...(prev.workspaceEvents ?? {}) };
  const existing = workspaceEvents[event.workspaceSessionId] ?? [];
  const nextEvents = [...existing, event];
  const capped =
    nextEvents.length > MAX_WORKSPACE_EVENTS
      ? nextEvents.slice(nextEvents.length - MAX_WORKSPACE_EVENTS)
      : nextEvents;
  workspaceEvents[event.workspaceSessionId] = capped;

  const sessions = prev.workspaceSessions ?? {};
  const current = sessions[event.workspaceSessionId];
  if (!current) {
    return {
      ...prev,
      workspaceEvents,
    };
  }

  let nextSession = current;
  if (event.kind === "status") {
    const status = resolveWorkspaceStatus(event.payload);
    if (status) {
      nextSession = {
        ...current,
        status,
        updatedAt: Math.max(current.updatedAt, event.timestamp),
        endedAt: status === "closed" ? (current.endedAt ?? event.timestamp) : current.endedAt,
      };
    }
  } else if (event.timestamp > current.updatedAt) {
    nextSession = {
      ...current,
      updatedAt: event.timestamp,
    };
  }

  if (nextSession === current) {
    return {
      ...prev,
      workspaceEvents,
    };
  }

  return {
    ...prev,
    workspaceSessions: {
      ...sessions,
      [event.workspaceSessionId]: nextSession,
    },
    workspaceEvents,
  };
}

function buildTaskNodes(tasks: CoworkTask[]): TaskStatusNode[] {
  return [...tasks]
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((task) => ({
      id: `task-${task.taskId}`,
      type: "task_status" as const,
      taskId: task.taskId,
      title: task.title,
      prompt: task.prompt,
      status: task.status,
      mappedStatus: mapTaskStatus(task.status),
      modelId: task.modelId,
      providerId: task.providerId,
      fallbackNotice: task.fallbackNotice,
      metadata: task.metadata,
      timestamp: new Date(task.updatedAt).toISOString(),
    }));
}

export function useTaskStream(sessionId: string) {
  const [graph, setGraph] = useState<TaskGraph>({
    sessionId,
    status: TaskStatus.PLANNING,
    nodes: [],
    artifacts: {},
    clarifications: [],
    messageUsage: {},
    workspaceSessions: {},
    workspaceEvents: {},
  });

  const [isConnected, setIsConnected] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [isPollingFallback, setIsPollingFallback] = useState(false);
  const lastHeartbeatRef = useRef<number>(Date.now());
  const abortControllerRef = useRef<AbortController | null>(null);
  const graphRef = useRef(graph);
  const lastEventIdRef = useRef<string | null>(null);
  const seenEventIdsRef = useRef(new Set<string>());
  const taskTitleRef = useRef(new Map<string, string>());
  const taskPromptRef = useRef(new Map<string, string>());
  const taskMetadataRef = useRef(new Map<string, Record<string, unknown>>());

  useEffect(() => {
    graphRef.current = graph;
  }, [graph]);

  useEffect(() => {
    // Try to restore from localStorage first
    const cached = loadGraphFromStorage(sessionId);
    if (cached && cached.nodes.length > 0) {
      setGraph(cached);
      // Populate seenEventIds from cached nodes to prevent duplicate filtering
      // We extract base IDs from node IDs (e.g., "call-xyz" -> "xyz", "task-abc" -> "abc")
      const seenIds = new Set<string>();
      for (const node of cached.nodes) {
        seenIds.add(node.id);
        // Also add the base event ID (strip prefixes used in node generation)
        const baseId = node.id.replace(/^(task-|call-|out-|think-|plan-|event-|approval-)/, "");
        if (baseId !== node.id) {
          seenIds.add(baseId);
        }
      }
      seenEventIdsRef.current = seenIds;
    } else {
      setGraph({
        sessionId,
        status: TaskStatus.PLANNING,
        nodes: [],
        artifacts: {},
        clarifications: [],
        messageUsage: {},
        workspaceSessions: {},
        workspaceEvents: {},
      });
      seenEventIdsRef.current = new Set();
    }
    lastEventIdRef.current = null;
    taskTitleRef.current.clear();
    taskPromptRef.current.clear();
    taskMetadataRef.current.clear();
  }, [sessionId]);

  // Persist graph to localStorage on every change
  useEffect(() => {
    if (graph.nodes.length > 0) {
      saveGraphToStorage(sessionId, graph);
    }
  }, [sessionId, graph]);

  const refreshSessionState = useCallback(
    async (isActiveRef?: { current: boolean }) => {
      if (!sessionId || sessionId === "undefined") {
        return;
      }
      try {
        const [session, tasks, approvals, artifacts, clarifications, workspaceSessions] =
          await Promise.all([
            getSession(sessionId),
            listTasks(sessionId),
            listApprovals(sessionId),
            listSessionArtifacts(sessionId),
            listClarifications(sessionId),
            listWorkspaceSessions(sessionId),
          ]);
        if (isActiveRef && !isActiveRef.current) {
          return;
        }

        const cached = loadGraphFromStorage(sessionId);
        const isCacheStale = cached && session.updatedAt > (cached.savedAt ?? 0);

        setGraph((prev) => {
          const base = isCacheStale
            ? {
                sessionId,
                status: TaskStatus.PLANNING,
                nodes: [],
                artifacts: {},
                clarifications: [],
                messageUsage: {},
                workspaceSessions: {},
                workspaceEvents: {},
              }
            : prev;
          const normalizedMode =
            session.agentMode === "plan" ||
            session.agentMode === "build" ||
            session.agentMode === "review"
              ? session.agentMode
              : undefined;
          const derived = deriveInitialState(
            base,
            tasks,
            approvals,
            artifacts,
            clarifications,
            normalizedMode,
            taskTitleRef.current,
            taskPromptRef.current,
            taskMetadataRef.current
          );
          return {
            ...derived,
            workspaceSessions: mapWorkspaceSessions(workspaceSessions),
            workspaceEvents: base.workspaceEvents ?? {},
          };
        });
      } catch (error) {
        if (!isActiveRef || isActiveRef.current) {
          // biome-ignore lint/suspicious/noConsole: Expected error logging
          console.error("Failed to load session state", error);
        }
      }
    },
    [sessionId]
  );

  useEffect(() => {
    const isActiveRef = { current: true };
    void refreshSessionState(isActiveRef);
    return () => {
      isActiveRef.current = false;
    };
  }, [refreshSessionState]);

  useEffect(() => {
    if (isConnected) {
      const isActiveRef = { current: true };
      void refreshSessionState(isActiveRef);
      return () => {
        isActiveRef.current = false;
      };
    }
  }, [isConnected, refreshSessionState]);

  useEffect(() => {
    if (!isPollingFallback || !sessionId || sessionId === "undefined") {
      return;
    }

    const isActiveRef = { current: true };
    void refreshSessionState(isActiveRef);
    const interval = setInterval(
      () => void refreshSessionState(isActiveRef),
      config.taskPollInterval
    );

    return () => {
      isActiveRef.current = false;
      clearInterval(interval);
    };
  }, [isPollingFallback, sessionId, refreshSessionState]);

  // Connection liveness monitor
  useEffect(() => {
    if (!isConnected) {
      setIsLive(false);
      return;
    }

    setIsLive(true);
    const interval = setInterval(() => {
      const now = Date.now();
      const elapsed = now - lastHeartbeatRef.current;
      // If no heartbeat for > 45 seconds (server sends every 30s), mark as not live
      if (elapsed > 45000) {
        setIsLive(false);
      } else {
        setIsLive(true);
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [isConnected]);

  const handleEvent = useCallback((id: string, type: string, data: unknown) => {
    if (type === "system.heartbeat") {
      lastHeartbeatRef.current = Date.now();
      setIsLive(true);
      return;
    }

    if (seenEventIdsRef.current.has(id)) {
      return;
    }
    seenEventIdsRef.current.add(id);
    lastEventIdRef.current = id;

    setGraph((prev) =>
      reduceGraph(
        prev,
        id,
        type,
        data,
        new Date().toISOString(),
        taskTitleRef.current,
        taskPromptRef.current,
        taskMetadataRef.current
      )
    );
  }, []);

  useEffect(() => {
    let retryTimeout: ReturnType<typeof setTimeout> | undefined;
    let retryCount = 0;
    const MAX_RETRY_DELAY = 30000; // 30 seconds max

    const requestReader = async (
      lastEventId: string | null | undefined,
      signal: AbortSignal
    ): Promise<ReadableStreamDefaultReader<Uint8Array> | null> => {
      const response = await fetchStream(sessionId, lastEventId, signal);
      if (!response.ok) {
        setIsConnected(false);
        setIsPollingFallback(true);
        return null;
      }
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("text/event-stream") || !response.body) {
        setIsConnected(false);
        setIsPollingFallback(true);
        return null;
      }
      setIsPollingFallback(false);
      setIsConnected(true);
      retryCount = 0; // Reset on successful connection
      return response.body.getReader();
    };

    const markDisconnected = (pollingFallback: boolean) => {
      setIsConnected(false);
      setIsPollingFallback(pollingFallback);
    };

    const scheduleReconnect = () => {
      // Exponential backoff: delay = base * 2^retryCount, capped at MAX_RETRY_DELAY
      const delay = Math.min(config.sseReconnectDelay * 2 ** retryCount, MAX_RETRY_DELAY);
      retryCount++;
      retryTimeout = setTimeout(() => connect(lastEventIdRef.current), delay);
    };

    const runStream = async (
      lastEventId: string | null | undefined,
      signal: AbortSignal
    ): Promise<void> => {
      try {
        const reader = await requestReader(lastEventId, signal);
        if (!reader) {
          return;
        }
        await readStream(reader, handleEvent);
        if (!signal.aborted) {
          setIsConnected(false);
          scheduleReconnect();
        }
      } catch (error) {
        if (signal.aborted) {
          return;
        }
        // biome-ignore lint/suspicious/noConsole: Expected error logging
        console.error("Stream disconnected", error);
        markDisconnected(true);
        scheduleReconnect();
      }
    };

    const connect = async (lastEventId?: string | null) => {
      if (!sessionId || sessionId === "undefined") {
        markDisconnected(false);
        return;
      }

      const abortController = setupAbortController(abortControllerRef);
      await runStream(lastEventId, abortController.signal);
    };

    void connect(lastEventIdRef.current);

    return () => {
      abortControllerRef.current?.abort();
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
      setIsConnected(false);
    };
  }, [sessionId, handleEvent]);

  const approveTool = useCallback(
    async (approvalId: string) => {
      // Optimistic UI update
      setGraph((prev) => ({
        ...prev,
        pendingApprovalId:
          prev.pendingApprovalId === approvalId ? undefined : prev.pendingApprovalId,
        status: prev.status === TaskStatus.AWAITING_APPROVAL ? TaskStatus.RUNNING : prev.status,
      }));

      try {
        await resolveApproval(approvalId, "approved");
      } catch (error) {
        // biome-ignore lint/suspicious/noConsole: Expected error logging
        console.error("Failed to approve", error);
        // Rollback or handle error if needed - for now we'll just log
        // In a real app we might want to refresh state
        void refreshSessionState();
      }
    },
    [refreshSessionState]
  );

  const rejectTool = useCallback(
    async (approvalId: string) => {
      // Optimistic UI update
      setGraph((prev) => ({
        ...prev,
        pendingApprovalId:
          prev.pendingApprovalId === approvalId ? undefined : prev.pendingApprovalId,
      }));

      try {
        await resolveApproval(approvalId, "rejected");
      } catch (error) {
        // biome-ignore lint/suspicious/noConsole: Expected error logging
        console.error("Failed to reject", error);
        void refreshSessionState();
      }
    },
    [refreshSessionState]
  );

  const updateArtifactRecord = useCallback((record: CoworkArtifact) => {
    const parsed = ArtifactPayloadSchema.safeParse(record.artifact);
    if (!parsed.success) {
      return;
    }
    setGraph((prev) => ({
      ...prev,
      artifacts: {
        ...prev.artifacts,
        [record.artifactId]: {
          ...parsed.data,
          updatedAt: record.updatedAt,
          taskId: record.taskId,
          version: record.version,
          applicationStatus: record.status,
          appliedAt: record.appliedAt,
        } as EnrichedArtifact,
      },
    }));
  }, []);

  const applyArtifact = useCallback(
    async (artifactId: string) => {
      try {
        const updated = await applyArtifactRequest(artifactId);
        updateArtifactRecord(updated);
      } catch (error) {
        // biome-ignore lint/suspicious/noConsole: Expected error logging
        console.error("Failed to apply artifact", error);
        void refreshSessionState();
      }
    },
    [refreshSessionState, updateArtifactRecord]
  );

  const revertArtifact = useCallback(
    async (artifactId: string) => {
      try {
        const updated = await revertArtifactRequest(artifactId);
        updateArtifactRecord(updated);
      } catch (error) {
        // biome-ignore lint/suspicious/noConsole: Expected error logging
        console.error("Failed to revert artifact", error);
        void refreshSessionState();
      }
    },
    [refreshSessionState, updateArtifactRecord]
  );

  const answerClarification = useCallback(
    async (input: { requestId: string; answer: string; selectedOption?: number }) => {
      const answer = input.answer.trim();
      if (!answer) {
        return;
      }
      try {
        await submitClarification(input.requestId, {
          answer,
          selectedOption: input.selectedOption,
        });
        setGraph((prev) => ({
          ...prev,
          clarifications: prev.clarifications.filter((request) => request.id !== input.requestId),
        }));
      } catch (error) {
        // biome-ignore lint/suspicious/noConsole: Expected error logging
        console.error("Failed to submit clarification", error);
        void refreshSessionState();
      }
    },
    [refreshSessionState]
  );

  return {
    graph,
    isConnected,
    isLive,
    approveTool,
    rejectTool,
    applyArtifact,
    revertArtifact,
    answerClarification,
  };
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
        // biome-ignore lint/suspicious/noConsole: Expected error logging
        console.error("Failed to parse SSE data", error);
      }
    }
  }
}

type EventHandler = (
  prev: TaskGraph,
  id: string,
  data: unknown,
  now: string,
  taskTitles: Map<string, string>,
  taskPrompts: Map<string, string>,
  taskMetadata: Map<string, Record<string, unknown>>
) => TaskGraph;

const EVENT_HANDLERS: Record<string, EventHandler> = {
  "session.mode.changed": handleSessionModeChanged,
  "workspace.session.created": handleWorkspaceSessionCreated,
  "workspace.session.updated": handleWorkspaceSessionUpdated,
  "workspace.session.ended": handleWorkspaceSessionEnded,
  "workspace.session.event": handleWorkspaceSessionEvent,
  "task.created": handleTaskUpdate,
  "task.updated": handleTaskUpdate,
  "approval.required": handleApprovalRequired,
  "approval.resolved": handleApprovalResolved,
  "clarification.requested": handleClarificationRequested,
  "clarification.answered": handleClarificationAnswered,
  "agent.think": handleAgentThink,
  "agent.tool.call": handleToolCall,
  "agent.tool.result": handleToolResult,
  "agent.plan": handlePlanUpdate,
  "task.plan": handlePlanUpdate,
  "agent.artifact": handleArtifactUpdate,
  "agent.turn.start": handleTurnStart,
  "agent.turn.end": handleTurnEnd,
  "policy.decision": handlePolicyDecision,
  "checkpoint.created": handleCheckpointCreated,
  "checkpoint.restored": handleCheckpointRestored,
  "session.usage.updated": handleUsageUpdated,
  "token.usage": handleTokenUsage,
};

function handleUsageUpdated(
  prev: TaskGraph,
  _id: string,
  data: unknown,
  _now: string,
  _taskTitles: Map<string, string>,
  _taskPrompts: Map<string, string>,
  _taskMetadata: Map<string, Record<string, unknown>>
): TaskGraph {
  if (
    !isRecord(data) ||
    typeof data.inputTokens !== "number" ||
    typeof data.outputTokens !== "number" ||
    typeof data.totalTokens !== "number"
  ) {
    return prev;
  }
  return {
    ...prev,
    usage: {
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
      totalTokens: data.totalTokens,
    },
  };
}

function handleTokenUsage(
  prev: TaskGraph,
  _id: string,
  data: unknown,
  _now: string,
  _taskTitles: Map<string, string>,
  _taskPrompts: Map<string, string>,
  _taskMetadata: Map<string, Record<string, unknown>>
): TaskGraph {
  if (
    !isRecord(data) ||
    typeof data.inputTokens !== "number" ||
    typeof data.outputTokens !== "number" ||
    typeof data.totalTokens !== "number"
  ) {
    return prev;
  }

  const messageId =
    typeof data.messageId === "string"
      ? data.messageId
      : typeof data.taskId === "string"
        ? `task-stream-${data.taskId}`
        : undefined;
  if (!messageId) {
    return prev;
  }

  const costUsd = typeof data.costUsd === "number" ? data.costUsd : null;
  const usageEntry = {
    inputTokens: data.inputTokens,
    outputTokens: data.outputTokens,
    totalTokens: data.totalTokens,
    ...(typeof data.contextWindow === "number" ? { contextWindow: data.contextWindow } : {}),
    ...(typeof data.utilization === "number" ? { utilization: data.utilization } : {}),
    ...(typeof data.modelId === "string" ? { modelId: data.modelId } : {}),
    ...(typeof data.providerId === "string" ? { providerId: data.providerId } : {}),
    costUsd,
  };

  return {
    ...prev,
    messageUsage: {
      ...(prev.messageUsage ?? {}),
      [messageId]: usageEntry,
    },
  };
}

function handleWorkspaceSessionCreated(
  prev: TaskGraph,
  _id: string,
  data: unknown,
  _now: string,
  _taskTitles: Map<string, string>,
  _taskPrompts: Map<string, string>,
  _taskMetadata: Map<string, Record<string, unknown>>
): TaskGraph {
  if (!isRecord(data) || !isWorkspaceSession(data.workspaceSession)) {
    return prev;
  }
  return upsertWorkspaceSession(prev, data.workspaceSession);
}

function handleWorkspaceSessionUpdated(
  prev: TaskGraph,
  _id: string,
  data: unknown,
  _now: string,
  _taskTitles: Map<string, string>,
  _taskPrompts: Map<string, string>,
  _taskMetadata: Map<string, Record<string, unknown>>
): TaskGraph {
  if (!isRecord(data) || !isWorkspaceSession(data.workspaceSession)) {
    return prev;
  }
  return upsertWorkspaceSession(prev, data.workspaceSession);
}

function handleWorkspaceSessionEnded(
  prev: TaskGraph,
  _id: string,
  data: unknown,
  _now: string,
  _taskTitles: Map<string, string>,
  _taskPrompts: Map<string, string>,
  _taskMetadata: Map<string, Record<string, unknown>>
): TaskGraph {
  if (!isRecord(data) || typeof data.workspaceSessionId !== "string") {
    return prev;
  }
  const sessions = prev.workspaceSessions ?? {};
  const current = sessions[data.workspaceSessionId];
  if (!current) {
    return prev;
  }
  const endedAt = typeof data.endedAt === "number" ? data.endedAt : current.endedAt;
  return {
    ...prev,
    workspaceSessions: {
      ...sessions,
      [data.workspaceSessionId]: {
        ...current,
        status: "closed",
        endedAt,
        updatedAt: endedAt ?? current.updatedAt,
      },
    },
  };
}

function handleWorkspaceSessionEvent(
  prev: TaskGraph,
  _id: string,
  data: unknown,
  _now: string,
  _taskTitles: Map<string, string>,
  _taskPrompts: Map<string, string>,
  _taskMetadata: Map<string, Record<string, unknown>>
): TaskGraph {
  if (!isRecord(data) || !isWorkspaceEvent(data.event)) {
    return prev;
  }
  return appendWorkspaceEvent(prev, data.event);
}

function handleSessionModeChanged(
  prev: TaskGraph,
  _id: string,
  data: unknown,
  _now: string,
  _taskTitles: Map<string, string>,
  _taskPrompts: Map<string, string>,
  _taskMetadata: Map<string, Record<string, unknown>>
): TaskGraph {
  if (!isRecord(data) || typeof data.mode !== "string") {
    return prev;
  }
  return {
    ...prev,
    agentMode: (data.mode as "plan" | "build" | "review") || "build",
  };
}

function handleApprovalRequired(
  prev: TaskGraph,
  _id: string,
  data: unknown,
  now: string,
  _taskTitles: Map<string, string>,
  _taskPrompts: Map<string, string>,
  _taskMetadata: Map<string, Record<string, unknown>>
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
  const reason = typeof data.reason === "string" ? data.reason : undefined;
  const taskId = typeof data.taskId === "string" ? data.taskId : undefined;

  return {
    ...prev,
    status: TaskStatus.AWAITING_APPROVAL,
    pendingApprovalId: approvalId,
    nodes: appendNode(prev.nodes, {
      id: `approval-${approvalId}`,
      type: "tool_call",
      toolName: action,
      args: { action, riskTags, ...(reason ? { reason } : {}) },
      requiresApproval: true,
      approvalId,
      riskLevel: mapRiskLevel(riskTags),
      taskId,
      timestamp: now,
    }),
  };
}

function handleApprovalResolved(
  prev: TaskGraph,
  id: string,
  data: unknown,
  now: string,
  _taskTitles: Map<string, string>,
  _taskPrompts: Map<string, string>,
  _taskMetadata: Map<string, Record<string, unknown>>
): TaskGraph {
  if (!isRecord(data)) {
    return prev;
  }
  const approvalId = typeof data.approvalId === "string" ? data.approvalId : undefined;
  const status = typeof data.status === "string" ? data.status : "resolved";
  const taskId = typeof data.taskId === "string" ? data.taskId : undefined;

  return {
    ...prev,
    pendingApprovalId: prev.pendingApprovalId === approvalId ? undefined : prev.pendingApprovalId,
    status: prev.status === TaskStatus.AWAITING_APPROVAL ? TaskStatus.RUNNING : prev.status,
    nodes: appendNode(prev.nodes, {
      id: `event-${id}`,
      type: "thinking",
      content: `Approval ${approvalId ? approvalId.slice(0, 8) : ""} ${formatStatus(status)}.`,
      taskId,
      timestamp: now,
    }),
  };
}

function handleClarificationRequested(
  prev: TaskGraph,
  _id: string,
  data: unknown,
  _now: string,
  _taskTitles: Map<string, string>,
  _taskPrompts: Map<string, string>,
  _taskMetadata: Map<string, Record<string, unknown>>
): TaskGraph {
  if (!isRecord(data) || !isRecord(data.request)) {
    return prev;
  }
  const request = data.request;
  if (!isClarificationRequest(request)) {
    return prev;
  }
  if (prev.clarifications.some((entry) => entry.id === request.id)) {
    return prev;
  }
  return {
    ...prev,
    clarifications: [...prev.clarifications, request],
  };
}

function handleClarificationAnswered(
  prev: TaskGraph,
  _id: string,
  data: unknown,
  _now: string,
  _taskTitles: Map<string, string>,
  _taskPrompts: Map<string, string>,
  _taskMetadata: Map<string, Record<string, unknown>>
): TaskGraph {
  if (!isRecord(data) || !isRecord(data.response)) {
    return prev;
  }
  const response = data.response as { requestId?: string };
  if (!response.requestId) {
    return prev;
  }
  return {
    ...prev,
    clarifications: prev.clarifications.filter((entry) => entry.id !== response.requestId),
  };
}

function handleAgentThink(
  prev: TaskGraph,
  id: string,
  data: unknown,
  now: string,
  _taskTitles: Map<string, string>,
  _taskPrompts: Map<string, string>,
  _taskMetadata: Map<string, Record<string, unknown>>
): TaskGraph {
  if (!isRecord(data) || typeof data.content !== "string") {
    return prev;
  }
  const taskId = typeof data.taskId === "string" ? data.taskId : undefined;
  return {
    ...prev,
    nodes: appendNode(prev.nodes, {
      id: `think-${id}`,
      type: "thinking",
      content: data.content,
      taskId,
      timestamp: now,
    }),
  };
}

function handleTurnStart(
  prev: TaskGraph,
  id: string,
  data: unknown,
  now: string,
  _taskTitles: Map<string, string>,
  _taskPrompts: Map<string, string>,
  _taskMetadata: Map<string, Record<string, unknown>>
): TaskGraph {
  if (!isRecord(data) || typeof data.turn !== "number") {
    return prev;
  }
  const taskId = typeof data.taskId === "string" ? data.taskId : undefined;
  return {
    ...prev,
    nodes: appendNode(prev.nodes, {
      id: `turn-start-${data.turn}-${id}`,
      type: "turn_marker",
      turn: data.turn,
      phase: "start",
      taskId,
      timestamp: now,
    }),
  };
}

function handleTurnEnd(
  prev: TaskGraph,
  id: string,
  data: unknown,
  now: string,
  _taskTitles: Map<string, string>,
  _taskPrompts: Map<string, string>,
  _taskMetadata: Map<string, Record<string, unknown>>
): TaskGraph {
  if (!isRecord(data) || typeof data.turn !== "number") {
    return prev;
  }
  const taskId = typeof data.taskId === "string" ? data.taskId : undefined;
  return {
    ...prev,
    nodes: appendNode(prev.nodes, {
      id: `turn-end-${data.turn}-${id}`,
      type: "turn_marker",
      turn: data.turn,
      phase: "end",
      taskId,
      timestamp: now,
    }),
  };
}

function handleToolCall(
  prev: TaskGraph,
  id: string,
  data: unknown,
  now: string,
  _taskTitles: Map<string, string>,
  _taskPrompts: Map<string, string>,
  _taskMetadata: Map<string, Record<string, unknown>>
): TaskGraph {
  if (!isRecord(data) || typeof data.tool !== "string") {
    return prev;
  }

  const { riskLevel, activity, activityLabel, taskId } = extractToolInvocationMetadata(data);

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
      activity,
      activityLabel,
      taskId,
    }),
  };
}

function handleToolResult(
  prev: TaskGraph,
  id: string,
  data: unknown,
  now: string,
  _taskTitles: Map<string, string>,
  _taskPrompts: Map<string, string>,
  _taskMetadata: Map<string, Record<string, unknown>>
): TaskGraph {
  if (!isRecord(data)) {
    return prev;
  }

  const { toolName, activity, activityLabel, taskId } = extractToolResultMetadata(data);

  return {
    ...prev,
    nodes: appendNode(prev.nodes, {
      id: `out-${id}`,
      type: "tool_output",
      callId: typeof data.callId === "string" ? data.callId : "unknown",
      toolName,
      output: data.result,
      isError: typeof data.isError === "boolean" ? data.isError : undefined,
      errorCode: typeof data.errorCode === "string" ? data.errorCode : undefined,
      durationMs: typeof data.durationMs === "number" ? data.durationMs : undefined,
      attempts: typeof data.attempts === "number" ? data.attempts : undefined,
      activity,
      activityLabel,
      taskId,
      timestamp: now,
    }),
  };
}

function handlePolicyDecision(
  prev: TaskGraph,
  id: string,
  data: unknown,
  now: string,
  _taskTitles: Map<string, string>,
  _taskPrompts: Map<string, string>,
  _taskMetadata: Map<string, Record<string, unknown>>
): TaskGraph {
  if (!isRecord(data)) {
    return prev;
  }

  const decision =
    typeof data.decision === "string" &&
    ["allow", "allow_with_confirm", "deny"].includes(data.decision)
      ? (data.decision as "allow" | "allow_with_confirm" | "deny")
      : undefined;
  const taskId = typeof data.taskId === "string" ? data.taskId : undefined;
  const riskTags = extractRiskTags(data.riskTags);

  return {
    ...prev,
    nodes: appendNode(prev.nodes, {
      id: `policy-${id}`,
      type: "policy_decision",
      toolName: typeof data.toolName === "string" ? data.toolName : undefined,
      decision,
      policyRuleId: typeof data.policyRuleId === "string" ? data.policyRuleId : undefined,
      policyAction: typeof data.policyAction === "string" ? data.policyAction : undefined,
      riskTags,
      riskScore: typeof data.riskScore === "number" ? data.riskScore : undefined,
      reason: typeof data.reason === "string" ? data.reason : undefined,
      taskId,
      timestamp: now,
    }),
  };
}

function handleCheckpointCreated(
  prev: TaskGraph,
  id: string,
  data: unknown,
  now: string,
  _taskTitles: Map<string, string>,
  _taskPrompts: Map<string, string>,
  _taskMetadata: Map<string, Record<string, unknown>>
): TaskGraph {
  if (!isRecord(data) || typeof data.checkpointId !== "string") {
    return prev;
  }
  const taskId = typeof data.taskId === "string" ? data.taskId : undefined;
  const createdAt =
    typeof data.createdAt === "number" ? new Date(data.createdAt).toISOString() : now;
  const currentStep = typeof data.currentStep === "number" ? data.currentStep : 0;

  return {
    ...prev,
    nodes: appendNode(prev.nodes, {
      id: `checkpoint-created-${data.checkpointId}-${id}`,
      type: "checkpoint",
      checkpointId: data.checkpointId,
      status: typeof data.status === "string" ? data.status : undefined,
      currentStep,
      action: "created",
      taskId,
      timestamp: createdAt,
    }),
  };
}

function handleCheckpointRestored(
  prev: TaskGraph,
  id: string,
  data: unknown,
  now: string,
  _taskTitles: Map<string, string>,
  _taskPrompts: Map<string, string>,
  _taskMetadata: Map<string, Record<string, unknown>>
): TaskGraph {
  if (!isRecord(data) || typeof data.checkpointId !== "string") {
    return prev;
  }
  const taskId = typeof data.taskId === "string" ? data.taskId : undefined;
  const restoredAt =
    typeof data.restoredAt === "number" ? new Date(data.restoredAt).toISOString() : now;
  const currentStep = typeof data.currentStep === "number" ? data.currentStep : 0;

  return {
    ...prev,
    nodes: appendNode(prev.nodes, {
      id: `checkpoint-restored-${data.checkpointId}-${id}`,
      type: "checkpoint",
      checkpointId: data.checkpointId,
      currentStep,
      action: "restored",
      taskId,
      timestamp: restoredAt,
    }),
  };
}

function extractToolResultMetadata(data: Record<string, unknown>): {
  toolName?: string;
  activity?: ToolActivity;
  activityLabel?: string;
  taskId?: string;
} {
  return {
    toolName: typeof data.toolName === "string" ? data.toolName : undefined,
    activity: typeof data.activity === "string" ? (data.activity as ToolActivity) : undefined,
    activityLabel: typeof data.activityLabel === "string" ? data.activityLabel : undefined,
    taskId: typeof data.taskId === "string" ? data.taskId : undefined,
  };
}

function extractToolInvocationMetadata(data: Record<string, unknown>): {
  riskLevel?: RiskLevel;
  activity?: ToolActivity;
  activityLabel?: string;
  taskId?: string;
} {
  const riskLevel =
    typeof data.riskLevel === "string" &&
    Object.values(RiskLevel).includes(data.riskLevel as RiskLevel)
      ? (data.riskLevel as RiskLevel)
      : undefined;

  return {
    riskLevel,
    activity: typeof data.activity === "string" ? (data.activity as ToolActivity) : undefined,
    activityLabel: typeof data.activityLabel === "string" ? data.activityLabel : undefined,
    taskId: typeof data.taskId === "string" ? data.taskId : undefined,
  };
}

function handlePlanUpdate(
  prev: TaskGraph,
  id: string,
  data: unknown,
  now: string,
  _taskTitles: Map<string, string>,
  _taskPrompts: Map<string, string>,
  _taskMetadata: Map<string, Record<string, unknown>>
): TaskGraph {
  if (!isRecord(data)) {
    return prev;
  }
  const parsedPlan = PlanStepSchema.array().safeParse(data.plan);
  if (!parsedPlan.success) {
    return prev;
  }
  const artifactId = typeof data.artifactId === "string" ? data.artifactId : "plan";
  const taskId = typeof data.taskId === "string" ? data.taskId : undefined;
  const existing = prev.artifacts[artifactId];
  if (existing?.type === "plan" && arePlanStepsEqual(existing.steps, parsedPlan.data)) {
    return prev;
  }

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
      taskId,
      timestamp: now,
    }),
  };
}

function arePlanStepsEqual(
  left: z.infer<typeof PlanStepSchema>[],
  right: z.infer<typeof PlanStepSchema>[]
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((step, index) => {
    const other = right[index];
    if (!other) {
      return false;
    }
    return step.id === other.id && step.label === other.label && step.status === other.status;
  });
}

function handleArtifactUpdate(
  prev: TaskGraph,
  _id: string,
  data: unknown,
  now: string,
  _taskTitles: Map<string, string>,
  _taskPrompts: Map<string, string>,
  _taskMetadata: Map<string, Record<string, unknown>>
): TaskGraph {
  if (!isRecord(data)) {
    return prev;
  }
  const parsedArtifact = ArtifactPayloadSchema.safeParse(data.artifact);
  if (!parsedArtifact.success || typeof data.id !== "string") {
    return prev;
  }

  const eventTime = typeof data.updatedAt === "number" ? data.updatedAt : new Date(now).getTime();
  const existing = prev.artifacts[data.id];

  // Version check: only update if newer than current artifact
  if (existing?.updatedAt && eventTime <= existing.updatedAt) {
    return prev;
  }

  return {
    ...prev,
    artifacts: {
      ...prev.artifacts,
      [data.id]: {
        ...parsedArtifact.data,
        updatedAt: eventTime,
        taskId: typeof data.taskId === "string" ? data.taskId : undefined,
        applicationStatus: existing?.applicationStatus,
        appliedAt: existing?.appliedAt,
        version: existing?.version,
      } as EnrichedArtifact,
    },
  };
}

function resolveTaskMetadata(data: Record<string, unknown>) {
  return {
    modelId: typeof data.modelId === "string" ? data.modelId : undefined,
    providerId: typeof data.providerId === "string" ? data.providerId : undefined,
    fallbackNotice: typeof data.fallbackNotice === "string" ? data.fallbackNotice : undefined,
  };
}

function resolveTaskMetadataRecord(
  data: Record<string, unknown>,
  taskId: string | undefined,
  taskMetadata: Map<string, Record<string, unknown>>
): Record<string, unknown> | undefined {
  const incoming = isRecord(data.metadata) ? data.metadata : undefined;
  if (taskId && incoming) {
    taskMetadata.set(taskId, incoming);
    return incoming;
  }
  if (taskId) {
    return taskMetadata.get(taskId);
  }
  return incoming;
}

function resolveTaskNodeProps(
  data: Record<string, unknown>,
  taskId: string | undefined,
  taskTitles: Map<string, string>,
  taskPrompts: Map<string, string>,
  taskMetadata: Map<string, Record<string, unknown>>
) {
  const statusValue = typeof data.status === "string" ? data.status : undefined;
  const title = resolveTaskTitle(taskId, data.title, taskTitles);
  let prompt = typeof data.prompt === "string" ? data.prompt : undefined;
  if (!prompt && taskId) {
    prompt = taskPrompts.get(taskId);
  }
  if (taskId && prompt) {
    taskPrompts.set(taskId, prompt);
  }

  const { modelId, providerId, fallbackNotice } = resolveTaskMetadata(data);
  const metadata = resolveTaskMetadataRecord(data, taskId, taskMetadata);

  return {
    statusValue,
    title,
    prompt,
    mappedStatus: statusValue ? mapTaskStatus(statusValue) : null,
    modelId,
    providerId,
    fallbackNotice,
    metadata,
  };
}

function createTaskStatusNode(
  taskId: string,
  title: string,
  prompt: string | undefined,
  statusValue: string,
  mappedStatus: TaskStatus | null,
  modelId: string | undefined,
  providerId: string | undefined,
  fallbackNotice: string | undefined,
  metadata: Record<string, unknown> | undefined,
  now: string
): TaskStatusNode {
  return {
    id: `task-${taskId}`,
    type: "task_status",
    taskId,
    title,
    prompt,
    status: statusValue as CoworkTaskStatus,
    mappedStatus,
    modelId,
    providerId,
    fallbackNotice,
    metadata,
    timestamp: now,
  };
}

function handleTaskUpdate(
  prev: TaskGraph,
  _id: string,
  data: unknown,
  now: string,
  taskTitles: Map<string, string>,
  taskPrompts: Map<string, string>,
  taskMetadata: Map<string, Record<string, unknown>>
): TaskGraph {
  if (!isRecord(data)) {
    return prev;
  }
  const taskId = typeof data.taskId === "string" ? data.taskId : undefined;
  const props = resolveTaskNodeProps(data, taskId, taskTitles, taskPrompts, taskMetadata);

  return {
    ...prev,
    status: props.mappedStatus ?? prev.status,
    nodes:
      taskId && props.statusValue
        ? upsertNode(
            prev.nodes,
            createTaskStatusNode(
              taskId,
              props.title,
              props.prompt,
              props.statusValue,
              props.mappedStatus,
              props.modelId,
              props.providerId,
              props.fallbackNotice,
              props.metadata,
              now
            )
          )
        : prev.nodes,
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

function buildArtifactMap(
  existing: Record<string, EnrichedArtifact>,
  records: CoworkArtifact[]
): Record<string, EnrichedArtifact> {
  const next = { ...existing };
  for (const record of records) {
    const parsed = ArtifactPayloadSchema.safeParse(record.artifact);
    if (!parsed.success) {
      continue;
    }
    const existingEntry = next[record.artifactId];
    // Only update if no existing entry or if the record is newer
    if (!existingEntry || (record.updatedAt && record.updatedAt > (existingEntry.updatedAt ?? 0))) {
      next[record.artifactId] = {
        ...parsed.data,
        updatedAt: record.updatedAt,
        taskId: record.taskId,
        version: record.version,
        applicationStatus: record.status,
        appliedAt: record.appliedAt,
      } as EnrichedArtifact;
    }
  }
  return next;
}

function deriveInitialState(
  prev: TaskGraph,
  tasks: CoworkTask[],
  approvals: CoworkApproval[],
  artifacts: CoworkArtifact[],
  clarifications: ClarificationRequest[],
  agentMode: "plan" | "build" | "review" | undefined,
  taskTitles: Map<string, string>,
  taskPrompts: Map<string, string>,
  taskMetadata: Map<string, Record<string, unknown>>
): TaskGraph {
  const statusNodes = buildTaskNodes(tasks);
  for (const task of tasks) {
    taskTitles.set(task.taskId, task.title);
    taskPrompts.set(task.taskId, task.prompt);
    if (task.metadata) {
      taskMetadata.set(task.taskId, task.metadata);
    }
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
    taskId: approval.taskId,
    timestamp: new Date(approval.createdAt).toISOString(),
  }));

  const latestTask = [...tasks].sort((a, b) => b.updatedAt - a.updatedAt)[0];
  const mappedStatus = latestTask ? mapTaskStatus(latestTask.status) : null;
  const latestApproval = pendingApprovals.sort((a, b) => b.createdAt - a.createdAt)[0];

  const nonStatusNodes = prev.nodes.filter((node) => node.type !== "task_status");
  const mergedStatusNodes = statusNodes.reduce<TaskNode[]>(
    (acc, node) => upsertNode(acc, node),
    nonStatusNodes
  );
  const nextArtifacts = buildArtifactMap(prev.artifacts, artifacts);

  return {
    ...prev,
    status: mappedStatus ?? prev.status,
    artifacts: nextArtifacts,
    clarifications,
    nodes: approvalNodes.reduce<TaskNode[]>(
      (acc, node) => appendNode(acc, node),
      mergedStatusNodes
    ),
    pendingApprovalId: latestApproval?.approvalId,
    agentMode: agentMode ?? "build",
  };
}

function reduceGraph(
  prev: TaskGraph,
  id: string,
  type: string,
  data: unknown,
  now: string,
  taskTitles: Map<string, string>,
  taskPrompts: Map<string, string>,
  taskMetadata: Map<string, Record<string, unknown>>
): TaskGraph {
  const handler = EVENT_HANDLERS[type];
  if (handler) {
    return handler(prev, id, data, now, taskTitles, taskPrompts, taskMetadata);
  }
  return prev;
}
