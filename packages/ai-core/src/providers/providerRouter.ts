/**
 * Provider Router
 *
 * Routes AI requests to the appropriate LLM provider with automatic
 * fallback, load balancing, and health-aware routing.
 */

import type {
  CompletionRequest,
  CompletionResponse,
  EmbeddingRequest,
  EmbeddingResponse,
  LLMProvider,
  ProviderHealth,
  ProviderMetrics,
  StreamChunk,
} from "./types";

/** Provider operation types */
export type ProviderOperation = "complete" | "stream" | "embed";

/** Provider candidate for routing */
export interface ProviderCandidate {
  provider: LLMProvider;
  isHealthy: boolean;
  consecutiveFailures: number;
  lastFailureAt: number;
}

/** Provider selector callback */
export type ProviderSelector = (
  candidates: ProviderCandidate[],
  context: { operation: ProviderOperation; request: CompletionRequest | EmbeddingRequest }
) => ProviderCandidate[];

/** Optional logger for routing events */
export interface ProviderLogger {
  debug?: (message: string, context?: Record<string, unknown>) => void;
  info?: (message: string, context?: Record<string, unknown>) => void;
  warn?: (message: string, context?: Record<string, unknown>) => void;
  error?: (message: string, error?: Error, context?: Record<string, unknown>) => void;
}

/** Router configuration */
export interface ProviderRouterConfig {
  /** Primary provider name */
  primaryProvider: string;
  /** Fallback provider order */
  fallbackOrder: string[];
  /** Health check interval in ms (default: 30000) */
  healthCheckIntervalMs?: number;
  /** Whether to enable automatic fallback (default: true) */
  enableFallback?: boolean;
  /** Maximum consecutive failures before marking unhealthy (default: 3) */
  maxConsecutiveFailures?: number;
  /** Optional logger for routing events */
  logger?: ProviderLogger;
  /** Optional provider selector */
  selector?: ProviderSelector;
}

/** Provider state tracking */
interface ProviderState {
  provider: LLMProvider;
  consecutiveFailures: number;
  lastFailureAt: number;
  isHealthy: boolean;
}

/**
 * Provider Router with automatic fallback and health tracking.
 */
