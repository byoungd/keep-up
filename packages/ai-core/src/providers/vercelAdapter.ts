/**
 * Vercel AI SDK Adapter
 *
 * Unified LLM provider implementation using Vercel AI SDK Core.
 * Supports OpenAI, Anthropic, and Google models through a single interface.
 *
 * @module providers/vercelAdapter
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { JSONSchema7 } from "ai";
import { embed as embedText, generateText, jsonSchema, streamText, tool } from "ai";
import { MODEL_CATALOG } from "../catalog/models";
import type {
  CompletionRequest,
  CompletionResponse,
  EmbeddingRequest,
  EmbeddingResponse,
  LLMProvider,
  Message,
  ProviderHealth,
  ProviderMetrics,
  StreamChunk,
  TokenUsage,
  ToolCall,
  Tool as ToolDef,
} from "./types";

/**
 * Supported provider types
 */
export type VercelProviderType = "openai" | "anthropic" | "google";

/**
 * Vercel AI Adapter configuration
 */
export interface VercelAIAdapterConfig {
  /** Provider type */
  provider: VercelProviderType;
  /** API key */
  apiKey: string;
  /** Base URL override (optional) */
  baseUrl?: string;
  /** Default model */
  defaultModel?: string;
  /** Default embedding model */
  defaultEmbeddingModel?: string;
}

/**
 * Model mappings for each provider
 */
const PROVIDER_MODELS: Record<VercelProviderType, string[]> = {
  openai: MODEL_CATALOG.filter((m) => m.provider === "openai" || m.group === "O3").map((m) => m.id),
  anthropic: MODEL_CATALOG.filter((m) => m.provider === "claude").map((m) => m.id),
  google: MODEL_CATALOG.filter((m) => m.provider === "gemini").map((m) => m.id),
};

const DEFAULT_MODELS: Record<VercelProviderType, string> = {
  openai:
    MODEL_CATALOG.find((m) => m.provider === "openai" && m.default)?.id ??
    PROVIDER_MODELS.openai[0],
  anthropic:
    MODEL_CATALOG.find((m) => m.provider === "claude" && m.default)?.id ??
    PROVIDER_MODELS.anthropic[0],
  google:
    MODEL_CATALOG.find((m) => m.provider === "gemini" && m.default)?.id ??
    PROVIDER_MODELS.google[0],
};

const DEFAULT_EMBEDDING_MODELS: Record<VercelProviderType, string> = {
  openai: "text-embedding-3-small",
  anthropic: "text-embedding-3-small", // Anthropic doesn't have embeddings, fallback
  google: "text-embedding-004",
};

type ProviderInstance =
  | ReturnType<typeof createOpenAI>
  | ReturnType<typeof createAnthropic>
  | ReturnType<typeof createGoogleGenerativeAI>;

/**
 * Vercel AI SDK Adapter
 *
 * Implements the LLMProvider interface using Vercel AI SDK Core.
 * Provides a unified interface for OpenAI, Anthropic, and Google models.
 */
export class VercelAIAdapter implements LLMProvider {
  readonly name: string;
  readonly models: string[];
  readonly defaultModel: string;
  readonly defaultEmbeddingModel: string;

  private readonly config: VercelAIAdapterConfig;
  private readonly providerInstance: ProviderInstance;

  // Metrics
  private totalRequests = 0;
  private successfulRequests = 0;
  private failedRequests = 0;
  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private totalLatencyMs = 0;
  private lastRequestAt = 0;

  constructor(config: VercelAIAdapterConfig) {
    this.config = config;
    this.name = `vercel-${config.provider}`;
    this.models = PROVIDER_MODELS[config.provider];
    this.defaultModel = config.defaultModel ?? DEFAULT_MODELS[config.provider];
    this.defaultEmbeddingModel =
      config.defaultEmbeddingModel ?? DEFAULT_EMBEDDING_MODELS[config.provider];

    // Create provider instance
    switch (config.provider) {
      case "openai":
        this.providerInstance = createOpenAI({
          apiKey: config.apiKey,
          baseURL: config.baseUrl,
        });
        break;
      case "anthropic":
        this.providerInstance = createAnthropic({
          apiKey: config.apiKey,
          baseURL: config.baseUrl,
        }) as unknown as ProviderInstance;
        break;
      case "google":
        this.providerInstance = createGoogleGenerativeAI({
          apiKey: config.apiKey,
          baseURL: config.baseUrl,
        }) as unknown as ProviderInstance;
        break;
    }
  }

