/**
 * Represents a single action/tool call within a step.
 */
export interface ActionItem {
  id: string;
  label: string;
  toolName?: string;
  args?: Record<string, unknown>;
  status: "pending" | "running" | "completed" | "failed";
  icon?: string;
  startTime?: number;
  durationMs?: number;
  result?: {
    success: boolean;
    content?: string;
    error?: string;
  };
}

/**
 * Represents a single step within an agent task.
 */
export interface TaskStep {
  id: string;
  label: string;
  status: "pending" | "running" | "completed" | "failed";
  duration?: string;
  startedAt?: string;
  completedAt?: string;
  /** Structured actions/tool calls performed in this step */
  actions?: ActionItem[];
}

/**
 * Represents a high-level phase in the task execution (Manus Spec 2.1.1).
 */
export interface TaskPhase {
  id: string;
  label: string;
  status: "pending" | "active" | "completed";
}

/**
 * Represents an artifact produced by an agent task.
 * Uses a flat structure with a type discriminator for flexibility.
 */
export interface ArtifactItem {
  id: string;
  type: "doc" | "image" | "link" | "code" | "diff" | "plan" | "report";
  title: string;
  url?: string;
  previewUrl?: string;
  content?: string;
  createdAt?: string;
  /** Optional reference to which step produced this artifact */
  stepId?: string;
}

/**
 * Represents an agent task with its steps and artifacts.
 * This is the primary data model for the TaskProgressWidget.
 */
export interface AgentTask {
  id: string;
  label: string;
  description?: string;
  status: "queued" | "running" | "completed" | "paused" | "failed" | "cancelled";
  progress: number; // 0-100
  steps: TaskStep[];
  artifacts: ArtifactItem[];
  modelId?: string;
  providerId?: string;
  fallbackNotice?: string;
  // Stats for display
  filesChanged?: number;
  linesAdded?: number;
  linesRemoved?: number;
  // Timestamps
  startedAt?: string;
  completedAt?: string;
  // Error info
  error?: string;

  // Integrated Confirmation
  approvalMetadata?: {
    approvalId: string;
    toolName: string;
    args: Record<string, unknown>;
    riskLevel?: "low" | "medium" | "high";
  };

  // Manus UI Spec (2.1.1)
  goal?: string; // Task Goal Header
  phases?: TaskPhase[]; // Progress Bar / Phase List
  currentPhaseId?: string;
  thoughts?: string[]; // Agent reasoning/updates
}

/**
 * Represents a rich message in the chat stream.
 */
export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  status: "pending" | "done" | "error" | "streaming" | "canceled";

  // -- Legacy / UI Fields --
  requestId?: string;
  modelId?: string;
  // biome-ignore lint/suspicious/noExplicitAny: legacy
  references?: any[]; // Keep flexible or import ReferenceAnchor
  confidence?: number;
  // biome-ignore lint/suspicious/noExplicitAny: legacy
  provenance?: any; // Import AIProvenance
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    contextWindow?: number;
    utilization?: number;
  };
  thinking?: Array<{
    content: string;
    type: "reasoning" | "planning" | "reflection";
    timestamp: number;
    complete: boolean;
  }>;

  /** Semantic type of the message for UI rendering */
  type?: "text" | "info" | "ask" | "result" | "task_stream";

  /** Model metadata for transparency */
  providerId?: string;
  fallbackNotice?: string;

  /** For 'ask' messages, what kind of action is requested (Spec 2.2.1) */
  suggested_action?:
    | "none"
    | "confirm_browser_operation"
    | "take_over_browser"
    | "upgrade_to_unlock_feature";

  /** Optional metadata for structured info (e.g. task phases) */
  // biome-ignore lint/suspicious/noExplicitAny: legacy
  metadata?: Record<string, any>;

  /** @deprecated - usage migrating to inline rendering based on type */
  // biome-ignore lint/suspicious/noExplicitAny: legacy
  executionSteps?: any[];
  /** @deprecated - usage migrating to inline rendering based on type */
  // biome-ignore lint/suspicious/noExplicitAny: legacy
  artifacts?: any[];
}

export type MessageStatus = "done" | "streaming" | "error" | "canceled" | "pending";

export interface MessageItemTranslations {
  you: string;
  assistant: string;
  actionEdit: string;
  actionBranch: string;
  actionQuote: string;
  actionCopy: string;
  actionRetry: string;
  requestIdLabel: string;
  statusLabels: Record<MessageStatus, string>;
  alertLabels: {
    titleError: string;
    titleCanceled: string;
    bodyError: string;
    bodyCanceled: string;
    retry: string;
  };
  referenceLabel: string;
  referenceResolved: string;
  referenceRemapped: string;
  referenceUnresolved: string;
  referenceFind: string;
  referenceUnavailable: string;
}

/**
 * @deprecated Use AgentTask instead. Kept for backwards compatibility.
 */
export interface ActiveTask {
  id: string;
  label: string;
  progress: number;
  status: "running" | "completed" | "paused";
  artifacts?: {
    docs?: ArtifactItem[];
    images?: ArtifactItem[];
    links?: ArtifactItem[];
  };
}

/**
 * Helper to convert legacy ActiveTask to AgentTask
 */
export function toAgentTask(task: ActiveTask): AgentTask {
  const artifacts: ArtifactItem[] = [
    ...(task.artifacts?.docs || []),
    ...(task.artifacts?.images || []),
    ...(task.artifacts?.links || []),
  ];

  return {
    id: task.id,
    label: task.label,
    progress: task.progress,
    status: task.status === "paused" ? "paused" : task.status,
    steps: [],
    artifacts,
  };
}

/**
 * Helper to group artifacts by type (for rendering convenience)
 */
export function groupArtifactsByType(artifacts: ArtifactItem[]): {
  docs: ArtifactItem[];
  images: ArtifactItem[];
  links: ArtifactItem[];
  other: ArtifactItem[];
} {
  return {
    docs: artifacts.filter((a) => a.type === "doc" || a.type === "plan" || a.type === "report"),
    images: artifacts.filter((a) => a.type === "image"),
    links: artifacts.filter((a) => a.type === "link"),
    other: artifacts.filter((a) => a.type === "code" || a.type === "diff"),
  };
}
