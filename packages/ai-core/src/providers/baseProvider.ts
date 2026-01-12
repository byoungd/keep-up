/**
 * Base LLM Provider
 *
 * Abstract base class with shared functionality for LLM providers.
 * Handles metrics tracking and common utilities.
 */

import type {
  CompletionRequest,
  CompletionResponse,
  EmbeddingRequest,
  EmbeddingResponse,
  LLMProvider,
  ProviderConfig,
  ProviderHealth,
  ProviderMetrics,
  StreamChunk,
} from "./types";

/** Default provider configuration */
const DEFAULT_CONFIG: Required<Omit<ProviderConfig, "apiKey" | "organizationId">> = {
  baseUrl: "",
  timeoutMs: 30000,
  maxRetries: 3,
};

/**
 * Abstract base class for LLM providers.
 * Provides common functionality for metrics and health checks.
 */
export abstract class BaseLLMProvider implements LLMProvider {
  abstract readonly name: string;
  abstract readonly models: string[];
  abstract readonly defaultModel: string;

  protected readonly config: Required<Omit<ProviderConfig, "organizationId">> & {
    organizationId?: string;
  };

  protected metrics: ProviderMetrics;
  protected lastHealth: ProviderHealth | null = null;

  constructor(config: ProviderConfig) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };

    // Initialize metrics with empty provider - will be set lazily
    this.metrics = {
      provider: "",
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      avgLatencyMs: 0,
      lastRequestAt: 0,
    };
  }

  /**
   * Abstract method to implement completion logic.
   */
  abstract complete(request: CompletionRequest): Promise<CompletionResponse>;

  /**
   * Abstract method to implement streaming logic.
   */
  abstract stream(request: CompletionRequest): AsyncIterable<StreamChunk>;

  /**
   * Abstract method to implement embedding logic.
   */
  abstract embed(request: EmbeddingRequest): Promise<EmbeddingResponse>;

  /**
   * Health check with caching.
   */
  async healthCheck(): Promise<ProviderHealth> {
    const now = Date.now();

    // Return cached health if recent (within 30s)
    if (this.lastHealth && now - this.lastHealth.lastCheckAt < 30000) {
      return this.lastHealth;
    }

    try {
      const start = performance.now();
      await this.performHealthCheck();
      const latency = performance.now() - start;

      this.lastHealth = {
        healthy: true,
        lastCheckAt: now,
        avgLatencyMs: latency,
      };
    } catch (error) {
      this.lastHealth = {
        healthy: false,
        lastCheckAt: now,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }

    return this.lastHealth;
  }

  /**
   * Abstract method for provider-specific health check.
   */
  protected abstract performHealthCheck(): Promise<void>;

  /**
   * Get current metrics.
   */
  getMetrics(): ProviderMetrics {
    // Lazy initialize provider name
    if (!this.metrics.provider) {
      this.metrics.provider = this.name;
    }
    return { ...this.metrics };
  }

  /**
   * Reset metrics.
   */
  resetMetrics(): void {
    this.metrics = {
      provider: this.name,
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      avgLatencyMs: 0,
      lastRequestAt: 0,
    };
  }

  /**
   * Track a successful request.
   */
  protected trackSuccess(inputTokens: number, outputTokens: number, latencyMs: number): void {
    // Ensure provider name is set
    if (!this.metrics.provider) {
      this.metrics.provider = this.name;
    }
    this.metrics.totalRequests++;
    this.metrics.successfulRequests++;
    this.metrics.totalInputTokens += inputTokens;
    this.metrics.totalOutputTokens += outputTokens;
    this.metrics.lastRequestAt = Date.now();

    // Update average latency
    const totalLatency =
      this.metrics.avgLatencyMs * (this.metrics.successfulRequests - 1) + latencyMs;
    this.metrics.avgLatencyMs = totalLatency / this.metrics.successfulRequests;
  }

  /**
   * Track a failed request.
   */
  protected trackFailure(): void {
    // Ensure provider name is set
    if (!this.metrics.provider) {
      this.metrics.provider = this.name;
    }
    this.metrics.totalRequests++;
    this.metrics.failedRequests++;
    this.metrics.lastRequestAt = Date.now();
  }

  /**
   * Retry a request with exponential backoff.
   */
  protected async withRetry<T>(
    operation: () => Promise<T>,
    retries: number = this.config.maxRetries
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on non-retriable errors
        if (this.isNonRetriableError(lastError)) {
          throw lastError;
        }

        // Wait before retry (exponential backoff)
        if (attempt < retries) {
          const delay = Math.min(1000 * 2 ** attempt, 10000);
          await this.sleep(delay);
        }
      }
    }

    throw lastError ?? new Error("Request failed after retries");
  }

  /**
   * Check if an error is non-retriable.
   */
  protected isNonRetriableError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return (
      message.includes("invalid api key") ||
      message.includes("authentication") ||
      message.includes("unauthorized") ||
      message.includes("forbidden") ||
      message.includes("invalid request")
    );
  }

  /**
   * Sleep helper.
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Create abort signal with timeout.
   */
  protected createTimeoutSignal(timeoutMs: number): AbortSignal {
    return AbortSignal.timeout(timeoutMs);
  }

  /**
   * Combine an optional external signal with a timeout signal.
   */
  protected resolveTimeoutSignal(timeoutMs: number | undefined, signal?: AbortSignal): AbortSignal {
    const timeoutSignal = this.createTimeoutSignal(timeoutMs ?? this.config.timeoutMs);
    if (!signal) {
      return timeoutSignal;
    }
    return this.mergeSignals(signal, timeoutSignal);
  }

  /**
   * Resolve an optional signal/timeout pair for long-lived operations.
   */
  protected resolveOptionalSignal(
    timeoutMs?: number,
    signal?: AbortSignal
  ): AbortSignal | undefined {
    if (!timeoutMs && !signal) {
      return undefined;
    }
    if (!timeoutMs) {
      return signal;
    }
    const timeoutSignal = this.createTimeoutSignal(timeoutMs);
    if (!signal) {
      return timeoutSignal;
    }
    return this.mergeSignals(signal, timeoutSignal);
  }

  /**
   * Merge multiple abort signals.
   */
  protected mergeSignals(primary: AbortSignal, secondary: AbortSignal): AbortSignal {
    if (primary.aborted || secondary.aborted) {
      const controller = new AbortController();
      controller.abort(primary.aborted ? primary.reason : secondary.reason);
      return controller.signal;
    }

    const controller = new AbortController();
    const abort = () => controller.abort();
    primary.addEventListener("abort", abort, { once: true });
    secondary.addEventListener("abort", abort, { once: true });
    return controller.signal;
  }

  /**
   * Get model to use (fallback to default).
   */
  protected getModel(requestModel: string): string {
    if (this.models.includes(requestModel)) {
      return requestModel;
    }
    return this.defaultModel;
  }
}
