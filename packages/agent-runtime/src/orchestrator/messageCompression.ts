/**
 * Message History Compression
 *
 * Optimizes agent memory usage by compressing conversation history.
 * Implements sliding window, summarization, and token-aware truncation.
 *
 * Features:
 * - Token-aware message windowing
 * - Automatic summarization of old messages
 * - Context preservation for important messages
 * - Configurable compression strategies
 */

import type { NativeMessage } from "@ku0/tokenizer-rs";
import type { AgentMessage, MCPToolResult } from "../types";
import { countTokens, estimateJsonTokens, tryCompressContext } from "../utils/tokenCounter";

// ============================================================================
// Types
// ============================================================================

/** Compression strategy */
export type CompressionStrategy = "sliding_window" | "summarize" | "truncate" | "hybrid";

/**
 * Interface for LLM-based message summarization.
 * Inject an implementation to enable the 'summarize' strategy.
 */
export interface ISummarizer {
  /** Summarize a list of messages into a concise summary */
  summarize(messages: AgentMessage[]): Promise<string>;
}

/** Compression metrics for observability */
export interface CompressionMetrics {
  /** Called when compression occurs */
  onCompress?: (result: CompressionResult) => void;
  /** Called when summarization occurs */
  onSummarize?: (originalCount: number, summaryTokens: number) => void;
}

/** Compression configuration */
export interface CompressionConfig {
  /** Maximum tokens to keep in history */
  maxTokens: number;
  /** Compression strategy */
  strategy: CompressionStrategy;
  /** Minimum messages to keep (even if over token limit) */
  minMessages: number;
  /** Messages to always preserve (system, recent user/assistant) */
  preserveCount: number;
  /** Enable summarization (requires LLM) */
  enableSummarization: boolean;
  /** Enable incremental compression when messages append */
  incremental?: boolean;
  /** Maximum token cache entries */
  maxTokenCacheEntries?: number;
  /** Token estimator function */
  estimateTokens: (text: string) => number;
  /** Optional summarizer for LLM-based compression */
  summarizer?: ISummarizer;
  /** Optional metrics callbacks */
  metrics?: CompressionMetrics;
}

/** Compression result */
export interface CompressionResult {
  /** Compressed messages */
  messages: AgentMessage[];
  /** Total tokens after compression */
  totalTokens: number;
  /** Number of messages removed */
  removedCount: number;
  /** Number of messages summarized */
  summarizedCount: number;
  /** Compression ratio (0-1) */
  compressionRatio: number;
  /** Context window utilization percentage (0-100) */
  utilization?: number;
  /** Metadata about compression event */
  metadata?: {
    timestamp: number;
    strategy: CompressionStrategy;
    preservedIndices: number[];
    summary?: string;
  };
}

/** Message metadata for compression */
interface MessageMetadata {
  /** Message index */
  index: number;
  /** Token count */
  tokens: number;
  /** Importance score (0-1) */
  importance: number;
  /** Whether to preserve */
  preserve: boolean;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: CompressionConfig = {
  maxTokens: 8000,
  strategy: "hybrid",
  minMessages: 5,
  preserveCount: 3,
  enableSummarization: false,
  incremental: true,
  maxTokenCacheEntries: 2000,
  estimateTokens: (text) => countTokens(text),
};

// ============================================================================
// Message Compressor
// ============================================================================

/**
 * Message History Compressor
 *
 * Compresses conversation history to fit within token limits.
 */
export class MessageCompressor {
  protected readonly config: CompressionConfig;
  protected readonly tokenCache = new Map<string, number>();
  private messageTokenCache = new WeakMap<AgentMessage, number>();
  private readonly maxTokenCacheEntries: number;
  private lastSnapshot?: {
    input: AgentMessage[];
    totalTokens: number;
    compressionRatio: number;
  };
  protected summarizer?: ISummarizer;

  constructor(config: Partial<CompressionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.maxTokenCacheEntries = this.config.maxTokenCacheEntries ?? 2000;
    this.summarizer = config.summarizer;
  }

  /**
   * Set the summarizer for LLM-based compression.
   * Can be called after construction to inject the LLM adapter.
   */
  setSummarizer(summarizer: ISummarizer): void {
    this.summarizer = summarizer;
  }

