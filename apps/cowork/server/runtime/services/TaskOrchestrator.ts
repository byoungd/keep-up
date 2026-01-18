/**
 * Task orchestrator service
 * Handles task lifecycle, event processing, and orchestration coordination
 */

import type { CoworkTask, CoworkTaskStatus, TokenUsageStats } from "@ku0/agent-runtime";
import {
  formatToolActivityLabel as formatActivity,
  resolveToolActivity as resolveActivity,
} from "@ku0/agent-runtime";
import { isRecord } from "@ku0/shared";
import type { TaskStoreLike } from "../../storage/contracts";
import {
  calculateUsageCostUsd,
  mergeTokenUsage,
  normalizeTokenUsage,
} from "../../utils/tokenUsage";
import { extractErrorCode, extractTelemetry, isToolError } from "../utils";
import type { ApprovalCoordinator } from "./ApprovalCoordinator";
import type { ArtifactProcessor } from "./ArtifactProcessor";
import type { EventStreamPublisher } from "./EventStreamPublisher";
import type { SessionLifecycleManager } from "./SessionLifecycleManager";

type PlanStep = {
  id: string;
  label: string;
  status: "pending" | "in_progress" | "completed" | "failed";
};

import { CostTrackerService } from "../../services/CostTrackerService";

export class TaskOrchestrator {
  private taskWriteQueue: Promise<void> = Promise.resolve();
  private readonly costTracker = new CostTrackerService();

  constructor(
    private readonly taskStore: TaskStoreLike,
    private readonly artifactProcessor: ArtifactProcessor,
    private readonly eventPublisher: EventStreamPublisher,
    private readonly sessionManager: SessionLifecycleManager,
    readonly _approvalCoordinator: ApprovalCoordinator
  ) {}

  /**
   * Create a task record and emit initial event
   */
  async createTask(task: CoworkTask): Promise<CoworkTask> {
    await this.enqueueTaskWrite(() => this.taskStore.create(task));
    await this.sessionManager.touchSession(task.sessionId);
    this.eventPublisher.publishTaskCreated({
      sessionId: task.sessionId,
      taskId: task.taskId,
      status: task.status,
      title: task.title,
      prompt: task.prompt,
      modelId: task.modelId,
      providerId: task.providerId,
      fallbackNotice: task.fallbackNotice,
      metadata: task.metadata,
    });
    return task;
  }

  /**
   * Update task status
   */
  async updateTaskStatus(
    taskId: string,
    status: CoworkTaskStatus,
    allowedStatuses?: CoworkTaskStatus[]
  ): Promise<void> {
    const now = Date.now();
    let didChange = false;

    const updated = await this.enqueueTaskWrite(() =>
      this.taskStore.update(taskId, (task) => {
        if (allowedStatuses && !allowedStatuses.includes(task.status)) {
          return task;
        }
        if (task.status === status) {
          return task;
        }
        didChange = true;
        return { ...task, status, updatedAt: now };
      })
    );

    if (!updated || !didChange) {
      return;
    }

    this.eventPublisher.publishTaskUpdated({
      sessionId: updated.sessionId,
      taskId: updated.taskId,
      status: updated.status,
      title: updated.title,
      prompt: updated.prompt,
      modelId: updated.modelId,
      providerId: updated.providerId,
      fallbackNotice: updated.fallbackNotice,
      metadata: updated.metadata,
    });
  }

  /**
   * Handle task event from runtime
   */
  async handleTaskEvent(event: {
    type: string;
    taskId: string;
    data?: Record<string, unknown>;
  }): Promise<void> {
    switch (event.type) {
      case "task.queued":
        await this.updateTaskStatus(event.taskId, "queued");
        break;
      case "task.running":
        await this.updateTaskStatus(event.taskId, "running");
        break;
      case "task.completed":
        await this.handleTaskCompleted(event.taskId, event.data);
        break;
      case "task.failed":
        await this.updateTaskStatus(event.taskId, "failed");
        break;
      case "task.cancelled":
        await this.updateTaskStatus(event.taskId, "cancelled");
        break;
      default:
        break;
    }
  }

