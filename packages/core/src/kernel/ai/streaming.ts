/**
 * LFCC v0.9.1+ — Streaming AI Operations
 *
 * Streaming-first protocol for progressive AI content generation.
 * Enables real-time feedback and partial commits during LLM output.
 *
 * @see docs/specs/proposals/LFCC_v0.9.1_AI_Native_Enhancement.md
 */

import type { EditIntent } from "./intent.js";
import type { AIOpCode, AIProvenance } from "./opcodes.js";

// ============================================================================
// Stream State
// ============================================================================

/**
 * Possible states of a streaming operation.
 */
export type StreamState =
  | { phase: "starting"; started_at: number }
  | { phase: "streaming"; tokens_received: number; last_token_at: number }
  | { phase: "completing"; finalizing: boolean }
  | { phase: "completed"; total_tokens: number; duration_ms: number }
  | { phase: "cancelled"; reason: string; tokens_before_cancel: number }
  | { phase: "error"; error: StreamError };

/**
 * Stream error information.
 */
export interface StreamError {
  code: string;
  message: string;
  recoverable: boolean;
  partial_content?: string;
}

// ============================================================================
// Stream Buffer
// ============================================================================

/**
 * Buffer for managing uncommitted streaming content.
 */
export interface StreamBuffer {
  /** Uncommitted tokens (not yet in CRDT) */
  pending_content: string;

  /** Last committed position */
  commit_offset: number;

  /** Sentence-complete offsets for semantic commits */
  sentence_complete_offsets: number[];

  /** Total content received */
  total_content: string;
}

/**
 * Create an empty stream buffer.
 */
export function createStreamBuffer(): StreamBuffer {
  return {
    pending_content: "",
    commit_offset: 0,
    sentence_complete_offsets: [],
    total_content: "",
  };
}

// ============================================================================
// Streaming Commit Strategy
// ============================================================================

/**
 * Strategy for committing streaming content to CRDT.
 */
export interface StreamingCommitStrategy {
  /** Commit after N characters (for responsiveness) */
  char_threshold: number;

  /** Prefer sentence boundaries (for semantic coherence) */
  prefer_sentence_boundary: boolean;

  /** Maximum uncommitted buffer (memory safety) */
  max_buffer_chars: number;

  /** Commit interval in ms (for long pauses) */
  commit_interval_ms: number;
}

/**
 * Default streaming commit strategy.
 */
export const DEFAULT_COMMIT_STRATEGY: StreamingCommitStrategy = {
  char_threshold: 50,
  prefer_sentence_boundary: true,
  max_buffer_chars: 1000,
  commit_interval_ms: 500,
};

// ============================================================================
// Stream Target
// ============================================================================

/**
 * Where streaming content should be inserted.
 */
export interface StreamTarget {
  /** Target block ID */
  block_id: string;

  /** Anchor mode */
  anchor: "append" | "replace" | "insert_after" | "insert_before";

  /** Cursor position within block (for insert modes) */
  cursor_position?: number;
}

// ============================================================================
// Streaming AI Operation
// ============================================================================

/**
 * A streaming AI operation for progressive content generation.
 */
export interface StreamingAIOperation {
  /** Unique stream identifier */
  stream_id: string;

  /** Intent for this stream */
  intent: EditIntent;

  /** Agent performing the stream */
  agent_id: string;

  /** AI operation code */
  op_code: AIOpCode;

  /** Provenance information */
  provenance: AIProvenance;

  /** Target for streaming content */
  target: StreamTarget;

  /** Current stream state */
  state: StreamState;

  /** Content buffer */
  buffer: StreamBuffer;

  /** Commit strategy */
  commit_strategy: StreamingCommitStrategy;
}

// ============================================================================
// Stream Manager Interface
// ============================================================================

/**
 * Manages active streaming operations.
 */
export interface StreamManager {
  /**
   * Start a new streaming operation.
   */
  startStream(
    intent: EditIntent,
    agentId: string,
    opCode: AIOpCode,
    provenance: AIProvenance,
    target: StreamTarget,
    strategy?: StreamingCommitStrategy
  ): StreamingAIOperation;

