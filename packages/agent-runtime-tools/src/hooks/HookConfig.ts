export type HookType = "PreToolUse" | "PostToolUse" | "OnError";

export interface HookInput {
  preToolUse?: {
    toolName: string;
    parameters: unknown;
  };
  postToolUse?: {
    toolName: string;
    parameters: unknown;
    result: unknown;
    success: boolean;
    executionTimeMs: number;
  };
  onError?: {
    toolName: string;
    error: Error;
  };
}

export interface HookResult {
  /** Cancel the operation */
  cancel?: boolean;
  /** Was cancelled by user */
  wasCancelled?: boolean;
  /** Context to add to conversation */
  contextModification?: string;
  /** Error message to display */
  errorMessage?: string;
  /** Modified parameters (PreToolUse only) */
  modifiedParams?: unknown;
}

export interface HookConfig {
  /** Hook name for identification */
  name: string;
  /** Hook type */
  type: HookType;
  /** Tool names this hook applies to (* for all) */
  toolPatterns: string[];
  /** Script or command to execute */
  command: string;
  /** Timeout in milliseconds */
  timeoutMs: number;
  /** Whether cancellation is allowed */
  isCancellable: boolean;
}
