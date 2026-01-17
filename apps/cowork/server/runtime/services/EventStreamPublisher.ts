/**
 * Event stream publisher service
 * Handles publishing events to session event hub
 */

import type { TokenUsageStats } from "@ku0/agent-runtime";
import { COWORK_EVENTS, type SessionEventHub } from "../../streaming/eventHub";

export class EventStreamPublisher {
  constructor(private readonly events: SessionEventHub) {}

  publishTaskCreated(data: {
    sessionId: string;
    taskId: string;
    status: string;
    title: string;
    prompt: string;
    modelId?: string;
    providerId?: string;
    fallbackNotice?: string;
  }) {
    this.events.publish(data.sessionId, COWORK_EVENTS.TASK_CREATED, {
      taskId: data.taskId,
      status: data.status,
      title: data.title,
      prompt: data.prompt,
      modelId: data.modelId,
      providerId: data.providerId,
      fallbackNotice: data.fallbackNotice,
    });
  }

  publishTaskUpdated(data: {
    sessionId: string;
    taskId: string;
    status: string;
    title: string;
    prompt: string;
    modelId?: string;
    providerId?: string;
    fallbackNotice?: string;
  }) {
    this.events.publish(data.sessionId, COWORK_EVENTS.TASK_UPDATED, {
      taskId: data.taskId,
      status: data.status,
      title: data.title,
      prompt: data.prompt,
      modelId: data.modelId,
      providerId: data.providerId,
      fallbackNotice: data.fallbackNotice,
    });
  }

  publishAgentThink(sessionId: string, content: string, taskId?: string) {
    this.events.publish(sessionId, COWORK_EVENTS.AGENT_THINK, {
      content,
      taskId,
    });
  }

  publishAgentToolCall(data: {
    sessionId: string;
    tool: string;
    args: Record<string, unknown>;
    activity: string;
    activityLabel: string;
    taskId?: string;
  }) {
    this.events.publish(data.sessionId, COWORK_EVENTS.AGENT_TOOL_CALL, {
      tool: data.tool,
      args: data.args,
      activity: data.activity,
      activityLabel: data.activityLabel,
      taskId: data.taskId,
    });
  }

  publishAgentToolResult(data: {
    sessionId: string;
    callId: string;
    toolName: string;
    result: unknown;
    isError?: boolean;
    errorCode?: string;
    durationMs?: number;
    attempts?: number;
    activity: string;
    activityLabel: string;
    taskId?: string;
  }) {
    this.events.publish(data.sessionId, COWORK_EVENTS.AGENT_TOOL_RESULT, {
      callId: data.callId,
      toolName: data.toolName,
      result: data.result,
      isError: data.isError,
      errorCode: data.errorCode,
      durationMs: data.durationMs,
      attempts: data.attempts,
      activity: data.activity,
      activityLabel: data.activityLabel,
      taskId: data.taskId,
    });
  }

  publishAgentPlan(data: {
    sessionId: string;
    artifactId: string;
    plan: Array<{ id: string; label: string; status: string }>;
    taskId?: string;
  }) {
    this.events.publish(data.sessionId, COWORK_EVENTS.AGENT_PLAN, {
      artifactId: data.artifactId,
      plan: data.plan,
      taskId: data.taskId,
    });
  }

  publishAgentArtifact(data: {
    sessionId: string;
    id: string;
    artifact: { type: string; content?: string; [key: string]: unknown };
    taskId: string;
    updatedAt: number;
  }) {
    this.events.publish(data.sessionId, COWORK_EVENTS.AGENT_ARTIFACT, {
      id: data.id,
      artifact: data.artifact,
      taskId: data.taskId,
      updatedAt: data.updatedAt,
    });
  }

  publishApprovalRequired(data: {
    sessionId: string;
    approvalId: string;
    action: string;
    riskTags: string[];
    reason?: string;
    taskId?: string;
  }) {
    this.events.publish(data.sessionId, COWORK_EVENTS.APPROVAL_REQUIRED, {
      approvalId: data.approvalId,
      action: data.action,
      riskTags: data.riskTags,
      reason: data.reason,
      taskId: data.taskId,
    });
  }

  publishApprovalResolved(data: {
    sessionId: string;
    approvalId: string;
    status: string;
    taskId?: string;
  }) {
    this.events.publish(data.sessionId, COWORK_EVENTS.APPROVAL_RESOLVED, {
      approvalId: data.approvalId,
      status: data.status,
      taskId: data.taskId,
    });
  }

  publishSessionUsageUpdated(data: { sessionId: string; usage: TokenUsageStats }) {
    this.events.publish(data.sessionId, COWORK_EVENTS.SESSION_USAGE_UPDATED, {
      inputTokens: data.usage.inputTokens,
      outputTokens: data.usage.outputTokens,
      totalTokens: data.usage.totalTokens,
    });
  }
}
