/**
 * Resilience Module
 *
 * Production-grade resilience patterns for AI operations.
 */

// Circuit Breaker
export {
  CircuitBreaker,
  type CircuitBreakerConfig,
  type CircuitBreakerMetrics,
  CircuitBreakerOpenError,
  type CircuitState,
  createCircuitBreaker,
} from "./circuitBreaker";
// Typed Errors
export {
  AIError,
  type AIErrorCode,
  calculateRetryDelay,
  isRetryableError,
  ProviderError,
  RateLimitError,
  type RecoverySuggestion,
  type RetryStrategy,
  ValidationError,
  wrapError,
} from "./errors";
// Health Aggregation
export {
  type ComponentHealth,
  createHealthAggregator,
  createLatencyCheck,
  createPingCheck,
  createProviderHealthCheck,
  formatHealthResponse,
  HealthAggregator,
  type HealthAggregatorConfig,
  type HealthCheck,
  type HealthStatus,
  type SystemHealth,
} from "./health";

// Observability
export {
  ConsoleLogger,
  createObservability,
  getObservability,
  InMemoryMetrics,
  type LogEntry,
  type Logger,
  type LogLevel,
  type MetricEntry,
  type MetricsCollector,
  type MetricType,
  ObservabilityContext,
  SimpleTracer,
  type Span,
  setObservability,
  type Tracer,
} from "./observability";
// Resilience Pipeline
export {
  createResiliencePipeline,
  type ResilienceContext,
  ResiliencePipeline,
  type ResiliencePipelineConfig,
} from "./pipeline";
// Request Queue
export {
  createRequestQueue,
  QueueFullError,
  type QueueStats,
  type RequestPriority,
  RequestQueue,
  type RequestQueueConfig,
  RequestTimeoutError,
} from "./requestQueue";
// Retry Policy
export {
  type CancellationToken,
  combineCancellationTokens,
  createAggressiveRetryPolicy,
  createCancellationToken,
  createGentleRetryPolicy,
  createRetryPolicy,
  createTimeoutToken,
  type RetryAttempt,
  RetryPolicy,
  type RetryPolicyConfig,
  type RetryResult,
  tryWithRetry,
  withRetry,
} from "./retryPolicy";
