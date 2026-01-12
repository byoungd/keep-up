/**
 * AI Client Service (Unified)
 *
 * Production-grade AI streaming client using @keepup/ai-core infrastructure:
 * - CircuitBreaker for fault tolerance
 * - RetryPolicy with exponential backoff
 * - ObservabilityContext for structured logging and metrics
 *
 * This is the single source of truth for frontend AI operations.
 */

import {
  AIError,
  CircuitBreaker,
  CircuitBreakerOpenError,
  type CircuitState,
  ConsoleLogger,
  type AIErrorCode as CoreAIErrorCode,
  InMemoryMetrics,
  ObservabilityContext,
  SimpleTracer,
  createRetryPolicy,
} from "@keepup/ai-core";

import { REQUEST_TIMEOUT_MS, SSE_DONE_MARKER } from "./constants";
import { parseSseText } from "./streamUtils";

// ============================================================================
// Types
// ============================================================================

export type AIRequestStatus = "idle" | "pending" | "streaming" | "done" | "error" | "canceled";

export type AIErrorCode =
  | "network_error"
  | "timeout"
  | "rate_limit"
  | "invalid_request"
  | "provider_error"
  | "circuit_open"
  | "canceled";

export interface AIStreamRequest {
  prompt: string;
  model: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  attachments?: Array<{ type: "image"; url: string }>;
  workflow?: "tdd" | "refactoring" | "debugging" | "research" | "none";
  systemPrompt?: string;
  signal?: AbortSignal;
}

export interface AIStreamCallbacks {
  onChunk: (content: string, accumulated: string) => void;
  onDone: (result: AIStreamResult) => void;
  onError: (error: AIClientError) => void;
}

export interface AIStreamResult {
  requestId: string;
  content: string;
  chunkCount: number;
  ttft: number | null;
  totalMs: number;
  attempts: number;
  /** AI confidence score (0-1), available when backend provides it */
  confidence?: number;
  /** AI provenance metadata, available when backend provides it */
  provenance?: {
    model_id: string;
    prompt_hash?: string;
    prompt_template_id?: string;
    input_context_hashes?: string[];
    rationale_summary?: string;
    temperature?: number;
  };
}

export interface AIServiceHealth {
  status: "healthy" | "degraded" | "unhealthy";
  circuitState: CircuitState;
  failureCount: number;
  lastFailureAt: number | null;
  retryAfterMs: number | null;
  metrics: {
    totalRequests: number;
    totalFailures: number;
    avgLatencyMs: number | null;
  };
}

// ============================================================================
// Error Class
// ============================================================================

export class AIClientError extends Error {
  readonly code: AIErrorCode;
  readonly requestId?: string;
  readonly retryAfterMs?: number;
  readonly isRetryable: boolean;
  readonly attempt?: number;

  constructor(
    code: AIErrorCode,
    message: string,
    options?: {
      requestId?: string;
      retryAfterMs?: number;
      cause?: Error;
      attempt?: number;
    }
  ) {
    super(message, { cause: options?.cause });
    this.name = "AIClientError";
    this.code = code;
    this.requestId = options?.requestId;
    this.retryAfterMs = options?.retryAfterMs;
    this.attempt = options?.attempt;
    this.isRetryable = code === "network_error" || code === "timeout" || code === "rate_limit";
  }

