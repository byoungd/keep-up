/**
 * AI Gateway
 *
 * Central hub for all AI operations. Provides unified interface for
 * completions, streaming, embeddings, and RAG with automatic provider
 * routing, rate limiting, and audit logging.
 */

import {
  type AnthropicConfig,
  AnthropicProvider,
  type CircuitBreakerConfig,
  type CompletionRequest,
  type CompletionResponse,
  type EmbeddingRequest,
  type EmbeddingResponse,
  type LLMProvider,
  type Message,
  type ObservabilityContext,
  type OpenAIConfig,
  OpenAIProvider,
  type ProviderLogger,
  ProviderRouter,
  type ProviderRouterConfig,
  type ProviderSelector,
  type RequestQueueConfig,
  type RetryPolicyConfig,
  type StreamChunk,
  TokenTracker,
  type UsageSummary,
  createObservability,
  createResiliencePipeline,
  createResilientProvider,
  isRetryableError,
} from "@keepup/ai-core";
import type { AuditLogger } from "../audit/auditLogger";

/** AI Gateway configuration */
export interface AIGatewayConfig {
  /** OpenAI configuration (optional) */
  openai?: OpenAIConfig;
  /** Anthropic configuration (optional) */
  anthropic?: AnthropicConfig;
  /** Primary provider (default: first configured) */
  primaryProvider?: "openai" | "anthropic";
  /** Enable automatic fallback (default: true) */
  enableFallback?: boolean;
  /** Default model to use */
  defaultModel?: string;
  /** Audit logger for tracking AI actions */
  auditLogger?: AuditLogger;
  /** Enable rate limiting (default: false) */
  enableRateLimiting?: boolean;
  /** Default rate limits per user */
  defaultRateLimits?: {
    requestsPerMinute?: number;
    tokensPerMinute?: number;
    tokensPerDay?: number;
    costPerDayUsd?: number;
  };
  /** Observability context (logger/metrics/tracer) */
  observability?: ObservabilityContext;
  /** Resilience pipeline configuration overrides */
  resilience?: {
    retry?: Partial<RetryPolicyConfig> | false;
    circuitBreaker?: Partial<CircuitBreakerConfig> | false;
    queue?: Partial<RequestQueueConfig> | false;
  };
  /** Embedding cache configuration */
  embeddingCache?: {
    enabled?: boolean;
    maxEntries?: number;
    ttlMs?: number;
    maxSizeBytes?: number;
  };
  /** Optional provider selector for routing */
  providerSelector?: ProviderSelector;
  /** Optional router logger override */
  routerLogger?: ProviderLogger;
}

/** AI request options */
export interface AIRequestOptions {
  /** User ID for tracking and rate limiting */
  userId: string;
  /** Document ID for context */
  docId?: string;
  /** Override model */
  model?: string;
  /** Temperature (0-2) */
  temperature?: number;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Request timeout in ms */
  timeoutMs?: number;
}

/** Copilot request for inline suggestions */
export interface CopilotRequest {
  /** Current text before cursor */
  prefix: string;
  /** Current text after cursor (if any) */
  suffix?: string;
  /** Surrounding context (document excerpt) */
  context?: string;
  /** User ID */
  userId: string;
  /** Document ID */
  docId?: string;
  /** Maximum suggestion length in tokens */
  maxTokens?: number;
}

/** Copilot response */
export interface CopilotResponse {
  /** Suggested completion text */
  suggestion: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Token usage */
  usage: { inputTokens: number; outputTokens: number };
  /** Latency in ms */
  latencyMs: number;
}

// ============================================================================
// Defaults
// ============================================================================

const DEFAULT_RETRY_CONFIG: RetryPolicyConfig = {
  maxAttempts: 2,
  initialDelayMs: 1000,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
  jitterFactor: 0.1,
  timeoutMs: 30000,
  isRetryable: isRetryableError,
};

const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  resetTimeoutMs: 30000,
  failureWindowMs: 60000,
};

const DEFAULT_QUEUE_CONFIG: RequestQueueConfig = {
  maxConcurrent: 6,
  maxQueueSize: 200,
  defaultTimeoutMs: 30000,
  enableDedup: true,
  dedupWindowMs: 1000,
};

const DEFAULT_EMBEDDING_CACHE = {
  enabled: true,
  maxEntries: 500,
  ttlMs: 5 * 60 * 1000,
  maxSizeBytes: 0,
} as const;

function resolveResilienceConfig(overrides?: AIGatewayConfig["resilience"]): {
  retry: Partial<RetryPolicyConfig> | false;
  circuitBreaker: Partial<CircuitBreakerConfig> | false;
  queue: Partial<RequestQueueConfig> | false;
} {
  return {
    retry:
      overrides?.retry === false ? false : { ...DEFAULT_RETRY_CONFIG, ...(overrides?.retry ?? {}) },
    circuitBreaker:
      overrides?.circuitBreaker === false
        ? false
        : { ...DEFAULT_CIRCUIT_CONFIG, ...(overrides?.circuitBreaker ?? {}) },
    queue:
      overrides?.queue === false ? false : { ...DEFAULT_QUEUE_CONFIG, ...(overrides?.queue ?? {}) },
  };
}