export class ProviderRouter {
  private readonly providers = new Map<string, ProviderState>();
  private readonly config: Required<Omit<ProviderRouterConfig, "logger" | "selector">>;
  private readonly logger: ProviderLogger;
  private readonly selector?: ProviderSelector;
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: ProviderRouterConfig) {
    this.config = {
      primaryProvider: config.primaryProvider,
      fallbackOrder: config.fallbackOrder,
      healthCheckIntervalMs: config.healthCheckIntervalMs ?? 30000,
      enableFallback: config.enableFallback ?? true,
      maxConsecutiveFailures: config.maxConsecutiveFailures ?? 3,
    };
    this.logger = config.logger ?? {
      warn: (message, context) => {
        if (context) {
          console.warn(message, context);
        } else {
          console.warn(message);
        }
      },
      error: (message, error, context) => {
        if (context) {
          console.error(message, error?.message ?? "", context);
        } else {
          console.error(message, error?.message ?? "");
        }
      },
    };
    this.selector = config.selector;
  }

  /**
   * Register a provider.
   */
  registerProvider(provider: LLMProvider): void {
    this.providers.set(provider.name, {
      provider,
      consecutiveFailures: 0,
      lastFailureAt: 0,
      isHealthy: true,
    });
  }

  /**
   * Get a provider by name.
   */
  getProvider(name: string): LLMProvider | undefined {
    return this.providers.get(name)?.provider;
  }

  /**
   * Get all registered provider names.
   */
  getProviderNames(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Start periodic health checks.
   */
  startHealthChecks(): void {
    if (this.healthCheckInterval) {
      return;
    }

    this.healthCheckInterval = setInterval(async () => {
      await this.checkAllProviderHealth();
    }, this.config.healthCheckIntervalMs);

    // Run initial health check
    this.checkAllProviderHealth();
  }

  /**
   * Stop health checks.
   */
  stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * Check health of all providers.
   */
  async checkAllProviderHealth(): Promise<Map<string, ProviderHealth>> {
    const results = new Map<string, ProviderHealth>();

    const checks = Array.from(this.providers.entries()).map(async ([name, state]) => {
      try {
        const health = await state.provider.healthCheck();
        state.isHealthy = health.healthy;
        if (health.healthy) {
          state.consecutiveFailures = 0;
        }
        results.set(name, health);
      } catch (error) {
        state.isHealthy = false;
        results.set(name, {
          healthy: false,
          lastCheckAt: Date.now(),
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    await Promise.allSettled(checks);
    return results;
  }

  /**
   * Route a completion request to the best available provider.
   */
  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const providers = this.getOrderedProviders("complete", request);

    for (const state of providers) {
      if (!state.isHealthy && this.config.enableFallback) {
        continue;
      }

      try {
        const response = await state.provider.complete(request);
        this.recordSuccess(state);
        return response;
      } catch (error) {
        this.recordFailure(state);

        if (!this.config.enableFallback) {
          throw error;
        }

        // Continue to next provider if fallback enabled
        this.logger.warn?.("Provider failed, trying fallback", {
          provider: state.provider.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    throw new Error("All providers failed or are unhealthy");
  }

  /**
   * Route a streaming request to the best available provider.
   */
  async *stream(request: CompletionRequest): AsyncIterable<StreamChunk> {
    const providers = this.getOrderedProviders("stream", request);
    let lastError: Error | null = null;

    for (const state of providers) {
      if (this.shouldSkipProvider(state)) {
        continue;
      }

      try {
        const outcome = { hasYielded: false, sawError: false };
        yield* this.streamFromProvider(state, request, outcome);

        if (this.finalizeStreamOutcome(outcome, state)) {
          return;
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.recordFailure(state);

        if (!this.config.enableFallback) {
          throw error;
        }

        this.logger.warn?.("Provider stream failed, trying fallback", {
          provider: state.provider.name,
          error: lastError.message,
        });
      }
    }

    yield {
      type: "error",
      error: lastError?.message ?? "All providers failed or are unhealthy",
    };
  }

  /**
   * Route an embedding request to the best available provider.
   * Note: Not all providers support embeddings.
   */
  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const providers = this.getOrderedProviders("embed", request);

    for (const state of providers) {
      if (this.shouldSkipProvider(state)) {
        continue;
      }

      try {
        const response = await state.provider.embed(request);
        this.recordSuccess(state);
        return response;
      } catch (error) {
        // Check if this is a "not supported" error vs a transient failure
        if (this.isNotSupportedError(error)) {
          // Skip this provider, don't count as failure
          continue;
        }

        this.recordFailure(state);

        if (!this.config.enableFallback) {
          throw error;
        }

        this.logger.warn?.("Provider embed failed, trying fallback", {
          provider: state.provider.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    throw new Error("No providers support embeddings or all failed");
  }

  /**
   * Get aggregated metrics from all providers.
   */
  getMetrics(): Map<string, ProviderMetrics> {
    const metrics = new Map<string, ProviderMetrics>();
    for (const [name, state] of this.providers) {
      metrics.set(name, state.provider.getMetrics());
    }
    return metrics;
  }

  /**
   * Get health status of all providers.
   */
  getHealthStatus(): Map<string, { isHealthy: boolean; consecutiveFailures: number }> {
    const status = new Map<string, { isHealthy: boolean; consecutiveFailures: number }>();
    for (const [name, state] of this.providers) {
      status.set(name, {
        isHealthy: state.isHealthy,
        consecutiveFailures: state.consecutiveFailures,
      });
    }
    return status;
  }

  /**
   * Get providers in order of preference (primary first, then fallbacks).
   */
  private getOrderedProviders(
    operation: ProviderOperation,
    request: CompletionRequest | EmbeddingRequest
  ): ProviderState[] {
    const ordered = this.buildDefaultOrder();
    if (!this.selector) {
      return ordered;
    }

    const candidates = this.buildCandidates(ordered);
    const selected = this.selector(candidates, { operation, request });
    return this.applySelection(ordered, selected);
  }

  private buildDefaultOrder(): ProviderState[] {
    const ordered: ProviderState[] = [];

    const primary = this.providers.get(this.config.primaryProvider);
    if (primary) {
      ordered.push(primary);
    }

    for (const name of this.config.fallbackOrder) {
      if (name === this.config.primaryProvider) {
        continue;
      }
      const state = this.providers.get(name);
      if (state) {
        ordered.push(state);
      }
    }

    for (const [, state] of this.providers) {
      if (!ordered.includes(state)) {
        ordered.push(state);
      }
    }

    return ordered;
  }

  private buildCandidates(ordered: ProviderState[]): ProviderCandidate[] {
    return ordered.map((state) => ({
      provider: state.provider,
      isHealthy: state.isHealthy,
      consecutiveFailures: state.consecutiveFailures,
      lastFailureAt: state.lastFailureAt,
    }));
  }

  private applySelection(ordered: ProviderState[], selected: ProviderCandidate[]): ProviderState[] {
    if (selected.length === 0) {
      return ordered;
    }

    const result: ProviderState[] = [];
    const seen = new Set<string>();
    for (const candidate of selected) {
      const name = candidate.provider.name;
      if (seen.has(name)) {
        continue;
      }
      const state = this.providers.get(name);
      if (state) {
        result.push(state);
        seen.add(name);
      }
    }

    return result.length > 0 ? result : ordered;
  }

  /**
   * Record a successful request.
   */
  private recordSuccess(state: ProviderState): void {
    state.consecutiveFailures = 0;
    state.isHealthy = true;
  }

  /**
   * Record a failed request.
   */
  private recordFailure(state: ProviderState): void {
    state.consecutiveFailures++;
    state.lastFailureAt = Date.now();

    if (state.consecutiveFailures >= this.config.maxConsecutiveFailures) {
      state.isHealthy = false;
    }
  }

  private shouldSkipProvider(state: ProviderState): boolean {
    return !state.isHealthy && this.config.enableFallback;
  }

  private isNotSupportedError(error: unknown): boolean {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return errorMessage.includes("not support") || errorMessage.includes("not available");
  }

  private async *streamFromProvider(
    state: ProviderState,
    request: CompletionRequest,
    outcome: { hasYielded: boolean; sawError: boolean }
  ): AsyncIterable<StreamChunk> {
    for await (const chunk of state.provider.stream(request)) {
      outcome.hasYielded = true;
      yield chunk;

      // If we got an error chunk, don't try fallback (stream was established)
      if (chunk.type === "error") {
        outcome.sawError = true;
        return;
      }
    }
  }

  private finalizeStreamOutcome(
    outcome: { hasYielded: boolean; sawError: boolean },
    state: ProviderState
  ): boolean {
    if (outcome.sawError) {
      this.recordFailure(state);
      return true;
    }

    if (outcome.hasYielded) {
      this.recordSuccess(state);
      return true;
    }

    return false;
  }
}

/**
 * Create a provider router with default configuration.
 */
export function createProviderRouter(
  providers: LLMProvider[],
  options: Partial<ProviderRouterConfig> = {}
): ProviderRouter {
  if (providers.length === 0) {
    throw new Error("At least one provider is required");
  }

  const primaryProvider = options.primaryProvider ?? providers[0].name;
  const fallbackOrder = options.fallbackOrder ?? providers.map((p) => p.name);

  const router = new ProviderRouter({
    primaryProvider,
    fallbackOrder,
    ...options,
  });

  for (const provider of providers) {
    router.registerProvider(provider);
  }

  return router;
}
