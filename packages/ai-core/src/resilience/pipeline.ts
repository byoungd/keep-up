/**
 * Resilience Pipeline
 *
 * Composable execution pipeline that wraps AI operations with
 * retry, circuit breaker, queueing, and observability.
 */

import { isOk } from "../types/result";
import { CircuitBreaker, type CircuitBreakerConfig } from "./circuitBreaker";
import { isRetryableError } from "./errors";
import type { ObservabilityContext, Span } from "./observability";
import { type RequestPriority, RequestQueue, type RequestQueueConfig } from "./requestQueue";
import { RetryPolicy, type RetryPolicyConfig } from "./retryPolicy";

// ============================================================================
// Types
// ============================================================================

export interface ResilienceContext {
  /** Operation name for logging/metrics */
  operation: string;
  /** Provider name for routing/metrics */
  provider?: string;
  /** Additional metric labels */
  labels?: Record<string, string>;
  /** Additional log metadata */
  metadata?: Record<string, unknown>;
  /** Queue priority */
  priority?: RequestPriority;
  /** Deduplication key (if queue supports dedup) */
  dedupKey?: string;
  /** Per-request timeout override in ms */
  timeoutMs?: number;
  /** External abort signal */
  signal?: AbortSignal;
}

export interface ResiliencePipelineConfig {
  /** Retry policy or config (disabled when false/undefined) */
  retry?: RetryPolicy | Partial<RetryPolicyConfig> | false;
  /** Circuit breaker instance or config (disabled when false/undefined) */
  circuitBreaker?: CircuitBreaker | Partial<CircuitBreakerConfig> | false;
  /** Request queue instance or config (disabled when false/undefined) */
  queue?: RequestQueue | Partial<RequestQueueConfig> | false;
  /** Observability context for logs/metrics/traces */
  observability?: ObservabilityContext;
}

type ResilienceOperation<T> = (signal: AbortSignal) => Promise<T>;
type ResilienceStreamOperation<T> = (signal: AbortSignal) => AsyncIterable<T>;

// ============================================================================
// Pipeline
// ============================================================================

export class ResiliencePipeline {
  private readonly baseRetryConfig?: Partial<RetryPolicyConfig>;
  private readonly retryPolicy?: RetryPolicy;
  private readonly circuitBreaker?: CircuitBreaker;
  private readonly queue?: RequestQueue;
  private readonly observability?: ObservabilityContext;

  constructor(config: ResiliencePipelineConfig = {}) {
    if (config.retry instanceof RetryPolicy) {
      this.retryPolicy = config.retry;
    } else if (config.retry) {
      this.baseRetryConfig = config.retry;
    }

    if (config.circuitBreaker instanceof CircuitBreaker) {
      this.circuitBreaker = config.circuitBreaker;
    } else if (config.circuitBreaker) {
      this.circuitBreaker = new CircuitBreaker(config.circuitBreaker);
    }

    if (config.queue instanceof RequestQueue) {
      this.queue = config.queue;
    } else if (config.queue) {
      this.queue = new RequestQueue(config.queue);
    }

    this.observability = config.observability;
  }

  /**
   * Execute a promise-based operation through the pipeline.
   */
  async execute<T>(operation: ResilienceOperation<T>, context: ResilienceContext): Promise<T> {
    const labels = this.buildLabels(context);
    const logContext = this.buildLogContext(labels, context.metadata);

    const run = async (signal: AbortSignal): Promise<T> => {
      if (signal.aborted) {
        throw new Error("Operation cancelled");
      }
      const executeOperation = () => operation(signal);
      return this.circuitBreaker
        ? this.circuitBreaker.execute(executeOperation)
        : executeOperation();
    };

    const runWithRetry = async (): Promise<T> => {
      if (this.retryPolicy) {
        const { result } = await this.retryPolicy.execute((_attempt, signal) => {
          return run(this.mergeSignals(signal, context.signal));
        });

        if (isOk(result)) {
          return result.value;
        }
        throw result.error;
      }

      if (!this.baseRetryConfig) {
        const signal = this.createSignal(context.timeoutMs);
        return run(this.mergeSignals(signal, context.signal));
      }

      const retryPolicy = this.createRetryPolicy(context, logContext);
      const { result } = await retryPolicy.execute((_attempt, signal) => {
        return run(this.mergeSignals(signal, context.signal));
      });

      if (isOk(result)) {
        return result.value;
      }
      throw result.error;
    };

    const runWithQueue = () => {
      if (!this.queue) {
        return runWithRetry();
      }
      return this.queue.enqueue(runWithRetry, {
        priority: context.priority,
        timeoutMs: context.timeoutMs,
        dedupKey: context.dedupKey,
      });
    };

    if (!this.observability) {
      return runWithQueue();
    }

    return this.observability.recordOperation(context.operation, runWithQueue, labels);
  }

