import type {
  ClarificationRequest,
  CoworkRiskTag,
  CoworkTaskStatus,
  CoworkWorkspaceEvent,
  CoworkWorkspaceSession,
  TokenUsageStats,
  ToolActivity,
} from "@ku0/agent-runtime";
import { z } from "zod";

export enum TaskStatus {
  QUEUED = "queued",
  PLANNING = "planning",
  READY = "ready",
  RUNNING = "running",
  AWAITING_APPROVAL = "awaiting_approval",
  COMPLETED = "completed",
  FAILED = "failed",
  CANCELLED = "cancelled",
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

const PreflightCheckResultSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(["lint", "typecheck", "test"]),
  command: z.string(),
  args: z.array(z.string()),
  status: z.enum(["pass", "fail", "skipped"]),
  durationMs: z.number(),
  exitCode: z.number().optional(),
  output: z.string(),
});

const PreflightReportSchema = z.object({
  reportId: z.string(),
  sessionId: z.string(),
  checks: z.array(PreflightCheckResultSchema),
  riskSummary: z.string(),
  createdAt: z.number(),
});

const PlanCardStepSchema = z.object({
  title: z.string(),
  status: z.enum(["pending", "running", "blocked", "completed", "failed"]).optional(),
});

const PlanCardSchema = z.object({
  type: z.literal("PlanCard"),
  goal: z.string(),
  summary: z.string().optional(),
  steps: z.array(PlanCardStepSchema).min(1),
  files: z.array(z.string()).optional(),
});

const DiffCardFileSchema = z.object({
  path: z.string(),
  diff: z.string(),
});

const DiffCardSchema = z.object({
  type: z.literal("DiffCard"),
  summary: z.string().optional(),
  files: z.array(DiffCardFileSchema).min(1),
});

const ReportCardSectionSchema = z.object({
  heading: z.string(),
  content: z.string(),
});

const ReportCardSchema = z.object({
  type: z.literal("ReportCard"),
  summary: z.string(),
  sections: z.array(ReportCardSectionSchema).optional(),
});

const ChecklistItemSchema = z.object({
  label: z.string(),
  checked: z.boolean(),
});

const ChecklistCardSchema = z.object({
  type: z.literal("ChecklistCard"),
  title: z.string().optional(),
  items: z.array(ChecklistItemSchema).min(1),
});

const TestReportSchema = z.object({
  type: z.literal("TestReport"),
  command: z.string(),
  status: z.enum(["passed", "failed", "skipped"]),
  durationMs: z.number(),
  summary: z.string().optional(),
});

const ReviewReportSchema = z.object({
  type: z.literal("ReviewReport"),
  summary: z.string(),
  risks: z.array(z.string()),
  recommendations: z.array(z.string()).optional(),
});

const ImageArtifactSchema = z.object({
  type: z.literal("ImageArtifact"),
  uri: z.string(),
  mimeType: z.string(),
  byteSize: z.number(),
  contentHash: z.string(),
  sourceTool: z.string().optional(),
  toolOutputSpoolId: z.string().optional(),
});

const LayoutBoundsSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

const ComponentRefSchema = z.object({
  filePath: z.string(),
  symbol: z.string().optional(),
  line: z.number(),
  column: z.number(),
});

const LayoutNodeSchema = z.object({
  id: z.string(),
  type: z.enum(["text", "image", "control", "container"]),
  bounds: LayoutBoundsSchema,
  text: z.string().optional(),
  role: z.string().optional(),
  componentRef: ComponentRefSchema.optional(),
  confidence: z.number(),
});

const LayoutEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  type: z.enum(["contains", "adjacent"]),
});

const LayoutGraphSchema = z.object({
  type: z.literal("LayoutGraph"),
  nodes: z.array(LayoutNodeSchema),
  edges: z.array(LayoutEdgeSchema),
});

const VisualDiffRegionSchema = z.object({
  id: z.string(),
  bounds: LayoutBoundsSchema,
  score: z.number(),
  changeType: z.enum(["added", "removed", "modified"]),
});

