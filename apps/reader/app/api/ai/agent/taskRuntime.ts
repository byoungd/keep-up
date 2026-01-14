import { EventEmitter } from "node:events";
import * as path from "node:path";

import {
  type CoworkSession,
  type CoworkTaskSummary,
  type ITaskExecutor,
  type OrchestratorEvent,
  type Task,
  type TaskExecutionContext,
  type TaskQueueStats,
  buildCoworkTaskSummary,
  createAICoreAdapter,
  createAuditLogger,
  createCoworkOrchestrator,
  createCoworkSessionState,
  createTaskQueue,
  mapTaskEventToCoworkEvent,
} from "@keepup/agent-runtime";
import {
  PathValidator,
  createBashToolServer,
  createFileToolServer,
  createToolRegistry,
} from "@keepup/agent-runtime/tools";
import { createAnthropicClient, createOpenAIProvider } from "../providerClients";
import type { ProviderConfig } from "../providerResolver";
import { buildInitialState, buildSystemPrompt, resolveWorkspaceRoot } from "./agentShared";
import { createPendingConfirmation, listPendingTaskConfirmations } from "./confirmationStore";
import { getArchivedTaskSnapshots, recordTaskSnapshot } from "./taskStore";

export type TaskStreamEvent =
  | {
      type: "task.snapshot";
      timestamp: number;
      data: { tasks: TaskSnapshot[]; stats: TaskQueueStats };
    }
  | {
      type:
        | "task.queued"
        | "task.paused"
        | "task.running"
        | "task.progress"
        | "task.completed"
        | "task.failed"
        | "task.cancelled";
      taskId: string;
      timestamp: number;
      data?: Record<string, unknown>;
    }
  | {
      type: "task.confirmation_required";
      taskId: string;
      timestamp: number;
      data: {
        confirmation_id: string;
        toolName: string;
        description: string;
        arguments: Record<string, unknown>;
        risk: "low" | "medium" | "high";
        reason?: string;
        riskTags?: string[];
        request_id: string;
      };
    }
  | {
      type: "task.confirmation_received";
      taskId: string;
      timestamp: number;
      data: { confirmation_id: string; confirmed: boolean };
    };

export type TaskSnapshot = {
  taskId: string;
  name: string;
  prompt: string;
  status: TaskStatusSnapshot;
  progress: number;
  progressMessage?: string;
  createdAt: number;
  queuedAt?: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
  summary?: CoworkTaskSummary;
};

export type TaskStatusSnapshot =
  | "queued"
  | "paused"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

type BackgroundTaskPayload = {
  prompt: string;
  modelId: string;
  provider: ProviderConfig;
  systemPrompt?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  agentId: string;
  requestId: string;
  name: string;
  workspaceRoot: string;
  outputRoot: string;
};

type BackgroundTaskResult = {
  summary?: CoworkTaskSummary;
  runId: string;
};

const TASK_EVENT_NAME = "task-event";
const taskEvents = new EventEmitter();
const DEFAULT_TASK_TIMEOUT_MS = 1000 * 60 * 30;
// In-memory queue scoped to this process. Replace with a persistent adapter for multi-instance deployments.
const taskQueue = createTaskQueue({ defaultTimeout: DEFAULT_TASK_TIMEOUT_MS });
const TASK_EVENT_HISTORY_LIMIT = 200;
const taskEventHistory: Array<{ id: number; event: TaskStreamEvent }> = [];
let lastTaskEventId = 0;
let queueListenerAttached = false;
let executorRegistered = false;

export function subscribeTaskEvents(
  handler: (event: TaskStreamEvent, eventId: number) => void
): () => void {
  taskEvents.on(TASK_EVENT_NAME, handler);
  return () => taskEvents.off(TASK_EVENT_NAME, handler);
}

