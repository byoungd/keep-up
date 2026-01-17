/**
 * Ghost Agent Types
 *
 * Proactive background agent that monitors file changes and
 * triggers background checks with toast suggestions.
 */

/**
 * File change event types
 */
export type FileChangeType = "create" | "modify" | "delete" | "rename";

/**
 * File change event
 */
export interface FileChangeEvent {
  /** File path (absolute) */
  path: string;
  /** Type of change */
  type: FileChangeType;
  /** Timestamp of change */
  timestamp: Date;
  /** Previous path (for rename events) */
  previousPath?: string;
}

/**
 * Ghost check types
 */
export type GhostCheckType = "typecheck" | "lint" | "test" | "security" | "performance";

/**
 * Ghost check result
 */
export interface GhostCheckResult {
  /** Check type */
  type: GhostCheckType;
  /** Whether the check passed */
  passed: boolean;
  /** Number of issues found */
  issueCount: number;
  /** Issue summary */
  summary: string;
  /** Detailed issues */
  issues?: GhostIssue[];
  /** Execution time in ms */
  executionTime: number;
  /** Timestamp */
  timestamp: Date;
}

/**
 * Individual issue from a ghost check
 */
export interface GhostIssue {
  /** Issue severity */
  severity: "error" | "warning" | "info";
  /** File path */
  file?: string;
  /** Line number (1-indexed) */
  line?: number;
  /** Issue message */
  message: string;
  /** Rule or check that triggered this */
  rule?: string;
  /** Suggested fix */
  suggestion?: string;
}

/**
 * Toast suggestion for the UI
 */
export interface ToastSuggestion {
  /** Unique ID */
  id: string;
  /** Suggestion type */
  type: "info" | "warning" | "error" | "success";
  /** Title */
  title: string;
  /** Message */
  message: string;
  /** Actions the user can take */
  actions?: ToastAction[];
  /** Auto-dismiss after ms (0 = no auto-dismiss) */
  autoDismissMs?: number;
  /** Timestamp */
  timestamp: Date;
  /** Source check that triggered this */
  sourceCheck?: GhostCheckType;
}

/**
 * Toast action
 */
export interface ToastAction {
  /** Action ID */
  id: string;
  /** Button label */
  label: string;
  /** Action to perform */
  action: "fix" | "ignore" | "details" | "custom";
  /** Custom handler name (for action: custom) */
  handler?: string;
}

/**
 * Ghost agent configuration
 */
export interface GhostAgentConfig {
  /** Enable file watching */
  enableWatcher: boolean;
  /** File patterns to watch (glob) */
  watchPatterns: string[];
  /** Patterns to ignore (glob) */
  ignorePatterns: string[];
  /** Debounce time for check triggers (ms) */
  debounceMs: number;
  /** Checks to run on file changes */
  enabledChecks: GhostCheckType[];
  /** Whether to show toast suggestions */
  showToasts: boolean;
}

/**
 * Ghost agent event types
 */
export type GhostEventType =
  | "file:changed"
  | "check:started"
  | "check:completed"
  | "toast:show"
  | "toast:dismissed";

/**
 * Ghost agent event
 */
export interface GhostEvent {
  type: GhostEventType;
  timestamp: Date;
  data?: FileChangeEvent | GhostCheckResult | ToastSuggestion | unknown;
}

/**
 * Ghost agent event handler
 */
export type GhostEventHandler = (event: GhostEvent) => void;

/**
 * Ghost agent interface
 */
export interface IGhostAgent {
  /** Start watching for file changes */
  start(): Promise<void>;

  /** Stop watching */
  stop(): Promise<void>;

  /** Trigger a specific check manually */
  triggerCheck(type: GhostCheckType): Promise<GhostCheckResult>;

  /** Get recent check results */
  getRecentResults(): GhostCheckResult[];

  /** Subscribe to ghost events */
  onEvent(handler: GhostEventHandler): () => void;

  /** Dismiss a toast */
  dismissToast(toastId: string): void;

  /** Get active toasts */
  getActiveToasts(): ToastSuggestion[];
}
