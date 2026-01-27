import type {
  ClarificationRequest,
  ClarificationResponse,
  MCPToolResult,
  ToolContext,
} from "@ku0/agent-runtime-core";
import { BaseToolServer, errorResult, textResult } from "../mcp/baseServer";

export interface ClarificationHandler {
  requestClarification(request: ClarificationRequest): Promise<ClarificationResponse>;
}

export class ClarificationToolServer extends BaseToolServer {
  readonly name = "clarification";
  readonly description = "Ask the user for clarification questions";

  constructor(private readonly handler: ClarificationHandler) {
    super();
    this.registerTools();
  }

  private registerTools(): void {
    this.registerTool(
      {
        name: "ask_clarification_question",
        description: "Ask the user for clarification with optional choices",
        inputSchema: {
          type: "object",
          properties: {
            question: { type: "string", description: "Clarification question" },
            options: {
              type: "array",
              description: "Optional answer choices",
              items: { type: "string" },
            },
            continueWork: {
              type: "boolean",
              description: "Continue work while waiting for response",
            },
            priority: {
              type: "string",
              enum: ["low", "medium", "high", "blocking"],
              description: "Priority of the clarification request",
            },
            timeoutMs: { type: "number", description: "Optional timeout in milliseconds" },
            context: {
              type: "object",
              description: "Optional context for the clarification",
              properties: {
                taskId: { type: "string" },
                relatedFiles: { type: "array", items: { type: "string" } },
                codeSnippet: { type: "string" },
              },
            },
          },
          required: ["question"],
        },
        annotations: {
          category: "communication",
          requiresConfirmation: false,
          readOnly: true,
          estimatedDuration: "fast",
          policyAction: "connector.read",
        },
      },
      this.handleAsk.bind(this)
    );
  }

  private async handleAsk(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    const question = typeof args.question === "string" ? args.question.trim() : "";
    if (!question) {
      return errorResult("INVALID_ARGUMENTS", "Provide a non-empty clarification question.");
    }

    const options = Array.isArray(args.options)
      ? (args.options as unknown[])
          .filter((opt) => typeof opt === "string")
          .map((opt) => (opt as string).trim())
          .filter((opt) => opt.length > 0)
      : undefined;
    const continueWork = typeof args.continueWork === "boolean" ? args.continueWork : false;
    const priorityCandidate = typeof args.priority === "string" ? args.priority : undefined;
    const priority =
      priorityCandidate && this.isPriority(priorityCandidate)
        ? (priorityCandidate as ClarificationRequest["priority"])
        : undefined;
    const timeoutMs = typeof args.timeoutMs === "number" ? args.timeoutMs : undefined;
    const requestContext =
      typeof args.context === "object" && args.context !== null
        ? (args.context as ClarificationRequest["context"])
        : undefined;

    const request: ClarificationRequest = {
      id: crypto.randomUUID(),
      question,
      options,
      timeoutMs,
      priority,
      continueWorkWhileWaiting: continueWork,
      context: {
        ...requestContext,
        sessionId: context.sessionId,
      },
    };

    const responsePromise = this.handler.requestClarification(request);
    if (continueWork) {
      return this.formatOutput(
        JSON.stringify({ requestId: request.id, status: "pending" }, null, 2),
        context
      );
    }

    const response = await responsePromise;
    return this.formatOutput(JSON.stringify(response, null, 2), context);
  }

  private isPriority(value: string | undefined): value is ClarificationRequest["priority"] {
    return value === "low" || value === "medium" || value === "high" || value === "blocking";
  }

  private formatOutput(output: string, context: ToolContext): MCPToolResult {
    const maxOutputBytes = context.security.limits.maxOutputBytes;
    if (Buffer.byteLength(output) > maxOutputBytes) {
      const truncated = Buffer.from(output).subarray(0, maxOutputBytes).toString();
      return textResult(`${truncated}\n\n[Output truncated at ${maxOutputBytes} bytes]`);
    }

    return textResult(output);
  }
}

export function createClarificationToolServer(
  handler: ClarificationHandler
): ClarificationToolServer {
  return new ClarificationToolServer(handler);
}
