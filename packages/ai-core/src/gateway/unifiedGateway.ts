/**
 * Unified AI Gateway
 *
 * Production-grade AI gateway consolidating all AI operations into a single,
 * observable, resilient entry point. Inspired by top-tier AI infrastructure
 * patterns from Anthropic, OpenAI, and Vercel.
 *
 * Key Features:
 * - Multi-provider routing with automatic fallback
 * - Built-in resilience (circuit breaker, retry, queue)
 * - Unified health monitoring
 * - End-to-end tracing
 * - Rate limiting and token tracking
 * - Standardized error handling
 */

import { getDefaultModelId } from "../catalog/models";
import {
  ProviderRouter,
  type ProviderRouterConfig,
  type ProviderStreamChunk,
} from "../providers/providerRouter";
import { TokenTracker } from "../providers/tokenTracker";
import type { LLMProvider, Message, TokenUsage } from "../providers/types";
import {
  type ComponentHealth,
  createHealthAggregator,
  formatHealthResponse,
  type HealthStatus,
  type SystemHealth,
} from "../resilience/health";
import { createObservability, type ObservabilityContext } from "../resilience/observability";
import type { ResiliencePipelineConfig } from "../resilience/pipeline";
import { createResiliencePipeline, type ResiliencePipeline } from "../resilience/pipeline";
import { fromProviderError, GatewayError, type GatewayErrorCode } from "./errors";
import { createNoopGatewayTelemetryAdapter, type GatewayTelemetryAdapter } from "./telemetry";
import { createTraceContext, type TraceContext } from "./traceContext";

// ============================================================================
// Types
// ============================================================================

/** Gateway configuration */
export interface UnifiedGatewayConfig {
  /** Registered LLM providers */
  providers: LLMProvider[];

  /** Primary provider name (defaults to first provider) */
  primaryProvider?: string;

  /** Enable automatic fallback between providers */
  enableFallback?: boolean;

  /** Default model to use */
  defaultModel?: string;

  /** Resilience configuration */
  resilience?: Partial<ResiliencePipelineConfig>;

  /** Rate limiting configuration */
  rateLimiting?: {
    enabled: boolean;
    defaultLimits?: {
      requestsPerMinute?: number;
      tokensPerMinute?: number;
      tokensPerDay?: number;
    };
  };

  /** Health check configuration */
  health?: {
    /** Health check interval in ms (default: 30000) */
    intervalMs?: number;
    /** Enable periodic health checks */
    enabled?: boolean;
  };

  /** Observability configuration */
  observability?: ObservabilityContext;

  /** Optional generation telemetry adapter (e.g., Langfuse) */
  telemetryAdapter?: GatewayTelemetryAdapter;

  /** Telemetry hook for external monitoring */
  onTelemetry?: (event: GatewayTelemetryEvent) => void;

  /** Error hook for external error tracking */
  onError?: (error: GatewayError, context: RequestContext) => void;
}

/** Request options */
export interface GatewayRequestOptions {
  /** User ID for tracking and rate limiting */
  userId: string;
  /** Document ID for context */
  docId?: string;
  /** Model to use (overrides default) */
  model?: string;
  /** Temperature (0-2) */
  temperature?: number;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Request timeout in ms */
  timeoutMs?: number;
  /** Trace context for distributed tracing */
  trace?: TraceContext;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
  /**
   * LFCC §11.1: Document frontier for conflict detection
   * For Loro: { loro_frontier: string[] }
   * For Yjs: { yjs_state_vector: string }
   */
  docFrontier?: DocFrontier;
}

/**
 * LFCC §11.1: Document frontier types
 * Represents the observed CRDT state boundary for AI precondition checks.
 */
export type DocFrontier = { loro_frontier: string[] };

/** Stream options (extends request options) */
export interface GatewayStreamOptions extends GatewayRequestOptions {
  /** Callback for each chunk */
  onChunk?: (chunk: GatewayStreamChunk) => void;
  /** Callback for usage stats (called at end) */
  onUsage?: (usage: TokenUsage) => void;
}

