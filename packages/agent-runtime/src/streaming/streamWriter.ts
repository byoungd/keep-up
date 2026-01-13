/**
 * Streaming Output System
 *
 * Provides enhanced streaming support for agent outputs, tool results,
 * and LLM responses with backpressure handling and transform capabilities.
 */

// ============================================================================
// Types
// ============================================================================

/** Stream chunk types */
export type StreamChunkType =
  | "text"
  | "tool_call"
  | "tool_result"
  | "thinking"
  | "progress"
  | "error"
  | "done"
  | "metadata";

/** Base stream chunk */
export interface StreamChunk<T = unknown> {
  /** Chunk type */
  type: StreamChunkType;

  /** Chunk payload */
  data: T;

  /** Timestamp */
  timestamp: number;

  /** Sequence number for ordering */
  sequence: number;

  /** Stream ID */
  streamId: string;
}

/** Text chunk data */
export interface TextChunkData {
  content: string;
  isPartial: boolean;
}

/** Tool call chunk data */
export interface ToolCallChunkData {
  callId: string;
  name: string;
  arguments: Record<string, unknown>;
}

/** Tool result chunk data */
export interface ToolResultChunkData {
  callId: string;
  name: string;
  result: unknown;
  success: boolean;
  durationMs: number;
}

/** Progress chunk data */
export interface ProgressChunkData {
  stage: string;
  message: string;
  percent?: number;
  current?: number;
  total?: number;
}

/** Error chunk data */
export interface ErrorChunkData {
  message: string;
  code?: string;
  recoverable: boolean;
}

/** Metadata chunk data */
export interface MetadataChunkData {
  key: string;
  value: unknown;
}

/** Stream options */
export interface StreamOptions {
  /** Buffer size before applying backpressure */
  bufferSize?: number;

  /** Whether to collect all chunks */
  collect?: boolean;

  /** Timeout for individual chunks (ms) */
  chunkTimeoutMs?: number;

  /** Transform function for chunks */
  transform?: (chunk: StreamChunk) => StreamChunk | null;

  /** Filter function for chunks */
  filter?: (chunk: StreamChunk) => boolean;
}

/** Stream statistics */
export interface StreamStats {
  chunksEmitted: number;
  chunksDropped: number;
  bytesEmitted: number;
  startTime: number;
  endTime?: number;
  durationMs?: number;
}

/** Stream metrics callbacks for observability */
export interface StreamMetrics {
  /** Called when a chunk is dropped due to backpressure */
  onChunkDropped?: (streamId: string, chunkType: StreamChunkType) => void;
  /** Called when buffer pressure changes (0-1 utilization ratio) */
  onBufferPressure?: (streamId: string, utilization: number) => void;
  /** Called when stream ends with final stats */
  onStreamEnd?: (streamId: string, stats: StreamStats) => void;
}

// ============================================================================
// Stream Writer
// ============================================================================

/**
 * Writes chunks to a stream with backpressure handling.
 */
export class StreamWriter {
  private readonly streamId: string;
  private readonly buffer: StreamChunk[] = [];
  private readonly bufferSize: number;
  private readonly metrics?: StreamMetrics;
  private sequence = 0;
  private closed = false;
  private stats: StreamStats;

  /** Subscribers waiting for chunks */
  private resolvers: Array<{
    resolve: (value: IteratorResult<StreamChunk>) => void;
    reject: (error: Error) => void;
  }> = [];

  constructor(streamId?: string, options: StreamOptions = {}, metrics?: StreamMetrics) {
    this.streamId = streamId ?? this.generateId();
    this.bufferSize = options.bufferSize ?? 100;
    this.metrics = metrics;
    this.stats = {
      chunksEmitted: 0,
      chunksDropped: 0,
      bytesEmitted: 0,
      startTime: Date.now(),
    };
  }

  /**
   * Write a text chunk.
   */
  writeText(content: string, isPartial = true): void {
    this.write<TextChunkData>("text", { content, isPartial });
  }

  /**
   * Write a tool call chunk.
   */
  writeToolCall(callId: string, name: string, args: Record<string, unknown>): void {
    this.write<ToolCallChunkData>("tool_call", {
      callId,
      name,
      arguments: args,
    });
  }

  /**
   * Write a tool result chunk.
   */
  writeToolResult(
    callId: string,
    name: string,
    result: unknown,
    success: boolean,
    durationMs: number
  ): void {
    this.write<ToolResultChunkData>("tool_result", {
      callId,
      name,
      result,
      success,
      durationMs,
    });
  }

  /**
   * Write a progress update.
   */
  writeProgress(
    stage: string,
    message: string,
    options?: { percent?: number; current?: number; total?: number }
  ): void {
    this.write<ProgressChunkData>("progress", {
      stage,
      message,
      ...options,
    });
  }

