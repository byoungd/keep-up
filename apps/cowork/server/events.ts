/**
 * Type-safe event constants for the Cowork event system.
 * Eliminates magic strings and provides compile-time safety.
 */

import type { ToolActivity } from "@ku0/agent-runtime";

export const COWORK_EVENTS = {
  // Session lifecycle
  SESSION_CREATED: "session.created",
  SESSION_UPDATED: "session.updated",
  SESSION_ENDED: "session.ended",
  SESSION_DELETED: "session.deleted",
  SESSION_MODE_CHANGED: "session.mode.changed",
  SESSION_USAGE_UPDATED: "session.usage.updated",

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
    agentMode?: "plan" | "build";
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
    mode: "plan" | "build";
    previousMode: "plan" | "build";
  };
  [COWORK_EVENTS.SESSION_USAGE_UPDATED]: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
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
