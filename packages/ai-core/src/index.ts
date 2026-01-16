/**
 * @ku0/ai-core
 *
 * AI Infrastructure Core - Provider-agnostic AI abstractions.
 *
 * This package provides foundational AI infrastructure:
 * - LLM Provider abstraction (OpenAI, Anthropic, etc.)
 * - Context window management
 * - Resilience patterns (Circuit Breaker, Queue, Errors)
 * - Performance utilities (Cache, Batching, Lazy Loading)
 * - Type-safe branded types and validation
 */

// ============================================================================
// Providers - LLM Provider Abstraction Layer
// ============================================================================
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
  GeminiProvider,
  type GeminiConfig,
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
} from "./providers";

// ============================================================================
// Context - Token & Context Window Management
// ============================================================================
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
} from "./context";

// ============================================================================
// Resilience - Circuit Breaker, Queue, Errors, Observability
// ============================================================================
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
  ValidationError as AIValidationError,
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
  type MetricsCollector,
  type Tracer,
  // Retry Policy
  RetryPolicy,
  createRetryPolicy,
  createAggressiveRetryPolicy,
  createGentleRetryPolicy,
  withRetry,
  tryWithRetry,
  createCancellationToken,
  createTimeoutToken,
  combineCancellationTokens,
  type RetryPolicyConfig,
  type RetryAttempt,
  type RetryResult,
  type CancellationToken,
  // Resilience Pipeline
  ResiliencePipeline,
  createResiliencePipeline,
  type ResilienceContext,
  type ResiliencePipelineConfig,
  // Health Aggregation
  HealthAggregator,
  createHealthAggregator,
  createPingCheck,
  createLatencyCheck,
  createProviderHealthCheck,
  formatHealthResponse,
  type HealthStatus,
  type ComponentHealth,
  type SystemHealth,
  type HealthCheck,
  type HealthAggregatorConfig,
} from "./resilience";

// ============================================================================
// Performance - Cache, Batching, Lazy Loading
// ============================================================================
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
} from "./performance";

// ============================================================================
// Prompts - Shared Prompt Templates
// ============================================================================
export {
  buildDigestMapPrompt,
  buildDigestReducePrompt,
  buildVerifierPrompt,
  type DigestMapPromptInput,
  type DigestReducePromptInput,
  type VerifierPromptInput,
} from "./prompts";

// ============================================================================
// Types - Branded Types & Validation
// ============================================================================
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
  type ValidationResult as BrandValidationResult,
  // Validation
  ValidationError as SchemaValidationError,
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
} from "./types";

// ============================================================================
// Catalog - Shared model capabilities & provider configuration
// ============================================================================
export {
  MODEL_CATALOG,
  type ModelCapability,
  type ProviderKind,
  getDefaultModelId,
  getModelCapability,
  normalizeModelId,
  // Capability validation
  type RequiredCapabilities,
  type CapabilityError,
  validateModelCapabilities,
  modelSupportsVision,
  modelSupportsTools,
  modelSupportsThinking,
  getModelsWithCapabilities,
  getSuggestedModel,
} from "./catalog/models";
export { normalizeMessages, withSystemPrompt } from "./catalog/messages";
export {
  // Types
  type ProviderProtocol,
  type ProviderEnvConfig,
  type ProviderDisplayInfo,
  type ProviderMetadata,
  // Catalog
  PROVIDER_CATALOG,
  // Lookup functions
  getProviderMetadata,
  getProviderEnvConfig,
  getProviderDisplayInfo,
  getAllProviderIds,
  getProvidersByProtocol,
  // Environment utilities
  getFirstEnvValue,
  parseApiKeys,
  normalizeBaseUrl,
  normalizeAnthropicBaseUrl,
  isGoogleBaseUrl,
  resolveProviderFromEnv,
  isProviderConfigured,
  getConfiguredProviders,
} from "./catalog/providers";

