/**
 * AI Client Service (Unified)
 *
 * Lightweight AI streaming client that delegates resilience to the server.
 *
 * Design Philosophy:
 * - Server-side handles circuit breaker, retry, and rate limiting
 * - Client focuses on: SSE parsing, cancellation, local health tracking
 * - Fetches health status from /api/ai/health endpoint
 *
 * This eliminates duplicate resilience logic between frontend and backend.
 */

import { AIError, type AIErrorCode as CoreAIErrorCode } from "@ku0/ai-core";
import { DEFAULT_POLICY_MANIFEST, generateRequestId } from "@ku0/core";

import { type AgentStreamEvent, parseAgentStreamEvent } from "./agentStream";
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
  mode?: "chat" | "agent";
  requestId?: string;
  clientRequestId?: string;
  policyContext?: { policy_id?: string; redaction_profile?: string; data_access_profile?: string };
  agentId?: string;
  intentId?: string;
  signal?: AbortSignal;
}

export interface AIStreamCallbacks {
  onChunk: (content: string, accumulated: string) => void;
  onDone: (result: AIStreamResult) => void;
  onError: (error: AIClientError) => void;
  onEvent?: (event: AgentStreamEvent) => void;
}

export interface AIStreamResult {
  requestId: string;
  content: string;
  chunkCount: number;
  ttft: number | null;
  totalMs: number;
  attempts: number;
  agentId?: string;
  intentId?: string;
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
  /** Server-side health data when available */
  serverHealth?: {
    providers: Array<{ name: string; status: string; latencyMs?: number }>;
    summary: { healthy: number; degraded: number; unhealthy: number };
  };
  /** Local client metrics */
  metrics: {
    totalRequests: number;
    totalFailures: number;
    avgLatencyMs: number | null;
  };
  lastFailureAt: number | null;
  retryAfterMs: number | null;
}

export interface AIConfirmationRequest {
  confirmationId: string;
  confirmed: boolean;
  requestId?: string;
}

export interface AIConfirmationResult {
  confirmationId: string;
  confirmed: boolean;
  requestId?: string;
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

// AI API endpoints
const API_ENDPOINT = "/api/ai/chat";
const AGENT_ENDPOINT = "/api/ai/agent";
const AGENT_CONFIRM_ENDPOINT = "/api/ai/agent/confirm";

type NormalizedStreamRequest = AIStreamRequest & {
  requestId: string;
  clientRequestId: string;
  policyContext: { policy_id?: string; redaction_profile?: string; data_access_profile?: string };
  agentId: string;
  mode: "chat" | "agent";
};
const DEFAULT_POLICY_CONTEXT = { policy_id: DEFAULT_POLICY_MANIFEST.policy_id };
const DEFAULT_AGENT_ID = "reader-panel";

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
  agent_id?: string;
  intent_id?: string;
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

function normalizeStreamRequest(request: AIStreamRequest): NormalizedStreamRequest {
  const requestId = request.requestId ?? generateRequestId();
  return {
    ...request,
    requestId,
    clientRequestId: request.clientRequestId ?? requestId,
    policyContext: request.policyContext ?? DEFAULT_POLICY_CONTEXT,
    agentId: request.agentId ?? DEFAULT_AGENT_ID,
    mode: request.mode ?? "chat",
  };
}

function buildStreamPayload(request: NormalizedStreamRequest): {
  endpoint: string;
  payload: Record<string, unknown>;
} {
  if (request.mode === "agent") {
    return {
      endpoint: AGENT_ENDPOINT,
      payload: {
        prompt: request.prompt,
        model: request.model,
        messages: request.history ?? [],
        systemPrompt: request.systemPrompt,
        request_id: request.requestId,
        client_request_id: request.clientRequestId,
        agent_id: request.agentId,
        intent_id: request.intentId,
      },
    };
  }

  return {
    endpoint: API_ENDPOINT,
    payload: {
      prompt: request.prompt,
      model: request.model,
      stream: true,
      messages: request.history ?? [],
      attachments: request.attachments,
      workflow: request.workflow,
      systemPrompt: request.systemPrompt,
      request_id: request.requestId,
      client_request_id: request.clientRequestId,
      policy_context: request.policyContext,
      agent_id: request.agentId,
      intent_id: request.intentId,
    },
  };
}

function applyChunk(
  line: string,
  startedAt: number,
  state: StreamState,
  onChunk: (delta: string, accumulated: string) => void,
  onEvent?: (event: AgentStreamEvent) => void
): void {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) {
    return;
  }