/** Gateway response */
export interface GatewayResponse {
  /** Generated content */
  content: string;
  /** Model used */
  model: string;
  /** Provider used */
  provider: string;
  /** Token usage */
  usage: TokenUsage;
  /** Latency in ms */
  latencyMs: number;
  /** Trace ID for debugging */
  traceId: string;
  /** Request ID */
  requestId: string;
  /** Finish reason */
  finishReason: string;
}

/** Stream chunk */
export interface GatewayStreamChunk {
  /** Chunk type */
  type: "content" | "usage" | "done" | "error";
  /** Content delta (for content type) */
  content?: string;
  /** Accumulated content so far */
  accumulated?: string;
  /** Usage stats (for usage type) */
  usage?: TokenUsage;
  /** Error message (for error type) */
  error?: string;
}

/** Health status */
export interface GatewayHealthStatus {
  /** Overall status */
  status: HealthStatus;
  /** Gateway version */
  version: string;
  /** Uptime in ms */
  uptimeMs: number;
  /** Provider health */
  providers: Record<string, ComponentHealth>;
  /** Circuit breaker states */
  circuitBreakers: Record<string, "closed" | "open" | "half_open">;
  /** Rate limiter status */
  rateLimiter?: {
    enabled: boolean;
    activeUsers: number;
  };
  /** Request stats */
  stats: {
    totalRequests: number;
    totalTokens: number;
    averageLatencyMs: number;
    errorRate: number;
  };
}

/** Telemetry event */
export interface GatewayTelemetryEvent {
  kind: "request" | "stream" | "error" | "health_check" | "rate_limit" | "fallback";
  timestamp: number;
  traceId: string;
  requestId: string;
  userId?: string;
  provider?: string;
  model?: string;
  durationMs?: number;
  tokenUsage?: TokenUsage;
  error?: {
    code: GatewayErrorCode;
    message: string;
  };
  metadata?: Record<string, unknown>;
}

/** Internal request context */
interface RequestContext {
  trace: TraceContext;
  requestId: string;
  userId: string;
  model: string;
  provider?: string;
  startTime: number;
}

interface StreamProcessingState {
  accumulated: string;
  totalUsage: TokenUsage;
  activeProvider?: string;
}

// ============================================================================
// Gateway Implementation
// ============================================================================

const GATEWAY_VERSION = "1.0.0";

/**
 * Unified AI Gateway - Single entry point for all AI operations.
 */
export class UnifiedAIGateway {
  private readonly config: Required<Pick<UnifiedGatewayConfig, "defaultModel" | "enableFallback">> &
    UnifiedGatewayConfig;
  private readonly router: ProviderRouter;
  private readonly tokenTracker: TokenTracker;
  private readonly healthAggregator;
  private readonly observability: ObservabilityContext;
  private readonly telemetryAdapter: GatewayTelemetryAdapter;
  private readonly pipeline: ResiliencePipeline;
  private readonly startTime: number;

  private totalRequests = 0;
  private totalErrors = 0;
  private totalLatencyMs = 0;