  /**
   * Generate a completion (non-streaming).
   */
  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const startTime = Date.now();
    this.totalRequests++;
    this.lastRequestAt = startTime;

    try {
      const modelId = request.model || this.defaultModel;
      const tools = request.tools ? this.formatTools(request.tools) : undefined;
      const result = await generateText({
        model: this.providerInstance(modelId),
        messages: this.formatMessages(request.messages),
        temperature: request.temperature,
        maxOutputTokens: request.maxTokens,
        stopSequences: request.stopSequences,
        tools,
        abortSignal: request.signal,
      });

      const latencyMs = Date.now() - startTime;
      this.successfulRequests++;
      this.totalLatencyMs += latencyMs;

      // Handle usage - Vercel AI SDK uses different property names
      const promptTokens = (result.usage as { promptTokens?: number })?.promptTokens ?? 0;
      const completionTokens =
        (result.usage as { completionTokens?: number })?.completionTokens ?? 0;

      const usage: TokenUsage = {
        inputTokens: promptTokens,
        outputTokens: completionTokens,
        totalTokens: promptTokens + completionTokens,
      };
      this.totalInputTokens += usage.inputTokens;
      this.totalOutputTokens += usage.outputTokens;

      return {
        content: result.text,
        toolCalls: this.parseToolCalls(result.toolCalls as unknown[]),
        usage,
        finishReason: this.mapFinishReason(result.finishReason),
        model: modelId,
        latencyMs,
      };
    } catch (error) {
      this.failedRequests++;
      throw error;
    }
  }

  /**
   * Generate a streaming completion.
   */
  async *stream(request: CompletionRequest): AsyncIterable<StreamChunk> {
    const startTime = Date.now();
    this.totalRequests++;
    this.lastRequestAt = startTime;

    try {
      const modelId = request.model || this.defaultModel;
      const tools = request.tools ? this.formatTools(request.tools) : undefined;
      const result = streamText({
        model: this.providerInstance(modelId),
        messages: this.formatMessages(request.messages),
        temperature: request.temperature,
        maxOutputTokens: request.maxTokens,
        stopSequences: request.stopSequences,
        tools,
        abortSignal: request.signal,
      });

      let totalInputTokens = 0;
      let totalOutputTokens = 0;

      for await (const chunk of result.textStream) {
        yield {
          type: "content",
          content: chunk,
        };
      }

      // Get final usage - need to await the full result
      const finalUsage = await result.usage;
      if (finalUsage) {
        totalInputTokens = (finalUsage as { promptTokens?: number }).promptTokens ?? 0;
        totalOutputTokens = (finalUsage as { completionTokens?: number }).completionTokens ?? 0;
      }

      const finalFinishReason = await result.finishReason;

      this.successfulRequests++;
      this.totalInputTokens += totalInputTokens;
      this.totalOutputTokens += totalOutputTokens;
      this.totalLatencyMs += Date.now() - startTime;

      yield {
        type: "done",
        usage: {
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          totalTokens: totalInputTokens + totalOutputTokens,
        },
        finishReason: this.mapFinishReason(finalFinishReason),
      };
    } catch (error) {
      this.failedRequests++;
      yield {
        type: "error",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Generate embeddings for texts.
   */
  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const startTime = Date.now();
    this.totalRequests++;
    this.lastRequestAt = startTime;

    try {
      const modelId = request.model || this.defaultEmbeddingModel;

      // Support OpenAI and Google for embeddings
      // biome-ignore lint/suspicious/noExplicitAny: needed for multiple provider types
      let embeddingModel: any;

      if (this.config.provider === "openai") {
        const openaiProvider = this.providerInstance as ReturnType<typeof createOpenAI>;
        embeddingModel = openaiProvider.embedding(modelId);
      } else if (this.config.provider === "google") {
        const googleProvider = this.providerInstance as ReturnType<typeof createGoogleGenerativeAI>;
        embeddingModel = googleProvider.textEmbeddingModel(modelId);
      } else {
        throw new Error(`Embeddings not supported for provider: ${this.config.provider}`);
      }

      const results: number[][] = [];
      let totalTokens = 0;

      for (const text of request.texts) {
        const result = await embedText({
          model: embeddingModel,
          value: text,
        });

        results.push(result.embedding);
        totalTokens += (result.usage as { tokens?: number })?.tokens ?? 0;
      }

      this.successfulRequests++;
      this.totalLatencyMs += Date.now() - startTime;

      return {
        embeddings: results,
        usage: {
          inputTokens: totalTokens,
          outputTokens: 0,
          totalTokens,
        },
        model: modelId,
      };
    } catch (error) {
      this.failedRequests++;
      throw error;
    }
  }

  /**
   * Check provider health.
   */
  async healthCheck(): Promise<ProviderHealth> {
    const startTime = Date.now();

    try {
      await generateText({
        model: this.providerInstance(this.defaultModel),
        prompt: "ping",
        maxOutputTokens: 1,
      });

      return {
        healthy: true,
        lastCheckAt: Date.now(),
        avgLatencyMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        healthy: false,
        lastCheckAt: Date.now(),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get provider metrics.
   */
  getMetrics(): ProviderMetrics {
    return {
      provider: this.name,
      totalRequests: this.totalRequests,
      successfulRequests: this.successfulRequests,
      failedRequests: this.failedRequests,
      totalInputTokens: this.totalInputTokens,
      totalOutputTokens: this.totalOutputTokens,
      avgLatencyMs: this.successfulRequests > 0 ? this.totalLatencyMs / this.successfulRequests : 0,
      lastRequestAt: this.lastRequestAt,
    };
  }

  /**
   * Reset provider metrics.
   */
  resetMetrics(): void {
    this.totalRequests = 0;
    this.successfulRequests = 0;
    this.failedRequests = 0;
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
    this.totalLatencyMs = 0;
    this.lastRequestAt = 0;
  }

  // --- Private helpers ---

  private formatMessages(
    messages: Message[]
  ): Array<{ role: "system" | "user" | "assistant"; content: string }> {
    return messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));
  }

  /**
   * Convert tool definitions to Vercel AI SDK format using jsonSchema helper.
   */
  private formatTools(tools: ToolDef[]): Record<string, ReturnType<typeof tool>> {
    const formatted: Record<string, ReturnType<typeof tool>> = {};
    for (const t of tools) {
      formatted[t.name] = tool({
        description: t.description,
        inputSchema: jsonSchema(t.parameters as JSONSchema7),
      });
    }
    return formatted;
  }

  private parseToolCalls(toolCalls?: unknown[]): ToolCall[] | undefined {
    if (!toolCalls || toolCalls.length === 0) {
      return undefined;
    }

    return toolCalls.map((tc) => {
      const call = tc as { toolCallId?: string; toolName?: string; args?: unknown };
      return {
        id: call.toolCallId ?? "",
        name: call.toolName ?? "",
        arguments: JSON.stringify(call.args ?? {}),
      };
    });
  }

  private mapFinishReason(reason: string | undefined): CompletionResponse["finishReason"] {
    switch (reason) {
      case "stop":
      case "end-turn":
        return "stop";
      case "length":
      case "max-tokens":
        return "length";
      case "tool-calls":
        return "tool_calls";
      case "content-filter":
        return "content_filter";
      default:
        return "stop";
    }
  }
}

// --- Factory functions ---

/**
 * Create an OpenAI adapter using Vercel AI SDK.
 */
export function createOpenAIAdapter(config: {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
}): VercelAIAdapter {
  return new VercelAIAdapter({
    provider: "openai",
    ...config,
  });
}

/**
 * Create an Anthropic adapter using Vercel AI SDK.
 */
export function createAnthropicAdapter(config: {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
}): VercelAIAdapter {
  return new VercelAIAdapter({
    provider: "anthropic",
    ...config,
  });
}

/**
 * Create a Google AI adapter using Vercel AI SDK.
 */
export function createGoogleAdapter(config: {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
}): VercelAIAdapter {
  return new VercelAIAdapter({
    provider: "google",
    ...config,
  });
}
