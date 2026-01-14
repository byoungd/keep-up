/**
 * Enhanced Streaming Types
 *
 * Type definitions for token-level streaming with partial results.
 */

import type { AIOpCode, AIOperationMeta } from "@ku0/core";

// ============================================================================
// Stream Configuration
// ============================================================================

/**
 * Configuration for streaming.
 */
export interface StreamConfig {
  /** Enable token-by-token streaming */
  tokenLevel: boolean;

  /** Enable partial tool results */
  partialResults: boolean;

  /** Backpressure configuration */
  backpressure: {
    /** Pause when buffer exceeds this size */
    highWaterMark: number;
    /** Resume when buffer drops below this */
    lowWaterMark: number;
  };

  /** Stream recovery configuration */
  recovery: {
    /** Enable recovery checkpoints */
    enabled: boolean;
    /** Save checkpoint every N tokens */
    checkpointInterval: number;
    /** Maximum checkpoints to keep */
    maxCheckpoints: number;
  };

  /** Heartbeat interval (ms) to keep connection alive */
  heartbeatInterval?: number;
}

/**
 * Default streaming configuration.
 */
export const DEFAULT_STREAM_CONFIG: StreamConfig = {
  tokenLevel: true,
  partialResults: true,
  backpressure: {
    highWaterMark: 1000,
    lowWaterMark: 100,
  },
  recovery: {
    enabled: true,
    checkpointInterval: 100,
    maxCheckpoints: 5,
  },
  heartbeatInterval: 30000,
};

// ============================================================================
// Stream Events
// ============================================================================

/**
 * Token streaming event.
 */
export interface TokenEvent {
  type: "token";
  token: string;
  index: number;
  timestamp: number;
  /** AI operation metadata (when token is part of AI edit flow) */
  aiMeta?: AIOperationMeta;
}

/**
 * Thinking/reasoning event.
 */
export interface ThinkingEvent {
  type: "thinking";
  content: string;
  step: number;
  visibility: "hidden" | "streaming" | "summary";
  timestamp: number;
}

/**
 * Tool execution start event.
 */
export interface ToolStartEvent {
  type: "tool:start";
  toolName: string;
  callId: string;
  arguments: Record<string, unknown>;
  timestamp: number;
}

/**
 * Tool progress event (partial results).
 */
export interface ToolProgressEvent {
  type: "tool:progress";
  callId: string;
  progress: number; // 0-100
  message?: string;
  partial?: unknown;
  timestamp: number;
}

/**
 * Tool completion event.
 */
export interface ToolEndEvent {
  type: "tool:end";
  callId: string;
  success: boolean;
  result?: unknown;
  error?: string;
  durationMs: number;
  timestamp: number;
}

/**
 * Error event.
 */
export interface StreamErrorEvent {
  type: "error";
  error: string;
  code?: string;
  recoverable: boolean;
  timestamp: number;
}

/**
 * Stream completion event.
 */
export interface DoneEvent {
  type: "done";
  summary: string;
  totalTokens: number;
  durationMs: number;
  timestamp: number;
}

/**
 * Heartbeat event for connection keepalive.
 */
export interface HeartbeatEvent {
  type: "heartbeat";
  timestamp: number;
}

/**
 * Checkpoint event for recovery.
 */
export interface CheckpointEvent {
  type: "checkpoint";
  checkpointId: string;
  tokenIndex: number;
  timestamp: number;
}

/**
 * Document edit event for LFCC integration.
 * Bridges runtime token streams to document-level operations.
 */
export interface DocumentEditEvent {
  type: "document:edit";
  /** AI operation code */
  opCode: AIOpCode;
  /** Target block ID */
  blockId: string;
  /** Content to apply */
  content: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Request identifier for AI envelope tracing */
  requestId?: string;
  /** AI operation metadata (LFCC v0.9.1) */
  aiMeta?: AIOperationMeta;
  /** Whether this is a partial (streaming) or final commit */
  partial: boolean;
  timestamp: number;
}

/**
 * All stream event types.
 */
export type StreamEvent =
  | TokenEvent
  | ThinkingEvent
  | ToolStartEvent
  | ToolProgressEvent
  | ToolEndEvent
  | StreamErrorEvent
  | DoneEvent
  | HeartbeatEvent
  | CheckpointEvent
  | DocumentEditEvent;

/**
 * Stream event type discriminator.
 */