export async function getTaskSnapshots(): Promise<TaskSnapshot[]> {
  const archived = await getArchivedTaskSnapshots();
  const live = taskQueue
    .listTasks()
    .filter(isBackgroundTask)
    .map((task) => serializeTask(task));
  const merged = new Map<string, TaskSnapshot>();
  for (const task of archived) {
    merged.set(task.taskId, task);
  }
  for (const task of live) {
    merged.set(task.taskId, task);
  }
  return Array.from(merged.values());
}

export function getTaskStats(): TaskQueueStats {
  return taskQueue.getStats();
}

export async function enqueueBackgroundTask(options: {
  prompt: string;
  modelId: string;
  provider: ProviderConfig;
  systemPrompt?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  agentId: string;
  requestId: string;
  name: string;
}): Promise<string> {
  ensureQueueListener();
  ensureExecutor();

  const workspaceRoot = resolveWorkspaceRoot();
  const outputRoot = path.join(workspaceRoot, ".keep-up", "outputs");

  const taskId = await taskQueue.enqueue<BackgroundTaskPayload, BackgroundTaskResult>({
    type: "agent",
    name: options.name,
    payload: {
      prompt: options.prompt,
      modelId: options.modelId,
      provider: options.provider,
      systemPrompt: options.systemPrompt,
      history: options.history,
      agentId: options.agentId,
      requestId: options.requestId,
      name: options.name,
      workspaceRoot,
      outputRoot,
    },
  });

  return taskId;
}

export async function cancelBackgroundTask(taskId: string): Promise<boolean> {
  return taskQueue.cancel(taskId);
}

export async function pauseBackgroundTask(taskId: string): Promise<boolean> {
  ensureQueueListener();
  const paused = await taskQueue.pause(taskId);
  if (!paused) {
    return false;
  }
  const task = taskQueue.getTask<BackgroundTaskPayload, BackgroundTaskResult>(taskId);
  if (task) {
    const snapshot = serializeTask(task);
    void recordTaskSnapshot(snapshot);
    emitTaskEvent({
      type: "task.paused",
      taskId,
      timestamp: Date.now(),
      data: { task: snapshot },
    });
  }
  return true;
}

export async function resumeBackgroundTask(taskId: string): Promise<boolean> {
  ensureQueueListener();
  const resumed = await taskQueue.resume(taskId);
  if (!resumed) {
    return false;
  }
  const task = taskQueue.getTask<BackgroundTaskPayload, BackgroundTaskResult>(taskId);
  if (task) {
    const snapshot = serializeTask(task);
    void recordTaskSnapshot(snapshot);
    emitTaskEvent({
      type: "task.queued",
      taskId,
      timestamp: Date.now(),
      data: { task: snapshot, resumed: true },
    });
  }
  return true;
}

export function getTaskEventHistorySince(eventId: number): {
  entries: Array<{ id: number; event: TaskStreamEvent }>;
  hasGap: boolean;
} {
  const oldestId = taskEventHistory[0]?.id;
  const hasGap = eventId > 0 && (oldestId === undefined || eventId < oldestId);
  if (!Number.isFinite(eventId) || hasGap) {
    return { entries: [], hasGap };
  }
  return {
    entries: taskEventHistory.filter((entry) => entry.id > eventId),
    hasGap,
  };
}

export async function getPendingConfirmationEvents(): Promise<TaskStreamEvent[]> {
  const pending = await listPendingTaskConfirmations();
  return pending.map((entry) => ({
    type: "task.confirmation_required",
    taskId: entry.taskId,
    timestamp: entry.createdAt,
    data: {
      confirmation_id: entry.confirmationId,
      toolName: entry.toolName,
      description: entry.description,
      arguments: entry.arguments,
      risk: entry.risk,
      reason: entry.reason,
      riskTags: entry.riskTags,
      request_id: entry.requestId,
    },
  }));
}

