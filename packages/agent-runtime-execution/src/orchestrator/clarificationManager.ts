import type { ClarificationRequest, ClarificationResponse } from "../types";

export type ClarificationEvent =
  | { type: "requested"; request: ClarificationRequest }
  | { type: "answered"; request: ClarificationRequest; response: ClarificationResponse };

export type ClarificationEventHandler = (event: ClarificationEvent) => void;

export interface ClarificationRecord {
  request: ClarificationRequest;
  response: ClarificationResponse;
}

type PendingClarification = {
  request: ClarificationRequest;
  createdAt: number;
  promise: Promise<ClarificationResponse>;
  resolve: (response: ClarificationResponse) => void;
  reject: (error: Error) => void;
  timeoutId?: ReturnType<typeof setTimeout>;
};

type ResolvedClarification = {
  response: ClarificationResponse;
  expiresAt: number;
};

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

export class ClarificationManager {
  private readonly pending = new Map<string, PendingClarification>();
  private readonly resolved = new Map<string, ResolvedClarification>();
  private readonly resolvedQueue: ClarificationRecord[] = [];
  private readonly handlers = new Set<ClarificationEventHandler>();
  private readonly defaultTimeoutMs: number;

  constructor(options: { defaultTimeoutMs?: number } = {}) {
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  onEvent(handler: ClarificationEventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async ask(request: ClarificationRequest): Promise<ClarificationResponse> {
    const resolved = this.resolved.get(request.id);
    if (resolved && resolved.expiresAt > Date.now()) {
      this.resolved.delete(request.id);
      const record = { request, response: resolved.response };
      this.resolvedQueue.push(record);
      this.emit({ type: "answered", ...record });
      return resolved.response;
    }

    const existing = this.pending.get(request.id);
    if (existing) {
      return existing.promise;
    }

    let resolvePromise!: (response: ClarificationResponse) => void;
    let rejectPromise!: (error: Error) => void;
    const promise = new Promise<ClarificationResponse>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });

    const createdAt = Date.now();
    const timeoutMs = request.timeoutMs ?? this.defaultTimeoutMs;
    const timeoutId = setTimeout(() => {
      this.pending.delete(request.id);
      const response = this.buildResponse(request.id, "No response", undefined, createdAt);
      resolvePromise(response);
    }, timeoutMs);

    this.pending.set(request.id, {
      request,
      createdAt,
      promise,
      resolve: resolvePromise,
      reject: rejectPromise,
      timeoutId,
    });

    this.emit({ type: "requested", request });
    return promise;
  }

  submitAnswer(input: {
    requestId: string;
    answer: string;
    selectedOption?: number;
  }): ClarificationResponse {
    const now = Date.now();
    const pending = this.pending.get(input.requestId);
    const createdAt = pending?.createdAt ?? now;
    const response = this.buildResponse(
      input.requestId,
      input.answer,
      input.selectedOption,
      createdAt,
      now
    );

    if (pending) {
      this.pending.delete(input.requestId);
      if (pending.timeoutId) {
        clearTimeout(pending.timeoutId);
      }
      pending.resolve(response);
      const record = { request: pending.request, response };
      this.resolvedQueue.push(record);
      this.emit({ type: "answered", ...record });
      return response;
    }

    this.resolved.set(input.requestId, {
      response,
      expiresAt: now + this.defaultTimeoutMs,
    });

    return response;
  }

  getPending(sessionId?: string): ClarificationRequest[] {
    const requests = Array.from(this.pending.values()).map((entry) => entry.request);
    if (!sessionId) {
      return requests;
    }
    return requests.filter((request) => request.context?.sessionId === sessionId);
  }

  consumeResolved(): ClarificationRecord[] {
    const records = [...this.resolvedQueue];
    this.resolvedQueue.length = 0;
    return records;
  }

  private buildResponse(
    requestId: string,
    answer: string,
    selectedOption: number | undefined,
    createdAt: number,
    now: number = Date.now()
  ): ClarificationResponse {
    return {
      requestId,
      answer,
      selectedOption,
      timestamp: now,
      responseTime: Math.max(0, now - createdAt),
    };
  }

  private emit(event: ClarificationEvent): void {
    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch {
        // Ignore handler errors
      }
    }
  }
}
