/**
 * Type-safe event constants for the Cowork event system.
 * Eliminates magic strings and provides compile-time safety.
 */

export const COWORK_EVENTS = {
  // Session lifecycle
  SESSION_CREATED: "session.created",
  SESSION_ENDED: "session.ended",

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
  [COWORK_EVENTS.SESSION_ENDED]: {
    sessionId: string;
    endedAt: number;
  };
  [COWORK_EVENTS.TASK_CREATED]: {
    taskId: string;
    status: string;
    title: string;
  };
  [COWORK_EVENTS.TASK_UPDATED]: {
    taskId: string;
    status: string;
    title: string;
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
  };
  [COWORK_EVENTS.APPROVAL_RESOLVED]: {
    approvalId: string;
    status: "approved" | "rejected";
  };
  [COWORK_EVENTS.AGENT_THINK]: {
    content: string;
  };
  [COWORK_EVENTS.AGENT_TOOL_CALL]: {
    tool: string;
    args: Record<string, unknown>;
    requiresApproval?: boolean;
    approvalId?: string;
    riskLevel?: string;
  };
  [COWORK_EVENTS.AGENT_TOOL_RESULT]: {
    callId: string;
    result: unknown;
    isError?: boolean;
  };
  [COWORK_EVENTS.AGENT_PLAN]: {
    artifactId: string;
    plan: unknown;
  };
  [COWORK_EVENTS.AGENT_ARTIFACT]: {
    id: string;
    artifact: unknown;
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
