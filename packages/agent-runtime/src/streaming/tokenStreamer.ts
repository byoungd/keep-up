/**
 * Token Streamer Implementation
 *
 * Implements token-level streaming with backpressure and checkpoints.
 */

import type { AIOperationMeta } from "@keepup/core";
import type {
  CreateStreamOptions,
  IStreamReader,
  IStreamWriter,
  StreamCheckpoint,
  StreamConfig,
  StreamEvent,
  StreamEventHandler,
  StreamEventType,
  StreamState,
  StreamStats,
} from "./types";
import { DEFAULT_STREAM_CONFIG } from "./types";

// ============================================================================
// Stream Writer
// ============================================================================

/**
 * Token-level stream writer with backpressure support.
 */
export class TokenStreamWriter implements IStreamWriter {
  private readonly config: StreamConfig;
  private readonly id: string;
  private readonly buffer: StreamEvent[] = [];
  private readonly handlers = new Set<StreamEventHandler>();
  private readonly checkpoints = new Map<string, StreamCheckpoint>();

  private state: StreamState;
  private tokenIndex = 0;
  private accumulatedContent = "";
  private pendingToolCalls = new Set<string>();
  private heartbeatTimer?: ReturnType<typeof setInterval>;
  private stats: StreamStats;
  private toolStartTimes = new Map<string, number>();

  constructor(options: CreateStreamOptions = {}) {
    this.id = options.id ?? generateStreamId();
    this.config = { ...DEFAULT_STREAM_CONFIG, ...options.config };

    this.state = {
      id: this.id,
      status: "active",
      tokenCount: 0,
      bufferSize: 0,
      startedAt: Date.now(),
    };

    this.stats = {
      eventsWritten: 0,
      eventsByType: {} as Record<StreamEventType, number>,
      totalTokens: 0,
      toolCalls: 0,
      errors: 0,
      durationMs: 0,
      checkpoints: 0,
      backpressurePauses: 0,
    };

    // Start heartbeat if configured
    if (this.config.heartbeatInterval) {
      this.heartbeatTimer = setInterval(() => {
        if (this.state.status === "active") {
          this.writeHeartbeat();
        }
      }, this.config.heartbeatInterval);
    }
  }

  /**
   * Write an event to the stream.
   */
  async write(event: StreamEvent): Promise<void> {
    if (this.state.status === "ended") {
      throw new Error("Cannot write to ended stream");
    }

    // Track stats
    this.stats.eventsWritten++;
    const eventType = event.type;
    this.stats.eventsByType[eventType] = (this.stats.eventsByType[eventType] ?? 0) + 1;

    // Handle backpressure
    if (this.state.status === "paused") {
      this.buffer.push(event);
      this.state.bufferSize = this.buffer.length;

      if (this.buffer.length > this.config.backpressure.highWaterMark * 2) {
        throw new Error("Buffer overflow: stream paused too long");
      }
      return;
    }

    // Add to buffer
    this.buffer.push(event);
    this.state.bufferSize = this.buffer.length;

    // Check backpressure
    if (this.buffer.length >= this.config.backpressure.highWaterMark) {
      this.pause();
      this.stats.backpressurePauses++;
    }

    // Emit to handlers
    await this.emit(event);

    // Auto-checkpoint if needed
    if (
      this.config.recovery.enabled &&
      event.type === "token" &&
      this.tokenIndex % this.config.recovery.checkpointInterval === 0
    ) {
      await this.checkpoint();
    }
  }

  /**
   * Write a token.
   */
  async writeToken(token: string, aiMeta?: AIOperationMeta): Promise<void> {
    this.tokenIndex++;
    this.accumulatedContent += token;
    this.state.tokenCount = this.tokenIndex;
    this.stats.totalTokens++;

    await this.write({
      type: "token",
      token,
      index: this.tokenIndex,
      timestamp: Date.now(),
      aiMeta,
    });
  }

  /**
   * Write a thinking step.
   */
  async writeThinking(content: string, step: number): Promise<void> {
    await this.write({
      type: "thinking",
      content,
      step,
      visibility: "streaming",
      timestamp: Date.now(),
    });
  }