function ensureQueueListener() {
  if (queueListenerAttached) {
    return;
  }
  queueListenerAttached = true;
  taskQueue.on((event) => {
    const mapped = mapTaskEventToCoworkEvent(event);
    if (!mapped) {
      return;
    }

    if (!isStreamableTaskEvent(mapped.type)) {
      return;
    }

    const task = taskQueue.getTask<BackgroundTaskPayload, BackgroundTaskResult>(event.taskId);
    const snapshot = task ? serializeTask(task) : undefined;
    if (snapshot) {
      void recordTaskSnapshot(snapshot);
    }
    emitTaskEvent({
      type: mapped.type,
      taskId: mapped.taskId,
      timestamp: mapped.timestamp,
      data: {
        ...(mapped.data ?? {}),
        ...(snapshot ? { task: snapshot } : {}),
      },
    });
  });
}

function ensureExecutor() {
  if (executorRegistered) {
    return;
  }
  executorRegistered = true;
  taskQueue.registerExecutor("agent", new CoworkAgentTaskExecutor());
}

function emitTaskEvent(event: TaskStreamEvent) {
  const eventId = ++lastTaskEventId;
  taskEventHistory.push({ id: eventId, event });
  if (taskEventHistory.length > TASK_EVENT_HISTORY_LIMIT) {
    taskEventHistory.shift();
  }
  taskEvents.emit(TASK_EVENT_NAME, event, eventId);
}

function serializeTask(task: Task<BackgroundTaskPayload, BackgroundTaskResult>): TaskSnapshot {
  const payload = task.payload;
  const status = mapStatus(task.status);
  const summary = task.result?.summary;
  return {
    taskId: task.id,
    name: task.name,
    prompt: payload.prompt,
    status,
    progress: task.progress,
    progressMessage: task.progressMessage,
    createdAt: task.createdAt,
    queuedAt: task.queuedAt,
    startedAt: task.startedAt,
    completedAt: task.completedAt,
    error: task.error,
    summary,
  };
}

function isBackgroundTask(
  task: Task<unknown, unknown>
): task is Task<BackgroundTaskPayload, BackgroundTaskResult> {
  return task.type === "agent";
}

type StreamableTaskEventType = Exclude<
  TaskStreamEvent["type"],
  "task.snapshot" | "task.confirmation_required" | "task.confirmation_received"
>;

const STREAMABLE_TASK_EVENT_TYPES: ReadonlySet<StreamableTaskEventType> = new Set([
  "task.queued",
  "task.paused",
  "task.running",
  "task.progress",
  "task.completed",
  "task.failed",
  "task.cancelled",
]);

function isStreamableTaskEvent(type: string): type is StreamableTaskEventType {
  return STREAMABLE_TASK_EVENT_TYPES.has(type as StreamableTaskEventType);
}

function mapStatus(status: Task<unknown>["status"]): TaskStatusSnapshot {
  if (status === "cancelled" || status === "timeout") {
    return "cancelled";
  }
  if (status === "failed") {
    return "failed";
  }
  if (status === "completed") {
    return "completed";
  }
  if (status === "running") {
    return "running";
  }
  if (status === "paused") {
    return "paused";
  }
  return "queued";
}

class CoworkAgentTaskExecutor
  implements ITaskExecutor<BackgroundTaskPayload, BackgroundTaskResult>
{
  canHandle(type: string): boolean {
    return type === "agent";
  }

  async execute(payload: BackgroundTaskPayload, context: TaskExecutionContext) {
    const auditLogger = createAuditLogger();
    const registry = await createToolRegistryForWorkspace(payload.workspaceRoot);
    // @ts-expect-error - provider types are compatible but not exported
    const llm = createAICoreAdapter(resolveProvider(payload.provider), { model: payload.modelId });
    const session = createCoworkSession(payload);

    const systemPrompt = buildSystemPrompt(payload.systemPrompt);
    const initialState = buildInitialState(systemPrompt, payload.history);
    const sessionState = createCoworkSessionState({ initialState });

    const orchestrator = createCoworkOrchestrator(llm, registry, {
      cowork: { session, audit: auditLogger },
      components: { sessionState },
      requireConfirmation: true,
      maxTurns: 25,
    });

    const unsubscribe = attachOrchestratorEvents(
      orchestrator,
      context,
      payload.name,
      payload.requestId
    );

    context.signal.addEventListener("abort", () => {
      orchestrator.stop();
    });

    const runId = context.taskId;
    try {
      await orchestrator.runWithRunId(payload.prompt, runId);
    } finally {
      unsubscribe();
    }

    const summary = buildCoworkTaskSummary({
      taskId: runId,
      auditEntries: auditLogger.getEntries({ correlationId: runId }),
      outputRoots: [payload.outputRoot],
    });

    return { runId, summary };
  }
}

