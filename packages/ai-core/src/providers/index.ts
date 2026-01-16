/**
 * AI Providers Module
 *
 * Unified LLM provider abstraction layer supporting multiple AI providers
 * (OpenAI, Anthropic) with automatic fallback, streaming, and metrics.
 */

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

// Base provider
export { BaseLLMProvider } from "./baseProvider";

// Provider implementations
export { OpenAIProvider, type OpenAIConfig } from "./openaiProvider";
export { AnthropicProvider, type AnthropicConfig } from "./anthropicProvider";
export { GeminiProvider, type GeminiConfig } from "./geminiProvider";
export {
  ResilientProvider,
  createResilientProvider,
  type ResilientProviderConfig,
} from "./resilientProvider";

// Router
export {
  ProviderRouter,
  createProviderRouter,
  type ProviderRouterConfig,
  type ProviderOperation,
  type ProviderCandidate,
  type ProviderSelector,
  type ProviderLogger,
  type ProviderRoutedResponse,
  type ProviderStreamChunk,
} from "./providerRouter";

// Token tracking
export {
  TokenTracker,
  type ModelPricing,
  type RateLimitConfig,
  type UsageRecord,
  type UsageSummary,
} from "./tokenTracker";
