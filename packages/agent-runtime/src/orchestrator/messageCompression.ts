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

import type { AgentMessage } from "../types";

// ============================================================================
// Types
// ============================================================================

/** Compression strategy */
export type CompressionStrategy = "sliding_window" | "summarize" | "truncate" | "hybrid";

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
  /** Token estimator function */
  estimateTokens: (text: string) => number;
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
  estimateTokens: (text) => Math.ceil(text.length / 4),
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
  private readonly config: CompressionConfig;
  private readonly tokenCache = new Map<string, number>();

  constructor(config: Partial<CompressionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Compress message history.
   */
  compress(messages: AgentMessage[]): CompressionResult {
    if (messages.length === 0) {
      return {
        messages: [],
        totalTokens: 0,
        removedCount: 0,
        summarizedCount: 0,
        compressionRatio: 0,
      };
    }

    // Calculate current token count
    const totalTokens = this.calculateTotalTokens(messages);
    const originalCount = messages.length;

    // If within limits, return as-is
    if (totalTokens <= this.config.maxTokens) {
      return {
        messages: [...messages],
        totalTokens,
        removedCount: 0,
        summarizedCount: 0,
        compressionRatio: 0,
        utilization: (totalTokens / this.config.maxTokens) * 100,
      };
    }

    // Apply compression strategy
    let result: CompressionResult;
    switch (this.config.strategy) {
      case "sliding_window":
        result = this.compressSlidingWindow(messages);
        break;
      case "summarize":
        result = this.compressWithSummarization(messages);
        break;
      case "truncate":
        result = this.compressTruncate(messages);
        break;
      case "hybrid":
        result = this.compressHybrid(messages);
        break;
      default:
        result = this.compressSlidingWindow(messages);
    }

    const utilization = (result.totalTokens / this.config.maxTokens) * 100;
    const preservedIndices = result.messages
      .map((msg) => messages.indexOf(msg))
      .filter((idx) => idx !== -1);

    return {
      ...result,
      removedCount: originalCount - result.messages.length,
      utilization,
      metadata: {
        timestamp: Date.now(),
        strategy: this.config.strategy,
        preservedIndices,
        summary: `Compressed ${originalCount - result.messages.length} messages using ${this.config.strategy} strategy`,
      },
    };
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
    // Create cache key based on role and partial content
    let contentPreview = "";
    if ("content" in message && message.content) {
      contentPreview = message.content.substring(0, 50);
    }
    const cacheKey = `${message.role}:${contentPreview}`;

    const cached = this.tokenCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    let tokens = 0;

    // Content tokens (for messages that have content)
    if ("content" in message && message.content) {
      tokens += this.config.estimateTokens(message.content);
    }

    // Tool calls tokens (rough estimate) - only for assistant messages
    if (message.role === "assistant" && message.toolCalls) {
      tokens += message.toolCalls.length * 50; // ~50 tokens per tool call
    }

    // Tool result tokens - only for tool messages
    if (message.role === "tool" && message.result) {
      const resultText = JSON.stringify(message.result);
      tokens += this.config.estimateTokens(resultText);
    }

    // Cache result
    if (this.tokenCache.size < 1000) {
      this.tokenCache.set(cacheKey, tokens);
    }

    return tokens;
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

  /**
   * Compress with summarization (placeholder - requires LLM).
   */
  private compressWithSummarization(messages: AgentMessage[]): CompressionResult {
    // For now, fall back to sliding window
    // In production, this would use LLM to summarize old messages
    return this.compressSlidingWindow(messages);
  }

  /**
   * Hybrid compression: sliding window + truncation.
   */
  private compressHybrid(messages: AgentMessage[]): CompressionResult {
    // First try sliding window
    const windowResult = this.compressSlidingWindow(messages);

    // If still over limit, apply truncation
    if (windowResult.totalTokens > this.config.maxTokens) {
      return this.compressTruncate(windowResult.messages);
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
  }
}

/**
 * Create a message compressor.
 */
export function createMessageCompressor(config?: Partial<CompressionConfig>): MessageCompressor {
  return new MessageCompressor(config);
}
