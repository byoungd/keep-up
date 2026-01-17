import type { CoworkTaskStatus } from "@ku0/agent-runtime";
import { z } from "zod";

export enum TaskStatus {
  PLANNING = "planning",
  RUNNING = "running",
  AWAITING_APPROVAL = "awaiting_approval",
  COMPLETED = "completed",
  FAILED = "failed",
}

export enum RiskLevel {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
}

// --- Schemas for SSE payloads ---

export const PlanStepSchema = z.object({
  id: z.string(),
  label: z.string(),
  status: z.enum(["pending", "in_progress", "completed", "failed"]),
});

export const ArtifactPayloadSchema = z.union([
  z.object({
    type: z.literal("diff"),
    file: z.string(),
    diff: z.string(), // git diff format
    language: z.string().optional(),
  }),
  z.object({
    type: z.literal("plan"),
    steps: z.array(PlanStepSchema),
  }),
  z.object({
    type: z.literal("markdown"),
    content: z.string(),
  }),
]);

export type ArtifactPayload = z.infer<typeof ArtifactPayloadSchema>;

// --- Node Types ---

export type TaskNodeType =
  | "thinking"
  | "tool_call"
  | "tool_output"
  | "error"
  | "plan_update"
  | "task_status";

export interface BaseNode {
  id: string;
  type: TaskNodeType;
  timestamp: string;
  taskId?: string;
}

export interface ThinkingNode extends BaseNode {
  type: "thinking";
  content: string; // The thought trace
  isCollapsed?: boolean; // UI state
}

export interface ToolCallNode extends BaseNode {
  type: "tool_call";
  toolName: string;
  args: Record<string, unknown>;
  requiresApproval?: boolean;
  approvalId?: string;
  riskLevel?: RiskLevel;
}

export interface ToolOutputNode extends BaseNode {
  type: "tool_output";
  callId: string; // References ToolCallNode.id
  output: unknown;
  isError?: boolean;
}

export interface ErrorNode extends BaseNode {
  type: "error";
  message: string;
  code?: string;
}

export interface PlanUpdateNode extends BaseNode {
  type: "plan_update";
  plan: z.infer<typeof ArtifactPayloadSchema>;
}

export interface TaskStatusNode extends BaseNode {
  type: "task_status";
  taskId: string;
  title: string;
  status: CoworkTaskStatus;
  mappedStatus: TaskStatus | null;
  prompt?: string;
  modelId?: string;
  providerId?: string;
  fallbackNotice?: string;
}

export type TaskNode =
  | ThinkingNode
  | ToolCallNode
  | ToolOutputNode
  | ErrorNode
  | PlanUpdateNode
  | TaskStatusNode;

export interface TaskGraph {
  sessionId: string;
  status: TaskStatus;
  nodes: TaskNode[];
  artifacts: Record<string, ArtifactPayload & { updatedAt?: number; taskId?: string }>; // map of artifactId -> payload with versioning and task association
  pendingApprovalId?: string;
  savedAt?: number;
}
