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
// Context management
// Resilience (Circuit Breaker, Queue, Errors, Observability)
// Performance (Cache, Batching, Lazy Loading)
// Types (Branded Types, Validation)
export {
  // Errors
  AIError,
  type AIErrorCode,
  AIValidationError,
  type AnthropicConfig,
  AnthropicProvider,
  and,
  array,
  arrayLength,
  // Base
  BaseLLMProvider,
  type BatchConfig,
  BrandValidationError,
  type BrandValidationResult,
  // Types
  type BuiltContext,
  batch,
  batchify,
  boolean,
  type CacheStats,
  type ChunkId,
  // Circuit Breaker
  CircuitBreaker,
  type CircuitBreakerConfig,
  type CircuitBreakerMetrics,
  CircuitBreakerOpenError,
  type CircuitState,
  // Types
  type CompletionRequest,
  type CompletionResponse,
  // Observability
  ConsoleLogger,
  type ContextSegment,
  type ContextSegmentType,
  type ContextWindowConfig,
  // Classes
  ContextWindowManager,
  cacheKey,
  calculateRetryDelay,
  chunkId,
  createCircuitBreaker,
  // Factory functions
  createContextManager,
  createDocumentContextBuilder,
  createObservability,
  createParser,
  createProviderRouter,
  createRequestQueue,
  createResiliencePipeline,
  createResilientProvider,
  // Constants
  DEFAULT_CONTEXT_LIMITS,
  type DocId,
  type DocumentContext,
  DocumentContextBuilder,
  type DocumentContextBuilderConfig,
  type DocumentContextOptions,
  docId,
  type EmbeddingRequest,
  type EmbeddingResponse,
  email,
  estimateMessagesTokens,
  // Utilities
  estimateTokens,
  type FieldError,
  generateChunkId,
  generateDocId,
  // ID Generators
  generateId,
  generateRequestId,
  generateTraceId,
  getObservability,
  type HistoryEntry,
  InMemoryMetrics,
  integer,
  isRetryableError,
  isValidPositiveInt,
  isValidUnitInterval,
  // Type Guards
  isValidUserId,
  // Lazy Loading
  Lazy,
  LazyFactory,
  LazySync,
  type LLMProvider,
  type LogEntry,
  type Logger,
  type LogLevel,
  // Cache
  LRUCache,
  type LRUCacheConfig,
  lazy,
  lazyFactory,
  lazySync,
  type Message,
  type MessageRole,
  type MetricEntry,
  type MetricsCollector as ObservabilityMetricsCollector,
  type MetricType,
  MODEL_CONTEXT_LIMITS,
  type ModelContextLimits,
  type ModelPricing,
  memoize,
  memoizeAsync,
  // Branded Value Types
  type NonEmptyString,
  nonEmptyString,
  nonEmptyStringValidator,
  number,
  ObservabilityContext,
  type OpenAIConfig,
  // Implementations
  OpenAIProvider,
  object,
  oneOf,
  optional,
  or,
  type PositiveInt,
  type ProviderCandidate,
  type ProviderConfig,
  ProviderError,
  type ProviderHealth,
  type ProviderId,
  type ProviderLogger,
  type ProviderMetrics,
  type ProviderOperation,
  // Router
  ProviderRouter,
  type ProviderRouterConfig,
  type ProviderSelector,
  parallelBatch,
  pattern,
  positive,
  positiveInt,
  providerId,
  QueueFullError,
  type QueueStats,
  type RateLimitConfig,
  RateLimitError,
  type RecoverySuggestion,
  // Batching
  RequestBatcher,
  type RequestId,
  type RequestPriority,
  // Request Queue
  RequestQueue,
  type RequestQueueConfig,
  RequestTimeoutError,
  type ResilienceContext,
  // Resilience Pipeline
  ResiliencePipeline,
  type ResiliencePipelineConfig,
  ResilientProvider,
  type ResilientProviderConfig,
  ResourcePool,
  type RetryStrategy,
  range,
  requestId,
  // Validation
  SchemaValidationError,
  SEGMENT_PRIORITY,
  type SimilarityScore,
  SimpleTracer,
  type Span,
  type SpanId,
  type StreamChunk,
  type StreamChunkType,
  safeChunkId,
  safeDocId,
  safePositiveInt,
  safeSimilarityScore,
  safeUnitInterval,
  // Safe Constructors
  safeUserId,
  setObservability,
  similarityScore,
  spanId,
  splitIntoChunks,
  string,
  stringLength,
  type Timestamp,
  type TokenBudget,
  type TokenCount,
  type TokenEstimateOptions,
  // Token tracking
  TokenTracker,
  type TokenUsage,
  type Tool,
  type ToolCall,
  type TraceId,
  type Tracer,
  timestamp,
  tokenCount,
  traceId,
  truncateToTokens,
  tryValidate,
  type UnitInterval,
  type UsageRecord,
  type UsageSummary,
  // Branded ID Types
  type UserId,
  type UTF16Offset,
  unitInterval,
  unwrap,
  url,
  // Constructors
  userId,
  utf16Offset,
  type ValidateResult,
  type Validator,
  validate,
  withDefault,
  wrapError,
} from "@ku0/ai-core";

