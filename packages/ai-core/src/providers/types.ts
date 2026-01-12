/**
 * LLM Provider Types
 *
 * Core type definitions for the AI Gateway's provider abstraction layer.
 * Supports multiple LLM providers (OpenAI, Anthropic, local models) with
 * unified interface for completion, streaming, and embeddings.
 */

/** Message role in conversation */
export type MessageRole = "system" | "user" | "assistant";

/** Chat message */
export interface Message {
  /** Message role */
  role: MessageRole;
  /** Message content */
  content: string;
}

/** Tool definition for function calling */
export interface Tool {
  /** Tool name */
  name: string;
  /** Tool description */
  description: string;
  /** JSON Schema for parameters */
  parameters: Record<string, unknown>;
}

/** Tool call from LLM */
export interface ToolCall {
  /** Tool call ID */
  id: string;
  /** Tool name */
  name: string;
  /** Arguments as JSON string */
  arguments: string;
}

/** Token usage statistics */
export interface TokenUsage {
  /** Input/prompt tokens */
  inputTokens: number;
  /** Output/completion tokens */
  outputTokens: number;
  /** Total tokens */
  totalTokens: number;
}

/** Completion request to LLM */
export interface CompletionRequest {
  /** Model identifier */
  model: string;
  /** Conversation messages */
  messages: Message[];
  /** Temperature (0-2, default 1) */
  temperature?: number;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Stop sequences */
  stopSequences?: string[];
  /** Tools for function calling */
  tools?: Tool[];
  /** Top-p sampling */
  topP?: number;
  /** Request timeout in ms */
  timeoutMs?: number;
  /** Optional abort signal for cancellation */
  signal?: AbortSignal;
}

/** Completion response from LLM */
export interface CompletionResponse {
  /** Generated content */
  content: string;
  /** Tool calls (if any) */
  toolCalls?: ToolCall[];
  /** Token usage */
  usage: TokenUsage;
  /** Finish reason */
  finishReason: "stop" | "length" | "tool_calls" | "content_filter" | "error";
  /** Model used */
  model: string;
  /** Response latency in ms */
  latencyMs: number;
}

/** Stream chunk types */
export type StreamChunkType = "content" | "tool_call" | "usage" | "done" | "error";

/** Stream chunk from LLM */
export interface StreamChunk {
  /** Chunk type */
  type: StreamChunkType;
  /** Content delta (for content type) */
  content?: string;
  /** Tool call delta (for tool_call type) */
  toolCall?: Partial<ToolCall>;
  /** Usage (for usage/done type) */
  usage?: TokenUsage;
  /** Error message (for error type) */
  error?: string;
  /** Finish reason (for done type) */
  finishReason?: CompletionResponse["finishReason"];
}

/** Provider health status */
export interface ProviderHealth {
  /** Whether provider is healthy */
  healthy: boolean;
  /** Last check timestamp */
  lastCheckAt: number;
  /** Error message if unhealthy */
  error?: string;
  /** Average latency in ms */
  avgLatencyMs?: number;
}

/** Provider metrics */
export interface ProviderMetrics {
  /** Provider name */
  provider: string;
  /** Total requests */
  totalRequests: number;
  /** Successful requests */
  successfulRequests: number;
  /** Failed requests */
  failedRequests: number;
  /** Total input tokens */
  totalInputTokens: number;
  /** Total output tokens */
  totalOutputTokens: number;
  /** Average latency in ms */
  avgLatencyMs: number;
  /** Last request timestamp */
  lastRequestAt: number;
}

/** Embedding request */
export interface EmbeddingRequest {
  /** Model identifier */
  model: string;
  /** Texts to embed */
  texts: string[];
  /** Dimensions (if supported) */
  dimensions?: number;
  /** Optional abort signal for cancellation */
  signal?: AbortSignal;
}

/** Embedding response */
export interface EmbeddingResponse {
  /** Embeddings for each text */
  embeddings: number[][];
  /** Token usage */
  usage: TokenUsage;
  /** Model used */
  model: string;
  /** Whether response came from cache */
  cached?: boolean;
}

/**
 * LLM Provider Interface
 *
 * Unified interface for all LLM providers (OpenAI, Anthropic, etc.)
 */
export interface LLMProvider {
  /** Provider name */
  readonly name: string;

  /** Supported models */
  readonly models: string[];

  /** Default model */
  readonly defaultModel: string;

  /**
   * Generate a completion (non-streaming).
   */
  complete(request: CompletionRequest): Promise<CompletionResponse>;

  /**
   * Generate a streaming completion.
   * Returns an async iterable of stream chunks.
   */
  stream(request: CompletionRequest): AsyncIterable<StreamChunk>;

  /**
   * Generate embeddings for texts.
   */
  embed(request: EmbeddingRequest): Promise<EmbeddingResponse>;

  /**
   * Check provider health.
   */
  healthCheck(): Promise<ProviderHealth>;

  /**
   * Get provider metrics.
   */
  getMetrics(): ProviderMetrics;

  /**
   * Reset provider metrics.
   */
  resetMetrics(): void;
}

/** Provider configuration base */
export interface ProviderConfig {
  /** API key */
  apiKey: string;
  /** Base URL override */
  baseUrl?: string;
  /** Default timeout in ms */
  timeoutMs?: number;
  /** Maximum retries */
  maxRetries?: number;
  /** Organization ID (for OpenAI) */
  organizationId?: string;
}

/** Provider factory function */
export type ProviderFactory = (config: ProviderConfig) => LLMProvider;