function resolveEmbeddingCache(overrides?: AIGatewayConfig["embeddingCache"]): {
  enabled: boolean;
  maxEntries: number;
  ttlMs: number;
  maxSizeBytes: number;
} {
  return {
    enabled: overrides?.enabled ?? DEFAULT_EMBEDDING_CACHE.enabled,
    maxEntries: overrides?.maxEntries ?? DEFAULT_EMBEDDING_CACHE.maxEntries,
    ttlMs: overrides?.ttlMs ?? DEFAULT_EMBEDDING_CACHE.ttlMs,
    maxSizeBytes: overrides?.maxSizeBytes ?? DEFAULT_EMBEDDING_CACHE.maxSizeBytes,
  };
}

/**
 * AI Gateway - Central hub for AI operations.
 */
export class AIGateway {
  private readonly router: ProviderRouter;
  private readonly tokenTracker: TokenTracker;
  private readonly config: AIGatewayConfig;
  private readonly auditLogger?: AuditLogger;

  constructor(config: AIGatewayConfig) {
    this.config = config;
    this.auditLogger = config.auditLogger;
    this.tokenTracker = new TokenTracker();

    const observability = config.observability ?? createObservability({ prefix: "[AIGateway]" });
    const resilience = resolveResilienceConfig(config.resilience);
    const embeddingCache = resolveEmbeddingCache(config.embeddingCache);

    // Configure rate limits if enabled
    if (config.enableRateLimiting && config.defaultRateLimits) {
      // Will be applied per-user on first request
    }

    // Initialize providers
    const rawProviders: LLMProvider[] = [];

    if (config.openai?.apiKey) {
      rawProviders.push(new OpenAIProvider(config.openai));
    }

    if (config.anthropic?.apiKey) {
      rawProviders.push(new AnthropicProvider(config.anthropic));
    }

    if (rawProviders.length === 0) {
      throw new Error("At least one AI provider must be configured");
    }

    const providers = rawProviders.map((provider) => {
      const pipeline = createResiliencePipeline({
        retry: resilience.retry,
        circuitBreaker: resilience.circuitBreaker,
        queue: resilience.queue,
        observability,
      });

      return createResilientProvider(provider, {
        pipeline,
        cacheEmbeddings: embeddingCache.enabled
          ? {
              maxEntries: embeddingCache.maxEntries,
              ttlMs: embeddingCache.ttlMs,
              maxSizeBytes: embeddingCache.maxSizeBytes,
            }
          : false,
      });
    });

    // Determine primary provider
    const primaryProvider = config.primaryProvider ?? providers[0].name;

    // Create router
    const routerConfig: ProviderRouterConfig = {
      primaryProvider,
      fallbackOrder: providers.map((p) => p.name),
      enableFallback: config.enableFallback ?? true,
      logger: config.routerLogger ?? observability.logger,
      selector: config.providerSelector,
    };

    this.router = new ProviderRouter(routerConfig);
    for (const provider of providers) {
      this.router.registerProvider(provider);
    }

    // Start health checks
    this.router.startHealthChecks();
  }

  /**
   * Generate a completion (non-streaming).
   */
  async complete(messages: Message[], options: AIRequestOptions): Promise<CompletionResponse> {
    // Check rate limits
    if (this.config.enableRateLimiting) {
      const check = this.tokenTracker.checkRateLimit(options.userId);
      if (!check.allowed) {
        throw new Error(check.reason ?? "Rate limit exceeded");
      }
    }

    const request: CompletionRequest = {
      model: options.model ?? this.config.defaultModel ?? "gpt-4o-mini",
      messages,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      timeoutMs: options.timeoutMs,
    };

    const response = await this.router.complete(request);

    // Track usage
    this.tokenTracker.record({
      requestId: crypto.randomUUID(),
      userId: options.userId,
      model: response.model,
      provider: this.getPrimaryProviderName(),
      usage: response.usage,
      requestType: "completion",
    });

    // Audit log
    await this.auditLog("ai.complete", options.userId, options.docId, {
      model: response.model,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      latencyMs: response.latencyMs,
    });

    return response;
  }

