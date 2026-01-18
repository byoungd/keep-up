/**
 * Context Compaction Service
 *
 * Implements context compaction strategies to handle long-horizon tasks.
 * Based on Anthropic's context engineering best practices.
 * Implements spec 5.11: Context Management Contract.
 *
 * @see https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
 */

import { countTokens } from "../utils/tokenCounter";
import type { AgentContext, ContextManager } from "./contextManager.js";

// ============================================================================
// Types
// ============================================================================

/**
 * A message in the conversation history.
 */
export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  /** Tool calls made in this message */
  toolCalls?: ToolCall[];
  /** Tool results for this message */
  toolResults?: ToolResult[];
  /** Timestamp */
  timestamp?: number;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  callId: string;
  result: unknown;
  /** Approximate size of the result in characters */
  size?: number;
}

/**
 * Context management configuration per spec 5.11.
 */
export interface ContextManagementConfig {
  /** Model's context limit (tokens) */
  maxTokens: number;
  /** Percentage threshold to trigger compression (0.8 = 80%) */
  compressionThreshold: number;
  /** Number of user messages to preserve after compression */
  preserveLastN: number;
  /** Compression strategy */
  compressionStrategy: "summarize" | "truncate" | "hybrid";
}

/**
 * Compaction options.
 */
export interface CompactionOptions {
  /** Target token threshold to trigger compaction (default: 20000) */
  targetThreshold?: number;
  /** Maximum messages to keep after compaction (default: 5) */
  maxMessagesToKeep?: number;
  /** Whether to preserve tool call inputs (default: true) */
  preserveToolInputs?: boolean;
  /** Maximum age of tool results to keep in full (in turns) */
  maxToolResultAge?: number;
  /** Context management config per spec 5.11 */
  contextConfig?: ContextManagementConfig;
}

/**
 * Result of a compaction operation.
 */
export interface CompactionResult {
  /** Whether compaction was performed */
  compacted: boolean;
  /** Summary generated during compaction */
  summary?: string;
  /** Number of messages before compaction */
  messagesBefore: number;
  /** Number of messages after compaction */
  messagesAfter: number;
  /** Estimated tokens saved */
  tokensSaved?: number;
  /** Original messages preserved for checkpoint */
  originalMessages?: Message[];
}

/**
 * Threshold check result.
 */
export interface ThresholdCheckResult {
  /** Whether compression is needed */
  needsCompression: boolean;
  /** Current token count */
  currentTokens: number;
  /** Token limit */
  maxTokens: number;
  /** Current usage percentage */
  usagePercent: number;
  /** Threshold percentage */
  thresholdPercent: number;
}

// ============================================================================
// Context Compactor
// ============================================================================

/**
 * Compacts conversation history to manage context window limits.
 * Implements spec 5.11: Context Management Contract.
 */
export class ContextCompactor {
  private readonly options: Required<Omit<CompactionOptions, "contextConfig">>;
  private readonly contextConfig: ContextManagementConfig;

  constructor(options: CompactionOptions = {}) {
    // Default context config per spec 5.11
    const defaultContextConfig: ContextManagementConfig = {
      maxTokens: 128000, // Default for modern models
      compressionThreshold: 0.8, // 80% as per spec
      preserveLastN: 5,
      compressionStrategy: "hybrid",
    };

    this.contextConfig = options.contextConfig ?? defaultContextConfig;
    this.options = {
      targetThreshold:
        options.targetThreshold ??
        Math.floor(this.contextConfig.maxTokens * this.contextConfig.compressionThreshold),
      maxMessagesToKeep: options.maxMessagesToKeep ?? this.contextConfig.preserveLastN,
      preserveToolInputs: options.preserveToolInputs ?? true,
      maxToolResultAge: options.maxToolResultAge ?? 3,
    };
  }

  /**
   * Check if compression is needed based on threshold (spec 5.11).
   * Triggers when tokens exceed threshold (default: 80% of limit).
   */
  checkThreshold(messages: Message[], systemPrompt?: string): ThresholdCheckResult {
    const systemTokens = systemPrompt ? countTokens(systemPrompt) : 0;
    const messageTokens = this.estimateTokens(messages);
    const currentTokens = systemTokens + messageTokens;
    const usagePercent = currentTokens / this.contextConfig.maxTokens;

    return {
      needsCompression: usagePercent >= this.contextConfig.compressionThreshold,
      currentTokens,
      maxTokens: this.contextConfig.maxTokens,
      usagePercent,
      thresholdPercent: this.contextConfig.compressionThreshold,
    };
  }

  /**
   * Check if compaction is needed based on estimated token count.
   */
  needsCompaction(messages: Message[]): boolean {
    const estimatedTokens = this.estimateTokens(messages);
    return estimatedTokens > this.options.targetThreshold;
  }

