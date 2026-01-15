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
  // Stats for display
  filesChanged?: number;
  linesAdded?: number;
  linesRemoved?: number;
  // Timestamps
  startedAt?: string;
  completedAt?: string;
  // Error info
  error?: string;
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