  /**
   * Write a thinking/reasoning chunk.
   */
  writeThinking(content: string): void {
    this.write<TextChunkData>("thinking", { content, isPartial: false });
  }

  /**
   * Write an error chunk.
   */
  writeError(message: string, code?: string, recoverable = false): void {
    this.write<ErrorChunkData>("error", { message, code, recoverable });
  }

  /**
   * Write metadata.
   */
  writeMetadata(key: string, value: unknown): void {
    this.write<MetadataChunkData>("metadata", { key, value });
  }

  /**
   * Write a generic chunk.
   */
  write<T>(type: StreamChunkType, data: T): void {
    if (this.closed) {
      throw new Error("Stream is closed");
    }

    const chunk: StreamChunk<T> = {
      type,
      data,
      timestamp: Date.now(),
      sequence: this.sequence++,
      streamId: this.streamId,
    };

    // Update stats
    this.stats.chunksEmitted++;
    this.stats.bytesEmitted += JSON.stringify(data).length;

    // If there are waiting readers, deliver directly
    if (this.resolvers.length > 0) {
      const resolver = this.resolvers.shift();
      resolver?.resolve({ value: chunk, done: false });
      return;
    }

    // Otherwise buffer (with backpressure)
    if (this.buffer.length >= this.bufferSize) {
      // Drop oldest chunk
      const droppedChunk = this.buffer.shift();
      this.stats.chunksDropped++;
      // Emit metrics for dropped chunk
      if (droppedChunk) {
        this.metrics?.onChunkDropped?.(this.streamId, droppedChunk.type);
      }
    }

    this.buffer.push(chunk);

    // Emit buffer pressure metric
    const utilization = this.buffer.length / this.bufferSize;
    if (this.metrics?.onBufferPressure && utilization > 0.5) {
      this.metrics.onBufferPressure(this.streamId, utilization);
    }
  }

  /**
   * Close the stream.
   */
  close(): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.stats.endTime = Date.now();
    this.stats.durationMs = this.stats.endTime - this.stats.startTime;

    // Write done chunk
    const doneChunk: StreamChunk = {
      type: "done",
      data: { stats: this.stats },
      timestamp: Date.now(),
      sequence: this.sequence++,
      streamId: this.streamId,
    };
    this.buffer.push(doneChunk);

    // Resolve all waiting readers
    for (const resolver of this.resolvers) {
      const chunk = this.buffer.shift();
      if (chunk) {
        resolver.resolve({ value: chunk, done: false });
      } else {
        resolver.resolve({ value: undefined, done: true });
      }
    }
    this.resolvers = [];

