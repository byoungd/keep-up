import { describe, expect, test } from "vitest";
import { ProviderRouter, type ProviderStreamChunk } from "./providerRouter";
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

function createProvider(
  name: string,
  options: {
    failComplete?: boolean;
    failStream?: boolean;
    failEmbed?: boolean;
  } = {}
): LLMProvider {
  const metrics: ProviderMetrics = {
    provider: name,
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    avgLatencyMs: 0,
    lastRequestAt: 0,
  };

  return {
    name,
    models: ["model"],
    defaultModel: "model",
    complete: async (request: CompletionRequest): Promise<CompletionResponse> => {
      if (options.failComplete) {
        throw new Error(`${name}-complete-failed`);
      }
      return {
        content: `${name}-ok`,
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        finishReason: "stop",
        model: request.model,
        latencyMs: 1,
      };
    },
    stream: async function* (_request: CompletionRequest): AsyncIterable<StreamChunk> {
      if (options.failStream) {
        throw new Error(`${name}-stream-failed`);
      }
      yield { type: "content", content: `${name}-chunk` };
      yield {
        type: "usage",
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      };
      yield { type: "done" };
    },
    embed: async (request: EmbeddingRequest): Promise<EmbeddingResponse> => {
      if (options.failEmbed) {
        throw new Error(`${name}-embed-failed`);
      }
      return {
        embeddings: [[0, 1, 2]],
        usage: { inputTokens: 1, outputTokens: 0, totalTokens: 1 },
        model: request.model,
      };
    },
    healthCheck: async (): Promise<ProviderHealth> => ({
      healthy: true,
      lastCheckAt: Date.now(),
    }),
    getMetrics: (): ProviderMetrics => metrics,
    resetMetrics: () => undefined,
  };
}

describe("ProviderRouter", () => {
  test("completeWithProvider returns fallback provider when primary fails", async () => {
    const router = new ProviderRouter({
      primaryProvider: "p1",
      fallbackOrder: ["p1", "p2"],
    });
    router.registerProvider(createProvider("p1", { failComplete: true }));
    router.registerProvider(createProvider("p2"));

    const result = await router.completeWithProvider({
      model: "model",
      messages: [],
    });

    expect(result.provider).toBe("p2");
    expect(result.response.content).toBe("p2-ok");
  });

  test("streamWithProvider yields provider-tagged chunks", async () => {
    const router = new ProviderRouter({
      primaryProvider: "p1",
      fallbackOrder: ["p1", "p2"],
    });
    router.registerProvider(createProvider("p1", { failStream: true }));
    router.registerProvider(createProvider("p2"));

    const chunks: ProviderStreamChunk[] = [];
    for await (const chunk of router.streamWithProvider({
      model: "model",
      messages: [],
    })) {
      chunks.push(chunk);
    }

    const contentChunk = chunks.find((chunk) => chunk.type === "content");
    expect(contentChunk?.provider).toBe("p2");
  });

  test("embedWithProvider returns provider metadata", async () => {
    const router = new ProviderRouter({
      primaryProvider: "p1",
      fallbackOrder: ["p1", "p2"],
    });
    router.registerProvider(createProvider("p1", { failEmbed: true }));
    router.registerProvider(createProvider("p2"));

    const result = await router.embedWithProvider({
      model: "model",
      texts: ["hello"],
    });

    expect(result.provider).toBe("p2");
    expect(result.response.embeddings.length).toBe(1);
  });
});
