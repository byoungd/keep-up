/**
 * Message Tool Server
 *
 * Provides the standardized communication protocol for agent-user interaction.
 * Based on Manus Agent Runtime specification.
 *
 * Message Types:
 * - info: Progress updates (non-blocking)
 * - ask: User input/authorization requests (blocking)
 * - result: Final task delivery
 *
 * This is the sole channel for user-facing communication in the agent runtime.
 */

import type { MCPToolResult, ToolContext } from "@ku0/agent-runtime-core";
import { BaseToolServer, errorResult, textResult } from "../mcp/baseServer";

// ============================================================================
// Message Types
// ============================================================================

/**
 * Message type for communication protocol.
 */
export type MessageType = "info" | "ask" | "result";

/**
 * Suggested action for ask-type messages.
 * Maps to specific UI components in the frontend.
 */
export type SuggestedAction =
  | "none" // Standard text input
  | "confirm_browser_operation" // Confirmation dialog for sensitive actions
  | "take_over_browser" // Browser takeover prompt
  | "upgrade_to_unlock_feature"; // Subscription upgrade card

/**
 * Message tool arguments for info type.
 */
export interface MessageInfoArgs {
  type: "info";
  /** Progress update message */
  message: string;
  /** Optional context for the update */
  context?: string;
}

/**
 * Message tool arguments for ask type.
 */
export interface MessageAskArgs {
  type: "ask";
  /** Question or authorization request */
  message: string;
  /** Suggested UI action */
  suggested_action?: SuggestedAction;
  /** Additional context for the request */
  context?: string;
}

/**
 * Message tool arguments for result type.
 */
export interface MessageResultArgs {
  type: "result";
  /** Final result message */
  message: string;
  /** File attachments in order of importance (descending) */
  attachments?: string[];
  /** Summary of what was accomplished */
  summary?: string;
}

/**
 * Combined message arguments.
 */
export type MessageArgs = MessageInfoArgs | MessageAskArgs | MessageResultArgs;

/**
 * Message event for orchestrator consumption.
 */
export interface MessageEvent {
  type: MessageType;
  message: string;
  timestamp: number;
  metadata: {
    suggested_action?: SuggestedAction;
    attachments?: string[];
    summary?: string;
    context?: string;
  };
}

// ============================================================================
// Message Tool Server
// ============================================================================

/**
 * Message tool server implementing the Manus communication protocol.
 */
export class MessageToolServer extends BaseToolServer {
  readonly name = "message";
  readonly description = "Send messages to the user (info, ask, result)";

  private messageHistory: MessageEvent[] = [];
  private readonly maxHistorySize = 100;

  constructor() {
    super();
    this.registerTools();
  }