  /**
   * Append content to an active stream.
   */
  appendContent(streamId: string, content: string): AppendResult;

  /**
   * Commit pending content to CRDT.
   */
  commitPending(streamId: string): CommitResult;

  /**
   * Complete a streaming operation.
   */
  completeStream(streamId: string): CompleteResult;

  /**
   * Cancel a streaming operation.
   */
  cancelStream(streamId: string, reason: string): void;

  /**
   * Get stream by ID.
   */
  getStream(streamId: string): StreamingAIOperation | undefined;

  /**
   * Get all active streams.
   */
  getActiveStreams(): StreamingAIOperation[];
}

/**
 * Result of appending content.
 */
export interface AppendResult {
  /** Whether append succeeded */
  success: boolean;

  /** Whether a commit was triggered */
  committed: boolean;

  /** Characters committed (if any) */
  chars_committed?: number;
}

/**
 * Result of committing pending content.
 */
export interface CommitResult {
  /** Whether commit succeeded */
  success: boolean;

  /** Characters committed */
  chars_committed: number;

  /** New commit offset */
  new_offset: number;
}

/**
 * Result of completing a stream.
 */
export interface CompleteResult {
  /** Whether completion succeeded */
  success: boolean;

  /** Total characters generated */
  total_chars: number;

  /** Total duration in ms */
  duration_ms: number;

  /** Final content */
  final_content: string;
}

// ============================================================================
// Sentence Detection
// ============================================================================

/**
 * Find sentence-complete offsets in content.
 */
export function findSentenceOffsets(content: string): number[] {
  const offsets: number[] = [];
  const regex = /[.!?。！？]\s*/g;
  const matches = content.matchAll(regex);

  for (const match of matches) {
    offsets.push(match.index + match[0].length);
  }

  return offsets;
}

/**
 * Find best commit point based on strategy.
 */
export function findBestCommitPoint(
  buffer: StreamBuffer,
  strategy: StreamingCommitStrategy
): number | null {
  const pendingLength = buffer.pending_content.length;

  // Force commit if buffer exceeds max
  if (pendingLength >= strategy.max_buffer_chars) {
    // Try to find a sentence boundary
    if (strategy.prefer_sentence_boundary && buffer.sentence_complete_offsets.length > 0) {
      const lastSentence =
        buffer.sentence_complete_offsets[buffer.sentence_complete_offsets.length - 1];
      if (lastSentence > buffer.commit_offset) {
        return lastSentence;
      }
    }
    // No sentence boundary, commit all
    return buffer.commit_offset + pendingLength;
  }

  // Check if we've reached the character threshold
  if (pendingLength >= strategy.char_threshold) {
    if (strategy.prefer_sentence_boundary && buffer.sentence_complete_offsets.length > 0) {
      // Find the highest sentence offset that's within pending content
      const validOffsets = buffer.sentence_complete_offsets.filter(
        (o) => o > buffer.commit_offset && o <= buffer.commit_offset + pendingLength
      );
      if (validOffsets.length > 0) {
        return validOffsets[validOffsets.length - 1];
      }
    }
  }

  return null;
}

// ============================================================================
// Stream Manager Implementation
// ============================================================================

let streamCounter = 0;

/**
 * Generate unique stream ID.
 */
export function generateStreamId(): string {
  const timestamp = Date.now().toString(36);
  const counter = (streamCounter++).toString(36).padStart(4, "0");
  const random = Math.random().toString(36).substring(2, 6);
  return `stream_${timestamp}_${counter}_${random}`;
}

/**
 * In-memory stream manager implementation.
 */
export class InMemoryStreamManager implements StreamManager {
  private streams = new Map<string, StreamingAIOperation>();
  private commitCallback?: (streamId: string, content: string, offset: number) => void;

  constructor(commitCallback?: (streamId: string, content: string, offset: number) => void) {
    this.commitCallback = commitCallback;
  }

