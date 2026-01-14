/**
 * AI Module
 *
 * Exports for AI Gateway, providers, and suggestion functionality.
 *
 * Core infrastructure is now provided by @ku0/ai-core.
 * This module re-exports ai-core for backward compatibility
 * and adds business-specific modules (gateway, rag, safety, extraction).
 */

// ============================================================================
// Re-export from @ku0/ai-core (Core Infrastructure)
// ============================================================================

// Providers
export {
  // Types
  type CompletionRequest,
  type CompletionResponse,
  type EmbeddingRequest,
  type EmbeddingResponse,
  type LLMProvider,
  type Message,
  type MessageRole,
  type ProviderConfig,
  type ProviderHealth,
  type ProviderMetrics,
  type StreamChunk,
  type StreamChunkType,
  type TokenUsage,
  type Tool,
  type ToolCall,
  // Base
  BaseLLMProvider,
  // Implementations
  OpenAIProvider,
  type OpenAIConfig,
  AnthropicProvider,
  type AnthropicConfig,
  ResilientProvider,
  createResilientProvider,
  type ResilientProviderConfig,
  // Router
  ProviderRouter,
  createProviderRouter,
  type ProviderRouterConfig,
  type ProviderOperation,
  type ProviderCandidate,
  type ProviderSelector,
  type ProviderLogger,
  // Token tracking
  TokenTracker,
  type ModelPricing,
  type RateLimitConfig,
  type UsageRecord,
  type UsageSummary,
} from "@ku0/ai-core";

// Context management
export {
  // Types
  type BuiltContext,
  type ContextSegment,
  type ContextSegmentType,
  type ContextWindowConfig,
  type DocumentContextOptions,
  type HistoryEntry,
  type ModelContextLimits,
  type TokenBudget,
  type DocumentContext,
  type DocumentContextBuilderConfig,
  type TokenEstimateOptions,
  // Constants
  DEFAULT_CONTEXT_LIMITS,
  MODEL_CONTEXT_LIMITS,
  SEGMENT_PRIORITY,
  // Classes
  ContextWindowManager,
  DocumentContextBuilder,
  // Factory functions
  createContextManager,
  createDocumentContextBuilder,
  // Utilities
  estimateTokens,
  estimateMessagesTokens,
  truncateToTokens,
  splitIntoChunks,
} from "@ku0/ai-core";

// Resilience (Circuit Breaker, Queue, Errors, Observability)
export {
  // Circuit Breaker
  CircuitBreaker,
  CircuitBreakerOpenError,
  type CircuitBreakerConfig,
  type CircuitBreakerMetrics,
  type CircuitState,
  createCircuitBreaker,
  // Request Queue
  RequestQueue,
  QueueFullError,
  RequestTimeoutError,
  type RequestQueueConfig,
  type RequestPriority,
  type QueueStats,
  createRequestQueue,
  // Errors
  AIError,
  RateLimitError,
  ProviderError,
  AIValidationError,
  type AIErrorCode,
  type RecoverySuggestion,
  type RetryStrategy,
  isRetryableError,
  calculateRetryDelay,
  wrapError,
  // Observability
  ConsoleLogger,
  InMemoryMetrics,
  SimpleTracer,
  ObservabilityContext,
  createObservability,
  getObservability,
  setObservability,
  type LogLevel,
  type MetricType,
  type LogEntry,
  type MetricEntry,
  type Span,
  type Logger,
  type MetricsCollector as ObservabilityMetricsCollector,
  type Tracer,
  // Resilience Pipeline
  ResiliencePipeline,
  createResiliencePipeline,
  type ResilienceContext,
  type ResiliencePipelineConfig,
} from "@ku0/ai-core";

// Performance (Cache, Batching, Lazy Loading)
export {
  // Cache
  LRUCache,
  type LRUCacheConfig,
  type CacheStats,
  cacheKey,
  memoize,
  memoizeAsync,
  // Batching
  RequestBatcher,
  type BatchConfig,
  batchify,
  batch,
  parallelBatch,
  // Lazy Loading
  Lazy,
  LazySync,
  LazyFactory,
  ResourcePool,
  lazy,
  lazySync,
  lazyFactory,
} from "@ku0/ai-core";