  /**
   * Compress message history.
   */
  compress(messages: AgentMessage[]): CompressionResult {
    if (messages.length === 0) {
      this.lastSnapshot = undefined;
      return {
        messages: [],
        totalTokens: 0,
        removedCount: 0,
        summarizedCount: 0,
        compressionRatio: 0,
      };
    }

    const incrementalResult = this.tryIncrementalCompression(messages);
    if (incrementalResult) {
      this.updateSnapshot(messages, incrementalResult);
      return incrementalResult;
    }

    // Calculate current token count
    const totalTokens = this.calculateTotalTokens(messages);
    const originalCount = messages.length;

    // If within limits, return as-is
    if (totalTokens <= this.config.maxTokens) {
      const result: CompressionResult = {
        messages: [...messages],
        totalTokens,
        removedCount: 0,
        summarizedCount: 0,
        compressionRatio: 0,
        utilization: (totalTokens / this.config.maxTokens) * 100,
      };
      this.updateSnapshot(messages, result);
      return result;
    }

    // Apply compression strategy (sync strategies only)
    // For async strategies, use compressAsync()
    let result: CompressionResult;
    switch (this.config.strategy) {
      case "sliding_window":
        result = this.compressSlidingWindow(messages);
        break;
      case "summarize":
        // Fallback to sliding window for sync API; use compressAsync for summarization
        result = this.compressSlidingWindow(messages);
        break;
      case "truncate":
        result = this.compressTruncateNative(messages);
        break;
      case "hybrid":
        result = this.compressHybrid(messages);
        break;
      default:
        result = this.compressSlidingWindow(messages);
    }

    const utilization = (result.totalTokens / this.config.maxTokens) * 100;
    const preservedIndices =
      result.metadata?.preservedIndices ??
      result.messages.map((msg) => messages.indexOf(msg)).filter((idx) => idx !== -1);

    const finalResult: CompressionResult = {
      ...result,
      removedCount: originalCount - result.messages.length,
      utilization,
      metadata: {
        ...result.metadata,
        timestamp: Date.now(),
        strategy: this.config.strategy,
        preservedIndices,
        summary: `Compressed ${originalCount - result.messages.length} messages using ${this.config.strategy} strategy`,
      },
    };
    this.updateSnapshot(messages, finalResult);
    return finalResult;
  }

  private tryIncrementalCompression(messages: AgentMessage[]): CompressionResult | null {
    if (!this.config.incremental || !this.lastSnapshot) {
      return null;
    }

    if (this.lastSnapshot.compressionRatio > 0) {
      return null;
    }

    const previousMessages = this.lastSnapshot.input;
    if (messages.length < previousMessages.length) {
      return null;
    }

    if (!this.isPrefixMatch(previousMessages, messages)) {
      return null;
    }

    let totalTokens = this.lastSnapshot.totalTokens;
    for (let i = previousMessages.length; i < messages.length; i++) {
      totalTokens += this.estimateMessageTokens(messages[i]);
    }

    if (totalTokens > this.config.maxTokens) {
      return null;
    }

    return {
      messages: [...messages],
      totalTokens,
      removedCount: 0,
      summarizedCount: 0,
      compressionRatio: 0,
      utilization: (totalTokens / this.config.maxTokens) * 100,
    };
  }

  private updateSnapshot(messages: AgentMessage[], result: CompressionResult): void {
    this.lastSnapshot = {
      input: messages.slice(),
      totalTokens: result.totalTokens,
      compressionRatio: result.compressionRatio,
    };
  }

  private isPrefixMatch(prefix: AgentMessage[], full: AgentMessage[]): boolean {
    for (let i = 0; i < prefix.length; i++) {
      if (prefix[i] !== full[i]) {
        return false;
      }
    }
    return true;
  }

  /**
   * Calculate total tokens in messages.
   */
  calculateTotalTokens(messages: AgentMessage[]): number {
    let total = 0;
    for (const msg of messages) {
      total += this.estimateMessageTokens(msg);
    }
    return total;
  }