  constructor(config: UnifiedGatewayConfig) {
    if (config.providers.length === 0) {
      throw new Error("At least one provider is required");
    }

    this.startTime = Date.now();
    this.config = {
      ...config,
      defaultModel: config.defaultModel ?? getDefaultModelId(),
      enableFallback: config.enableFallback ?? true,
    };

    // Initialize observability
    this.observability = config.observability ?? createObservability({ prefix: "[AIGateway]" });
    this.telemetryAdapter = config.telemetryAdapter ?? createNoopGatewayTelemetryAdapter();

    // Initialize router
    const routerConfig: ProviderRouterConfig = {
      primaryProvider: config.primaryProvider ?? config.providers[0].name,
      fallbackOrder: config.providers.map((p) => p.name),
      enableFallback: this.config.enableFallback,
      healthCheckIntervalMs: config.health?.intervalMs ?? 30000,
      logger: this.observability.logger,
    };

    this.router = new ProviderRouter(routerConfig);
    for (const provider of config.providers) {
      this.router.registerProvider(provider);
    }

    // Initialize token tracker
    this.tokenTracker = new TokenTracker();
    if (config.rateLimiting?.enabled && config.rateLimiting.defaultLimits) {
      // Default limits are applied per-user on first request
    }

    // Initialize health aggregator
    this.healthAggregator = createHealthAggregator({
      timeoutMs: 5000,
      cacheDurationMs: 10000,
    });

    // Register provider health checks
    for (const provider of config.providers) {
      this.healthAggregator.register(provider.name, async () => {
        const startTime = Date.now();
        try {
          const health = await provider.healthCheck();
          return {
            name: provider.name,
            status: health.healthy ? "healthy" : "unhealthy",
            latencyMs: Date.now() - startTime,
            lastCheckedAt: Date.now(),
            details: { avgLatencyMs: health.avgLatencyMs },
            error: health.error,
          };
        } catch (error) {
          return {
            name: provider.name,
            status: "unhealthy" as const,
            latencyMs: Date.now() - startTime,
            lastCheckedAt: Date.now(),
            error: error instanceof Error ? error.message : String(error),
          };
        }
      });
    }

    // Start health checks if enabled
    if (config.health?.enabled !== false) {
      this.router.startHealthChecks();
    }

    // Initialize resilience pipeline
    this.pipeline = createResiliencePipeline(config.resilience);
  }

  // ==========================================================================
  // Core Operations
  // ==========================================================================

  /**
   * Generate a completion (non-streaming).
   */
  async complete(messages: Message[], options: GatewayRequestOptions): Promise<GatewayResponse> {
    const context = this.createContext(options);

    // Create generation trace
    const generation = this.telemetryAdapter.startGeneration({
      name: "gateway.complete",
      model: context.model,
      input: messages,
      metadata: {
        ...options.metadata,
        requestId: context.requestId,
        userId: options.userId,
        docId: options.docId,
      },
    });

    this.totalRequests++;
    this.observability.metrics.increment("gateway.requests", {
      operation: "complete",
    });

    try {
      // Check rate limits with estimated cost
      // Default estimation: input * 1.5 for output if not specified
      const estimatedInput = this.tokenTracker.countTokens(JSON.stringify(messages), context.model);
      const estimatedOutput = options.maxTokens ?? 1000;
      this.checkRateLimit(options.userId, estimatedInput + estimatedOutput);

      const routed = await this.pipeline.execute(
        async (signal) => {
          return this.observability.recordOperation(
            "gateway.complete.attempt",
            async () => {
              return this.router.completeWithProvider({
                model: context.model,
                messages,
                temperature: options.temperature,
                maxTokens: options.maxTokens,
                timeoutMs: options.timeoutMs,
                signal,
              });
            },
            { userId: options.userId, model: context.model }
          );
        },
        {
          operation: "gateway.complete",
          provider: context.provider,
          timeoutMs: options.timeoutMs,
          signal: options.signal,
          metadata: {
            requestId: context.requestId,
            userId: options.userId,
          },
        }
      );
      const response = routed.response;
      context.provider = routed.provider;

      // Track usage
      this.trackUsage(context, response.usage, "completion");

      const latencyMs = Date.now() - context.startTime;
      this.totalLatencyMs += latencyMs;

      // Update generation telemetry
      generation?.end({
        output: response.content,
        usage: {
          input: response.usage.inputTokens,
          output: response.usage.outputTokens,
          total: response.usage.totalTokens,
        },
        model: response.model,
        metadata: {
          latencyMs,
          provider: routed.provider,
          finishReason: response.finishReason,
        },
      });

      // Emit telemetry
      this.emitTelemetry({
        kind: "request",
        timestamp: Date.now(),
        traceId: context.trace.traceId,
        requestId: context.requestId,
        userId: options.userId,
        provider: routed.provider,
        model: response.model,
        durationMs: latencyMs,
        tokenUsage: response.usage,
      });

      return {
        content: response.content,
        model: response.model,
        provider: routed.provider,
        usage: response.usage,
        latencyMs,
        traceId: context.trace.traceId,
        requestId: context.requestId,
        finishReason: response.finishReason ?? "stop",
      };
    } catch (error) {
      // Log error to telemetry adapter
      generation?.end({
        statusMessage: error instanceof Error ? error.message : String(error),
        level: "ERROR",
      });
      return this.handleError(error, context, options);
    }
  }

