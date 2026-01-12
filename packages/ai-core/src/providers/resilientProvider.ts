/**
 * Resilient Provider Wrapper
 *
 * Wraps an LLM provider with the ResiliencePipeline to add
 * retries, circuit breaking, queueing, and optional caching.
 */

import { LRUCache, type LRUCacheConfig, cacheKey } from "../performance/cache";
import type { ResilienceContext, ResiliencePipeline } from "../resilience/pipeline";
import type {
  CompletionRequest,
  CompletionResponse,
  EmbeddingRequest,
  EmbeddingResponse,
  LLMProvider,
  StreamChunk,
  TokenUsage,
} from "./types";

export interface ResilientProviderConfig {
  pipeline: ResiliencePipeline;
  cacheEmbeddings?: boolean | Partial<LRUCacheConfig> | LRUCache<string, EmbeddingResponse>;
  embeddingCacheKey?: (request: EmbeddingRequest) => string;
}

const DEFAULT_EMBEDDING_CACHE: LRUCacheConfig = {
  maxEntries: 500,
  ttlMs: 5 * 60 * 1000,
  maxSizeBytes: 0,
};

const ZERO_USAGE: TokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
};

export class ResilientProvider implements LLMProvider {
  readonly name: string;
  readonly models: string[];
  readonly defaultModel: string;

  private readonly provider: LLMProvider;
  private readonly pipeline: ResiliencePipeline;
  private readonly embeddingCache?: LRUCache<string, EmbeddingResponse>;
  private readonly embeddingCacheKey: (request: EmbeddingRequest) => string;

  constructor(provider: LLMProvider, config: ResilientProviderConfig) {
    this.provider = provider;
    this.pipeline = config.pipeline;
    this.name = provider.name;
    this.models = provider.models;
    this.defaultModel = provider.defaultModel;

    this.embeddingCache = this.createEmbeddingCache(config.cacheEmbeddings);
    this.embeddingCacheKey =
      config.embeddingCacheKey ?? ((request) => this.defaultEmbeddingKey(request));
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const context = this.buildContext("complete", request);
    return this.pipeline.execute(
      (signal) => this.provider.complete({ ...request, signal }),
      context
    );
  }

  async *stream(request: CompletionRequest): AsyncIterable<StreamChunk> {
    const context = this.buildContext("stream", request);
    const iterable = await this.pipeline.executeStream(
      (signal) => this.provider.stream({ ...request, signal }),
      context
    );
    for await (const chunk of iterable) {
      yield chunk;
    }
  }

  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    if (request.signal?.aborted) {
      throw new Error("Operation cancelled");
    }

    const key = this.embeddingCacheKey(request);

    if (this.embeddingCache) {
      const cached = this.embeddingCache.get(key);
      if (cached) {
        return {
          ...cached,
          cached: true,
          usage: { ...ZERO_USAGE },
        };
      }
    }

    const context = this.buildContext("embed", request, key);
    const response = await this.pipeline.execute(
      (signal) => this.provider.embed({ ...request, signal }),
      context
    );

    if (this.embeddingCache) {
      this.embeddingCache.set(key, response);
    }

    return response;
  }

  healthCheck(): ReturnType<LLMProvider["healthCheck"]> {
    return this.provider.healthCheck();
  }

  getMetrics(): ReturnType<LLMProvider["getMetrics"]> {
    return this.provider.getMetrics();
  }

  resetMetrics(): void {
    this.provider.resetMetrics();
  }

  private buildContext(
    operation: ResilienceContext["operation"],
    request: { model: string; timeoutMs?: number; signal?: AbortSignal },
    dedupKey?: string
  ): ResilienceContext {
    return {
      operation,
      provider: this.name,
      timeoutMs: request.timeoutMs,
      signal: request.signal,
      dedupKey,
      labels: {
        model: request.model,
      },
    };
  }

  private createEmbeddingCache(
    cache?: ResilientProviderConfig["cacheEmbeddings"]
  ): LRUCache<string, EmbeddingResponse> | undefined {
    if (!cache) {
      return undefined;
    }
    if (cache instanceof LRUCache) {
      return cache;
    }
    const overrides = typeof cache === "object" ? cache : {};
    return new LRUCache<string, EmbeddingResponse>({
      ...DEFAULT_EMBEDDING_CACHE,
      ...overrides,
    });
  }

  private defaultEmbeddingKey(request: EmbeddingRequest): string {
    return cacheKey(this.name, request.model, request.dimensions ?? "default", request.texts);
  }
}

export function createResilientProvider(
  provider: LLMProvider,
  config: ResilientProviderConfig
): ResilientProvider {
  return new ResilientProvider(provider, config);
}