  /**
   * Estimate tokens for a message.
   */
  estimateMessageTokens(message: AgentMessage): number {
    const cached = this.messageTokenCache.get(message);
    if (cached !== undefined) {
      return cached;
    }

    let tokens = 0;

    // Content tokens (for messages that have content)
    if ("content" in message && message.content) {
      tokens += this.estimateTextTokens(message.content);
    }

    // Tool calls tokens (rough estimate) - only for assistant messages
    if (message.role === "assistant" && message.toolCalls) {
      tokens += message.toolCalls.length * 50; // ~50 tokens per tool call
    }

    // Tool result tokens - only for tool messages
    if (message.role === "tool" && message.result) {
      tokens += this.estimateStructuredTokens(message.result);
    }

    this.messageTokenCache.set(message, tokens);

    return tokens;
  }

  private estimateStructuredTokens(value: unknown): number {
    return estimateJsonTokens(value);
  }

  private estimateTextTokens(text: string): number {
    const key = this.buildTextCacheKey(text);
    const cached = this.tokenCache.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const tokens = this.config.estimateTokens(text);
    this.writeTokenCache(key, tokens);
    return tokens;
  }

  private buildTextCacheKey(text: string): string {
    return `${text.length}:${this.hashText(text)}`;
  }

  private writeTokenCache(key: string, tokens: number): void {
    if (this.tokenCache.size >= this.maxTokenCacheEntries) {
      const oldestKey = this.tokenCache.keys().next().value;
      if (oldestKey) {
        this.tokenCache.delete(oldestKey);
      }
    }
    this.tokenCache.set(key, tokens);
  }