  static fromCoreError(error: AIError, requestId?: string): AIClientError {
    const codeMap: Record<CoreAIErrorCode, AIErrorCode> = {
      PROVIDER_UNAVAILABLE: "provider_error",
      PROVIDER_RATE_LIMITED: "rate_limit",
      PROVIDER_QUOTA_EXCEEDED: "rate_limit",
      PROVIDER_AUTH_FAILED: "provider_error",
      PROVIDER_INVALID_REQUEST: "invalid_request",
      PROVIDER_CONTENT_FILTERED: "provider_error",
      PROVIDER_CONTEXT_LENGTH_EXCEEDED: "invalid_request",
      NETWORK_TIMEOUT: "timeout",
      NETWORK_CONNECTION_FAILED: "network_error",
      NETWORK_DNS_FAILED: "network_error",
      VALIDATION_FAILED: "invalid_request",
      RATE_LIMIT_EXCEEDED: "rate_limit",
      CIRCUIT_BREAKER_OPEN: "circuit_open",
      QUEUE_FULL: "rate_limit",
      REQUEST_CANCELLED: "canceled",
      NO_RESULTS_FOUND: "provider_error",
      EMBEDDING_FAILED: "provider_error",
      INDEX_NOT_FOUND: "provider_error",
      UNKNOWN_ERROR: "provider_error",
    };

    return new AIClientError(codeMap[error.code] || "provider_error", error.message, {
      requestId,
      cause: error,
    });
  }
}

// ============================================================================
// Configuration
// ============================================================================

// AI chat API endpoint
const API_ENDPOINT = "/api/ai/chat";

const CIRCUIT_CONFIG = {
  failureThreshold: 3,
  successThreshold: 2,
  resetTimeoutMs: 30_000,
  failureWindowMs: 60_000,
} as const;

const RETRY_CONFIG = {
  maxAttempts: 2,
  initialDelayMs: 1000,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
  jitterFactor: 0.1,
  timeoutMs: REQUEST_TIMEOUT_MS,
} as const;

// ============================================================================
// Helpers
// ============================================================================

type StreamState = {
  content: string;
  lastDelta: string;
  chunkCount: number;
  firstChunkAt: number | null;
  ttft: number | null;
  metadata: AIMetadata | null;
};

type AIMetadata = {
  confidence?: number;
  provenance?: {
    model_id: string;
    prompt_hash?: string;
    prompt_template_id?: string;
    input_context_hashes?: string[];
    rationale_summary?: string;
    temperature?: number;
  };
};

function createStreamState(): StreamState {
  return {
    content: "",
    lastDelta: "",
    chunkCount: 0,
    firstChunkAt: null,
    ttft: null,
    metadata: null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function parseRetryAfterMs(response: Response): number | undefined {
  const header = response.headers.get("retry-after");
  if (!header) {
    return undefined;
  }

  const seconds = Number(header);
  if (!Number.isNaN(seconds)) {
    return seconds * 1000;
  }

  const date = Date.parse(header);
  if (!Number.isNaN(date)) {
    return Math.max(0, date - Date.now());
  }

  return undefined;
}

function parseErrorPayload(text: string): { message: string; code?: string; requestId?: string } {
  if (!text) {
    return { message: "Request failed" };
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    if (isRecord(parsed) && isRecord(parsed.error)) {
      const code = asString(parsed.error.code);
      const message = asString(parsed.error.message) ?? text;
      const requestId = asString(parsed.error.request_id);
      return { message, code, requestId };
    }
  } catch {
    return { message: text };
  }

  return { message: text };
}

function mapErrorCode(status: number, code?: string): AIErrorCode {
  if (code) {
    switch (code) {
      case "missing_prompt":
      case "invalid_model":
      case "unsupported_capability":
        return "invalid_request";
      case "config_error":
      case "provider_error":
        return "provider_error";
      default:
        break;
    }
  }

  if (status === 408 || status === 504) {
    return "timeout";
  }
  if (status === 429) {
    return "rate_limit";
  }
  if (status >= 500) {
    return "provider_error";
  }
  if (status >= 400) {
    return "invalid_request";
  }
  return "network_error";
}

function fallbackRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `req-${Date.now()}`;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function combineSignals(
  primary: AbortSignal,
  secondary?: AbortSignal
): { signal: AbortSignal; cleanup: () => void } {
  if (!secondary) {
    return { signal: primary, cleanup: () => undefined };
  }

  const controller = new AbortController();
  const abortHandler = () => controller.abort();
  const signals = [primary, secondary];

  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort();
      break;
    }
    signal.addEventListener("abort", abortHandler);
  }

  const cleanup = () => {
    for (const signal of signals) {
      signal.removeEventListener("abort", abortHandler);
    }
  };

  return { signal: controller.signal, cleanup };
}