  const payload = trimmed.slice(5).trim();
  if (!payload || payload === SSE_DONE_MARKER) {
    return;
  }

  const agentEvent = parseAgentStreamEvent(payload);
  if (agentEvent) {
    onEvent?.(agentEvent);
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
  onChunk: (delta: string, accumulated: string) => void,
  onEvent?: (event: AgentStreamEvent) => void
): Promise<
  Pick<
    AIStreamResult,
    "content" | "chunkCount" | "ttft" | "confidence" | "provenance" | "agentId" | "intentId"
  >
> {
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
        applyChunk(line, startedAt, state, onChunk, onEvent);
      }
    }

    if (buffer) {
      applyChunk(buffer, startedAt, state, onChunk, onEvent);
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
    agentId: state.metadata?.agent_id,
    intentId: state.metadata?.intent_id,
  };
}

// ============================================================================
// Client
// ============================================================================

const HEALTH_ENDPOINT = "/api/ai/health";

class AIClientService {
  private totalRequests = 0;
  private totalFailures = 0;
  private totalLatencyMs = 0;
  private lastFailureAt: number | null = null;
  private retryAfterMs: number | null = null;
  private cachedServerHealth: AIServiceHealth["serverHealth"] | null = null;
  private lastHealthCheck = 0;
  private readonly healthCacheDurationMs = 30_000;

  /**
   * Get health status combining local metrics with server-side health.
   * Server health is fetched asynchronously and cached.
   */
  getHealth(): AIServiceHealth {
    const avgLatencyMs = this.totalRequests ? this.totalLatencyMs / this.totalRequests : null;
    const errorRate = this.totalRequests > 0 ? this.totalFailures / this.totalRequests : 0;

    // Determine local status based on recent failures
    let status: AIServiceHealth["status"] = "healthy";
    if (errorRate > 0.5) {
      status = "unhealthy";
    } else if (this.totalFailures > 0) {
      status = "degraded";
    }

    // Trigger async health fetch if cache is stale
    if (Date.now() - this.lastHealthCheck > this.healthCacheDurationMs) {
      this.fetchServerHealth();
    }

    return {
      status,
      serverHealth: this.cachedServerHealth ?? undefined,
      metrics: {
        totalRequests: this.totalRequests,
        totalFailures: this.totalFailures,
        avgLatencyMs,
      },
      lastFailureAt: this.lastFailureAt,
      retryAfterMs: this.retryAfterMs,
    };
  }