  /**
   * Get messages to preserve per spec 5.11.
   * Preserves: system prompt (handled separately), last N user messages, current turn tool results.
   */
  getMessagesToPreserve(
    messages: Message[],
    _currentTurnToolResults: ToolResult[] = []
  ): { preserved: Message[]; toSummarize: Message[] } {
    const preserveCount = this.contextConfig.preserveLastN;

    // Find last N user messages and their responses
    const lastUserMessageIndices: number[] = [];
    for (
      let i = messages.length - 1;
      i >= 0 && lastUserMessageIndices.length < preserveCount;
      i--
    ) {
      if (messages[i].role === "user") {
        lastUserMessageIndices.unshift(i);
      }
    }

    const firstPreservedIndex =
      lastUserMessageIndices.length > 0 ? lastUserMessageIndices[0] : messages.length;

    // Messages to preserve (from first preserved user message to end)
    const preserved = messages.slice(firstPreservedIndex);

    // Messages to summarize (everything before)
    const toSummarize = messages.slice(0, firstPreservedIndex);

    return { preserved, toSummarize };
  }

  /**
   * Prune old tool results from messages.
   * This is a lightweight form of compaction that preserves tool inputs
   * but removes verbose outputs from older messages.
   */
  pruneToolResults(messages: Message[], currentTurn: number): Message[] {
    return messages.map((msg, idx) => {
      const messageAge = currentTurn - idx;
      if (messageAge > this.options.maxToolResultAge && msg.toolResults) {
        return {
          ...msg,
          toolResults: msg.toolResults.map((result) => ({
            ...result,
            result: `[Pruned: ${result.size ?? "unknown"} chars]`,
          })),
        };
      }
      return msg;
    });
  }

  /**
   * Generate a summary prompt for compaction.
   * This should be sent to the LLM to generate a summary.
   */
  generateSummaryPrompt(messages: Message[], context: AgentContext): string {
    const factsSection =
      context.facts.length > 0
        ? `\nKnown Facts:\n${context.facts.map((f) => `- [${f.type}] ${f.content}`).join("\n")}`
        : "";

    const progressSection = context.progress.currentObjective
      ? `\nCurrent Objective: ${context.progress.currentObjective}
Completed Steps: ${context.progress.completedSteps.join(", ") || "None"}
Pending Steps: ${context.progress.pendingSteps.join(", ") || "None"}`
      : "";

    return `You are summarizing a conversation to continue work efficiently.

CONTEXT:
${factsSection}
${progressSection}

Scratchpad:
${context.scratchpad || "(empty)"}

CONVERSATION TO SUMMARIZE:
${this.formatMessagesForSummary(messages)}

INSTRUCTIONS:
Produce a concise summary that preserves:
1. Key architectural or design decisions made
2. Important discoveries about the codebase
3. Current progress and what's been accomplished
4. Any unresolved issues or pending tasks
5. Critical context needed for continuation

Format your summary as bullet points. Be specific - include file names, function names, and key details.
Do NOT include redundant tool outputs or verbose explanations.`;
  }

  /**
   * Apply a summary to the context and prepare for continuation.
   */
  applyCompaction(
    contextManager: ContextManager,
    contextId: string,
    summary: string,
    recentMessages: Message[]
  ): CompactionResult {
    const context = contextManager.get(contextId);
    if (!context) {
      return {
        compacted: false,
        messagesBefore: 0,
        messagesAfter: 0,
      };
    }

    // Update scratchpad with summary
    const timestamp = new Date().toISOString();
    const compactionNote = `[Compaction @ ${timestamp}]\n${summary}`;
    contextManager.updateScratchpad(contextId, compactionNote, "append");

    return {
      compacted: true,
      summary,
      messagesBefore: recentMessages.length + 1, // +1 for the summarized portion
      messagesAfter: recentMessages.length,
    };
  }

  /**
   * Estimate token count for messages.
   */
  estimateTokens(messages: Message[]): number {
    let total = 0;
    for (const msg of messages) {
      total += countTokens(msg.content);
      if (msg.toolCalls) {
        for (const call of msg.toolCalls) {
          total += countTokens(JSON.stringify(call.arguments));
        }
      }
      if (msg.toolResults) {
        for (const result of msg.toolResults) {
          total += countTokens(JSON.stringify(result.result));
        }
      }
    }
    return total;
  }

  /**
   * Format messages for summary generation.
   */
  private formatMessagesForSummary(messages: Message[]): string {
    return messages
      .map((msg) => {
        const roleLabel = msg.role.toUpperCase();
        let content = msg.content;

        // Add tool call info if present
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          const toolInfo = msg.toolCalls
            .map((tc) => `  - ${tc.name}(${JSON.stringify(tc.arguments).slice(0, 100)}...)`)
            .join("\n");
          content += `\n[Tool Calls]:\n${toolInfo}`;
        }

        return `[${roleLabel}]: ${content}`;
      })
      .join("\n\n");
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a context compactor.
 *
 * @example
 * ```typescript
 * const compactor = createContextCompactor({
 *   targetThreshold: 15000,
 *   maxMessagesToKeep: 3,
 * });
 *
 * // Check if compaction is needed
 * if (compactor.needsCompaction(messages)) {
 *   // Generate summary prompt
 *   const prompt = compactor.generateSummaryPrompt(messages, context);
 *
 *   // Send to LLM and get summary
 *   const summary = await llm.complete(prompt);
 *
 *   // Apply compaction
 *   const result = compactor.applyCompaction(
 *     contextManager,
 *     contextId,
 *     summary,
 *     messages.slice(-5) // Keep last 5 messages
 *   );
 * }
 * ```
 */
export function createContextCompactor(options?: CompactionOptions): ContextCompactor {
  return new ContextCompactor(options);
}