  /**
   * Generate a streaming completion.
   */
  async *stream(messages: Message[], options: AIRequestOptions): AsyncIterable<StreamChunk> {
    // Check rate limits
    if (this.config.enableRateLimiting) {
      const check = this.tokenTracker.checkRateLimit(options.userId);
      if (!check.allowed) {
        yield { type: "error", error: check.reason ?? "Rate limit exceeded" };
        return;
      }
    }

    const request: CompletionRequest = {
      model: options.model ?? this.config.defaultModel ?? "gpt-4o-mini",
      messages,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      timeoutMs: options.timeoutMs,
    };

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const startTime = performance.now();

    for await (const chunk of this.router.stream(request)) {
      if (chunk.type === "usage" && chunk.usage) {
        totalInputTokens = chunk.usage.inputTokens;
        totalOutputTokens = chunk.usage.outputTokens;
      }
      yield chunk;
    }

    const latencyMs = performance.now() - startTime;

    // Track usage
    this.tokenTracker.record({
      requestId: crypto.randomUUID(),
      userId: options.userId,
      model: request.model,
      provider: this.getPrimaryProviderName(),
      usage: {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        totalTokens: totalInputTokens + totalOutputTokens,
      },
      requestType: "streaming",
    });

    // Audit log
    await this.auditLog("ai.stream", options.userId, options.docId, {
      model: request.model,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      latencyMs,
    });
  }

  /**
   * Generate embeddings.
   */
  async embed(
    texts: string[],
    options: AIRequestOptions & { model?: string; dimensions?: number }
  ): Promise<EmbeddingResponse> {
    const request: EmbeddingRequest = {
      model: options.model ?? "text-embedding-3-small",
      texts,
      dimensions: options.dimensions,
    };

    const response = await this.router.embed(request);

    // Track usage
    this.tokenTracker.record({
      requestId: crypto.randomUUID(),
      userId: options.userId,
      model: response.model,
      provider: "openai", // Embeddings are OpenAI-only for now
      usage: response.usage,
      requestType: "embedding",
    });

    return response;
  }

  /**
   * Generate a copilot suggestion for inline completion.
   */
  async copilot(request: CopilotRequest): Promise<CopilotResponse> {
    const systemPrompt = `You are an AI writing assistant. Complete the user's text naturally and concisely. Only output the completion, nothing else. Do not repeat text that's already there.`;

    const userPrompt = request.context
      ? `Context:\n${request.context}\n\nComplete this text:\n${request.prefix}`
      : `Complete this text:\n${request.prefix}`;

    const messages: Message[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    const response = await this.complete(messages, {
      userId: request.userId,
      docId: request.docId,
      maxTokens: request.maxTokens ?? 100,
      temperature: 0.7,
    });

    return {
      suggestion: response.content.trim(),
      confidence: 0.8, // TODO: Calculate based on model confidence
      usage: {
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
      },
      latencyMs: response.latencyMs,
    };
  }

  /**
   * Get usage summary.
   */
  getUsageSummary(options?: {
    userId?: string;
    startTime?: number;
    endTime?: number;
  }): UsageSummary {
    return this.tokenTracker.getSummary(options);
  }

  /**
   * Set rate limits for a user.
   */
  setUserRateLimit(
    userId: string,
    limits: {
      requestsPerMinute?: number;
      tokensPerMinute?: number;
      tokensPerDay?: number;
      costPerDayUsd?: number;
    }
  ): void {
    this.tokenTracker.setRateLimit(userId, limits);
  }

  /**
   * Get provider health status.
   */
  getHealthStatus(): Map<string, { isHealthy: boolean; consecutiveFailures: number }> {
    return this.router.getHealthStatus();
  }

  /**
   * Get available provider names.
   */
  getProviders(): string[] {
    return this.router.getProviderNames();
  }

  /**
   * Shutdown the gateway.
   */
  shutdown(): void {
    this.router.stopHealthChecks();
  }

  private getPrimaryProviderName(): string {
    return this.config.primaryProvider ?? this.router.getProviderNames()[0] ?? "unknown";
  }

  private async auditLog(
    action: string,
    userId: string,
    docId: string | undefined,
    metadata: Record<string, unknown>
  ): Promise<void> {
    if (!this.auditLogger) {
      return;
    }

    try {
      // Use the existing audit logger interface
      this.auditLogger.log({
        docId: docId ?? "unknown",
        actorId: userId,
        role: "editor", // AI actions are always from editors
        eventType: "UPDATE",
        metadata: {
          aiAction: action,
          ...metadata,
        },
      });
    } catch (error) {
      console.error("[AIGateway] Audit log failed:", error);
    }
  }
}

/**
 * Create an AI Gateway with environment-based configuration.
 */
export function createAIGateway(overrides: Partial<AIGatewayConfig> = {}): AIGateway {
  const config: AIGatewayConfig = {
    ...overrides,
  };

  const defaultModel = process.env.AI_GATEWAY_MODEL?.trim() ?? process.env.AI_DEFAULT_MODEL?.trim();
  if (defaultModel && !config.defaultModel) {
    config.defaultModel = defaultModel;
  }

  // Try to get API keys from environment
  const openaiKey = process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (openaiKey && !config.openai) {
    config.openai = {
      apiKey: openaiKey,
      organizationId: process.env.OPENAI_ORG_ID,
    };
  }

  if (anthropicKey && !config.anthropic) {
    config.anthropic = {
      apiKey: anthropicKey,
    };
  }

  return new AIGateway(config);
}