    // Emit final stream metrics
    this.metrics?.onStreamEnd?.(this.streamId, this.stats);
  }

  /**
   * Get stream ID.
   */
  get id(): string {
    return this.streamId;
  }

  /**
   * Check if closed.
   */
  get isClosed(): boolean {
    return this.closed;
  }

  /**
   * Get current stats.
   */
  getStats(): StreamStats {
    return { ...this.stats };
  }

  /**
   * Create async iterator for reading.
   */
  [Symbol.asyncIterator](): AsyncIterator<StreamChunk> {
    return {
      next: () => this.read(),
    };
  }

  /**
   * Read the next chunk.
   */
  private read(): Promise<IteratorResult<StreamChunk>> {
    // Return buffered chunk if available
    if (this.buffer.length > 0) {
      const chunk = this.buffer.shift();
      if (!chunk) {
        return Promise.resolve({ value: undefined, done: true });
      }
      if (chunk?.type === "done") {
        return Promise.resolve({ value: chunk, done: false });
      }
      return Promise.resolve({ value: chunk, done: false });
    }

    // Stream closed and buffer empty
    if (this.closed) {
      return Promise.resolve({ value: undefined, done: true });
    }

    // Wait for next chunk
    return new Promise((resolve, reject) => {
      this.resolvers.push({ resolve, reject });
    });
  }

  private generateId(): string {
    return `stream_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  }
}

// ============================================================================
// Stream Reader Utilities
// ============================================================================

/**
 * Collect all chunks from a stream.
 */
export async function collectStream(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
    if (chunk.type === "done") {
      break;
    }
  }
  return chunks;
}

/**
 * Collect text content from a stream.
 */
export async function collectText(stream: AsyncIterable<StreamChunk>): Promise<string> {
  const parts: string[] = [];
  for await (const chunk of stream) {
    if (chunk.type === "text") {
      const data = chunk.data as TextChunkData;
      parts.push(data.content);
    }
    if (chunk.type === "done") {
      break;
    }
  }
  return parts.join("");
}

/**
 * Transform a stream.
 */
export async function* transformStream(
  stream: AsyncIterable<StreamChunk>,
  transformer: (chunk: StreamChunk) => StreamChunk | null
): AsyncGenerator<StreamChunk> {
  for await (const chunk of stream) {
    const transformed = transformer(chunk);
    if (transformed) {
      yield transformed;
    }
    if (chunk.type === "done") {
      break;
    }
  }
}

/**
 * Filter a stream.
 */
export async function* filterStream(
  stream: AsyncIterable<StreamChunk>,
  predicate: (chunk: StreamChunk) => boolean
): AsyncGenerator<StreamChunk> {
  for await (const chunk of stream) {
    if (predicate(chunk) || chunk.type === "done") {
      yield chunk;
    }
    if (chunk.type === "done") {
      break;
    }
  }
}

/**
 * Merge multiple streams.
 */
export async function* mergeStreams(
  ...streams: AsyncIterable<StreamChunk>[]
): AsyncGenerator<StreamChunk> {
  // Create iterators
  const iterators = streams.map((s) => s[Symbol.asyncIterator]());
  const pending = new Map<
    number,
    Promise<{ index: number; result: IteratorResult<StreamChunk> }>
  >();

  // Initialize all streams
  for (let i = 0; i < iterators.length; i++) {
    pending.set(
      i,
      iterators[i].next().then((result) => ({ index: i, result }))
    );
  }

  let doneCount = 0;

  while (doneCount < iterators.length) {
    // Wait for any stream to produce
    const { index, result } = await Promise.race(pending.values());

    if (result.done) {
      pending.delete(index);
      doneCount++;
    } else {
      yield result.value;

      // Don't continue if this was a done chunk
      if (result.value.type === "done") {
        pending.delete(index);
        doneCount++;
      } else {
        // Queue next read
        pending.set(
          index,
          iterators[index].next().then((r) => ({ index, result: r }))
        );
      }
    }
  }
}

/**
 * Add timeout to stream iteration.
 */
export async function* withStreamTimeout(
  stream: AsyncIterable<StreamChunk>,
  timeoutMs: number
): AsyncGenerator<StreamChunk> {
  const iterator = stream[Symbol.asyncIterator]();

  while (true) {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Stream timeout")), timeoutMs);
    });

    const result = await Promise.race([iterator.next(), timeoutPromise]);

    if (result.done) {
      break;
    }
    yield result.value;
    if (result.value.type === "done") {
      break;
    }
  }
}

// ============================================================================
// Stream Callbacks
// ============================================================================

/** Stream event callbacks */
export interface StreamCallbacks {
  onText?: (content: string, isPartial: boolean) => void;
  onToolCall?: (callId: string, name: string, args: Record<string, unknown>) => void;
  onToolResult?: (callId: string, name: string, result: unknown, success: boolean) => void;
  onProgress?: (stage: string, message: string, percent?: number) => void;
  onThinking?: (content: string) => void;
  onError?: (message: string, code?: string, recoverable?: boolean) => void;
  onDone?: (stats: StreamStats) => void;
}

/**
 * Process a stream with callbacks.
 */
export async function processStreamWithCallbacks(
  stream: AsyncIterable<StreamChunk>,
  callbacks: StreamCallbacks
): Promise<void> {
  for await (const chunk of stream) {
    switch (chunk.type) {
      case "text": {
        const data = chunk.data as TextChunkData;
        callbacks.onText?.(data.content, data.isPartial);
        break;
      }
      case "tool_call": {
        const data = chunk.data as ToolCallChunkData;
        callbacks.onToolCall?.(data.callId, data.name, data.arguments);
        break;
      }
      case "tool_result": {
        const data = chunk.data as ToolResultChunkData;
        callbacks.onToolResult?.(data.callId, data.name, data.result, data.success);
        break;
      }
      case "progress": {
        const data = chunk.data as ProgressChunkData;
        callbacks.onProgress?.(data.stage, data.message, data.percent);
        break;
      }
      case "thinking": {
        const data = chunk.data as TextChunkData;
        callbacks.onThinking?.(data.content);
        break;
      }
      case "error": {
        const data = chunk.data as ErrorChunkData;
        callbacks.onError?.(data.message, data.code, data.recoverable);
        break;
      }
      case "done": {
        const data = chunk.data as { stats: StreamStats };
        callbacks.onDone?.(data.stats);
        break;
      }
    }

    if (chunk.type === "done") {
      break;
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a stream writer.
 * @param streamId Optional stream identifier
 * @param options Stream configuration options
 * @param metrics Optional metrics callbacks for observability
 */
export function createStreamWriter(
  streamId?: string,
  options?: StreamOptions,
  metrics?: StreamMetrics
): StreamWriter {
  return new StreamWriter(streamId, options, metrics);
}