  startStream(
    intent: EditIntent,
    agentId: string,
    opCode: AIOpCode,
    provenance: AIProvenance,
    target: StreamTarget,
    strategy: StreamingCommitStrategy = DEFAULT_COMMIT_STRATEGY
  ): StreamingAIOperation {
    const stream: StreamingAIOperation = {
      stream_id: generateStreamId(),
      intent,
      agent_id: agentId,
      op_code: opCode,
      provenance,
      target,
      state: { phase: "starting", started_at: Date.now() },
      buffer: createStreamBuffer(),
      commit_strategy: strategy,
    };

    this.streams.set(stream.stream_id, stream);
    return stream;
  }

  appendContent(streamId: string, content: string): AppendResult {
    const stream = this.streams.get(streamId);
    if (!stream) {
      return { success: false, committed: false };
    }

    // Update state if still starting
    if (stream.state.phase === "starting") {
      stream.state = { phase: "streaming", tokens_received: 0, last_token_at: Date.now() };
    }

    // Update buffer
    stream.buffer.pending_content += content;
    stream.buffer.total_content += content;

    // Update sentence offsets
    const newOffsets = findSentenceOffsets(stream.buffer.total_content);
    stream.buffer.sentence_complete_offsets = newOffsets;

    // Update state
    if (stream.state.phase === "streaming") {
      stream.state.tokens_received += content.length;
      stream.state.last_token_at = Date.now();
    }

    // Check if we should commit
    const commitPoint = findBestCommitPoint(stream.buffer, stream.commit_strategy);
    if (commitPoint !== null) {
      const result = this.commitPending(streamId);
      return {
        success: true,
        committed: true,
        chars_committed: result.chars_committed,
      };
    }

    return { success: true, committed: false };
  }

  commitPending(streamId: string): CommitResult {
    const stream = this.streams.get(streamId);
    if (!stream || stream.buffer.pending_content.length === 0) {
      return { success: false, chars_committed: 0, new_offset: 0 };
    }

    const contentToCommit = stream.buffer.pending_content;
    const newOffset = stream.buffer.commit_offset + contentToCommit.length;

    // Invoke commit callback
    if (this.commitCallback) {
      this.commitCallback(streamId, contentToCommit, stream.buffer.commit_offset);
    }

    // Update buffer
    stream.buffer.commit_offset = newOffset;
    stream.buffer.pending_content = "";

    return {
      success: true,
      chars_committed: contentToCommit.length,
      new_offset: newOffset,
    };
  }

  completeStream(streamId: string): CompleteResult {
    const stream = this.streams.get(streamId);
    if (!stream) {
      return { success: false, total_chars: 0, duration_ms: 0, final_content: "" };
    }

    // Commit any remaining content
    if (stream.buffer.pending_content.length > 0) {
      this.commitPending(streamId);
    }

    const startedAt =
      stream.state.phase === "starting"
        ? stream.state.started_at
        : stream.state.phase === "streaming"
          ? stream.state.last_token_at - stream.state.tokens_received / 10 // Estimate
          : Date.now();

    const duration = Date.now() - startedAt;

    stream.state = {
      phase: "completed",
      total_tokens: stream.buffer.total_content.length,
      duration_ms: duration,
    };

    return {
      success: true,
      total_chars: stream.buffer.total_content.length,
      duration_ms: duration,
      final_content: stream.buffer.total_content,
    };
  }

  cancelStream(streamId: string, reason: string): void {
    const stream = this.streams.get(streamId);
    if (!stream) {
      return;
    }

    const tokensBeforeCancel =
      stream.state.phase === "streaming" ? stream.state.tokens_received : 0;

    stream.state = {
      phase: "cancelled",
      reason,
      tokens_before_cancel: tokensBeforeCancel,
    };
  }

  getStream(streamId: string): StreamingAIOperation | undefined {
    return this.streams.get(streamId);
  }

  getActiveStreams(): StreamingAIOperation[] {
    return Array.from(this.streams.values()).filter(
      (s) => s.state.phase === "starting" || s.state.phase === "streaming"
    );
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a stream manager.
 */
export function createStreamManager(
  commitCallback?: (streamId: string, content: string, offset: number) => void
): StreamManager {
  return new InMemoryStreamManager(commitCallback);
}