  /**
   * Execute a streaming operation through the pipeline.
   */
  async executeStream<T>(
    operation: ResilienceStreamOperation<T>,
    context: ResilienceContext
  ): Promise<AsyncIterable<T>> {
    const labels = this.buildLabels(context);
    const logContext = this.buildLogContext(labels, context.metadata);
    const observability = this.observability;

    const startTime = performance.now();
    const span = observability?.tracer.startSpan(context.operation);
    observability?.logger.debug(`Starting ${context.operation}`, logContext);

    const run = async (): Promise<AsyncIterable<T>> => {
      if (context.signal?.aborted) {
        throw new Error("Operation cancelled");
      }
      const signal = this.mergeSignals(this.createSignal(context.timeoutMs), context.signal);
      const executeOperation = () => Promise.resolve(operation(signal));
      return this.circuitBreaker
        ? this.circuitBreaker.execute(executeOperation)
        : executeOperation();
    };

    const runWithQueue = () => {
      if (!this.queue) {
        return run();
      }
      return this.queue.enqueue(run, {
        priority: context.priority,
        timeoutMs: context.timeoutMs,
        dedupKey: context.dedupKey,
      });
    };

    let iterable: AsyncIterable<T>;
    try {
      iterable = await runWithQueue();
    } catch (error) {
      this.recordStreamResult("error", startTime, labels, observability, span, error);
      throw error;
    }

    const recordOnce = this.createStreamRecorder(startTime, labels, observability, span);

    return (async function* streamWrapper(): AsyncIterable<T> {
      try {
        for await (const chunk of iterable) {
          yield chunk;
        }
        recordOnce("ok");
      } catch (error) {
        recordOnce("error", error);
        throw error;
      }
    })();
  }

  private buildLabels(context: ResilienceContext): Record<string, string> {
    const labels: Record<string, string> = { ...(context.labels ?? {}) };
    if (context.provider) {
      labels.provider = context.provider;
    }
    labels.operation = context.operation;
    return labels;
  }

  private buildLogContext(
    labels: Record<string, string>,
    metadata?: Record<string, unknown>
  ): Record<string, unknown> {
    return metadata ? { ...labels, ...metadata } : { ...labels };
  }

  private createRetryPolicy(
    context: ResilienceContext,
    logContext: Record<string, unknown>
  ): RetryPolicy {
    const userOnRetry = this.baseRetryConfig?.onRetry;
    const onRetry = this.observability
      ? (attempt: number, error: unknown, delayMs: number) => {
          userOnRetry?.(attempt, error, delayMs);
          this.observability?.logger.warn("Retrying operation", {
            ...logContext,
            attempt,
            delayMs,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      : userOnRetry;

    return new RetryPolicy({
      ...this.baseRetryConfig,
      timeoutMs: context.timeoutMs ?? this.baseRetryConfig?.timeoutMs,
      isRetryable: this.baseRetryConfig?.isRetryable ?? isRetryableError,
      onRetry,
    });
  }

  private createSignal(timeoutMs?: number): AbortSignal {
    if (timeoutMs && typeof AbortSignal.timeout === "function") {
      return AbortSignal.timeout(timeoutMs);
    }
    return new AbortController().signal;
  }

  private mergeSignals(primary: AbortSignal, secondary?: AbortSignal): AbortSignal {
    if (!secondary) {
      return primary;
    }
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

  private createStreamRecorder(
    startTime: number,
    labels: Record<string, string>,
    observability?: ObservabilityContext,
    span?: Span
  ): (status: "ok" | "error", error?: unknown) => void {
    let recorded = false;
    return (status: "ok" | "error", error?: unknown) => {
      if (recorded) {
        return;
      }
      recorded = true;
      this.recordStreamResult(status, startTime, labels, observability, span, error);
    };
  }

  private recordStreamResult(
    status: "ok" | "error",
    startTime: number,
    labels: Record<string, string>,
    observability?: ObservabilityContext,
    span?: Span,
    error?: unknown
  ): void {
    if (!observability) {
      return;
    }
    const duration = performance.now() - startTime;
    observability.metrics.histogram(`ai.${labels.operation}.duration_ms`, duration, labels);
    observability.metrics.increment(`ai.${labels.operation}.${status}`, labels);

    if (status === "error") {
      observability.logger.error(
        `Failed ${labels.operation}`,
        error instanceof Error ? error : undefined,
        { ...labels, durationMs: duration }
      );
      if (span) {
        observability.tracer.finishSpan(span, "error");
      }
      return;
    }

    observability.logger.info(`Completed ${labels.operation}`, { ...labels, durationMs: duration });
    if (span) {
      observability.tracer.finishSpan(span, "ok");
    }
  }
}

/**
 * Create a resilience pipeline with the given configuration.
 */
export function createResiliencePipeline(
  config: ResiliencePipelineConfig = {}
): ResiliencePipeline {
  return new ResiliencePipeline(config);
}
