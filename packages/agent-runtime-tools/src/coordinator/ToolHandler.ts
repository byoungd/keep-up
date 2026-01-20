import type { JSONSchema } from "@ku0/agent-runtime-core";

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

export class ValidationError extends Error {
  readonly errors: string[];

  constructor(errors: string[]) {
    super(errors.join("; "));
    this.name = "ValidationError";
    this.errors = errors;
  }
}

export interface ToolAutoApprovalSettings {
  enabled: boolean;
  policyNames?: string[];
}

export interface ToolServices {
  logger?: (message: string, data?: unknown) => void;
}

export interface ToolCallbacks {
  onResult?: (result: unknown) => void;
  onError?: (error: Error) => void;
}

export interface ToolContext {
  /** Current working directory */
  cwd: string;
  /** Task ID */
  taskId: string;
  /** Auto-approval settings */
  autoApproval?: ToolAutoApprovalSettings;
  /** Services */
  services?: ToolServices;
  /** Callbacks */
  callbacks?: ToolCallbacks;
}

export interface PartialToolUse<TParams = unknown> {
  name: string;
  params: TParams;
  partial: true;
}

export interface ToolHandler<TParams = unknown, TResult = unknown> {
  /** Tool name for registration */
  readonly name: string;
  /** Tool description for LLM */
  readonly description: string;
  /** JSON Schema for parameters */
  readonly schema: JSONSchema;
  /** Execute the tool */
  execute(params: TParams, context: ToolContext): Promise<TResult>;
  /** Handle partial block for streaming UI (optional) */
  handlePartial?(block: PartialToolUse<TParams>, context: ToolContext): Promise<void>;
  /** Validate parameters before execution (optional) */
  validate?(params: TParams, context: ToolContext): ValidationResult;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: JSONSchema;
}