  private registerTools(): void {
    // Single message tool with type parameter
    this.registerTool(
      {
        name: "send",
        description: `Send a message to the user. This is the ONLY way to communicate with the user.

Message types:
- info: Non-blocking progress update (e.g., "Searching for data...", "Installing dependencies...")
- ask: Blocking request for user input or authorization (requires user response)
- result: Final task completion notification with output and attachments

The frontend will render different UI based on the type and suggested_action.`,
        inputSchema: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: ["info", "ask", "result"],
              description: "Message type",
            },
            message: {
              type: "string",
              description: "The message content",
            },
            suggested_action: {
              type: "string",
              enum: [
                "none",
                "confirm_browser_operation",
                "take_over_browser",
                "upgrade_to_unlock_feature",
              ],
              description:
                "Suggested UI action (only for 'ask' type). Maps to specific frontend components.",
            },
            attachments: {
              type: "array",
              items: { type: "string" },
              description:
                "File paths for attachments (only for 'result' type). Order by importance (descending).",
            },
            summary: {
              type: "string",
              description: "Summary of accomplishments (only for 'result' type)",
            },
            context: {
              type: "string",
              description: "Additional context for the message",
            },
          },
          required: ["type", "message"],
        },
        annotations: {
          category: "communication",
          requiresConfirmation: false,
          readOnly: true,
          estimatedDuration: "instant",
          policyAction: "connector.read",
        },
      },
      this.handleSend.bind(this)
    );
  }

  // ============================================================================
  // Handlers
  // ============================================================================

  private async handleSend(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    try {
      const typeValue = typeof args.type === "string" ? args.type : "";
      if (!this.isMessageType(typeValue)) {
        return errorResult("INVALID_ARGUMENTS", "Message type must be one of: info, ask, result.");
      }
      const type = typeValue as MessageType;
      const message = typeof args.message === "string" ? args.message.trim() : "";
      if (!message) {
        return errorResult("INVALID_ARGUMENTS", "Message content must be a non-empty string.");
      }

      const suggested_action =
        typeof args.suggested_action === "string" && this.isSuggestedAction(args.suggested_action)
          ? (args.suggested_action as SuggestedAction)
          : undefined;
      const attachments = Array.isArray(args.attachments)
        ? (args.attachments as unknown[])
            .filter((item) => typeof item === "string")
            .map((item) => (item as string).trim())
            .filter((item) => item.length > 0)
        : undefined;
      const summary =
        typeof args.summary === "string" && args.summary.trim().length > 0
          ? args.summary.trim()
          : undefined;
      const messageContext =
        typeof args.context === "string" && args.context.trim().length > 0
          ? args.context.trim()
          : undefined;

      const normalized = this.normalizeMetadata(type, {
        suggested_action,
        attachments,
        summary,
        context: messageContext,
      });

      // Create message event
      const event: MessageEvent = {
        type,
        message,
        timestamp: Date.now(),
        metadata: {
          suggested_action: normalized.suggested_action,
          attachments: normalized.attachments,
          summary: normalized.summary,
          context: normalized.context,
        },
      };

      // Record in history
      this.recordMessage(event);

      // Build response
      const response = this.buildResponse(type, message, {
        suggested_action: normalized.suggested_action,
        attachments: normalized.attachments,
        summary: normalized.summary,
      });

      return this.formatOutput(response, context);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return errorResult("EXECUTION_FAILED", `Failed to send message: ${errorMessage}`);
    }
  }

  private isMessageType(value: string): value is MessageType {
    return value === "info" || value === "ask" || value === "result";
  }

  private isSuggestedAction(value: string): value is SuggestedAction {
    return (
      value === "none" ||
      value === "confirm_browser_operation" ||
      value === "take_over_browser" ||
      value === "upgrade_to_unlock_feature"
    );
  }

  /**
   * Build response string based on message type.
   */
  private buildResponse(
    type: MessageType,
    message: string,
    metadata: {
      suggested_action?: SuggestedAction;
      attachments?: string[];
      summary?: string;
    }
  ): string {
    let response = `[${type.toUpperCase()}] ${message}`;

    if (type === "ask") {
      response += "\n\n(Waiting for user response...)";
      if (metadata.suggested_action && metadata.suggested_action !== "none") {
        response += `\nUI Action: ${metadata.suggested_action}`;
      }
    } else if (type === "result") {
      if (metadata.summary) {
        response += `\n\nSummary: ${metadata.summary}`;
      }
      if (metadata.attachments && metadata.attachments.length > 0) {
        response += `\n\nAttachments (${metadata.attachments.length}):`;
        for (const attachment of metadata.attachments) {
          response += `\n  - ${attachment}`;
        }
      }
    }

    return response;
  }

  private normalizeMetadata(
    type: MessageType,
    metadata: {
      suggested_action?: SuggestedAction;
      attachments?: string[];
      summary?: string;
      context?: string;
    }
  ): {
    suggested_action?: SuggestedAction;
    attachments?: string[];
    summary?: string;
    context?: string;
  } {
    if (type === "ask") {
      return {
        suggested_action: metadata.suggested_action ?? "none",
        context: metadata.context,
      };
    }

    if (type === "result") {
      return {
        attachments: metadata.attachments,
        summary: metadata.summary,
        context: metadata.context,
      };
    }

    return { context: metadata.context };
  }

  private formatOutput(output: string, context: ToolContext): MCPToolResult {
    const maxOutputBytes = context.security.limits.maxOutputBytes;
    if (Buffer.byteLength(output) > maxOutputBytes) {
      const truncated = Buffer.from(output).subarray(0, maxOutputBytes).toString();
      return textResult(`${truncated}\n\n[Output truncated at ${maxOutputBytes} bytes]`);
    }

    return textResult(output);
  }

  // ============================================================================
  // Message History
  // ============================================================================

  /**
   * Record message in history.
   */
  private recordMessage(event: MessageEvent): void {
    this.messageHistory.push(event);
    if (this.messageHistory.length > this.maxHistorySize) {
      this.messageHistory.shift();
    }
  }

  /**
   * Get message history.
   */
  getMessageHistory(): MessageEvent[] {
    return [...this.messageHistory];
  }

  /**
   * Get messages by type.
   */
  getMessagesByType(type: MessageType): MessageEvent[] {
    return this.messageHistory.filter((m) => m.type === type);
  }

  /**
   * Clear message history.
   */
  clearHistory(): void {
    this.messageHistory = [];
  }

  /**
   * Get the last message of a specific type.
   */
  getLastMessage(type?: MessageType): MessageEvent | undefined {
    if (type) {
      const filtered = this.messageHistory.filter((m) => m.type === type);
      return filtered[filtered.length - 1];
    }
    return this.messageHistory[this.messageHistory.length - 1];
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a Message tool server.
 */
export function createMessageToolServer(): MessageToolServer {
  return new MessageToolServer();
}