  private hashText(text: string): string {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Compress using sliding window (keep most recent).
   */
  private compressSlidingWindow(messages: AgentMessage[]): CompressionResult {
    const metadata = this.analyzeMessages(messages);
    const preserved = this.selectPreserved(messages, metadata);
    const candidates = this.selectCandidates(messages, metadata, preserved);

    // Select candidates until token limit
    const selected: AgentMessage[] = [...preserved];
    let tokens = this.calculateTotalTokens(selected);

    for (const candidate of candidates) {
      const candidateTokens = this.estimateMessageTokens(candidate);
      if (tokens + candidateTokens <= this.config.maxTokens) {
        selected.push(candidate);
        tokens += candidateTokens;
      } else {
        break;
      }
    }

    // Ensure minimum messages
    while (selected.length < this.config.minMessages && messages.length > selected.length) {
      const remaining = messages.filter((m) => !selected.includes(m));
      if (remaining.length === 0) {
        break;
      }
      selected.push(remaining[remaining.length - 1]);
      tokens = this.calculateTotalTokens(selected);
    }

    return {
      messages: selected,
      totalTokens: tokens,
      removedCount: messages.length - selected.length,
      summarizedCount: 0,
      compressionRatio: 1 - selected.length / messages.length,
    };
  }

  /**
   * Compress by truncating message content.
   */
  private compressTruncate(messages: AgentMessage[]): CompressionResult {
    const preserved = messages.slice(-this.config.preserveCount);
    const toTruncate = messages.slice(0, -this.config.preserveCount);

    const preservedTokens = this.calculateTotalTokens(preserved);
    const availableTokens = this.config.maxTokens - preservedTokens;

    // Truncate older messages
    const truncated: AgentMessage[] = [];
    let tokens = 0;

    for (let i = toTruncate.length - 1; i >= 0 && tokens < availableTokens; i--) {
      const msg = toTruncate[i];
      const msgTokens = this.estimateMessageTokens(msg);

      if (tokens + msgTokens <= availableTokens) {
        truncated.unshift(msg);
        tokens += msgTokens;
      } else {
        // Truncate content to fit
        const remainingTokens = availableTokens - tokens;
        if (remainingTokens > 50 && "content" in msg && msg.content) {
          const truncatedMsg: AgentMessage = {
            ...msg,
            content: this.truncateText(msg.content, remainingTokens),
          };
          truncated.unshift(truncatedMsg);
          tokens += this.estimateMessageTokens(truncatedMsg);
        }
        break;
      }
    }

    const result = [...truncated, ...preserved];
    return {
      messages: result,
      totalTokens: this.calculateTotalTokens(result),
      removedCount: messages.length - result.length,
      summarizedCount: 0,
      compressionRatio: 1 - result.length / messages.length,
    };
  }

  private compressTruncateNative(messages: AgentMessage[]): CompressionResult {
    return this.tryNativeCompression(messages) ?? this.compressTruncate(messages);
  }

  /**
   * Compress message history asynchronously.
   * Required for summarization strategy which needs LLM calls.
   */
  async compressAsync(messages: AgentMessage[]): Promise<CompressionResult> {
    if (messages.length === 0) {
      this.lastSnapshot = undefined;
      return {
        messages: [],
        totalTokens: 0,
        removedCount: 0,
        summarizedCount: 0,
        compressionRatio: 0,
      };
    }

    const incrementalResult = this.tryIncrementalCompression(messages);
    if (incrementalResult) {
      this.updateSnapshot(messages, incrementalResult);
      return incrementalResult;
    }

    const totalTokens = this.calculateTotalTokens(messages);
    const _originalCount = messages.length;

    if (totalTokens <= this.config.maxTokens) {
      const result: CompressionResult = {
        messages: [...messages],
        totalTokens,
        removedCount: 0,
        summarizedCount: 0,
        compressionRatio: 0,
        utilization: (totalTokens / this.config.maxTokens) * 100,
      };
      this.updateSnapshot(messages, result);
      return result;
    }

    // Use async summarization if available and strategy requests it
    if (
      (this.config.strategy === "summarize" || this.config.strategy === "hybrid") &&
      this.summarizer &&
      this.config.enableSummarization
    ) {
      const result = await this.compressWithSummarization(messages);
      this.updateSnapshot(messages, result);
      return result;
    }

    // Fall back to sync compression
    return this.compress(messages);
  }

  /**
   * Compress with LLM-based summarization.
   * Summarizes older messages while preserving recent context.
   */
  private async compressWithSummarization(messages: AgentMessage[]): Promise<CompressionResult> {
    if (!this.summarizer) {
      // Fallback to sliding window if no summarizer available
      return this.compressSlidingWindow(messages);
    }

    const originalCount = messages.length;
    const preserved = this.selectPreserved(messages, this.analyzeMessages(messages));
    const preservedSet = new Set(preserved);

    // Get messages to summarize (oldest messages not in preserved set)
    const toSummarize = messages.filter((m) => !preservedSet.has(m) && m.role !== "system");

    if (toSummarize.length === 0) {
      return this.compressSlidingWindow(messages);
    }

    try {
      // Generate summary using LLM
      const summary = await this.summarizer.summarize(toSummarize);
      const summaryTokens = this.config.estimateTokens(summary);

      // Emit metrics
      this.config.metrics?.onSummarize?.(toSummarize.length, summaryTokens);

      // Create summary message
      const summaryMessage: AgentMessage = {
        role: "system",
        content: `[Conversation Summary]\n${summary}`,
      };

      // Build result: system messages + summary + preserved recent messages
      const systemMessages = messages.filter((m) => m.role === "system");
      const recentMessages = preserved.filter((m) => m.role !== "system");
      const resultMessages = [...systemMessages, summaryMessage, ...recentMessages];

      const totalTokens = this.calculateTotalTokens(resultMessages);

      const result: CompressionResult = {
        messages: resultMessages,
        totalTokens,
        removedCount: originalCount - resultMessages.length,
        summarizedCount: toSummarize.length,
        compressionRatio: 1 - resultMessages.length / originalCount,
        utilization: (totalTokens / this.config.maxTokens) * 100,
        metadata: {
          timestamp: Date.now(),
          strategy: "summarize",
          preservedIndices: preserved.map((m) => messages.indexOf(m)).filter((i) => i !== -1),
          summary,
        },
      };

      this.config.metrics?.onCompress?.(result);
      return result;
    } catch (_error) {
      // On summarization failure, fall back to sliding window
      return this.compressSlidingWindow(messages);
    }
  }

  /**
   * Hybrid compression: sliding window + truncation.
   */
  private compressHybrid(messages: AgentMessage[]): CompressionResult {
    // First try sliding window
    const windowResult = this.compressSlidingWindow(messages);

    // If still over limit, apply truncation
    if (windowResult.totalTokens > this.config.maxTokens) {
      return this.compressTruncateNative(windowResult.messages);
    }

    return windowResult;
  }

  /**
   * Analyze messages for importance.
   */
  private analyzeMessages(messages: AgentMessage[]): MessageMetadata[] {
    return messages.map((msg, index) => {
      const tokens = this.estimateMessageTokens(msg);
      let importance = 0.5;

      // System messages are always important
      if (msg.role === "system") {
        importance = 1.0;
      }
      // Recent messages are more important
      else if (index >= messages.length - this.config.preserveCount) {
        importance = 0.9;
      }
      // User messages are more important than tool results
      else if (msg.role === "user") {
        importance = 0.7;
      }
      // Tool results are less important
      else if (msg.role === "tool") {
        importance = 0.3;
      }

      return {
        index,
        tokens,
        importance,
        preserve: msg.role === "system" || index >= messages.length - this.config.preserveCount,
      };
    });
  }

  /**
   * Select messages to preserve.
   */
  private selectPreserved(messages: AgentMessage[], _metadata: MessageMetadata[]): AgentMessage[] {
    const preserved: AgentMessage[] = [];

    // Always preserve system messages
    for (let i = 0; i < messages.length; i++) {
      if (messages[i].role === "system") {
        preserved.push(messages[i]);
      }
    }

    // Preserve recent messages
    const recentStart = Math.max(0, messages.length - this.config.preserveCount);
    for (let i = recentStart; i < messages.length; i++) {
      if (!preserved.includes(messages[i])) {
        preserved.push(messages[i]);
      }
    }

    return preserved;
  }

  /**
   * Select candidate messages for inclusion.
   */
  private selectCandidates(
    messages: AgentMessage[],
    metadata: MessageMetadata[],
    preserved: AgentMessage[]
  ): AgentMessage[] {
    const candidates = messages.filter((m) => !preserved.includes(m));

    // Sort by importance (descending)
    candidates.sort((a, b) => {
      const aMeta = metadata[messages.indexOf(a)];
      const bMeta = metadata[messages.indexOf(b)];
      return bMeta.importance - aMeta.importance;
    });

    return candidates;
  }

  /**
   * Truncate text to fit token budget.
   */
  private truncateText(text: string, maxTokens: number): string {
    const maxChars = maxTokens * 4; // Rough estimate
    if (text.length <= maxChars) {
      return text;
    }

    // Try to truncate at sentence boundary
    const truncated = text.substring(0, maxChars - 10);
    const lastPeriod = truncated.lastIndexOf(".");
    const lastNewline = truncated.lastIndexOf("\n");

    const cutPoint = Math.max(lastPeriod, lastNewline);
    if (cutPoint > maxChars * 0.7) {
      return `${truncated.substring(0, cutPoint + 1)}...`;
    }

    return `${truncated}...`;
  }

  /**
   * Clear token cache.
   */
  clearCache(): void {
    this.tokenCache.clear();
    this.messageTokenCache = new WeakMap();
    this.lastSnapshot = undefined;
  }

  private tryNativeCompression(messages: AgentMessage[]): CompressionResult | null {
    if (this.config.estimateTokens !== DEFAULT_CONFIG.estimateTokens) {
      return null;
    }

    const nativeResult = tryCompressContext(
      toNativeMessages(messages),
      this.config.maxTokens,
      this.config.preserveCount
    );

    if (!nativeResult) {
      return null;
    }

    return {
      messages: toAgentMessages(nativeResult.messages),
      totalTokens: nativeResult.totalTokens,
      removedCount: nativeResult.removedCount,
      summarizedCount: 0,
      compressionRatio: nativeResult.compressionRatio,
      metadata: {
        timestamp: Date.now(),
        strategy: this.config.strategy,
        preservedIndices: nativeResult.selectedIndices,
      },
    };
  }
}

function toNativeMessages(messages: AgentMessage[]): NativeMessage[] {
  return messages.map((message) => {
    if (message.role === "tool") {
      return {
        role: "tool",
        toolName: message.toolName,
        result: message.result,
      };
    }

    if (message.role === "assistant") {
      return {
        role: "assistant",
        content: message.content,
        toolCalls: message.toolCalls?.map((tc) => ({ ...tc, id: tc.id ?? "" })),
      };
    }

    return {
      role: message.role,
      content: message.content,
    };
  });
}

function toAgentMessages(messages: NativeMessage[]): AgentMessage[] {
  return messages.map((message) => {
    if (message.role === "tool") {
      return {
        role: "tool",
        toolName: message.toolName ?? "tool",
        result: (message.result ?? { success: false, content: [] }) as MCPToolResult,
      };
    }

    const content = message.content ?? "";
    if (message.role === "assistant") {
      return {
        role: "assistant",
        content,
        toolCalls: message.toolCalls,
      };
    }

    return {
      role: message.role,
      content,
    };
  });
}

/**
 * Smart Message History Compressor
 *
 * Extends basic compression with semantic awareness and intelligent tool result handling.
 */
export class SmartMessageCompressor extends MessageCompressor {
  private readonly maxToolResultTokens: number;

