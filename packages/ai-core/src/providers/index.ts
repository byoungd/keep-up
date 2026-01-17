/**
 * AI Providers Module
 *
 * Unified LLM provider abstraction layer supporting multiple AI providers
 * (OpenAI, Anthropic) with automatic fallback, streaming, and metrics.
 */

// Re-export pricing type from models catalog
export type { ModelPricing } from "../catalog/models";
export { type AnthropicConfig, AnthropicProvider } from "./anthropicProvider";
// Base provider
export { BaseLLMProvider } from "./baseProvider";
export { type GeminiConfig, GeminiProvider } from "./geminiProvider";
// Provider implementations
export { type OpenAIConfig, OpenAIProvider } from "./openaiProvider";
// Router
export {
  createProviderRouter,
  type ProviderCandidate,
  type ProviderLogger,
  type ProviderOperation,
  type ProviderRoutedResponse,
  ProviderRouter,
  type ProviderRouterConfig,
  type ProviderSelector,
  type ProviderStreamChunk,
} from "./providerRouter";
export {
  createResilientProvider,
  ResilientProvider,
  type ResilientProviderConfig,
} from "./resilientProvider";
// Token tracking
export {
  type RateLimitConfig,
  TokenTracker,
  type UsageRecord,
  type UsageSummary,
} from "./tokenTracker";
// Types
export type {
  CompletionRequest,
  CompletionResponse,
  EmbeddingRequest,
  EmbeddingResponse,
  LLMProvider,
  Message,
  MessageRole,
  ProviderConfig,
  ProviderHealth,
  ProviderMetrics,
  StreamChunk,
  StreamChunkType,
  TokenUsage,
  Tool,
  ToolCall,
} from "./types";