async function createToolRegistryForWorkspace(workspaceRoot: string) {
  const registry = createToolRegistry();
  const validator = new PathValidator({ allowedPaths: [workspaceRoot] });

  await registry.register(createFileToolServer({ validator }));
  await registry.register(createBashToolServer());

  return registry;
}

function resolveProvider(config: ProviderConfig) {
  return config.kind === "anthropic" ? createAnthropicClient(config) : createOpenAIProvider(config);
}

function createCoworkSession(payload: BackgroundTaskPayload): CoworkSession {
  return {
    sessionId: payload.requestId,
    userId: payload.agentId,
    deviceId: "reader",
    platform: "macos",
    mode: "cowork",
    grants: [
      {
        id: "workspace",
        rootPath: payload.workspaceRoot,
        allowWrite: true,
        allowDelete: true,
        allowCreate: true,
        outputRoots: [payload.outputRoot],
      },
    ],
    connectors: [],
    createdAt: Date.now(),
  };
}

function attachOrchestratorEvents(
  orchestrator: ReturnType<typeof createCoworkOrchestrator>,
  context: TaskExecutionContext,
  taskName: string,
  requestId: string
): () => void {
  let progress = 5;
  const updateProgress = (message: string, increment = 5) => {
    progress = Math.min(95, progress + increment);
    context.reportProgress(progress, message);
  };

  const unsubscribe = orchestrator.on((event: OrchestratorEvent) => {
    if (event.type === "plan:created") {
      updateProgress("Plan ready", 10);
      return;
    }
    if (event.type === "plan:approved") {
      updateProgress("Plan approved", 5);
      return;
    }
    if (event.type === "tool:calling") {
      const toolName =
        typeof event.data === "object" && event.data && "toolName" in event.data
          ? String((event.data as { toolName?: unknown }).toolName ?? "tool")
          : "tool";
      updateProgress(`Running ${toolName}`, 8);
      return;
    }
    if (event.type === "tool:result") {
      updateProgress("Tool result captured", 5);
      return;
    }
  });

  orchestrator.setConfirmationHandler(async (confirmation) => {
    const { confirmationId, promise } = await createPendingConfirmation({
      requestId,
      metadata: {
        taskId: context.taskId,
        toolName: confirmation.toolName,
        description: confirmation.description,
        risk: confirmation.risk,
        reason: confirmation.reason,
        riskTags: confirmation.riskTags,
        arguments: confirmation.arguments,
      },
    });
    emitTaskEvent({
      type: "task.confirmation_required",
      taskId: context.taskId,
      timestamp: Date.now(),
      data: {
        ...confirmation,
        description: formatTaskDescription(taskName, confirmation.description),
        confirmation_id: confirmationId,
        request_id: requestId,
      },
    });
    promise.then((confirmed) => {
      emitTaskEvent({
        type: "task.confirmation_received",
        taskId: context.taskId,
        timestamp: Date.now(),
        data: { confirmation_id: confirmationId, confirmed },
      });
    });
    return promise;
  });

  return unsubscribe;
}

function formatTaskDescription(taskName: string, description: string): string {
  if (!description) {
    return taskName;
  }
  return `${taskName}: ${description}`;
}