  constructor(config: Partial<CompressionConfig & { maxToolResultTokens?: number }> = {}) {
    super(config);
    this.maxToolResultTokens = config.maxToolResultTokens ?? 500;
  }

  /**
   * Intelligently compress tool results.
   */
  compressToolResult(result: MCPToolResult): MCPToolResult {
    if (result.success && result.content.length > 0) {
      const compressedContent = result.content.map((item) => {
        if (item.type === "text" && item.text) {
          const tokens = this.config.estimateTokens(item.text);
          if (tokens > this.maxToolResultTokens) {
            return {
              ...item,
              type: "text" as const,
              text: this.summarizeText(item.text, this.maxToolResultTokens),
            };
          }
        }
        return item;
      });

      return {
        ...result,
        content: compressedContent,
      };
    }
    return result;
  }

  /**
   * Improve token estimation for structured data.
   */
  override estimateMessageTokens(message: AgentMessage): number {
    if (message.role === "tool" && message.result) {
      // For tool results, use accurate tokens for JSON
      return estimateJsonTokens(message.result);
    }
    return super.estimateMessageTokens(message);
  }

  /**
   * Summarize long text content while preserving structure hints.
   */
  private summarizeText(text: string, maxTokens: number): string {
    const maxChars = maxTokens * 3.5;
    if (text.length <= maxChars) {
      return text;
    }

    try {
      // If it looks like JSON, try to summarize it structurally
      if (text.trim().startsWith("{") || text.trim().startsWith("[")) {
        const parsed = JSON.parse(text);
        const summarized = this.summarizeJson(parsed);
        const summarizedText = JSON.stringify(summarized, null, 2);
        if (summarizedText.length <= maxChars) {
          return summarizedText;
        }
      }
    } catch {
      // Fallback to simple truncation
    }

    const head = text.substring(0, Math.floor(maxChars * 0.6));
    const tail = text.substring(text.length - Math.floor(maxChars * 0.3));
    return `${head}\n... [Content truncated, ${text.length - head.length - tail.length} characters removed] ...\n${tail}`;
  }

