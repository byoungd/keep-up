import type {
  CompletionRequest,
  CompletionResponse,
  ModelFabricContext,
  ModelFabricSnapshot,
  ModelStreamHandle,
  ModelUsageEvent,
  ProviderConfigRecord,
  RouteRule,
} from "./types";

export function isModelFabricAvailable(): boolean {
  return false;
}

export class ModelFabric {
  constructor() {
    throw new Error("Model fabric native bindings are not available in the browser.");
  }

  loadProviders(_records: ProviderConfigRecord[]): void {
    throw new Error("Model fabric native bindings are not available in the browser.");
  }

  loadRoutes(_routes: RouteRule[]): void {
    throw new Error("Model fabric native bindings are not available in the browser.");
  }

  complete(
    _request: CompletionRequest,
    _context?: ModelFabricContext
  ): Promise<CompletionResponse> {
    throw new Error("Model fabric native bindings are not available in the browser.");
  }

  stream(_request: CompletionRequest, _context?: ModelFabricContext): ModelStreamHandle {
    throw new Error("Model fabric native bindings are not available in the browser.");
  }

  getSnapshot(): ModelFabricSnapshot {
    throw new Error("Model fabric native bindings are not available in the browser.");
  }

  drainUsageEvents(_after?: number, _limit?: number): ModelUsageEvent[] {
    return [];
  }

  reset(): void {
    throw new Error("Model fabric native bindings are not available in the browser.");
  }
}

export type { StreamChunk } from "./types";