const VisualDiffReportSchema = z.object({
  type: z.literal("VisualDiffReport"),
  regions: z.array(VisualDiffRegionSchema),
  summary: z.object({
    totalRegions: z.number(),
    changedRegions: z.number(),
    maxScore: z.number(),
  }),
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
  z.object({
    type: z.literal("preflight"),
    report: PreflightReportSchema,
    selectionNotes: z.array(z.string()),
    changedFiles: z.array(z.string()),
  }),
  PlanCardSchema,
  DiffCardSchema,
  ReportCardSchema,
  ChecklistCardSchema,
  TestReportSchema,
  ReviewReportSchema,
  ImageArtifactSchema,
  LayoutGraphSchema,
  VisualDiffReportSchema,
]);

export type ArtifactPayload = z.infer<typeof ArtifactPayloadSchema>;

/**
 * Metadata fields for enriched artifacts.
 */
export type ArtifactMetadata = {
  updatedAt?: number;
  taskId?: string;
  version?: number;
  applicationStatus?: "pending" | "applied" | "reverted";
  appliedAt?: number;
};

/**
 * Enriched artifact combining payload with metadata.
 * The intersection is straightforward - assignments need type assertions
 * after Zod validation since TS struggles with complex union spreading.
 */
export type EnrichedArtifact = ArtifactPayload & ArtifactMetadata;

// --- Node Types ---

export type TaskNodeType =
  | "thinking"
  | "tool_call"
  | "tool_output"
  | "error"
  | "plan_update"
  | "task_status"
  | "turn_marker"
  | "policy_decision"
  | "checkpoint";

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
  callId?: string;
  toolName: string;
  args: Record<string, unknown>;
  requiresApproval?: boolean;
  approvalId?: string;
  riskLevel?: RiskLevel;
  activity?: ToolActivity;
  activityLabel?: string;
}

export interface ToolOutputNode extends BaseNode {
  type: "tool_output";
  callId: string; // Tool call ID or resolved ToolCallNode.id
  toolName?: string;
  output: unknown;
  isError?: boolean;
  errorCode?: string;
  durationMs?: number;
  attempts?: number;
  cached?: boolean;
  activity?: ToolActivity;
  activityLabel?: string;
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
  metadata?: Record<string, unknown>;
}

export interface TurnMarkerNode extends BaseNode {
  type: "turn_marker";
  turn: number;
  phase: "start" | "end";
}

export interface PolicyDecisionNode extends BaseNode {
  type: "policy_decision";
  toolName?: string;
  decision?: "allow" | "allow_with_confirm" | "deny";
  policyRuleId?: string;
  policyAction?: string;
  riskTags?: CoworkRiskTag[];
  riskScore?: number;
  reason?: string;
}

export interface CheckpointNode extends BaseNode {
  type: "checkpoint";
  checkpointId: string;
  status?: string;
  currentStep: number;
  action: "created" | "restored";
}

export type TaskNode =
  | ThinkingNode
  | ToolCallNode
  | ToolOutputNode
  | ErrorNode
  | PlanUpdateNode
  | TaskStatusNode
  | TurnMarkerNode
  | PolicyDecisionNode
  | CheckpointNode;

export interface TaskGraph {
  sessionId: string;
  status: TaskStatus;
  nodes: TaskNode[];
  artifacts: Record<string, EnrichedArtifact>; // Properly typed artifact map
  clarifications: ClarificationRequest[];
  pendingApprovalId?: string;
  savedAt?: number;
  agentMode?: "plan" | "build" | "review";
  usage?: TokenUsageStats;
  messageUsage?: Record<string, MessageUsage>;
  workspaceSessions?: Record<string, CoworkWorkspaceSession>;
  workspaceEvents?: Record<string, CoworkWorkspaceEvent[]>;
}

export type MessageUsage = TokenUsageStats & {
  costUsd?: number | null;
  modelId?: string;
  providerId?: string;
};