  /**
   * Summarize JSON objects by keeping keys and truncating/summarizing values.
   */
  private summarizeJson(obj: unknown): unknown {
    if (Array.isArray(obj)) {
      return this.summarizeArray(obj);
    }

    if (typeof obj === "object" && obj !== null) {
      return this.summarizeObject(obj as Record<string, unknown>);
    }

    return obj;
  }

  private summarizeArray(arr: unknown[]): unknown {
    if (arr.length > 10) {
      return [
        ...arr.slice(0, 5).map((i) => this.summarizeJson(i)),
        `... and ${arr.length - 5} more items`,
      ];
    }
    return arr.map((i) => this.summarizeJson(i));
  }

  private summarizeObject(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const entries = Object.entries(obj);

    for (const [key, value] of entries) {
      // Always preserve status/error/id fields if present
      if (this.isCriticalField(key)) {
        result[key] = value;
        continue;
      }

      result[key] = this.summarizeValue(value);
    }
    return result;
  }

  private isCriticalField(key: string): boolean {
    const criticalFields = [
      "status",
      "error",
      "id",
      "success",
      "type",
      "name",
      "code",
      "message",
      "path",
      "url",
    ];
    return criticalFields.includes(key.toLowerCase());
  }

  private summarizeValue(value: unknown): unknown {
    if (typeof value === "string" && value.length > 200) {
      return `${value.substring(0, 100)}... [truncated]`;
    }
    if (typeof value === "object" && value !== null) {
      return "[Object/Array]";
    }
    return value;
  }
}

/**
 * Create a message compressor.
 */
export function createMessageCompressor(config?: Partial<CompressionConfig>): MessageCompressor {
  return new MessageCompressor(config);
}
