/**
 * Event stream publisher service
 * Handles publishing events to session event hub
 */

import type {
  ClarificationRequest,
  ClarificationResponse,
  CoworkWorkspaceEvent,
  CoworkWorkspaceSession,
  TokenUsageStats,
} from "@ku0/agent-runtime";
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
    metadata?: Record<string, unknown>;
  }) {
    this.events.publish(data.sessionId, COWORK_EVENTS.TASK_CREATED, {
      taskId: data.taskId,
      status: data.status,
      title: data.title,
      prompt: data.prompt,
      modelId: data.modelId,
      providerId: data.providerId,
      fallbackNotice: data.fallbackNotice,
      metadata: data.metadata,
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
    metadata?: Record<string, unknown>;
  }) {
    this.events.publish(data.sessionId, COWORK_EVENTS.TASK_UPDATED, {
      taskId: data.taskId,
      status: data.status,
      title: data.title,
      prompt: data.prompt,
      modelId: data.modelId,
      providerId: data.providerId,
      fallbackNotice: data.fallbackNotice,
      metadata: data.metadata,
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
    callId?: string;
    tool: string;
    args: Record<string, unknown>;
    activity: string;
    activityLabel: string;
    taskId?: string;
  }) {
    this.events.publish(data.sessionId, COWORK_EVENTS.AGENT_TOOL_CALL, {
      callId: data.callId,
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
    cached?: boolean;
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
      cached: data.cached,
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
    this.events.publish(data.sessionId, COWORK_EVENTS.TASK_PLAN, {
      artifactId: data.artifactId,
      plan: data.plan,
      taskId: data.taskId,
    });
  }

  publishAgentTurnStart(data: { sessionId: string; turn: number; taskId?: string }) {
    this.events.publish(data.sessionId, COWORK_EVENTS.AGENT_TURN_START, {
      turn: data.turn,
      taskId: data.taskId,
    });
  }

  publishAgentTurnEnd(data: { sessionId: string; turn: number; taskId?: string }) {
    this.events.publish(data.sessionId, COWORK_EVENTS.AGENT_TURN_END, {
      turn: data.turn,
      taskId: data.taskId,
    });
  }

  publishAgentArtifact(data: {
    sessionId: string;
    id: string;
    artifact: { type: string; content?: string; [key: string]: unknown };
    taskId?: string;
    updatedAt: number;
  }) {
    this.events.publish(data.sessionId, COWORK_EVENTS.AGENT_ARTIFACT, {
      id: data.id,
      artifact: data.artifact,
      taskId: data.taskId,
      updatedAt: data.updatedAt,
    });
  }

  publishPolicyDecision(data: {
    sessionId: string;
    toolName?: string;
    decision?: "allow" | "allow_with_confirm" | "deny";
    policyRuleId?: string;
    policyAction?: string;
    riskTags?: string[];
    riskScore?: number;
    reason?: string;
    taskId?: string;
  }) {
    this.events.publish(data.sessionId, COWORK_EVENTS.POLICY_DECISION, {
      toolName: data.toolName,
      decision: data.decision,
      policyRuleId: data.policyRuleId,
      policyAction: data.policyAction,
      riskTags: data.riskTags ?? [],
      riskScore: data.riskScore,
      reason: data.reason,
      taskId: data.taskId,
    });
  }

  publishCheckpointCreated(data: {
    sessionId: string;
    checkpointId: string;
    taskId?: string;
    status: string;
    currentStep: number;
    createdAt: number;
  }) {
    this.events.publish(data.sessionId, COWORK_EVENTS.CHECKPOINT_CREATED, {
      checkpointId: data.checkpointId,
      taskId: data.taskId,
      status: data.status,
      currentStep: data.currentStep,
      createdAt: data.createdAt,
    });
  }

  publishCheckpointRestored(data: {
    sessionId: string;
    checkpointId: string;
    taskId?: string;
    restoredAt: number;
    currentStep: number;
  }) {
    this.events.publish(data.sessionId, COWORK_EVENTS.CHECKPOINT_RESTORED, {
      checkpointId: data.checkpointId,
      taskId: data.taskId,
      restoredAt: data.restoredAt,
      currentStep: data.currentStep,
    });
  }

  publishClarificationRequested(data: {
    sessionId: string;
    request: ClarificationRequest;
    taskId?: string;
  }) {
    this.events.publish(data.sessionId, COWORK_EVENTS.CLARIFICATION_REQUESTED, {
      request: data.request,
      taskId: data.taskId,
    });
  }

  publishClarificationAnswered(data: {
    sessionId: string;
    response: ClarificationResponse;
    taskId?: string;
  }) {
    this.events.publish(data.sessionId, COWORK_EVENTS.CLARIFICATION_ANSWERED, {
      response: data.response,
      taskId: data.taskId,
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

  publishSessionUsageUpdated(data: { sessionId: string; usage: TokenUsageStats; cost?: number }) {
    this.events.publish(data.sessionId, COWORK_EVENTS.SESSION_USAGE_UPDATED, {
      inputTokens: data.usage.inputTokens,
      outputTokens: data.usage.outputTokens,
      totalTokens: data.usage.totalTokens,
      totalCostUsd: data.cost,
    });
  }

  publishTokenUsage(data: {
    sessionId: string;
    messageId?: string;
    taskId?: string;
    usage: TokenUsageStats;
    costUsd: number | null;
    modelId?: string;
    providerId?: string;
  }) {
    this.events.publish(data.sessionId, COWORK_EVENTS.TOKEN_USAGE, {
      messageId: data.messageId,
      taskId: data.taskId,
      inputTokens: data.usage.inputTokens,
      outputTokens: data.usage.outputTokens,
      totalTokens: data.usage.totalTokens,
      costUsd: data.costUsd,
      modelId: data.modelId,
      providerId: data.providerId,
      contextWindow: data.usage.contextWindow,
      utilization: data.usage.utilization,
    });
  }

  publishWorkspaceSessionCreated(data: {
    sessionId: string;
    workspaceSession: CoworkWorkspaceSession;
  }) {
    this.events.publish(data.sessionId, COWORK_EVENTS.WORKSPACE_SESSION_CREATED, {
      sessionId: data.sessionId,
      workspaceSession: data.workspaceSession,
    });
  }

  publishWorkspaceSessionUpdated(data: {
    sessionId: string;
    workspaceSession: CoworkWorkspaceSession;
  }) {
    this.events.publish(data.sessionId, COWORK_EVENTS.WORKSPACE_SESSION_UPDATED, {
      sessionId: data.sessionId,
      workspaceSession: data.workspaceSession,
    });
  }

  publishWorkspaceSessionEnded(data: {
    sessionId: string;
    workspaceSessionId: string;
    endedAt: number;
  }) {
    this.events.publish(data.sessionId, COWORK_EVENTS.WORKSPACE_SESSION_ENDED, {
      sessionId: data.sessionId,
      workspaceSessionId: data.workspaceSessionId,
      endedAt: data.endedAt,
    });
  }

  publishWorkspaceSessionEvent(data: {
    sessionId: string;
    workspaceSessionId: string;
    event: CoworkWorkspaceEvent;
  }) {
    this.events.publish(data.sessionId, COWORK_EVENTS.WORKSPACE_SESSION_EVENT, {
      sessionId: data.sessionId,
      workspaceSessionId: data.workspaceSessionId,
      event: data.event,
    });
  }
}
