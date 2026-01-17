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
import { embed as embedText, generateText, streamText } from "ai";
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
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-4", "gpt-3.5-turbo", "o1", "o1-mini"],
  anthropic: [
    "claude-sonnet-4-20250514",
    "claude-3-5-sonnet-20241022",
    "claude-3-5-haiku-20241022",
    "claude-3-opus-20240229",
  ],
  google: ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
};

const DEFAULT_MODELS: Record<VercelProviderType, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-sonnet-4-20250514",
  google: "gemini-2.0-flash",
};

const DEFAULT_EMBEDDING_MODELS: Record<VercelProviderType, string> = {
  openai: "text-embedding-3-small",
  anthropic: "text-embedding-3-small", // Anthropic doesn't have embeddings, fallback
  google: "text-embedding-004",
};

type ProviderInstance = ReturnType<typeof createOpenAI>;

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
      const result = await generateText({
        model: this.providerInstance(modelId),
        messages: this.formatMessages(request.messages),
        temperature: request.temperature,
        maxOutputTokens: request.maxTokens,
        stopSequences: request.stopSequences,
        // Note: Tool calling with Vercel AI SDK requires proper tool() definitions
        // For now, we skip tools to ensure basic completion works
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
      const result = streamText({
        model: this.providerInstance(modelId),
        messages: this.formatMessages(request.messages),
        temperature: request.temperature,
        maxOutputTokens: request.maxTokens,
        stopSequences: request.stopSequences,
        // Note: Tool calling with Vercel AI SDK requires proper tool() definitions
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

      // Only OpenAI provider has embedding support via this method
      if (this.config.provider !== "openai") {
        throw new Error(`Embeddings not supported for provider: ${this.config.provider}`);
      }

      const openaiProvider = this.providerInstance as ReturnType<typeof createOpenAI>;
      const results: number[][] = [];
      let totalTokens = 0;

      for (const text of request.texts) {
        const result = await embedText({
          model: openaiProvider.embedding(modelId),
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

  // Note: formatTools is kept for future use when tool calling is fully implemented
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private formatTools(_tools: ToolDef[]): undefined {
    // Tool calling requires proper Zod schema conversion from JSON Schema
    // This is a complex task that requires runtime schema conversion
    // For now, we return undefined and tools are not passed to the SDK
    return undefined;
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