// ============================================================================
// Business-Specific Modules (collab-server only)
// ============================================================================

// Audit types
export {
  type AISuggestionAuditEvent,
  type AISuggestionAuditMetadata,
  type AISuggestionEventType,
  createSuggestionAppliedEvent,
  createSuggestionGeneratedEvent,
  createSuggestionRejectedEvent,
  createSuggestionUndoneEvent,
} from "./aiAuditTypes";
// Document extraction & chunking
export {
  // Extractors
  BaseExtractor,
  type ChunkEmbedding,
  // Types
  type ChunkingOptions,
  type ChunkingStrategy,
  cosineSimilarity,
  createChunker,
  type DocumentChunk,
  type DocumentExtractor,
  type DocumentMetadata,
  type DocumentType,
  // Embedding
  EmbeddingService,
  type EmbeddingServiceConfig,
  type ExtractedImage,
  type ExtractedLink,
  type ExtractedTable,
  type ExtractionOptions,
  type ExtractionResult,
  extractDocument,
  findTopK,
  getExtractor,
  HTMLExtractor,
  MarkdownExtractor,
  registerExtractor,
  // Chunker
  SemanticChunker,
  TextExtractor,
} from "./extraction";
// AI Gateway (main entry point)
export {
  AIGateway,
  type AIGatewayConfig,
  type AIRequestOptions,
  type CopilotRequest,
  type CopilotResponse,
  createAIGateway,
} from "./gateway";
// RAG (Retrieval-Augmented Generation)
export {
  // Types
  type Citation as RAGCitation,
  createHybridSearch,
  createInMemoryStore,
  createRAGPipeline,
  HybridSearch,
  type HybridSearchConfig,
  type IndexedDocument,
  // Vector Store
  InMemoryVectorStore,
  // Hybrid Search
  KeywordIndex,
  type RAGConfig,
  // Pipeline
  RAGPipeline,
  type RAGQueryOptions,
  type RAGQueryResult,
  reciprocalRankFusion,
  type SearchResult,
  type VectorStore,
} from "./rag";
// Safety pipeline
export {
  createSafetyPipeline,
  quickValidate,
  SafetyPipeline,
  type SafetyPipelineConfig,
  type ValidationError as SafetyValidationError,
  type ValidationErrorCode,
  type ValidationMetadata,
  type ValidationResult as SafetyValidationResult,
  type ValidationWarning,
  type ValidationWarningCode,
} from "./safety";
// Legacy suggestion generator (stub)
export {
  type Citation,
  type Suggestion,
  SuggestionGenerator,
  type SuggestionGeneratorConfig,
  type SuggestionRequest,
  type SuggestionResponse,
  type SuggestionStatus,
  type SuggestionType,
} from "./suggestionGenerator";