  /**
   * Fetch server-side health status asynchronously.
   */
  async fetchServerHealth(): Promise<AIServiceHealth["serverHealth"] | null> {
    this.lastHealthCheck = Date.now();

    try {
      const response = await fetch(HEALTH_ENDPOINT, {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as {
        status: string;
        providers: Array<{ name: string; status: string; latencyMs?: number }>;
        summary: { healthy: number; degraded: number; unhealthy: number };
      };

      this.cachedServerHealth = {
        providers: data.providers,
        summary: data.summary,
      };

      return this.cachedServerHealth;
    } catch {
      return null;
    }
  }

  async stream(request: AIStreamRequest, callbacks: AIStreamCallbacks): Promise<void> {
    this.totalRequests += 1;
    const startedAt = performance.now();

    try {
      const result = await this.performStream(request, callbacks);
      this.totalLatencyMs += performance.now() - startedAt;
      callbacks.onDone({
        ...result,
        attempts: 1, // Server handles retries now
      });
    } catch (error) {
      const clientError = this.normalizeError(error, request.signal);
      if (clientError.code !== "canceled") {
        this.totalFailures += 1;
        this.lastFailureAt = Date.now();
        this.retryAfterMs = clientError.retryAfterMs ?? null;
      }
      callbacks.onError(clientError);
    }
  }

  async confirm(request: AIConfirmationRequest): Promise<AIConfirmationResult> {
    try {
      const response = await fetch(AGENT_CONFIRM_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          confirmation_id: request.confirmationId,
          confirmed: request.confirmed,
          request_id: request.requestId,
        }),
      });

      if (!response.ok) {
        const errorInfo = parseErrorPayload(await response.text());
        const code = mapErrorCode(response.status, errorInfo.code);
        throw new AIClientError(code, errorInfo.message, {
          requestId: errorInfo.requestId ?? request.requestId,
        });
      }

      const data = (await response.json()) as {
        confirmation_id?: string;
        confirmed?: boolean;
        request_id?: string;
      };

      return {
        confirmationId: data.confirmation_id ?? request.confirmationId,
        confirmed: data.confirmed ?? request.confirmed,
        requestId: data.request_id ?? request.requestId,
      };
    } catch (error) {
      if (error instanceof AIClientError) {
        throw error;
      }
      throw this.normalizeError(error);
    }
  }

  private async performStream(
    request: AIStreamRequest,
    callbacks: AIStreamCallbacks
  ): Promise<Omit<AIStreamResult, "attempts">> {
    const normalizedRequest = normalizeStreamRequest(request);

    const startedAt = performance.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    // Combine with user-provided signal
    const { signal, cleanup } = combineSignals(controller.signal, request.signal);

    try {
      const { endpoint, payload } = buildStreamPayload(normalizedRequest);

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-model": normalizedRequest.model,
        },
        body: JSON.stringify(payload),
        signal,
      });

      clearTimeout(timeoutId);

      const fallbackId = fallbackRequestId();
      const headerRequestId = response.headers.get("x-request-id") ?? fallbackId;
      const headerAgentId = response.headers.get("x-agent-id") ?? undefined;
      const headerIntentId = response.headers.get("x-intent-id") ?? undefined;

      if (!response.ok || !response.body) {
        const errorInfo = parseErrorPayload(await response.text());
        const code = mapErrorCode(response.status, errorInfo.code);
        throw new AIClientError(code, errorInfo.message, {
          requestId: errorInfo.requestId ?? headerRequestId,
          retryAfterMs: parseRetryAfterMs(response),
        });
      }

      const streamData = await readStream(
        response.body,
        startedAt,
        callbacks.onChunk,
        callbacks.onEvent
      );

      return {
        requestId: headerRequestId,
        content: streamData.content,
        chunkCount: streamData.chunkCount,
        ttft: streamData.ttft,
        totalMs: performance.now() - startedAt,
        agentId: streamData.agentId ?? headerAgentId,
        intentId: streamData.intentId ?? headerIntentId,
      };
    } finally {
      clearTimeout(timeoutId);
      cleanup();
    }
  }

  private normalizeError(error: unknown, signal?: AbortSignal): AIClientError {
    if (signal?.aborted) {
      return new AIClientError("canceled", "Request canceled");
    }

    if (error instanceof AIClientError) {
      return error;
    }

    if (error instanceof AIError) {
      return AIClientError.fromCoreError(error);
    }

    if (isAbortError(error)) {
      return new AIClientError("timeout", "Request timed out");
    }

    if (error instanceof Error) {
      // Check for server-side circuit breaker indication
      if (error.message.includes("circuit") || error.message.includes("unavailable")) {
        return new AIClientError("circuit_open", "AI service temporarily unavailable");
      }
      return new AIClientError("network_error", error.message);
    }

    return new AIClientError("network_error", "Unknown error");
  }
}

export const aiClient = new AIClientService();