function applyChunk(
  line: string,
  startedAt: number,
  state: StreamState,
  onChunk: (delta: string, accumulated: string) => void
): void {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) {
    return;
  }

  const payload = trimmed.slice(5).trim();
  if (!payload || payload === SSE_DONE_MARKER) {
    return;
  }

  // Check for metadata event (sent before [DONE])
  try {
    const parsed = JSON.parse(payload) as { metadata?: AIMetadata };
    if (parsed.metadata) {
      state.metadata = parsed.metadata;
      return;
    }
  } catch {
    // Not metadata, continue with content parsing
  }

  const delta = parseSseText(payload);
  if (!delta || delta === state.lastDelta) {
    return;
  }

  state.lastDelta = delta;
  state.content += delta;
  state.chunkCount += 1;

  if (!state.firstChunkAt) {
    state.firstChunkAt = performance.now();
    state.ttft = state.firstChunkAt - startedAt;
  }

  onChunk(delta, state.content);
}

async function readStream(
  body: ReadableStream<Uint8Array>,
  startedAt: number,
  onChunk: (delta: string, accumulated: string) => void
): Promise<Pick<AIStreamResult, "content" | "chunkCount" | "ttft" | "confidence" | "provenance">> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const state = createStreamState();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        applyChunk(line, startedAt, state, onChunk);
      }
    }

    if (buffer) {
      applyChunk(buffer, startedAt, state, onChunk);
    }
  } finally {
    reader.releaseLock();
  }

  return {
    content: state.content,
    chunkCount: state.chunkCount,
    ttft: state.ttft,
    confidence: state.metadata?.confidence,
    provenance: state.metadata?.provenance,
  };
}

// ============================================================================
// Client
// ============================================================================

class AIClientService {
  private readonly circuitBreaker = new CircuitBreaker(CIRCUIT_CONFIG);
  private readonly observability = new ObservabilityContext({
    logger: new ConsoleLogger({ prefix: "[AI Client]", minLevel: "info" }),
    metrics: new InMemoryMetrics(),
    tracer: new SimpleTracer(),
  });
  private readonly retryPolicy = createRetryPolicy({
    ...RETRY_CONFIG,
    isRetryable: (error: unknown) => {
      if (error instanceof AIClientError) {
        return error.isRetryable;
      }
      if (error instanceof AIError) {
        return AIClientError.fromCoreError(error).isRetryable;
      }
      if (error instanceof CircuitBreakerOpenError) {
        return false;
      }
      return isAbortError(error);
    },
    onRetry: (attempt: number, error: unknown, delayMs: number) => {
      const message = error instanceof Error ? error.message : "Unknown error";
      this.observability.logger.warn("Retrying AI request", {
        attempt,
        delayMs,
        error: message,
      });
    },
  });

  private totalRequests = 0;
  private totalFailures = 0;
  private totalLatencyMs = 0;
  private lastFailureAt: number | null = null;
  private retryAfterMs: number | null = null;

  getHealth(): AIServiceHealth {
    const circuitMetrics = this.circuitBreaker.getMetrics();
    const avgLatencyMs = this.totalRequests ? this.totalLatencyMs / this.totalRequests : null;

    let status: AIServiceHealth["status"] = "healthy";
    if (circuitMetrics.state === "OPEN") {
      status = "unhealthy";
    } else if (circuitMetrics.state === "HALF_OPEN" || this.totalFailures > 0) {
      status = "degraded";
    }

    return {
      status,
      circuitState: circuitMetrics.state,
      failureCount: circuitMetrics.failureCount,
      lastFailureAt: this.lastFailureAt,
      retryAfterMs: this.retryAfterMs,
      metrics: {
        totalRequests: this.totalRequests,
        totalFailures: this.totalFailures,
        avgLatencyMs,
      },
    };
  }

