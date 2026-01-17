/**
 * Streaming Module
 *
 * Provides enhanced streaming support for agent outputs.
 * Includes token-level streaming with backpressure and recovery.
 */

// Runtime event bridge
export {
  attachRuntimeEventStreamBridge,
  type RuntimeEventStreamBridgeConfig,
} from "./runtimeEventBridge";
// Streaming Cache
export {
  createStreamingCache,
  type IStreamingCache,
  StreamingCache,
  type StreamingCacheConfig,
  type StreamingCacheStats,
} from "./streamingCache";
// Legacy stream writer (for backward compatibility)
export {
  collectStream,
  collectText,
  createStreamWriter,
  type ErrorChunkData,
  filterStream,
  type MetadataChunkData,
  mergeStreams,
  type ProgressChunkData,
  processStreamWithCallbacks,
  type StreamCallbacks,
  type StreamChunk,
  type StreamChunkType,
  type StreamMetrics,
  type StreamOptions,
  type StreamStats as LegacyStreamStats,
  StreamWriter,
  type TextChunkData,
  type ToolCallChunkData,
  type ToolResultChunkData,
  transformStream,
  withStreamTimeout,
} from "./streamWriter";

// Token streamer
export {
  createStreamPair,
  createTokenStreamReader,
  createTokenStreamWriter,
  TokenStreamReader,
  TokenStreamWriter,
} from "./tokenStreamer";
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
