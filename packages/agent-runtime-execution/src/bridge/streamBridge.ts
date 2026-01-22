/**
 * Stream Bridge
 *
 * Converts between agent-runtime StreamEvents and
 * @reader/core StreamingAIOperation for LFCC document edits.
 */

import type {
  AIOpCode,
  AIOperationMeta,
  AIProvenance,
  EditIntent,
  StreamBuffer,
  StreamingCommitStrategy,
} from "@ku0/core";
import { createStreamBuffer, DEFAULT_COMMIT_STRATEGY, findBestCommitPoint } from "@ku0/core";
import type { DocumentEditEvent, StreamEvent, TokenEvent } from "../streaming/types";

// Re-export types for consumers
export type { DocumentEditEvent } from "../streaming/types";

// ============================================================================
// Document Edit Stream
// ============================================================================

/**
 * Extended token event with AI metadata.
 */
export interface AITokenEvent extends TokenEvent {
  /** AI operation metadata */
  aiMeta?: AIOperationMeta;
}

/**
 * Extended stream event union including document edits.
 */
export type ExtendedStreamEvent = StreamEvent;

// ============================================================================
// Stream Bridge
// ============================================================================

/**
 * Configuration for stream bridge.
 */
export interface StreamBridgeConfig {
  /** Target block ID for document edits */
  blockId: string;

  /** AI OpCode for this stream */
  opCode: AIOpCode;

  /** Intent for this stream */
  intent: EditIntent;

  /** AI provenance information */
  provenance: AIProvenance;

  /** Commit strategy */
  commitStrategy?: StreamingCommitStrategy;

  /** Request ID for AI envelope tracing */
  requestId?: string;

  /** Confidence score (0-1) */
  confidence?: number;
}

/**
 * Bridges runtime token streams to LFCC document edits.
 */
export class StreamBridge {
  private readonly config: StreamBridgeConfig;
  private readonly buffer: StreamBuffer;
  private readonly strategy: StreamingCommitStrategy;
  private tokenCount = 0;

  constructor(config: StreamBridgeConfig) {
    this.config = config;
    this.buffer = createStreamBuffer();
    this.strategy = config.commitStrategy ?? DEFAULT_COMMIT_STRATEGY;
  }

  /**
   * Process a token event and return any document edit events to emit.
   */
  processToken(token: string): DocumentEditEvent[] {
    this.tokenCount++;
    this.buffer.total_content += token;
    this.buffer.pending_content += token;

    // Update sentence offsets
    this.updateSentenceOffsets();

    // Check if we should commit
    const commitPoint = findBestCommitPoint(this.buffer, this.strategy);
    if (commitPoint === null) {
      return [];
    }

    return [this.createCommitEvent(commitPoint)];
  }

  /**
   * Flush any remaining content as a final commit.
   */
  flush(): DocumentEditEvent | null {
    if (this.buffer.pending_content.length === 0) {
      return null;
    }

    return this.createCommitEvent(
      this.buffer.commit_offset + this.buffer.pending_content.length,
      false
    );
  }

  /**
   * Get current buffer state.
   */
  getBuffer(): StreamBuffer {
    return { ...this.buffer };
  }

  /**
   * Get total tokens processed.
   */
  getTokenCount(): number {
    return this.tokenCount;
  }

  /**
   * Create AI operation metadata for this stream.
   */
  getAIOperationMeta(): AIOperationMeta {
    return {
      op_code: this.config.opCode,
      agent_id: this.config.intent.agent_id ?? "stream-bridge",
      intent_id: this.config.intent.id,
      intent: this.config.intent,
      provenance: this.config.provenance,
      confidence: { score: this.config.confidence ?? 0.8 },
      timestamp: Date.now(),
    };
  }

  private updateSentenceOffsets(): void {
    const content = this.buffer.total_content;
    const offsets: number[] = [];

    // Find sentence endings
    const sentencePattern = /[.!?。！？]\s*/g;
    const matches = content.matchAll(sentencePattern);

    for (const match of matches) {
      if (match.index !== undefined) {
        offsets.push(match.index + match[0].length);
      }
    }

    this.buffer.sentence_complete_offsets = offsets;
  }

  private createCommitEvent(commitPoint: number, partial = true): DocumentEditEvent {
    const contentToCommit = this.buffer.total_content.slice(this.buffer.commit_offset, commitPoint);

    // Update buffer state
    this.buffer.commit_offset = commitPoint;
    this.buffer.pending_content = this.buffer.total_content.slice(commitPoint);

    return {
      type: "document:edit",
      opCode: this.config.opCode,
      blockId: this.config.blockId,
      content: contentToCommit,
      confidence: this.config.confidence ?? 0.8,
      requestId: this.config.requestId,
      aiMeta: this.getAIOperationMeta(),
      timestamp: Date.now(),
      partial,
    };
  }
}

/**
 * Create a stream bridge.
 */
export function createStreamBridge(config: StreamBridgeConfig): StreamBridge {
  return new StreamBridge(config);
}

// ============================================================================
// Event Converters
// ============================================================================

/**
 * Check if an event is a document edit event.
 */
export function isDocumentEditEvent(event: ExtendedStreamEvent): event is DocumentEditEvent {
  return event.type === "document:edit";
}

/**
 * Create an AI-enhanced token event.
 */
export function createAITokenEvent(
  token: string,
  index: number,
  aiMeta?: AIOperationMeta
): AITokenEvent {
  return {
    type: "token",
    token,
    index,
    timestamp: Date.now(),
    aiMeta,
  };
}
