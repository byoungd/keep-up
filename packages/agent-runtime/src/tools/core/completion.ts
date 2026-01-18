/**
 * Completion Tool Server
 *
 * Provides the completion contract for task termination.
 */

import type { MCPToolResult, ToolContext } from "../../types";
import { BaseToolServer, errorResult, textResult } from "../mcp/baseServer";

// ============================================================================
// Types
// ============================================================================

export interface CompleteTaskInput {
  /** Required: final summary of work */
  summary: string;
  /** Optional: list of created/modified artifacts */
  artifacts?: string[];
  /** Optional: recommended follow-up steps */
  nextSteps?: string;
}

export interface CompletionEvent {
  summary: string;
  artifacts?: string[];
  nextSteps?: string;
  timestamp: number;
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
    this.registerTool(
      {
        name: "complete_task",
        description:
          "Declare task completion with a required summary and optional artifacts/next steps.",
        inputSchema: {
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
        },
        annotations: {
          category: "control",
          requiresConfirmation: false,
          readOnly: true,
          estimatedDuration: "instant",
        },
      },
      this.handleComplete.bind(this)
    );
  }

  private async handleComplete(
    args: Record<string, unknown>,
    _context: ToolContext
  ): Promise<MCPToolResult> {
    const summary = args.summary;
    if (typeof summary !== "string" || summary.trim().length === 0) {
      return errorResult("INVALID_ARGUMENTS", "Summary is required for completion.");
    }

    const artifacts = Array.isArray(args.artifacts)
      ? args.artifacts.filter((item): item is string => typeof item === "string")
      : undefined;
    const nextSteps = typeof args.nextSteps === "string" ? args.nextSteps : undefined;

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
