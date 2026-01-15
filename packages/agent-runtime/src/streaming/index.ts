/**
 * Streaming Module
 *
 * Provides enhanced streaming support for agent outputs.
 * Includes token-level streaming with backpressure and recovery.
 */

// Legacy stream writer (for backward compatibility)
export {
  StreamWriter,
  createStreamWriter,
  collectStream,
  collectText,
  transformStream,
  filterStream,
  mergeStreams,
  withStreamTimeout,
  processStreamWithCallbacks,
  type StreamChunkType,
  type StreamChunk,
  type TextChunkData,
  type ToolCallChunkData,
  type ToolResultChunkData,
  type ProgressChunkData,
  type ErrorChunkData,
  type MetadataChunkData,
  type StreamOptions,
  type StreamStats as LegacyStreamStats,
  type StreamCallbacks,
  type StreamMetrics,
} from "./streamWriter";

// New enhanced types
export type {
  CheckpointEvent,
  CreateStreamOptions,
  DoneEvent,
  HeartbeatEvent,
  IStreamReader,
  IStreamWriter,
  StreamCheckpoint,
  StreamConfig,
  StreamErrorEvent,
  StreamEvent,
  StreamEventHandler,
  StreamEventType,
  StreamFilter,
  StreamState,
  StreamStats,
  StreamTransform,
  ThinkingEvent,
  TokenEvent,
  ToolEndEvent,
  ToolProgressEvent,
  ToolStartEvent,
  TypedStreamEventHandler,
} from "./types";

export { DEFAULT_STREAM_CONFIG } from "./types";

// Token streamer
export {
  TokenStreamReader,
  TokenStreamWriter,
  createStreamPair,
  createTokenStreamReader,
  createTokenStreamWriter,
} from "./tokenStreamer";

// Streaming Cache
export {
  StreamingCache,
  createStreamingCache,
  type IStreamingCache,
  type StreamingCacheConfig,
  type StreamingCacheStats,
} from "./streamingCache";
