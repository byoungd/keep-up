/**
 * AI Providers Module
 *
 * Unified LLM provider abstraction layer supporting multiple AI providers
 * (OpenAI, Anthropic, Google) with automatic fallback, streaming, and metrics.
 *
 * ## 2026 Standard
 *
 * Use the Vercel AI SDK adapters for new development:
 * - `createOpenAIAdapter` (recommended)
 * - `createAnthropicAdapter` (recommended)
 * - `createGoogleAdapter` (recommended)
 *
 * Legacy providers (OpenAIProvider, AnthropicProvider, GeminiProvider) are
 * deprecated and will be removed in a future version.
 */

// Re-export pricing type from models catalog
export type { ModelPricing } from "../catalog/models";
// ============================================================================
// Model Fabric Provider (Rust)
// ============================================================================
export {
  createModelFabricProvider,
  ModelFabricProvider,
  type ModelFabricProviderConfig,
} from "./modelFabricProvider";
// ============================================================================
// Vercel AI SDK Adapters (Recommended)
// ============================================================================
export {
  createAnthropicAdapter,
  createGoogleAdapter,
  createOpenAIAdapter,
  VercelAIAdapter,
  type VercelAIAdapterConfig,
  type VercelProviderType,
} from "./vercelAdapter";

// ============================================================================
// Legacy Providers (Deprecated)
// ============================================================================

/**
 * @deprecated Use `createAnthropicAdapter` from Vercel AI SDK instead.
 */
export { type AnthropicConfig, AnthropicProvider } from "./anthropicProvider";
// Base provider
export { BaseLLMProvider } from "./baseProvider";
/**
 * @deprecated Use `createGoogleAdapter` from Vercel AI SDK instead.
 */
export { type GeminiConfig, GeminiProvider } from "./geminiProvider";
/**
 * @deprecated Use `createOpenAIAdapter` from Vercel AI SDK instead.
 */
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