  /**
   * Handle task completion
   */
  private async handleTaskCompleted(taskId: string, data?: Record<string, unknown>): Promise<void> {
    await this.updateTaskStatus(taskId, "completed");

    const task = await this.taskStore.getById(taskId);
    if (!task) {
      return;
    }

    const { summaryArtifact, outputArtifacts } = await this.artifactProcessor.processTaskCompletion(
      task.sessionId,
      taskId,
      data
    );

    if (summaryArtifact) {
      this.eventPublisher.publishAgentArtifact({
        sessionId: task.sessionId,
        id: summaryArtifact.artifactId,
        artifact: summaryArtifact.artifact,
        taskId,
        updatedAt: summaryArtifact.updatedAt,
      });
    }

    for (const artifact of outputArtifacts) {
      this.eventPublisher.publishAgentArtifact({
        sessionId: task.sessionId,
        id: artifact.artifactId,
        artifact: artifact.artifact,
        taskId,
        updatedAt: artifact.updatedAt,
      });
    }
  }

  /**
   * Handle orchestrator event
   */
  async handleOrchestratorEvent(
    sessionId: string,
    activeTaskId: string | null,
    event: { type: string; data: unknown },
    context?: { modelId?: string; providerId?: string }
  ): Promise<void> {
    switch (event.type) {
      case "thinking":
        this.handleThinkingEvent(sessionId, activeTaskId, event.data);
        break;
      case "tool:calling":
        this.handleToolCallingEvent(sessionId, activeTaskId, event.data);
        break;
      case "tool:result":
        this.handleToolResultEvent(sessionId, activeTaskId, event.data);
        break;
      case "usage:update":
        await this.handleUsageUpdate(
          sessionId,
          activeTaskId,
          event.data as { usage: TokenUsageStats; totalUsage: TokenUsageStats }
        );
        break;
      case "plan:created":
        await this.handlePlanCreatedEvent(sessionId, activeTaskId, event.data);
        break;
      case "confirmation:required":
        if (activeTaskId) {
          await this.updateTaskStatus(activeTaskId, "awaiting_confirmation", [
            "queued",
            "planning",
            "ready",
            "running",
            "awaiting_confirmation",
          ]);
        }
        break;
      case "confirmation:received":
        if (activeTaskId) {
          await this.updateTaskStatus(activeTaskId, "running");
        }
        break;
      case "error":
        if (activeTaskId) {
          await this.updateTaskStatus(activeTaskId, "failed");
        }
        break;
      default:
        break;
    }
  }

  /**
   * Handle thinking event
   */
  private handleThinkingEvent(sessionId: string, activeTaskId: string | null, data: unknown): void {
    if (!isRecord(data) || typeof data.content !== "string") {
      return;
    }
    this.eventPublisher.publishAgentThink(sessionId, data.content, activeTaskId ?? undefined);
  }

  /**
   * Handle tool calling event
   */
  private handleToolCallingEvent(
    sessionId: string,
    activeTaskId: string | null,
    data: unknown
  ): void {
    if (!isRecord(data) || typeof data.toolName !== "string") {
      return;
    }
    const activity = resolveActivity(data.toolName);
    const activityLabel = formatActivity(activity);

    this.eventPublisher.publishAgentToolCall({
      sessionId,
      tool: data.toolName,
      args: isRecord(data.arguments) ? data.arguments : {},
      activity,
      activityLabel,
      taskId: activeTaskId ?? undefined,
    });
  }

  /**
   * Handle tool result event
   */
  private handleToolResultEvent(
    sessionId: string,
    activeTaskId: string | null,
    data: unknown
  ): void {
    if (!isRecord(data) || typeof data.toolName !== "string") {
      return;
    }
    const result = data.result;
    const isError = isToolError(result);
    const errorCode = extractErrorCode(result);
    const telemetry = extractTelemetry(data);
    const activity = resolveActivity(data.toolName);
    const activityLabel = formatActivity(activity);

    this.eventPublisher.publishAgentToolResult({
      sessionId,
      callId: `${data.toolName}-${Date.now().toString(36)}`,
      toolName: data.toolName,
      result,
      isError,
      errorCode,
      durationMs: telemetry?.durationMs,
      attempts: telemetry?.attempts,
      activity,
      activityLabel,
      taskId: activeTaskId ?? undefined,
    });
  }

