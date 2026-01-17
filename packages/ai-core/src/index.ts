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

export { normalizeMessages, withSystemPrompt } from "./catalog/messages";
// ============================================================================
// Catalog - Shared model capabilities & provider configuration
// ============================================================================
export {
  type CapabilityError,
  getDefaultModelId,
  getModelCapability,
  getModelsWithCapabilities,
  getSuggestedModel,
  MODEL_CATALOG,
  type ModelCapability,
  modelSupportsThinking,
  modelSupportsTools,
  modelSupportsVision,
  normalizeModelId,
  type ProviderKind,
  // Capability validation
  type RequiredCapabilities,
  validateModelCapabilities,
} from "./catalog/models";
export {
  getAllProviderIds,
  getConfiguredProviders,
  // Environment utilities
  getFirstEnvValue,
  getProviderDisplayInfo,
  getProviderEnvConfig,
  // Lookup functions
  getProviderMetadata,
  getProvidersByProtocol,
  isGoogleBaseUrl,
  isProviderConfigured,
  normalizeAnthropicBaseUrl,
  normalizeBaseUrl,
  // Catalog
  PROVIDER_CATALOG,
  type ProviderDisplayInfo,
  type ProviderEnvConfig,
  type ProviderMetadata,
  // Types
  type ProviderProtocol,
  parseApiKeys,
  resolveProviderFromEnv,
} from "./catalog/providers";
// ============================================================================
// Context - Token & Context Window Management
// ============================================================================
export {
  // Types
  type BuiltContext,
  type ContextSegment,
  type ContextSegmentType,
  type ContextWindowConfig,
  // Classes
  ContextWindowManager,
  // Factory functions
  createContextManager,
  createDocumentContextBuilder,
  // Constants
  DEFAULT_CONTEXT_LIMITS,
  type DocumentContext,
  DocumentContextBuilder,
  type DocumentContextBuilderConfig,
  type DocumentContextOptions,
  estimateMessagesTokens,
  // Utilities
  estimateTokens,
  type HistoryEntry,
  MODEL_CONTEXT_LIMITS,
  type ModelContextLimits,
  SEGMENT_PRIORITY,
  splitIntoChunks,
  type TokenBudget,
  type TokenEstimateOptions,
  truncateToTokens,
} from "./context";
// ============================================================================
// Gateway - Unified AI Gateway & Tracing
// ============================================================================
export {
  createGatewayError,
  createLangfuseGatewayTelemetryAdapter,
  createNoopGatewayTelemetryAdapter,
  createTraceContext,
  createUnifiedAIGateway,
  extractTraceFromHeaders,
  formatErrorResponse,
  // Errors
  GatewayError,
  type GatewayErrorCode,
  type GatewayErrorResponse,
  type GatewayGenerationResult,
  type GatewayGenerationStart,
  type GatewayGenerationUsage,
  type GatewayHealthStatus,
  type GatewayRequestOptions,
  type GatewayResponse,
  type GatewayStreamChunk,
  type GatewayStreamOptions,
  // Telemetry adapters
  type GatewayTelemetryAdapter,
  type GatewayTelemetryGeneration,
  type GatewayTelemetryLevel,
  generateSpanId as generateGatewaySpanId,
  generateTraceId as generateGatewayTraceId,
  injectTraceToHeaders,
  isGatewayError,
  // Trace Context
  TraceContext,
  type TraceContextData,
  type TracePropagator,
  toHttpStatus,
  // Unified Gateway
  UnifiedAIGateway,
  type UnifiedGatewayConfig,
} from "./gateway";
// ============================================================================
// Lanes - Multi-Lane Model Routing (Fast/Deep/Consensus)
// ============================================================================
export {
  type ComplexityHints,
  type ComplexitySelectorOptions,
  type ConsensusConfig,
  type ConsensusDiff,
  type ConsensusMergeStrategy,
  type ConsensusModelResult,
  type ConsensusResult,
  type ConsensusSelectorOptions,
  combineSelectors,
  // Selectors
  createComplexityBasedSelector,
  createConsensusSelector,
  createLaneRouter,
  createPreferenceBasedSelector,
  type LaneCompletionRequest,
  type LaneCompletionResponse,
  type LaneConfig,
  type LaneLogger,
  type LaneModelConfig,
  // Lane Router
  LaneRouter,
  type LaneRouterConfig,
  type LaneSelectionContext,
  type LaneSelector,
  type LaneTelemetryEvent,
  // Types
  type ModelLane,
  type MultiLaneConfig,
  type PreferenceSelectorOptions,
  type ProviderFactory,
} from "./lanes";
// ============================================================================
// Middleware - Response Processing & Citation Grounding
// ============================================================================
export {
  // Citation Middleware
  CitationMiddleware,
  type CitationMiddlewareConfig,
  type CitationRef,
  createCitationMiddleware,
  createMiddlewareChain,
  createSimpleMiddleware,
  type FlagSeverity,
  type GroundingSummary,
  // Middleware Chain
  MiddlewareChain,
  type MiddlewareChainConfig,
  type MiddlewareContext,
  type MiddlewareLogger,
  type MiddlewareRequestOptions,
  type MiddlewareResponse,
  type ProcessedResponse,
  type ResponseFlag,
  type ResponseFlagType,
  type ResponseMetadata,
  // Types
  type ResponseMiddleware,
  type SourceContext,
} from "./middleware";
// ============================================================================
// Observability - Enhanced Telemetry & Profiling
// ============================================================================
export {
  createAlwaysSampler,
  createConsoleTraceExporter,
  createNeverSampler,
  createOpenTelemetryTracer,
  createPerformanceProfiler,
  createProbabilitySampler,
  createRateLimitingSampler,
  createTelemetryContext,
  type ExportResult,
  type FunctionStats,
  type HotPath,
  type LogExportEntry,
  type MemorySnapshot,
  type MemoryStats,
  type MetricExportEntry,
  type OpenTelemetryConfig,
  // OpenTelemetry Tracer
  OpenTelemetryTracer,
  type OTelSpan,
  // Performance Profiler
  PerformanceProfiler,
  type ProfileEntry,
  type ProfileReport,
  type ProfilerConfig,
  type ProfilerMetrics,
  type ProfileSummary,
  type ResourceAttributes,
  type Sampler,
  type SamplingResult,
  type ScopedContext,
  type SpanContext,
  type SpanExportEntry,
  type SpanKind,
  type SpanLink,
  type SpanStatus,
  // Unified Telemetry Context
  TelemetryContext,
  type TelemetryContextConfig,
  type TelemetryExporter,
  type TraceExporter,
} from "./observability";
// ============================================================================
// Performance - Cache, Batching, Lazy Loading
// ============================================================================
export {
  type BatchConfig,
  batch,
  batchify,
  type CacheStats,
  cacheKey,
  // Lazy Loading
  Lazy,
  LazyFactory,
  LazySync,
  // Cache
  LRUCache,
  type LRUCacheConfig,
  lazy,
  lazyFactory,
  lazySync,
  memoize,
  memoizeAsync,
  parallelBatch,
  // Batching
  RequestBatcher,
  ResourcePool,
} from "./performance";
// ============================================================================
// Prompts - Shared Prompt Templates
// ============================================================================
export {
  // Legacy prompt builders (deprecated)
  buildDigestMapPrompt,
  // Modern prompt builders (for use with generateObject)
  buildDigestMapSystemPrompt,
  buildDigestMapUserPrompt,
  buildDigestReducePrompt,
  buildDigestReduceSystemPrompt,
  buildDigestReduceUserPrompt,
  buildVerifierPrompt,
  buildVerifierSystemPrompt,
  buildVerifierUserPrompt,
  type Citation,
  // Modern Zod schemas
  CitationSchema,
  type DigestMapInput,
  type DigestMapOutput,
  DigestMapOutputSchema,
  type DigestMapPromptInput,
  type DigestReduceInput,
  type DigestReduceOutput,
  DigestReduceOutputSchema,
  type DigestReducePromptInput,
  type VerifierInput,
  type VerifierOutput,
  VerifierOutputSchema,
  type VerifierPromptInput,
} from "./prompts";
// ============================================================================
// Providers - LLM Provider Abstraction Layer
// ============================================================================
export {
  type AnthropicConfig,
  AnthropicProvider,
  // Base
  BaseLLMProvider,
  // Types
  type CompletionRequest,
  type CompletionResponse,
  // Vercel AI SDK Adapters (Recommended)
  createAnthropicAdapter,
  createGoogleAdapter,
  createOpenAIAdapter,
  createProviderRouter,
  createResilientProvider,
  type EmbeddingRequest,
  type EmbeddingResponse,
  type GeminiConfig,
  GeminiProvider,
  type LLMProvider,
  type Message,
  type MessageRole,
  type ModelPricing,
  type OpenAIConfig,
  // Implementations
  OpenAIProvider,
  type ProviderCandidate,
  type ProviderConfig,
  type ProviderHealth,
  type ProviderLogger,
  type ProviderMetrics,
  type ProviderOperation,
  type ProviderRoutedResponse,
  // Router
  ProviderRouter,
  type ProviderRouterConfig,
  type ProviderSelector,
  type ProviderStreamChunk,
  type RateLimitConfig,
  ResilientProvider,
  type ResilientProviderConfig,
  type StreamChunk,
  type StreamChunkType,
  // Token tracking
  TokenTracker,
  type TokenUsage,
  type Tool,
  type ToolCall,
  type UsageRecord,
  type UsageSummary,
  // Vercel adapter types
  VercelAIAdapter,
  type VercelAIAdapterConfig,
  type VercelProviderType,
} from "./providers";
// ============================================================================
// Resilience - Circuit Breaker, Queue, Errors, Observability
// ============================================================================
export {
  // Errors
  AIError,
  type AIErrorCode,
  type CancellationToken,
  // Circuit Breaker
  CircuitBreaker,
  type CircuitBreakerConfig,
  type CircuitBreakerMetrics,
  CircuitBreakerOpenError,
  type CircuitState,
  type ComponentHealth,
  // Observability
  ConsoleLogger,
  calculateRetryDelay,
  combineCancellationTokens,
  createAggressiveRetryPolicy,
  createCancellationToken,
  createCircuitBreaker,
  createGentleRetryPolicy,
  createHealthAggregator,
  createLatencyCheck,
  createObservability,
  createPingCheck,
  createProviderHealthCheck,
  createRequestQueue,
  createResiliencePipeline,
  createRetryPolicy,
  createTimeoutToken,
  formatHealthResponse,
  getObservability,
  // Health Aggregation
  HealthAggregator,
  type HealthAggregatorConfig,
  type HealthCheck,
  type HealthStatus,
  InMemoryMetrics,
  isRetryableError,
  type LogEntry,
  type Logger,
  type LogLevel,
  type MetricEntry,
  type MetricsCollector,
  type MetricType,
  ObservabilityContext,
  ProviderError,
  QueueFullError,
  type QueueStats,
  RateLimitError,
  type RecoverySuggestion,
  type RequestPriority,
  // Request Queue
  RequestQueue,
  type RequestQueueConfig,
  RequestTimeoutError,
  type ResilienceContext,
  // Resilience Pipeline
  ResiliencePipeline,
  type ResiliencePipelineConfig,
  type RetryAttempt,
  // Retry Policy
  RetryPolicy,
  type RetryPolicyConfig,
  type RetryResult,
  type RetryStrategy,
  SimpleTracer,
  type Span,
  type SystemHealth,
  setObservability,
  type Tracer,
  tryWithRetry,
  ValidationError as AIValidationError,
  withRetry,
  wrapError,
} from "./resilience";
// ============================================================================
// Types - Branded Types & Validation
// ============================================================================
export {
  and,
  array,
  arrayLength,
  BrandValidationError,
  boolean,
  type ChunkId,
  chunkId,
  createParser,
  type DocId,
  docId,
  email,
  type FieldError,
  generateChunkId,
  generateDocId,
  // ID Generators
  generateId,
  generateRequestId,
  generateTraceId,
  integer,
  isValidPositiveInt,
  isValidUnitInterval,
  // Type Guards
  isValidUserId,
  // Branded Value Types
  type NonEmptyString,
  nonEmptyString,
  nonEmptyStringValidator,
  number,
  object,
  oneOf,
  optional,
  or,
  type PositiveInt,
  type ProviderId,
  pattern,
  positive,
  positiveInt,
  providerId,
  type RequestId,
  range,
  requestId,
  type SimilarityScore,
  type SpanId,
  safeChunkId,
  safeDocId,
  safePositiveInt,
  safeSimilarityScore,
  safeUnitInterval,
  // Safe Constructors
  safeUserId,
  similarityScore,
  spanId,
  string,
  stringLength,
  type Timestamp,
  type TokenCount,
  type TraceId,
  timestamp,
  tokenCount,
  traceId,
  tryValidate,
  type UnitInterval,
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
  // Validation
  ValidationError as SchemaValidationError,
  type ValidationResult as BrandValidationResult,
  type Validator,
  validate,
  withDefault,
} from "./types";