  /**
   * Write tool start.
   */
  async writeToolStart(
    toolName: string,
    callId: string,
    args: Record<string, unknown>
  ): Promise<void> {
    this.pendingToolCalls.add(callId);
    this.toolStartTimes.set(callId, Date.now());
    this.stats.toolCalls++;

    await this.write({
      type: "tool:start",
      toolName,
      callId,
      arguments: args,
      timestamp: Date.now(),
    });
  }

  /**
   * Write tool progress.
   */
  async writeToolProgress(callId: string, progress: number, partial?: unknown): Promise<void> {
    await this.write({
      type: "tool:progress",
      callId,
      progress: Math.min(100, Math.max(0, progress)),
      partial,
      timestamp: Date.now(),
    });
  }

  /**
   * Write tool end.
   */
  async writeToolEnd(
    callId: string,
    success: boolean,
    result?: unknown,
    error?: string
  ): Promise<void> {
    this.pendingToolCalls.delete(callId);
    const startTime = this.toolStartTimes.get(callId) ?? Date.now();
    this.toolStartTimes.delete(callId);

    await this.write({
      type: "tool:end",
      callId,
      success,
      result,
      error,
      durationMs: Date.now() - startTime,
      timestamp: Date.now(),
    });
  }

  /**
   * Write error.
   */
  async writeError(error: string, recoverable = true): Promise<void> {
    this.stats.errors++;

    if (!recoverable) {
      this.state.status = "error";
      this.state.error = error;
    }

    await this.write({
      type: "error",
      error,
      recoverable,
      timestamp: Date.now(),
    });
  }

  /**
   * Write completion.
   */
  async writeDone(summary: string): Promise<void> {
    this.stats.durationMs = Date.now() - this.state.startedAt;

    await this.write({
      type: "done",
      summary,
      totalTokens: this.stats.totalTokens,
      durationMs: this.stats.durationMs,
      timestamp: Date.now(),
    });

    this.end();
  }

  /**
   * Pause the stream.
   */
  pause(): void {
    if (this.state.status === "active") {
      this.state.status = "paused";
    }
  }

  /**
   * Resume the stream.
   */
  resume(): void {
    if (this.state.status === "paused") {
      this.state.status = "active";

      // Drain buffer
      this.drainBuffer();
    }
  }

  /**
   * Check if paused.
   */
  isPaused(): boolean {
    return this.state.status === "paused";
  }

