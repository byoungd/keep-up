/**
 * Completion Tool Server
 *
 * Provides the completion contract for task termination.
 */

import type {
  CompleteTaskInput,
  MCPTool,
  MCPToolResult,
  ToolContext,
  ToolError,
} from "../../types";
import { BaseToolServer, errorResult, textResult } from "../mcp/baseServer";

// ============================================================================
// Types
// ============================================================================

export type { CompleteTaskInput };

export interface CompletionEvent {
  summary: string;
  artifacts?: string[];
  nextSteps?: string;
  timestamp: number;
}

export type CompletionValidationResult =
  | { ok: true; value: CompleteTaskInput }
  | { ok: false; error: ToolError };

export const COMPLETION_TOOL_NAME = "complete_task";
const COMPLETION_ALLOWED_KEYS = new Set(["summary", "artifacts", "nextSteps"]);

export const COMPLETION_TOOL_SCHEMA: MCPTool["inputSchema"] = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      description: "Required summary of what was completed.",
    },
    artifacts: {
      type: "array",
      items: { type: "string" },
      description: "Optional list of created or modified file paths.",
    },
    nextSteps: {
      type: "string",
      description: "Optional recommended follow-up actions.",
    },
  },
  required: ["summary"],
};

export const COMPLETION_TOOL_DEFINITION: MCPTool = {
  name: COMPLETION_TOOL_NAME,
  description: "Declare task completion with a required summary and optional artifacts/next steps.",
  inputSchema: COMPLETION_TOOL_SCHEMA,
  annotations: {
    category: "control",
    requiresConfirmation: false,
    readOnly: true,
    estimatedDuration: "instant",
  },
};

export function validateCompletionInput(args: unknown): CompletionValidationResult {
  const recordResult = validateCompletionRecord(args);
  if (!recordResult.ok) {
    return recordResult;
  }

  const summaryResult = validateCompletionSummary(recordResult.value);
  if (!summaryResult.ok) {
    return summaryResult;
  }

  const artifactsResult = validateCompletionArtifacts(recordResult.value);
  if (!artifactsResult.ok) {
    return artifactsResult;
  }

  const nextStepsResult = validateCompletionNextSteps(recordResult.value);
  if (!nextStepsResult.ok) {
    return nextStepsResult;
  }

  return {
    ok: true,
    value: {
      summary: summaryResult.value,
      artifacts:
        artifactsResult.value && artifactsResult.value.length > 0
          ? artifactsResult.value
          : undefined,
      nextSteps: nextStepsResult.value,
    },
  };
}

function validateCompletionRecord(
  args: unknown
): { ok: true; value: Record<string, unknown> } | { ok: false; error: ToolError } {
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return {
      ok: false,
      error: { code: "INVALID_ARGUMENTS", message: "Completion payload must be an object." },
    };
  }

  const record = args as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!COMPLETION_ALLOWED_KEYS.has(key)) {
      return {
        ok: false,
        error: {
          code: "INVALID_ARGUMENTS",
          message: `Unknown completion field: ${key}`,
        },
      };
    }
  }

  return { ok: true, value: record };
}

function validateCompletionSummary(
  record: Record<string, unknown>
): { ok: true; value: string } | { ok: false; error: ToolError } {
  const summaryValue = record.summary;
  if (typeof summaryValue !== "string" || summaryValue.trim().length === 0) {
    return {
      ok: false,
      error: { code: "INVALID_ARGUMENTS", message: "Summary is required for completion." },
    };
  }
  return { ok: true, value: summaryValue.trim() };
}

function validateCompletionArtifacts(
  record: Record<string, unknown>
): { ok: true; value?: string[] } | { ok: false; error: ToolError } {
  if (!("artifacts" in record)) {
    return { ok: true };
  }

  if (!Array.isArray(record.artifacts)) {
    return {
      ok: false,
      error: { code: "INVALID_ARGUMENTS", message: "Artifacts must be an array of strings." },
    };
  }

  const artifactsValue = record.artifacts;
  for (const item of artifactsValue) {
    if (typeof item !== "string" || item.trim().length === 0) {
      return {
        ok: false,
        error: {
          code: "INVALID_ARGUMENTS",
          message: "Artifacts must be an array of non-empty strings.",
        },
      };
    }
  }

  return { ok: true, value: artifactsValue.map((item) => item.trim()) };
}

function validateCompletionNextSteps(
  record: Record<string, unknown>
): { ok: true; value?: string } | { ok: false; error: ToolError } {
  if (!("nextSteps" in record)) {
    return { ok: true };
  }

  if (typeof record.nextSteps !== "string") {
    return {
      ok: false,
      error: { code: "INVALID_ARGUMENTS", message: "Next steps must be a string." },
    };
  }

  const trimmed = record.nextSteps.trim();
  if (trimmed.length === 0) {
    return {
      ok: false,
      error: { code: "INVALID_ARGUMENTS", message: "Next steps must be a non-empty string." },
    };
  }

  return { ok: true, value: trimmed };
}

// ============================================================================
// Completion Tool Server
// ============================================================================

export class CompletionToolServer extends BaseToolServer {
  readonly name = "completion";
  readonly description = "Finalize tasks via the completion contract";

  private readonly completionHistory: CompletionEvent[] = [];
  private readonly maxHistorySize = 50;

  constructor() {
    super();
    this.registerTools();
  }

  private registerTools(): void {
    this.registerTool(COMPLETION_TOOL_DEFINITION, this.handleComplete.bind(this));
  }

  protected validateArguments(
    args: Record<string, unknown>,
    _schema: MCPTool["inputSchema"]
  ): ToolError | null {
    const validation = validateCompletionInput(args);
    return validation.ok ? null : validation.error;
  }

  private async handleComplete(
    args: Record<string, unknown>,
    _context: ToolContext
  ): Promise<MCPToolResult> {
    const validation = validateCompletionInput(args);
    if (!validation.ok) {
      return errorResult(validation.error.code, validation.error.message, validation.error.details);
    }

    const { summary, artifacts, nextSteps } = validation.value;

    this.recordCompletion({
      summary,
      artifacts: artifacts?.length ? artifacts : undefined,
      nextSteps,
      timestamp: Date.now(),
    });

    const messageParts = [`Summary: ${summary}`];
    if (artifacts && artifacts.length > 0) {
      messageParts.push(`Artifacts: ${artifacts.join(", ")}`);
    }
    if (nextSteps) {
      messageParts.push(`Next steps: ${nextSteps}`);
    }

    return textResult(messageParts.join("\n"));
  }

  private recordCompletion(event: CompletionEvent): void {
    this.completionHistory.push(event);
    if (this.completionHistory.length > this.maxHistorySize) {
      this.completionHistory.shift();
    }
  }

  getCompletionHistory(): CompletionEvent[] {
    return [...this.completionHistory];
  }
}

export function createCompletionToolServer(): CompletionToolServer {
  return new CompletionToolServer();
}
