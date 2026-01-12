/**
 * Resilience Module
 *
 * Production-grade resilience patterns for AI operations.
 */

// Circuit Breaker
export {
  CircuitBreaker,
  CircuitBreakerOpenError,
  createCircuitBreaker,
  type CircuitBreakerConfig,
  type CircuitBreakerMetrics,
  type CircuitState,
} from "./circuitBreaker";

// Request Queue
export {
  RequestQueue,
  QueueFullError,
  RequestTimeoutError,
  createRequestQueue,
  type RequestQueueConfig,
  type RequestPriority,
  type QueueStats,
} from "./requestQueue";

// Typed Errors
export {
  AIError,
  ProviderError,
  RateLimitError,
  ValidationError,
  isRetryableError,
  calculateRetryDelay,
  wrapError,
  type AIErrorCode,
  type RetryStrategy,
  type RecoverySuggestion,
} from "./errors";

// Observability
export {
  ConsoleLogger,
  InMemoryMetrics,
  SimpleTracer,
  ObservabilityContext,
  createObservability,
  getObservability,
  setObservability,
  type LogLevel,
  type LogEntry,
  type MetricType,
  type MetricEntry,
  type Span,
  type Logger,
  type MetricsCollector,
  type Tracer,
} from "./observability";

// Retry Policy
export {
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
} from "./retryPolicy";

// Resilience Pipeline
export {
  ResiliencePipeline,
  createResiliencePipeline,
  type ResilienceContext,
  type ResiliencePipelineConfig,
} from "./pipeline";

// Health Aggregation
export {
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
} from "./health";