  /**
   * Handle usage update event
   */
  private async handleUsageUpdate(
    sessionId: string,
    activeTaskId: string | null,
    data: { usage: TokenUsageStats; totalUsage: TokenUsageStats }
  ): Promise<void> {
    if (
      !data ||
      !data.usage ||
      typeof data.usage.inputTokens !== "number" ||
      typeof data.usage.outputTokens !== "number" ||
      typeof data.usage.totalTokens !== "number"
    ) {
      return;
    }

    const taskId = activeTaskId ?? undefined;
    const task = taskId ? await this.taskStore.getById(taskId) : null;
    const modelId = task?.modelId;
    const providerId = task?.providerId;
    const usageStats = normalizeTokenUsage(data.usage, modelId);
    const costUsd = calculateUsageCostUsd(usageStats, modelId);

    const updatedSession = await this.sessionManager.updateSession(sessionId, (s) => ({
      ...s,
      usage: mergeTokenUsage(s.usage, usageStats),
    }));

    if (updatedSession?.usage) {
      this.eventPublisher.publishSessionUsageUpdated({
        sessionId,
        usage: updatedSession.usage,
      });
    }

    if (taskId) {
      await this.taskStore.update(taskId, (taskRecord) => {
        const existingUsage = readUsageMetadata(taskRecord.metadata);
        const mergedUsage = mergeTokenUsage(existingUsage, usageStats);
        const mergedCostUsd = calculateUsageCostUsd(mergedUsage, taskRecord.modelId);
        const metadata = {
          ...(taskRecord.metadata ?? {}),
          usage: {
            ...mergedUsage,
            costUsd: mergedCostUsd,
            ...(taskRecord.modelId ? { modelId: taskRecord.modelId } : {}),
            ...(taskRecord.providerId ? { providerId: taskRecord.providerId } : {}),
          },
        };
        return {
          ...taskRecord,
          metadata,
          updatedAt: Date.now(),
        };
      });
    }

    this.eventPublisher.publishTokenUsage({
      sessionId,
      taskId,
      usage: usageStats,
      costUsd: costUsd,
      modelId,
      providerId,
    });
  }

  /**
   * Handle plan created event
   */
  private async handlePlanCreatedEvent(
    sessionId: string,
    activeTaskId: string | null,
    data: unknown
  ): Promise<void> {
    if (!isRecord(data)) {
      return;
    }
    const steps = this.buildPlanSteps(data.steps);
    const artifactId = activeTaskId ? `plan-${activeTaskId}` : "plan";

    const persisted = await this.artifactProcessor.persistArtifact(sessionId, {
      artifactId,
      artifact: {
        type: "plan",
        steps,
      },
      taskId: activeTaskId ?? undefined,
      title: "Plan",
    });

    this.eventPublisher.publishAgentPlan({
      sessionId,
      artifactId,
      plan: steps,
      taskId: activeTaskId ?? undefined,
    });
    this.eventPublisher.publishAgentArtifact({
      sessionId,
      id: persisted.artifactId,
      artifact: persisted.artifact,
      taskId: activeTaskId ?? undefined,
      updatedAt: persisted.updatedAt,
    });

    if (activeTaskId) {
      await this.updateTaskStatus(activeTaskId, "planning", ["queued", "planning", "ready"]);
    }
  }

  /**
   * Build plan steps from raw data
   */
  private buildPlanSteps(rawSteps: unknown): PlanStep[] {
    if (!Array.isArray(rawSteps)) {
      return [];
    }
    const steps: PlanStep[] = [];
    for (const step of rawSteps) {
      if (!isRecord(step) || typeof step.id !== "string" || typeof step.description !== "string") {
        continue;
      }
      steps.push({
        id: step.id,
        label: step.description,
        status: this.mapPlanStatus(step.status),
      });
    }
    return steps;
  }

  /**
   * Map plan status to standard status
   */
  private mapPlanStatus(status: unknown): "pending" | "in_progress" | "completed" | "failed" {
    switch (status) {
      case "executing":
        return "in_progress";
      case "complete":
        return "completed";
      case "failed":
        return "failed";
      default:
        return "pending";
    }
  }

  /**
   * Serialize writes to the task store to avoid filesystem races
   */
  private enqueueTaskWrite<T>(work: () => Promise<T>): Promise<T> {
    const next = this.taskWriteQueue.then(work, work);
    this.taskWriteQueue = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }
}

function readUsageMetadata(
  metadata: Record<string, unknown> | undefined
): TokenUsageStats | undefined {
  if (!metadata || !isRecord(metadata.usage)) {
    return undefined;
  }
  const usage = metadata.usage;
  if (
    typeof usage.inputTokens !== "number" ||
    typeof usage.outputTokens !== "number" ||
    typeof usage.totalTokens !== "number"
  ) {
    return undefined;
  }

  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
    ...(typeof usage.contextWindow === "number" ? { contextWindow: usage.contextWindow } : {}),
    ...(typeof usage.utilization === "number" ? { utilization: usage.utilization } : {}),
  };
}