  /**
   * Generate a streaming completion.
   */
  async *stream(
    messages: Message[],
    options: GatewayStreamOptions
  ): AsyncIterable<GatewayStreamChunk> {
    const context = this.createContext(options);

    // Create generation trace for stream
    const generation = this.telemetryAdapter.startGeneration({
      name: "gateway.stream",
      model: context.model,
      input: messages,
      metadata: {
        ...options.metadata,
        requestId: context.requestId,
        userId: options.userId,
        docId: options.docId,
      },
    });

    this.totalRequests++;
    this.observability.metrics.increment("gateway.requests", {
      operation: "stream",
    });

    try {
      // Check rate limits
      const estimatedInput = this.tokenTracker.countTokens(JSON.stringify(messages), context.model);
      const estimatedOutput = options.maxTokens ?? 1000;
      this.checkRateLimit(options.userId, estimatedInput + estimatedOutput);

      const streamState = this.createStreamState();

      // Execute stream with resilience
      const providerStream = await this.pipeline.executeStream(
        (signal) => {
          return this.router.streamWithProvider({
            model: context.model,
            messages,
            temperature: options.temperature,
            maxTokens: options.maxTokens,
            timeoutMs: options.timeoutMs,
            signal,
          });
        },
        {
          operation: "gateway.stream",
          timeoutMs: options.timeoutMs,
          signal: options.signal,
          metadata: {
            requestId: context.requestId,
            userId: options.userId,
          },
        }
      );

      const result = yield* this.consumeProviderStream(
        providerStream,
        streamState,
        options,
        context
      );
      context.provider = result.activeProvider;

      // Track usage
      this.trackUsage(context, result.totalUsage, "streaming");

      const latencyMs = Date.now() - context.startTime;
      this.totalLatencyMs += latencyMs;

      // Update generation telemetry
      generation?.end({
        output: result.accumulated,
        usage: {
          input: result.totalUsage.inputTokens,
          output: result.totalUsage.outputTokens,
          total: result.totalUsage.totalTokens,
        },
        metadata: {
          latencyMs,
          provider: result.activeProvider,
          finishReason: "stop", // Streaming usually ends with stop or explicit done. We assume stop here if successful.
        },
      });

      // Emit telemetry
      this.emitTelemetry({
        kind: "stream",
        timestamp: Date.now(),
        traceId: context.trace.traceId,
        requestId: context.requestId,
        userId: options.userId,
        model: context.model,
        provider: result.activeProvider,
        durationMs: latencyMs,
        tokenUsage: result.totalUsage,
      });

      yield { type: "done" };
    } catch (error) {
      generation?.end({
        statusMessage: error instanceof Error ? error.message : String(error),
        level: "ERROR",
        metadata: {
          provider: context.provider,
        },
      });
      this.handleStreamError(error, context, options);
      yield {
        type: "error",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ==========================================================================
  // Health & Monitoring
  // ==========================================================================

  /**
   * Get comprehensive health status.
   */
  async getHealth(): Promise<GatewayHealthStatus> {
    const systemHealth = await this.healthAggregator.getHealth();
    const routerHealth = this.router.getHealthStatus();

    const providers: Record<string, ComponentHealth> = {};
    for (const component of systemHealth.components) {
      providers[component.name] = component;
    }

    const circuitBreakers: Record<string, "closed" | "open" | "half_open"> = {};
    for (const [name, status] of routerHealth) {
      circuitBreakers[name] = status.consecutiveFailures >= 3 ? "open" : "closed";
    }

    const avgLatency = this.totalRequests > 0 ? this.totalLatencyMs / this.totalRequests : 0;
    const errorRate = this.totalRequests > 0 ? this.totalErrors / this.totalRequests : 0;

    return {
      status: systemHealth.status,
      version: GATEWAY_VERSION,
      uptimeMs: Date.now() - this.startTime,
      providers,
      circuitBreakers,
      rateLimiter: this.config.rateLimiting?.enabled
        ? {
            enabled: true,
            activeUsers: 0, // Would need to track this
          }
        : undefined,
      stats: {
        totalRequests: this.totalRequests,
        totalTokens:
          this.tokenTracker.getSummary().totalInputTokens +
          this.tokenTracker.getSummary().totalOutputTokens,
        averageLatencyMs: Math.round(avgLatency),
        errorRate: Math.round(errorRate * 10000) / 100,
      },
    };
  }

  /**
   * Format health for HTTP response.
   */
  async getHealthResponse(): Promise<{ status: number; body: SystemHealth }> {
    const health = await this.healthAggregator.getHealth();
    return formatHealthResponse(health);
  }

  /**
   * Check if gateway is healthy.
   */
  async isHealthy(): Promise<boolean> {
    const health = await this.healthAggregator.getHealth();
    return health.status === "healthy" || health.status === "degraded";
  }

  // ==========================================================================
  // Configuration
  // ==========================================================================

  /**
   * Set rate limits for a user.
   */
  setUserRateLimit(
    userId: string,
    limits: {
      requestsPerMinute?: number;
      tokensPerMinute?: number;
      tokensPerDay?: number;
    }
  ): void {
    this.tokenTracker.setRateLimit(userId, limits);
  }

  /**
   * Get usage summary.
   */
  getUsageSummary(options?: { userId?: string; startTime?: number; endTime?: number }) {
    return this.tokenTracker.getSummary(options);
  }

  /**
   * Get available providers.
   */
  getProviders(): string[] {
    return this.router.getProviderNames();
  }

  /**
   * Shutdown the gateway.
   */
  shutdown(): void {
    this.router.stopHealthChecks();
    this.observability.logger.info("Gateway shutdown");
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private createContext(options: GatewayRequestOptions): RequestContext {
    const trace = options.trace ?? createTraceContext();
    return {
      trace,
      requestId: trace.getRequestId(),
      userId: options.userId,
      model: options.model ?? this.config.defaultModel,
      startTime: Date.now(),
    };
  }

  private checkRateLimit(userId: string, estimatedTokens = 0): void {
    if (!this.config.rateLimiting?.enabled) {
      return;
    }

    const check = this.tokenTracker.checkRateLimit(userId, estimatedTokens);
    if (!check.allowed) {
      throw new GatewayError("RATE_LIMITED", check.reason ?? "Rate limit exceeded", {
        retryAfterMs: check.retryAfterMs,
      });
    }
  }

  private trackUsage(
    context: RequestContext,
    usage: TokenUsage,
    requestType: "completion" | "streaming" | "embedding"
  ): void {
    this.tokenTracker.record({
      requestId: context.requestId,
      userId: context.userId,
      model: context.model,
      provider: context.provider ?? "unknown",
      usage,
      requestType,
    });
  }

  private handleError(
    error: unknown,
    context: RequestContext,
    options: GatewayRequestOptions
  ): never {
    this.totalErrors++;

    const gatewayError =
      error instanceof GatewayError
        ? error
        : error instanceof Error
          ? fromProviderError(error, context.provider ?? "unknown", {
              traceId: context.trace.traceId,
              requestId: context.requestId,
              model: context.model,
            })
          : new GatewayError("INTERNAL_ERROR", String(error), {
              traceId: context.trace.traceId,
              requestId: context.requestId,
            });

    this.emitTelemetry({
      kind: "error",
      timestamp: Date.now(),
      traceId: context.trace.traceId,
      requestId: context.requestId,
      userId: options.userId,
      model: context.model,
      provider: context.provider,
      durationMs: Date.now() - context.startTime,
      error: {
        code: gatewayError.code,
        message: gatewayError.message,
      },
    });

    this.config.onError?.(gatewayError, context);

    throw gatewayError;
  }

  private handleStreamError(
    error: unknown,
    context: RequestContext,
    options: GatewayStreamOptions
  ): void {
    this.totalErrors++;

    const gatewayError =
      error instanceof GatewayError
        ? error
        : error instanceof Error
          ? fromProviderError(error, context.provider ?? "unknown", {
              traceId: context.trace.traceId,
              requestId: context.requestId,
              model: context.model,
            })
          : new GatewayError("INTERNAL_ERROR", String(error), {
              traceId: context.trace.traceId,
              requestId: context.requestId,
            });

    this.emitTelemetry({
      kind: "error",
      timestamp: Date.now(),
      traceId: context.trace.traceId,
      requestId: context.requestId,
      userId: options.userId,
      model: context.model,
      provider: context.provider,
      durationMs: Date.now() - context.startTime,
      error: {
        code: gatewayError.code,
        message: gatewayError.message,
      },
    });

    this.config.onError?.(gatewayError, context);
  }

  private emitTelemetry(event: GatewayTelemetryEvent): void {
    this.config.onTelemetry?.(event);
  }

  private createStreamState(): StreamProcessingState {
    return {
      accumulated: "",
      totalUsage: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      },
    };
  }

  private async *consumeProviderStream(
    providerStream: AsyncIterable<ProviderStreamChunk>,
    state: StreamProcessingState,
    options: GatewayStreamOptions,
    context: RequestContext
  ): AsyncGenerator<GatewayStreamChunk, StreamProcessingState> {
    for await (const chunk of providerStream) {
      const result = this.handleProviderChunk(chunk, state, options, context);
      if (result.streamChunk) {
        yield result.streamChunk;
      }
      if (result.error) {
        throw result.error;
      }
    }
    return state;
  }

  private handleProviderChunk(
    chunk: ProviderStreamChunk,
    state: StreamProcessingState,
    options: GatewayStreamOptions,
    context: RequestContext
  ): { streamChunk?: GatewayStreamChunk; error?: GatewayError } {
    if (chunk.provider) {
      state.activeProvider = chunk.provider;
      context.provider = chunk.provider;
    }

    if (chunk.type === "content" && chunk.content) {
      state.accumulated += chunk.content;
      const streamChunk: GatewayStreamChunk = {
        type: "content",
        content: chunk.content,
        accumulated: state.accumulated,
      };
      options.onChunk?.(streamChunk);
      return { streamChunk };
    }

    if (chunk.type === "usage" && chunk.usage) {
      state.totalUsage = chunk.usage;
      const streamChunk: GatewayStreamChunk = {
        type: "usage",
        usage: chunk.usage,
      };
      options.onUsage?.(chunk.usage);
      return { streamChunk };
    }

    if (chunk.type === "error") {
      const streamChunk: GatewayStreamChunk = {
        type: "error",
        error: chunk.error,
      };
      return {
        streamChunk,
        error: new GatewayError("PROVIDER_ERROR", chunk.error ?? "Stream error", {
          traceId: context.trace.traceId,
          requestId: context.requestId,
          provider: context.provider,
        }),
      };
    }

    return {};
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a unified AI gateway with sensible defaults.
 */
export function createUnifiedAIGateway(config: UnifiedGatewayConfig): UnifiedAIGateway {
  return new UnifiedAIGateway(config);
}
