import { describe, expect, test } from "vitest";
import type {
  CompletionRequest,
  CompletionResponse,
  LLMProvider,
  ProviderHealth,
  ProviderMetrics,
  StreamChunk,
} from "../providers/types";
import type {
  GatewayGenerationResult,
  GatewayGenerationStart,
  GatewayTelemetryAdapter,
} from "./telemetry";
import { UnifiedAIGateway } from "./unifiedGateway";

function createProvider(name: string): LLMProvider {
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
    complete: async (request: CompletionRequest): Promise<CompletionResponse> => ({
      content: `${name}-ok`,
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      finishReason: "stop",
      model: request.model,
      latencyMs: 1,
    }),
    stream: async function* (_request: CompletionRequest): AsyncIterable<StreamChunk> {
      yield { type: "content", content: `${name}-chunk` };
      yield {
        type: "usage",
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      };
      yield { type: "done" };
    },
    embed: async () => ({
      embeddings: [[0, 1, 2]],
      usage: { inputTokens: 1, outputTokens: 0, totalTokens: 1 },
      model: "model",
    }),
    healthCheck: async (): Promise<ProviderHealth> => ({
      healthy: true,
      lastCheckAt: Date.now(),
    }),
    getMetrics: (): ProviderMetrics => metrics,
    resetMetrics: () => undefined,
  };
}

describe("UnifiedAIGateway telemetry adapter", () => {
  test("emits generation start/end with provider metadata", async () => {
    const starts: GatewayGenerationStart[] = [];
    const ends: GatewayGenerationResult[] = [];

    const telemetryAdapter: GatewayTelemetryAdapter = {
      startGeneration: (start) => {
        starts.push(start);
        return {
          end: (result) => {
            ends.push(result);
          },
        };
      },
    };

    const gateway = new UnifiedAIGateway({
      providers: [createProvider("p1")],
      telemetryAdapter,
      health: { enabled: false },
    });

    const response = await gateway.complete([{ role: "user", content: "hello" }], {
      userId: "u1",
      docId: "d1",
    });

    expect(response.provider).toBe("p1");
    expect(starts.length).toBe(1);
    expect(starts[0]?.metadata?.userId).toBe("u1");
    expect(starts[0]?.metadata?.docId).toBe("d1");
    expect(ends.length).toBe(1);
    expect(ends[0]?.metadata?.provider).toBe("p1");
    expect(ends[0]?.usage?.total).toBe(2);
  });
});