// Types (Branded Types, Validation)
export {
  // Branded ID Types
  type UserId,
  type DocId,
  type ChunkId,
  type TraceId,
  type SpanId,
  type ProviderId,
  type RequestId,
  // Branded Value Types
  type NonEmptyString,
  type PositiveInt,
  type UnitInterval,
  type TokenCount,
  type SimilarityScore,
  type UTF16Offset,
  type Timestamp,
  // Constructors
  userId,
  docId,
  chunkId,
  traceId,
  spanId,
  providerId,
  requestId,
  nonEmptyString,
  positiveInt,
  unitInterval,
  tokenCount,
  similarityScore,
  utf16Offset,
  timestamp,
  // Safe Constructors
  safeUserId,
  safeDocId,
  safeChunkId,
  safePositiveInt,
  safeUnitInterval,
  safeSimilarityScore,
  // Type Guards
  isValidUserId,
  isValidPositiveInt,
  isValidUnitInterval,
  // ID Generators
  generateId,
  generateDocId,
  generateChunkId,
  generateTraceId,
  generateRequestId,
  unwrap,
  BrandValidationError,
  type BrandValidationResult,
  // Validation
  SchemaValidationError,
  type FieldError,
  type ValidateResult,
  type Validator,
  string,
  nonEmptyStringValidator,
  number,
  integer,
  positive,
  range,
  boolean,
  array,
  arrayLength,
  object,
  optional,
  withDefault,
  and,
  or,
  oneOf,
  stringLength,
  pattern,
  url,
  email,
  validate,
  createParser,
  tryValidate,
} from "@ku0/ai-core";

// ============================================================================
// Business-Specific Modules (collab-server only)
// ============================================================================

// AI Gateway (main entry point)
export {
  AIGateway,
  createAIGateway,
  type AIGatewayConfig,
  type AIRequestOptions,
  type CopilotRequest,
  type CopilotResponse,
} from "./gateway";

// Legacy suggestion generator (stub)
export {
  SuggestionGenerator,
  type Suggestion,
  type SuggestionRequest,
  type SuggestionResponse,
  type SuggestionType,
  type SuggestionStatus,
  type Citation,
  type SuggestionGeneratorConfig,
} from "./suggestionGenerator";

// Audit types
export {
  type AISuggestionEventType,
  type AISuggestionAuditMetadata,
  type AISuggestionAuditEvent,
  createSuggestionGeneratedEvent,
  createSuggestionAppliedEvent,
  createSuggestionRejectedEvent,
  createSuggestionUndoneEvent,
} from "./aiAuditTypes";

// Safety pipeline
export {
  SafetyPipeline,
  createSafetyPipeline,
  quickValidate,
  type SafetyPipelineConfig,
  type ValidationResult as SafetyValidationResult,
  type ValidationError as SafetyValidationError,
  type ValidationWarning,
  type ValidationMetadata,
  type ValidationErrorCode,
  type ValidationWarningCode,
} from "./safety";

// Document extraction & chunking
export {
  // Types
  type ChunkingOptions,
  type ChunkingStrategy,
  type DocumentChunk,
  type DocumentExtractor,
  type DocumentMetadata,
  type DocumentType,
  type ExtractedImage,
  type ExtractedLink,
  type ExtractedTable,
  type ExtractionOptions,
  type ExtractionResult,
  type ChunkEmbedding,
  type EmbeddingServiceConfig,
  // Extractors
  BaseExtractor,
  HTMLExtractor,
  MarkdownExtractor,
  TextExtractor,
  extractDocument,
  getExtractor,
  registerExtractor,
  // Chunker
  SemanticChunker,
  createChunker,
  // Embedding
  EmbeddingService,
  cosineSimilarity,
  findTopK,
} from "./extraction";

// RAG (Retrieval-Augmented Generation)
export {
  // Types
  type Citation as RAGCitation,
  type IndexedDocument,
  type RAGConfig,
  type RAGQueryOptions,
  type RAGQueryResult,
  type SearchResult,
  type VectorStore,
  type HybridSearchConfig,
  // Vector Store
  InMemoryVectorStore,
  createInMemoryStore,
  // Pipeline
  RAGPipeline,
  createRAGPipeline,
  // Hybrid Search
  KeywordIndex,
  HybridSearch,
  createHybridSearch,
  reciprocalRankFusion,
} from "./rag";
