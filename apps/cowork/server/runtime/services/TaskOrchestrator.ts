/**
 * Task orchestrator service
 * Handles task lifecycle, event processing, and orchestration coordination
 */

import type { CoworkTaskStatus, TokenUsageStats } from "@ku0/agent-runtime";
import {
  formatToolActivityLabel as formatActivity,
  resolveToolActivity as resolveActivity,
} from "@ku0/agent-runtime";
import { isRecord } from "@ku0/shared";
import type { TaskStoreLike } from "../../storage/contracts";
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

export class TaskOrchestrator {
  constructor(
    private readonly taskStore: TaskStoreLike,
    private readonly artifactProcessor: ArtifactProcessor,
    private readonly eventPublisher: EventStreamPublisher,
    private readonly sessionManager: SessionLifecycleManager,
    readonly _approvalCoordinator: ApprovalCoordinator
  ) {}

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

    const updated = await this.taskStore.update(taskId, (task) => {
      if (allowedStatuses && !allowedStatuses.includes(task.status)) {
        return task;
      }
      if (task.status === status) {
        return task;
      }
      didChange = true;
      return { ...task, status, updatedAt: now };
    });

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
    event: { type: string; data: unknown }
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
        await this.handleUsageUpdate(sessionId, event.data as { totalUsage: TokenUsageStats });
        break;
      case "plan:created":
        await this.handlePlanCreatedEvent(sessionId, activeTaskId, event.data);
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
    data: { totalUsage: TokenUsageStats }
  ): Promise<void> {
    await this.sessionManager.updateSession(sessionId, (s) => ({
      ...s,
      usage: data.totalUsage,
    }));

    this.eventPublisher.publishSessionUsageUpdated({
      sessionId,
      usage: data.totalUsage,
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

    this.eventPublisher.publishAgentPlan({
      sessionId,
      artifactId: activeTaskId ? `plan-${activeTaskId}` : "plan",
      plan: steps,
      taskId: activeTaskId ?? undefined,
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
}
