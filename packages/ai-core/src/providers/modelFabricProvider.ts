/**
 * Model Fabric Provider
 *
 * Adapter that routes requests through the Rust model fabric via native bindings.
 */

import {
  type CompletionRequest as FabricCompletionRequest,
  type StreamChunk as FabricStreamChunk,
  isModelFabricAvailable,
  ModelFabric,
  type ModelFabricContext,
  type ModelUsageEvent,
  type ProviderConfigRecord,
  type RouteRule,
} from "@ku0/model-fabric-rs";

import { MODEL_CATALOG } from "../catalog/models";

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

export interface ModelFabricProviderConfig {
  providers: ProviderConfigRecord[];
  routes?: RouteRule[];
  context?: ModelFabricContext;
  contextProvider?: (request: CompletionRequest) => ModelFabricContext | undefined;
  onUsageEvents?: (events: ModelUsageEvent[]) => void;
  usageDrainLimit?: number;
}

export class ModelFabricProvider implements LLMProvider {
  readonly name = "model-fabric";
  readonly models: string[];
  readonly defaultModel: string;

  private readonly fabric: ModelFabric;
  private readonly config: ModelFabricProviderConfig;
  private metrics: ProviderMetrics;
  private lastHealth: ProviderHealth | null = null;

  constructor(config: ModelFabricProviderConfig) {
    this.config = config;
    if (!isModelFabricAvailable()) {
      throw new Error("Model fabric native binding is not available.");
    }
    this.fabric = new ModelFabric();
    this.fabric.loadProviders(config.providers);
    if (config.routes) {
      this.fabric.loadRoutes(config.routes);
    }

    const modelIds = config.providers.flatMap((provider) => provider.modelIds);
    this.models = modelIds;
    this.defaultModel =
      config.providers.find((provider) => provider.defaultModelId)?.defaultModelId ??
      modelIds[0] ??
      "model-fabric";

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

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const start = performance.now();
    try {
      const context = this.resolveContext(request);
      const response = await this.fabric.complete(this.toFabricRequest(request), context);
      this.recordSuccess(response.usage, response.latencyMs ?? performance.now() - start);
      this.drainUsageEvents();
      return response as CompletionResponse;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  async *stream(request: CompletionRequest): AsyncIterable<StreamChunk> {
    const start = performance.now();
    let latestUsage: CompletionResponse["usage"] | null = null;

    try {
      const context = this.resolveContext(request);
      const handle = this.fabric.stream(this.toFabricRequest(request), context);

      for (;;) {
        const chunk = (await handle.next()) as FabricStreamChunk | null;
        if (!chunk) {
          break;
        }
        if (chunk.type === "usage" && chunk.usage) {
          latestUsage = chunk.usage as CompletionResponse["usage"];
        }
        if (chunk.type === "done" && chunk.usage) {
          latestUsage = chunk.usage as CompletionResponse["usage"];
        }
        yield chunk as StreamChunk;
      }

      const latencyMs = performance.now() - start;
      this.recordSuccess(
        latestUsage ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        latencyMs
      );
      this.drainUsageEvents();
    } catch (error) {
      this.recordFailure();
      yield {
        type: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async embed(_request: EmbeddingRequest): Promise<EmbeddingResponse> {
    throw new Error("Model fabric does not support embeddings yet.");
  }

  async healthCheck(): Promise<ProviderHealth> {
    const now = Date.now();
    if (this.lastHealth && now - this.lastHealth.lastCheckAt < 30_000) {
      return this.lastHealth;
    }

    try {
      const start = performance.now();
      const snapshot = this.fabric.getSnapshot();
      if (snapshot.providers.length === 0) {
        throw new Error("No providers loaded");
      }
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

  getMetrics(): ProviderMetrics {
    return { ...this.metrics };
  }

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

  private resolveContext(request: CompletionRequest): ModelFabricContext | undefined {
    return this.config.contextProvider?.(request) ?? this.config.context;
  }

  private toFabricRequest(request: CompletionRequest): FabricCompletionRequest {
    return {
      model: request.model,
      messages: request.messages,
      temperature: request.temperature,
      maxTokens: request.maxTokens,
      stopSequences: request.stopSequences,
      tools: request.tools,
      topP: request.topP,
      timeoutMs: request.timeoutMs,
    } as FabricCompletionRequest;
  }

  private recordSuccess(usage: CompletionResponse["usage"], latencyMs: number): void {
    this.metrics.totalRequests += 1;
    this.metrics.successfulRequests += 1;
    this.metrics.totalInputTokens += usage.inputTokens;
    this.metrics.totalOutputTokens += usage.outputTokens;
    this.metrics.lastRequestAt = Date.now();

    const totalLatency =
      this.metrics.avgLatencyMs * (this.metrics.successfulRequests - 1) + latencyMs;
    this.metrics.avgLatencyMs = totalLatency / this.metrics.successfulRequests;
  }

  private recordFailure(): void {
    this.metrics.totalRequests += 1;
    this.metrics.failedRequests += 1;
    this.metrics.lastRequestAt = Date.now();
  }

  private drainUsageEvents(): void {
    if (!this.config.onUsageEvents) {
      return;
    }
    const events = this.fabric.drainUsageEvents(undefined, this.config.usageDrainLimit);
    if (events.length > 0) {
      this.config.onUsageEvents(events.map((event) => this.withCost(event)));
    }
  }

  private withCost(event: ModelUsageEvent): ModelUsageEvent {
    if (event.costUsd !== undefined) {
      return event;
    }
    const pricing = PRICING_BY_MODEL.get(event.modelId);
    if (!pricing) {
      return event;
    }
    const inputCost = (event.inputTokens / 1_000_000) * pricing.inputTokensPer1M;
    const outputCost = (event.outputTokens / 1_000_000) * pricing.outputTokensPer1M;
    const costUsd = Number((inputCost + outputCost).toFixed(6));
    return { ...event, costUsd };
  }
}

export function createModelFabricProvider(config: ModelFabricProviderConfig): ModelFabricProvider {
  return new ModelFabricProvider(config);
}

const PRICING_BY_MODEL = new Map(
  MODEL_CATALOG.flatMap((model) => (model.pricing ? ([[model.id, model.pricing]] as const) : []))
);