export type StreamEventType = StreamEvent["type"];

// ============================================================================
// Stream Writer Interface
// ============================================================================

/**
 * Interface for writing stream events.
 */
export interface IStreamWriter {
  /** Write an event to the stream */
  write(event: StreamEvent): Promise<void>;

  /** Write a token */
  writeToken(token: string, aiMeta?: AIOperationMeta): Promise<void>;

  /** Write a thinking step */
  writeThinking(content: string, step: number): Promise<void>;

  /** Write tool start */
  writeToolStart(toolName: string, callId: string, args: Record<string, unknown>): Promise<void>;

  /** Write tool progress */
  writeToolProgress(callId: string, progress: number, partial?: unknown): Promise<void>;

  /** Write tool end */
  writeToolEnd(callId: string, success: boolean, result?: unknown, error?: string): Promise<void>;

  /** Write error */
  writeError(error: string, recoverable?: boolean): Promise<void>;

  /** Write completion */
  writeDone(summary: string): Promise<void>;

  /** Pause the stream (backpressure) */
  pause(): void;

  /** Resume the stream */
  resume(): void;

  /** Check if stream is paused */
  isPaused(): boolean;

  /** Create a checkpoint for recovery */
  checkpoint(): Promise<string>;

  /** Recover from a checkpoint */
  recover(checkpointId: string): Promise<void>;

  /** End the stream */
  end(): void;

  /** Check if stream has ended */
  isEnded(): boolean;
}

// ============================================================================
// Stream Reader Interface
// ============================================================================

/**
 * Interface for reading stream events.
 */
export interface IStreamReader {
  /** Read the next event */
  read(): Promise<StreamEvent | null>;

  /** Iterate over events */
  [Symbol.asyncIterator](): AsyncIterator<StreamEvent>;

  /** Cancel reading */
  cancel(): void;

  /** Check if reading is cancelled */
  isCancelled(): boolean;
}

// ============================================================================
// Stream State
// ============================================================================

/**
 * Current state of a stream.
 */
export interface StreamState {
  /** Stream ID */
  id: string;

  /** Current status */
  status: "active" | "paused" | "ended" | "error";

  /** Total tokens written */
  tokenCount: number;

  /** Current buffer size */
  bufferSize: number;

  /** Last checkpoint ID */
  lastCheckpointId?: string;

  /** Start timestamp */
  startedAt: number;

  /** End timestamp */
  endedAt?: number;

  /** Error if any */
  error?: string;
}

// ============================================================================
// Stream Checkpoint
// ============================================================================

/**
 * A stream checkpoint for recovery.
 */
export interface StreamCheckpoint {
  /** Checkpoint ID */
  id: string;

  /** Stream ID */
  streamId: string;

  /** Token index at checkpoint */
  tokenIndex: number;

  /** Accumulated content up to checkpoint */
  content: string;

  /** Pending tool calls at checkpoint */
  pendingToolCalls: string[];

  /** Creation timestamp */
  createdAt: number;

  /** Metadata */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Event Handlers
// ============================================================================

/**
 * Handler for stream events.
 */
export type StreamEventHandler = (event: StreamEvent) => void | Promise<void>;

/**
 * Handler for specific event types.
 */
export type TypedStreamEventHandler<T extends StreamEvent> = (event: T) => void | Promise<void>;

// ============================================================================
// Transform Types
// ============================================================================

/**
 * Transform function for stream events.
 */
export type StreamTransform = (event: StreamEvent) => StreamEvent | null;

/**
 * Filter function for stream events.
 */
export type StreamFilter = (event: StreamEvent) => boolean;

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Options for creating a stream.
 */
export interface CreateStreamOptions {
  /** Stream ID (auto-generated if not provided) */
  id?: string;

  /** Configuration */
  config?: Partial<StreamConfig>;

  /** Initial checkpoint to recover from */
  recoverFrom?: string;
}

/**
 * Stream statistics.
 */
export interface StreamStats {
  /** Total events written */
  eventsWritten: number;

  /** Events by type */
  eventsByType: Record<StreamEventType, number>;

  /** Total tokens */
  totalTokens: number;

  /** Tool calls count */
  toolCalls: number;

  /** Errors count */
  errors: number;

  /** Duration in ms */
  durationMs: number;

  /** Checkpoints created */
  checkpoints: number;

  /** Pauses due to backpressure */
  backpressurePauses: number;
}
