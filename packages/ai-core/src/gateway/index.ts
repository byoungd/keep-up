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
  createGatewayError,
  formatErrorResponse,
  GatewayError,
  type GatewayErrorCode,
  type GatewayErrorResponse,
  isGatewayError,
  toHttpStatus,
} from "./errors";
export { createLangfuseGatewayTelemetryAdapter } from "./langfuseTelemetry";
export {
  createNoopGatewayTelemetryAdapter,
  type GatewayGenerationResult,
  type GatewayGenerationStart,
  type GatewayGenerationUsage,
  type GatewayTelemetryAdapter,
  type GatewayTelemetryGeneration,
  type GatewayTelemetryLevel,
} from "./telemetry";
export {
  createTraceContext,
  extractTraceFromHeaders,
  generateSpanId,
  generateTraceId,
  injectTraceToHeaders,
  TraceContext,
  type TraceContextData,
  type TracePropagator,
} from "./traceContext";
export {
  createUnifiedAIGateway,
  type GatewayHealthStatus,
  type GatewayRequestOptions,
  type GatewayResponse,
  type GatewayStreamChunk,
  type GatewayStreamOptions,
  UnifiedAIGateway,
  type UnifiedGatewayConfig,
} from "./unifiedGateway";