// ============================================================================
// Observability - Enhanced Telemetry & Profiling
// ============================================================================
export {
  // Unified Telemetry Context
  TelemetryContext,
  createTelemetryContext,
  type TelemetryContextConfig,
  type TelemetryExporter,
  type LogExportEntry,
  type MetricExportEntry,
  type SpanExportEntry,
  type ResourceAttributes,
  type ScopedContext,
  // OpenTelemetry Tracer
  OpenTelemetryTracer,
  createOpenTelemetryTracer,
  createConsoleTraceExporter,
  createAlwaysSampler,
  createNeverSampler,
  createProbabilitySampler,
  createRateLimitingSampler,
  type OpenTelemetryConfig,
  type SpanContext,
  type TraceExporter,
  type ExportResult,
  type Sampler,
  type SamplingResult,
  type SpanKind,
  type SpanStatus,
  type SpanLink,
  type OTelSpan,
  // Performance Profiler
  PerformanceProfiler,
  createPerformanceProfiler,
  type ProfilerConfig,
  type ProfileEntry,
  type ProfileReport,
  type ProfilerMetrics,
  type FunctionStats,
  type HotPath,
  type MemoryStats,
  type MemorySnapshot,
  type ProfileSummary,
} from "./observability";

// ============================================================================
// Gateway - Unified AI Gateway & Tracing
// ============================================================================
export {
  // Unified Gateway
  UnifiedAIGateway,
  createUnifiedAIGateway,
  type UnifiedGatewayConfig,
  type GatewayRequestOptions,
  type GatewayStreamOptions,
  type GatewayResponse,
  type GatewayStreamChunk,
  type GatewayHealthStatus,
  // Trace Context
  TraceContext,
  createTraceContext,
  extractTraceFromHeaders,
  injectTraceToHeaders,
  generateTraceId as generateGatewayTraceId,
  generateSpanId as generateGatewaySpanId,
  type TraceContextData,
  type TracePropagator,
  // Errors
  GatewayError,
  type GatewayErrorCode,
  createGatewayError,
  isGatewayError,
  toHttpStatus,
  formatErrorResponse,
  type GatewayErrorResponse,
} from "./gateway";

// ============================================================================
// Lanes - Multi-Lane Model Routing (Fast/Deep/Consensus)
// ============================================================================
export {
  // Lane Router
  LaneRouter,
  createLaneRouter,
  type ProviderFactory,
  // Types
  type ModelLane,
  type LaneConfig,
  type LaneModelConfig,
  type MultiLaneConfig,
  type LaneRouterConfig,
  type LaneCompletionRequest,
  type LaneCompletionResponse,
  type LaneSelector,
  type LaneSelectionContext,
  type ComplexityHints,
  type ConsensusConfig,
  type ConsensusMergeStrategy,
  type ConsensusResult,
  type ConsensusModelResult,
  type ConsensusDiff,
  type LaneLogger,
  type LaneTelemetryEvent,
  // Selectors
  createComplexityBasedSelector,
  createPreferenceBasedSelector,
  createConsensusSelector,
  combineSelectors,
  type ComplexitySelectorOptions,
  type PreferenceSelectorOptions,
  type ConsensusSelectorOptions,
} from "./lanes";

// ============================================================================
// Middleware - Response Processing & Citation Grounding
// ============================================================================
export {
  // Middleware Chain
  MiddlewareChain,
  createMiddlewareChain,
  createSimpleMiddleware,
  // Citation Middleware
  CitationMiddleware,
  createCitationMiddleware,
  // Types
  type ResponseMiddleware,
  type MiddlewareResponse,
  type MiddlewareContext,
  type MiddlewareRequestOptions,
  type ResponseMetadata,
  type CitationRef,
  type SourceContext,
  type ResponseFlag,
  type ResponseFlagType,
  type FlagSeverity,
  type ProcessedResponse,
  type GroundingSummary,
  type MiddlewareChainConfig,
  type CitationMiddlewareConfig,
  type MiddlewareLogger,
} from "./middleware";
