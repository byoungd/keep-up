/**
 * Type-safe event constants for the Cowork event system.
 * Eliminates magic strings and provides compile-time safety.
 */

import type { ClarificationRequest, ClarificationResponse, ToolActivity } from "@ku0/agent-runtime";

export const COWORK_EVENTS = {
  // Session lifecycle
  SESSION_CREATED: "session.created",
  SESSION_UPDATED: "session.updated",
  SESSION_ENDED: "session.ended",
  SESSION_DELETED: "session.deleted",
  SESSION_MODE_CHANGED: "session.mode.changed",
  SESSION_USAGE_UPDATED: "session.usage.updated",
  TOKEN_USAGE: "token.usage",

  // Task lifecycle
  TASK_CREATED: "task.created",
  TASK_UPDATED: "task.updated",
  TASK_COMPLETED: "task.completed",
  TASK_FAILED: "task.failed",

  // Approval workflow
  APPROVAL_REQUIRED: "approval.required",
  APPROVAL_RESOLVED: "approval.resolved",

  // Agent events
  AGENT_THINK: "agent.think",
  AGENT_TOOL_CALL: "agent.tool.call",
  AGENT_TOOL_RESULT: "agent.tool.result",
  AGENT_PLAN: "agent.plan",
  AGENT_ARTIFACT: "agent.artifact",
  AGENT_TURN_START: "agent.turn.start",
  AGENT_TURN_END: "agent.turn.end",
  POLICY_DECISION: "policy.decision",
  CHECKPOINT_CREATED: "checkpoint.created",
  CHECKPOINT_RESTORED: "checkpoint.restored",
  CLARIFICATION_REQUESTED: "clarification.requested",
  CLARIFICATION_ANSWERED: "clarification.answered",

  // System events
  SYSTEM_HEARTBEAT: "system.heartbeat",
} as const;

export type CoworkEventType = (typeof COWORK_EVENTS)[keyof typeof COWORK_EVENTS];

/**
 * Type-safe event payload definitions
 */
export interface CoworkEventPayloads {
  [COWORK_EVENTS.SESSION_CREATED]: {
    sessionId: string;
    createdAt: number;
  };
  [COWORK_EVENTS.SESSION_UPDATED]: {
    sessionId: string;
    agentMode?: "plan" | "build" | "review";
    title?: string;
  };
  [COWORK_EVENTS.SESSION_ENDED]: {
    sessionId: string;
    endedAt: number;
  };
  [COWORK_EVENTS.SESSION_DELETED]: {
    sessionId: string;
  };
  [COWORK_EVENTS.SESSION_MODE_CHANGED]: {
    sessionId: string;
    mode: "plan" | "build" | "review";
    previousMode: "plan" | "build" | "review";
  };
  [COWORK_EVENTS.SESSION_USAGE_UPDATED]: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    totalCostUsd?: number;
  };

  [COWORK_EVENTS.TOKEN_USAGE]: {
    messageId?: string;
    taskId?: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    costUsd: number | null;
    modelId?: string;
    providerId?: string;
    contextWindow?: number;
    utilization?: number;
  };
  [COWORK_EVENTS.TASK_CREATED]: {
    taskId: string;
    status: string;
    title: string;
    prompt?: string;
    modelId?: string;
    providerId?: string;
    fallbackNotice?: string;
    metadata?: Record<string, unknown>;
  };
  [COWORK_EVENTS.TASK_UPDATED]: {
    taskId: string;
    status: string;
    title: string;
    prompt?: string;
    modelId?: string;
    providerId?: string;
    fallbackNotice?: string;
    metadata?: Record<string, unknown>;
  };
  [COWORK_EVENTS.TASK_COMPLETED]: {
    taskId: string;
    completedAt: number;
  };
  [COWORK_EVENTS.TASK_FAILED]: {
    taskId: string;
    error: string;
  };
  [COWORK_EVENTS.APPROVAL_REQUIRED]: {
    approvalId: string;
    action: string;
    riskTags: string[];
    reason?: string;
    taskId?: string;
  };
  [COWORK_EVENTS.APPROVAL_RESOLVED]: {
    approvalId: string;
    status: "approved" | "rejected";
    taskId?: string;
  };
  [COWORK_EVENTS.AGENT_THINK]: {
    content: string;
    taskId?: string;
  };
  [COWORK_EVENTS.AGENT_TOOL_CALL]: {
    tool: string;
    args: Record<string, unknown>;
    requiresApproval?: boolean;
    approvalId?: string;
    riskLevel?: string;
    activity?: ToolActivity;
    activityLabel?: string;
    taskId?: string;
  };
  [COWORK_EVENTS.AGENT_TOOL_RESULT]: {
    callId: string;
    toolName?: string;
    result: unknown;
    isError?: boolean;
    errorCode?: string;
    durationMs?: number;
    attempts?: number;
    activity?: ToolActivity;
    activityLabel?: string;
    taskId?: string;
  };
  [COWORK_EVENTS.AGENT_PLAN]: {
    artifactId: string;
    plan: unknown;
    taskId?: string;
  };
  [COWORK_EVENTS.AGENT_ARTIFACT]: {
    id: string;
    artifact: unknown;
    taskId?: string;
    updatedAt: number;
  };
  [COWORK_EVENTS.AGENT_TURN_START]: {
    turn: number;
    taskId?: string;
  };
  [COWORK_EVENTS.AGENT_TURN_END]: {
    turn: number;
    taskId?: string;
  };
  [COWORK_EVENTS.POLICY_DECISION]: {
    toolName?: string;
    decision?: "allow" | "allow_with_confirm" | "deny";
    policyRuleId?: string;
    policyAction?: string;
    riskTags?: string[];
    riskScore?: number;
    reason?: string;
    taskId?: string;
  };
  [COWORK_EVENTS.CHECKPOINT_CREATED]: {
    checkpointId: string;
    taskId?: string;
    status: string;
    currentStep: number;
    createdAt: number;
  };
  [COWORK_EVENTS.CHECKPOINT_RESTORED]: {
    checkpointId: string;
    taskId?: string;
    restoredAt: number;
    currentStep: number;
  };
  [COWORK_EVENTS.CLARIFICATION_REQUESTED]: {
    request: ClarificationRequest;
    taskId?: string;
  };
  [COWORK_EVENTS.CLARIFICATION_ANSWERED]: {
    response: ClarificationResponse;
    taskId?: string;
  };
  [COWORK_EVENTS.SYSTEM_HEARTBEAT]: {
    timestamp: number;
    sessionId: string;
  };
}

/**
 * Helper to create type-safe events
 */
export function createEvent<T extends CoworkEventType>(
  type: T,
  data: CoworkEventPayloads[T]
): { type: T; data: CoworkEventPayloads[T] } {
  return { type, data };
}