  /**
   * Create a checkpoint.
   */
  async checkpoint(): Promise<string> {
    const checkpointId = `ckpt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

    const checkpoint: StreamCheckpoint = {
      id: checkpointId,
      streamId: this.id,
      tokenIndex: this.tokenIndex,
      content: this.accumulatedContent,
      pendingToolCalls: Array.from(this.pendingToolCalls),
      createdAt: Date.now(),
    };

    this.checkpoints.set(checkpointId, checkpoint);
    this.state.lastCheckpointId = checkpointId;
    this.stats.checkpoints++;

    // Enforce max checkpoints
    if (this.checkpoints.size > this.config.recovery.maxCheckpoints) {
      const oldest = Array.from(this.checkpoints.keys())[0];
      if (oldest) {
        this.checkpoints.delete(oldest);
      }
    }

    await this.write({
      type: "checkpoint",
      checkpointId,
      tokenIndex: this.tokenIndex,
      timestamp: Date.now(),
    });

    return checkpointId;
  }

  /**
   * Recover from a checkpoint.
   */
  async recover(checkpointId: string): Promise<void> {
    const checkpoint = this.checkpoints.get(checkpointId);
    if (!checkpoint) {
      throw new Error(`Checkpoint ${checkpointId} not found`);
    }

    // Restore state
    this.tokenIndex = checkpoint.tokenIndex;
    this.accumulatedContent = checkpoint.content;
    this.pendingToolCalls = new Set(checkpoint.pendingToolCalls);
    this.state.tokenCount = checkpoint.tokenIndex;
    this.state.status = "active";
  }

  /**
   * End the stream.
   */
  end(): void {
    this.state.status = "ended";
    this.state.endedAt = Date.now();
    this.stats.durationMs = this.state.endedAt - this.state.startedAt;

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
  }

  /**
   * Check if ended.
   */
  isEnded(): boolean {
    return this.state.status === "ended";
  }

  /**
   * Subscribe to stream events.
   */
  onEvent(handler: StreamEventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  /**
   * Get stream state.
   */
  getState(): StreamState {
    return { ...this.state };
  }

  /**
   * Get stream statistics.
   */
  getStats(): StreamStats {
    return { ...this.stats };
  }

  /**
   * Get accumulated content.
   */
  getContent(): string {
    return this.accumulatedContent;
  }

  /**
   * Get stream ID.
   */
  getId(): string {
    return this.id;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async emit(event: StreamEvent): Promise<void> {
    for (const handler of this.handlers) {
      try {
        await handler(event);
      } catch {
        // Don't let handler errors break the stream
      }
    }
  }

  private async drainBuffer(): Promise<void> {
    while (this.buffer.length > 0 && this.state.status === "active") {
      const event = this.buffer.shift();
      if (event) {
        await this.emit(event);
      }
      if (this.buffer.length <= this.config.backpressure.lowWaterMark) {
        break;
      }
    }

    this.state.bufferSize = this.buffer.length;
  }

  private writeHeartbeat(): void {
    this.emit({
      type: "heartbeat",
      timestamp: Date.now(),
    });
  }
}

// ============================================================================
// Stream Reader
// ============================================================================

/**
 * Stream reader for consuming events.
 */
export class TokenStreamReader implements IStreamReader {
  private readonly queue: StreamEvent[] = [];
  private readonly resolvers: Array<(event: StreamEvent | null) => void> = [];
  private cancelled = false;
  private ended = false;

  /**
   * Push an event to the reader.
   */
  push(event: StreamEvent): void {
    if (this.cancelled || this.ended) {
      return;
    }

    if (event.type === "done") {
      this.ended = true;
    }

    if (this.resolvers.length > 0) {
      const resolver = this.resolvers.shift();
      resolver?.(event);
    } else {
      this.queue.push(event);
    }
  }

  /**
   * Read the next event.
   */
  async read(): Promise<StreamEvent | null> {
    if (this.cancelled) {
      return null;
    }

    if (this.queue.length > 0) {
      return this.queue.shift() ?? null;
    }

    if (this.ended) {
      return null;
    }

    return new Promise((resolve) => {
      this.resolvers.push(resolve);
    });
  }

  /**
   * Iterate over events.
   */
  async *[Symbol.asyncIterator](): AsyncIterator<StreamEvent> {
    while (!this.cancelled && !this.ended) {
      const event = await this.read();
      if (event === null) {
        break;
      }
      yield event;
    }
  }

  /**
   * Cancel reading.
   */
  cancel(): void {
    this.cancelled = true;

    // Resolve any pending reads
    for (const resolver of this.resolvers) {
      resolver(null);
    }
    this.resolvers.length = 0;
  }

  /**
   * Check if cancelled.
   */
  isCancelled(): boolean {
    return this.cancelled;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

function generateStreamId(): string {
  return `stream-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Create a token stream writer.
 */
export function createTokenStreamWriter(options?: CreateStreamOptions): TokenStreamWriter {
  return new TokenStreamWriter(options);
}

/**
 * Create a token stream reader.
 */
export function createTokenStreamReader(): TokenStreamReader {
  return new TokenStreamReader();
}

/**
 * Create a connected writer-reader pair.
 */
export function createStreamPair(options?: CreateStreamOptions): {
  writer: TokenStreamWriter;
  reader: TokenStreamReader;
} {
  const writer = new TokenStreamWriter(options);
  const reader = new TokenStreamReader();

  writer.onEvent((event) => {
    reader.push(event);
  });

  return { writer, reader };
}
