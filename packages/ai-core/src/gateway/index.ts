/**
 * Unified AI Gateway
 *
 * Production-grade AI gateway that consolidates:
 * - LLM provider routing with automatic fallback
 * - Resilience patterns (circuit breaker, retry, queue)
 * - Health monitoring and degraded state handling
 * - Unified telemetry and observability
 * - Rate limiting and token tracking
 * - Request/response standardization
 *
 * Design Philosophy:
 * - Single entry point for all AI operations
 * - Fail-fast with graceful degradation
 * - Observable by default
 * - Zero-config sensible defaults
 */

export {
  UnifiedAIGateway,
  createUnifiedAIGateway,
  type UnifiedGatewayConfig,
  type GatewayRequestOptions,
  type GatewayStreamOptions,
  type GatewayResponse,
  type GatewayStreamChunk,
  type GatewayHealthStatus,
} from "./unifiedGateway";

export {
  TraceContext,
  createTraceContext,
  extractTraceFromHeaders,
  injectTraceToHeaders,
  generateTraceId,
  generateSpanId,
  type TraceContextData,
  type TracePropagator,
} from "./traceContext";

export {
  GatewayError,
  type GatewayErrorCode,
  createGatewayError,
  isGatewayError,
  toHttpStatus,
  formatErrorResponse,
  type GatewayErrorResponse,
} from "./errors";
