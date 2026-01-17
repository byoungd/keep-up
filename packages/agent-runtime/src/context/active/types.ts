/**
 * Active Context Types
 *
 * Defines the schema for workflow state extracted from task.md files.
 * Supports auto-resume functionality for interrupted agent sessions.
 */

/**
 * Task item status in task.md
 * - `pending`: `[ ]` - Not started
 * - `in_progress`: `[/]` - Currently in progress
 * - `completed`: `[x]` - Done
 */
export type TaskCheckboxStatus = "pending" | "in_progress" | "completed";

/**
 * Individual task item parsed from task.md
 */
export interface TaskItem {
  /** Full text of the task item */
  text: string;
  /** Current status */
  status: TaskCheckboxStatus;
  /** Indentation level (0 = top-level) */
  level: number;
  /** Line number in the source file (1-indexed) */
  line: number;
  /** Child tasks (if any) */
  children?: TaskItem[];
}

/**
 * Task section (grouped by header)
 */
export interface TaskSection {
  /** Section title (from heading) */
  title: string;
  /** Heading level (1-6) */
  headingLevel: number;
  /** Line number of the heading (1-indexed) */
  line: number;
  /** Tasks in this section */
  tasks: TaskItem[];
}

/**
 * Workflow state extracted from task.md
 */
export interface WorkflowState {
  /** All sections in the task file */
  sections: TaskSection[];
  /** Tasks currently in progress (`[/]`) */
  inProgressTasks: TaskItem[];
  /** Most recently started task (for resume prompt) */
  currentTask: TaskItem | null;
  /** Overall progress (completed / total) */
  progress: {
    completed: number;
    inProgress: number;
    pending: number;
    total: number;
    percentage: number;
  };
  /** YAML frontmatter metadata (if present) */
  metadata: Record<string, unknown>;
  /** Source file path */
  sourcePath: string;
  /** Last modified timestamp */
  lastModified: Date;
}

/**
 * Memory checkpoint for cross-session continuity
 */
export interface MemoryCheckpoint {
  /** Unique checkpoint ID */
  id: string;
  /** Session ID this checkpoint belongs to */
  sessionId: string;
  /** Current workflow state */
  workflowState: WorkflowState;
  /** Agent's "thought process" summary */
  thoughtSummary: string;
  /** Key context items to restore */
  contextItems: string[];
  /** Token budget for this checkpoint */
  tokenCount: number;
  /** Timestamp */
  createdAt: Date;
}

/**
 * Resume prompt configuration
 */
export interface ResumePromptConfig {
  /** Whether to include thought summary */
  includeThoughts: boolean;
  /** Whether to include context items */
  includeContext: boolean;
  /** Maximum tokens for the resume prompt */
  maxTokens: number;
}