  async stream(request: AIStreamRequest, callbacks: AIStreamCallbacks): Promise<void> {
    this.totalRequests += 1;
    this.observability.metrics.increment("ai.stream.request", {
      model: request.model,
    });
    const startedAt = performance.now();

    try {
      const result = await this.observability.recordOperation(
        "ai.stream",
        async () => this.executeStream(request, callbacks),
        { model: request.model }
      );

      this.totalLatencyMs += performance.now() - startedAt;
      callbacks.onDone(result);
    } catch (error) {
      const clientError = this.normalizeError(error, request.signal);
      if (clientError.code !== "canceled") {
        this.totalFailures += 1;
        this.lastFailureAt = Date.now();
        this.retryAfterMs = clientError.retryAfterMs ?? null;
        this.observability.metrics.increment("ai.stream.failure", {
          model: request.model,
          code: clientError.code,
        });
      }
      callbacks.onError(clientError);
    }
  }

  private async executeStream(
    request: AIStreamRequest,
    callbacks: AIStreamCallbacks
  ): Promise<AIStreamResult> {
    return this.circuitBreaker.execute(async () => {
      const retryResult = await this.retryPolicy.execute(
        async (_attempt: number, signal: AbortSignal) => {
          const combined = combineSignals(signal, request.signal);
          try {
            return await this.performStream(request, callbacks, combined.signal);
          } finally {
            combined.cleanup();
          }
        }
      );

      if (retryResult.result._tag === "Ok") {
        return {
          ...retryResult.result.value,
          attempts: retryResult.attempts.length,
        };
      }

      throw retryResult.result.error;
    });
  }

  private async performStream(
    request: AIStreamRequest,
    callbacks: AIStreamCallbacks,
    signal: AbortSignal
  ): Promise<Omit<AIStreamResult, "attempts">> {
    const startedAt = performance.now();
    const response = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-model": request.model,
      },
      body: JSON.stringify({
        prompt: request.prompt,
        model: request.model,
        stream: true,
        messages: request.history ?? [],
        attachments: request.attachments,
        workflow: request.workflow,
        systemPrompt: request.systemPrompt,
      }),
      signal,
    });

    const fallbackId = fallbackRequestId();
    const headerRequestId = response.headers.get("x-request-id") ?? fallbackId;

    if (!response.ok || !response.body) {
      const errorInfo = parseErrorPayload(await response.text());
      const code = mapErrorCode(response.status, errorInfo.code);
      throw new AIClientError(code, errorInfo.message, {
        requestId: errorInfo.requestId ?? headerRequestId,
        retryAfterMs: parseRetryAfterMs(response),
      });
    }

    const streamData = await readStream(response.body, startedAt, callbacks.onChunk);

    return {
      requestId: headerRequestId,
      content: streamData.content,
      chunkCount: streamData.chunkCount,
      ttft: streamData.ttft,
      totalMs: performance.now() - startedAt,
    };
  }

  private normalizeError(error: unknown, signal?: AbortSignal): AIClientError {
    if (signal?.aborted) {
      return new AIClientError("canceled", "Request canceled");
    }

    if (error instanceof AIClientError) {
      return error;
    }

    if (error instanceof CircuitBreakerOpenError) {
      return new AIClientError("circuit_open", "AI service temporarily unavailable", {
        retryAfterMs: error.retryAfterMs,
      });
    }

    if (error instanceof AIError) {
      return AIClientError.fromCoreError(error);
    }

    if (isAbortError(error)) {
      return new AIClientError("timeout", "Request timed out");
    }

    if (error instanceof Error) {
      return new AIClientError("network_error", error.message);
    }

    return new AIClientError("network_error", "Unknown error");
  }
}

export const aiClient = new AIClientService();
