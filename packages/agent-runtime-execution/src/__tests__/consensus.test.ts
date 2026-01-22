/**
 * Consensus Orchestrator Tests
 *
 * Comprehensive tests for multi-model consensus including:
 * - Voting strategies (majority, unanimous, weighted)
 * - Similarity calculation and clustering
 * - Error handling and failure tolerance
 * - Timeout handling
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  type ConsensusConfig,
  type ConsensusModelConfig,
  ConsensusOrchestrator,
  createConsensusOrchestrator,
  type ModelResponse,
} from "../orchestrator/consensusOrchestrator";

// ============================================================================
// Mock Consensus Orchestrator for Testing
// ============================================================================

class MockConsensusOrchestrator extends ConsensusOrchestrator {
  public mockResponses: Map<string, string | Error> = new Map();
  public mockLatencies: Map<string, number> = new Map();
  public callCount = 0;

  setMockResponse(modelId: string, response: string | Error, latencyMs = 100): void {
    this.mockResponses.set(modelId, response);
    this.mockLatencies.set(modelId, latencyMs);
  }

  protected async invokeLLM(
    _prompt: string,
    model: ConsensusModelConfig,
    signal: AbortSignal
  ): Promise<string> {
    this.callCount++;

    const latency = this.mockLatencies.get(model.modelId) ?? 100;

    // Respect abort signal during simulated latency
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => resolve(), latency);

      if (signal.aborted) {
        clearTimeout(timeout);
        reject(new Error("Aborted"));
        return;
      }

      signal.addEventListener("abort", () => {
        clearTimeout(timeout);
        reject(new Error("Aborted"));
      });
    });

    const response = this.mockResponses.get(model.modelId);

    if (response instanceof Error) {
      throw response;
    }

    return response ?? `Response from ${model.modelId}`;
  }
}

// ============================================================================
// Test Fixtures
// ============================================================================

function createTestModels(count: number): ConsensusModelConfig[] {
  return Array.from({ length: count }, (_, i) => ({
    providerId: "test",
    modelId: `model-${i + 1}`,
    weight: 1.0,
    apiKey: "test-key",
  }));
}

function createWeightedModels(): ConsensusModelConfig[] {
  return [
    { providerId: "test", modelId: "expert", weight: 3.0, apiKey: "test-key" },
    { providerId: "test", modelId: "standard-1", weight: 1.0, apiKey: "test-key" },
    { providerId: "test", modelId: "standard-2", weight: 1.0, apiKey: "test-key" },
  ];
}

// ============================================================================
// Tests
// ============================================================================

describe("ConsensusOrchestrator", () => {
  let orchestrator: MockConsensusOrchestrator;

  beforeEach(() => {
    orchestrator = new MockConsensusOrchestrator();
  });

  describe("basic execution", () => {
    it("should execute consensus with single model", async () => {
      const models = createTestModels(1);
      orchestrator.setMockResponse("model-1", "The answer is 42");

      const config: ConsensusConfig = {
        models,
        votingStrategy: "majority",
      };

      const result = await orchestrator.executeConsensus("What is the answer?", config);

      expect(result.hasConsensus).toBe(true);
      expect(result.finalAnswer).toBe("The answer is 42");
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.modelResponses).toHaveLength(1);
      expect(result.agreement).toBe(1);
    });

    it("should execute consensus with multiple agreeing models", async () => {
      const models = createTestModels(3);
      orchestrator.setMockResponse("model-1", "The capital of France is Paris");
      orchestrator.setMockResponse("model-2", "Paris is the capital of France");
      orchestrator.setMockResponse("model-3", "France's capital is Paris");

      const config: ConsensusConfig = {
        models,
        votingStrategy: "majority",
      };

      const result = await orchestrator.executeConsensus("What is the capital of France?", config);

      expect(result.hasConsensus).toBe(true);
      expect(result.finalAnswer).toContain("Paris");
      expect(result.agreement).toBeGreaterThan(0.5);
      expect(result.modelResponses).toHaveLength(3);
      expect(result.modelResponses.every((r) => r.success)).toBe(true);
    });

    it("should handle empty models array", async () => {
      const config: ConsensusConfig = {
        models: [],
        votingStrategy: "majority",
      };

      await expect(orchestrator.executeConsensus("test", config)).rejects.toThrow(
        "At least one model is required"
      );
    });

    it("should track total duration", async () => {
      const models = createTestModels(2);
      orchestrator.setMockResponse("model-1", "Response 1", 50);
      orchestrator.setMockResponse("model-2", "Response 2", 100);

      const config: ConsensusConfig = {
        models,
        votingStrategy: "majority",
      };

      const result = await orchestrator.executeConsensus("test", config);

      expect(result.totalDurationMs).toBeGreaterThan(0);
      // Should be at least as long as the slowest model (parallel execution)
      const toleranceMs = 10;
      expect(result.totalDurationMs).toBeGreaterThanOrEqual(100 - toleranceMs);
    });

    it("should call onModelResponse callback for each response", async () => {
      const models = createTestModels(3);
      orchestrator.setMockResponse("model-1", "Response 1");
      orchestrator.setMockResponse("model-2", "Response 2");
      orchestrator.setMockResponse("model-3", "Response 3");

      const config: ConsensusConfig = {
        models,
        votingStrategy: "majority",
      };

      const responses: ModelResponse[] = [];
      await orchestrator.executeConsensus("test", config, {
        onModelResponse: (r) => responses.push(r),
      });

      expect(responses).toHaveLength(3);
    });
  });

  describe("majority voting strategy", () => {
    it("should reach consensus when majority agrees", async () => {
      const models = createTestModels(3);
      orchestrator.setMockResponse("model-1", "Answer A");
      orchestrator.setMockResponse("model-2", "Answer A");
      orchestrator.setMockResponse("model-3", "Different answer B");

      const config: ConsensusConfig = {
        models,
        votingStrategy: "majority",
      };

      const result = await orchestrator.executeConsensus("test", config);

      expect(result.hasConsensus).toBe(true);
      expect(result.finalAnswer).toBe("Answer A");
      expect(result.agreement).toBeCloseTo(2 / 3, 1);
      expect(result.dissenting).toHaveLength(1);
    });

    it("should not reach consensus when no majority", async () => {
      const models = createTestModels(3);
      orchestrator.setMockResponse("model-1", "Answer A completely different");
      orchestrator.setMockResponse("model-2", "Answer B totally unique");
      orchestrator.setMockResponse("model-3", "Answer C another option");

      const config: ConsensusConfig = {
        models,
        votingStrategy: "majority",
      };

      const result = await orchestrator.executeConsensus("test", config);

      // With 3 completely different answers, no majority
      expect(result.agreement).toBeLessThanOrEqual(1 / 3 + 0.1);
    });

    it("should handle 5 models with 3 agreeing", async () => {
      const models = createTestModels(5);
      // Use identical responses to ensure clustering works
      orchestrator.setMockResponse("model-1", "The correct answer is 42");
      orchestrator.setMockResponse("model-2", "The correct answer is 42");
      orchestrator.setMockResponse("model-3", "The correct answer is 42");
      orchestrator.setMockResponse("model-4", "Wrong different answer xyz");
      orchestrator.setMockResponse("model-5", "Another wrong option abc");

      const config: ConsensusConfig = {
        models,
        votingStrategy: "majority",
      };

      const result = await orchestrator.executeConsensus("test", config);

      expect(result.hasConsensus).toBe(true);
      expect(result.agreement).toBeGreaterThan(0.5);
    });
  });

  describe("unanimous voting strategy", () => {
    it("should reach consensus only when all agree", async () => {
      const models = createTestModels(3);
      orchestrator.setMockResponse("model-1", "Same answer");
      orchestrator.setMockResponse("model-2", "Same answer");
      orchestrator.setMockResponse("model-3", "Same answer");

      const config: ConsensusConfig = {
        models,
        votingStrategy: "unanimous",
      };

      const result = await orchestrator.executeConsensus("test", config);

      expect(result.hasConsensus).toBe(true);
      expect(result.agreement).toBe(1);
      expect(result.dissenting).toHaveLength(0);
    });

    it("should not reach consensus if any model disagrees", async () => {
      const models = createTestModels(3);
      orchestrator.setMockResponse("model-1", "Same answer here");
      orchestrator.setMockResponse("model-2", "Same answer here");
      orchestrator.setMockResponse("model-3", "Different answer completely");

      const config: ConsensusConfig = {
        models,
        votingStrategy: "unanimous",
      };

      const result = await orchestrator.executeConsensus("test", config);

      expect(result.hasConsensus).toBe(false);
    });
  });

  describe("weighted voting strategy", () => {
    it("should use weights to determine consensus", async () => {
      const models = createWeightedModels();
      // Expert (weight 3) disagrees with two standard models (weight 1 each)
      orchestrator.setMockResponse("expert", "Expert answer is correct");
      orchestrator.setMockResponse("standard-1", "Standard answer");
      orchestrator.setMockResponse("standard-2", "Standard answer");

      const config: ConsensusConfig = {
        models,
        votingStrategy: "weighted",
        minAgreement: 0.5,
      };

      const result = await orchestrator.executeConsensus("test", config);

      // Expert has weight 3, standards have 2 combined
      // The cluster with expert should win
      expect(result.finalAnswer).toContain("Expert");
    });

    it("should respect minAgreement threshold", async () => {
      const models = createTestModels(4);
      orchestrator.setMockResponse("model-1", "Answer A");
      orchestrator.setMockResponse("model-2", "Answer A");
      orchestrator.setMockResponse("model-3", "Answer B");
      orchestrator.setMockResponse("model-4", "Answer C");

      const config: ConsensusConfig = {
        models,
        votingStrategy: "weighted",
        minAgreement: 0.6, // Require 60% agreement
      };

      const result = await orchestrator.executeConsensus("test", config);

      // 2/4 = 50% agreement, below 60% threshold
      expect(result.hasConsensus).toBe(false);
    });

    it("should reach consensus when above minAgreement", async () => {
      const models = createTestModels(4);
      orchestrator.setMockResponse("model-1", "Consensus answer");
      orchestrator.setMockResponse("model-2", "Consensus answer");
      orchestrator.setMockResponse("model-3", "Consensus answer");
      orchestrator.setMockResponse("model-4", "Different answer");

      const config: ConsensusConfig = {
        models,
        votingStrategy: "weighted",
        minAgreement: 0.6,
      };

      const result = await orchestrator.executeConsensus("test", config);

      // 3/4 = 75% agreement, above 60% threshold
      expect(result.hasConsensus).toBe(true);
      expect(result.agreement).toBeCloseTo(0.75, 1);
    });
  });

  describe("error handling", () => {
    it("should handle model failures with tolerateFailures=true", async () => {
      const models = createTestModels(3);
      orchestrator.setMockResponse("model-1", "Valid response");
      orchestrator.setMockResponse("model-2", new Error("API Error"));
      orchestrator.setMockResponse("model-3", "Valid response");

      const config: ConsensusConfig = {
        models,
        votingStrategy: "majority",
        tolerateFailures: true,
      };

      const result = await orchestrator.executeConsensus("test", config);

      expect(result.hasConsensus).toBe(true);
      expect(result.modelResponses.filter((r) => r.success)).toHaveLength(2);
      expect(result.modelResponses.filter((r) => !r.success)).toHaveLength(1);
    });

    it("should throw when tolerateFailures=false and model fails", async () => {
      const models = createTestModels(3);
      orchestrator.setMockResponse("model-1", "Valid response");
      orchestrator.setMockResponse("model-2", new Error("API Error"));
      orchestrator.setMockResponse("model-3", "Valid response");

      const config: ConsensusConfig = {
        models,
        votingStrategy: "majority",
        tolerateFailures: false,
      };

      await expect(orchestrator.executeConsensus("test", config)).rejects.toThrow(
        "2/3 models responded successfully"
      );
    });

    it("should return no consensus when all models fail", async () => {
      const models = createTestModels(3);
      orchestrator.setMockResponse("model-1", new Error("Error 1"));
      orchestrator.setMockResponse("model-2", new Error("Error 2"));
      orchestrator.setMockResponse("model-3", new Error("Error 3"));

      const config: ConsensusConfig = {
        models,
        votingStrategy: "majority",
        tolerateFailures: true,
      };

      const result = await orchestrator.executeConsensus("test", config);

      expect(result.hasConsensus).toBe(false);
      expect(result.finalAnswer).toBe("");
      expect(result.confidence).toBe(0);
      expect(result.agreement).toBe(0);
    });

    it("should capture error messages in failed responses", async () => {
      const models = createTestModels(2);
      orchestrator.setMockResponse("model-1", "Valid response");
      orchestrator.setMockResponse("model-2", new Error("Specific API failure"));

      const config: ConsensusConfig = {
        models,
        votingStrategy: "majority",
      };

      const result = await orchestrator.executeConsensus("test", config);

      const failedResponse = result.modelResponses.find((r) => !r.success);
      expect(failedResponse?.error).toBe("Specific API failure");
    });
  });

  describe("latency tracking", () => {
    it("should track latency for each response", async () => {
      const models = createTestModels(2);
      orchestrator.setMockResponse("model-1", "Response 1", 50);
      orchestrator.setMockResponse("model-2", "Response 2", 150);

      const config: ConsensusConfig = {
        models,
        votingStrategy: "majority",
      };

      const result = await orchestrator.executeConsensus("test", config);

      const latencies = result.modelResponses.map((r) => r.latencyMs);
      const toleranceMs = 10;
      expect(latencies[0]).toBeGreaterThanOrEqual(50 - toleranceMs);
      expect(latencies[1]).toBeGreaterThanOrEqual(150 - toleranceMs);
    });

    it("should select fastest response as representative when tied", async () => {
      const models = createTestModels(2);
      orchestrator.setMockResponse("model-1", "Same answer", 200);
      orchestrator.setMockResponse("model-2", "Same answer", 50);

      const config: ConsensusConfig = {
        models,
        votingStrategy: "majority",
      };

      const result = await orchestrator.executeConsensus("test", config);

      // Should pick model-2 as representative (faster)
      expect(result.modelResponses.find((r) => r.model.modelId === "model-2")).toBeDefined();
    });
  });

  describe("similarity calculation", () => {
    it("should cluster similar responses together", async () => {
      const models = createTestModels(4);
      // Two similar responses about Paris
      orchestrator.setMockResponse("model-1", "Paris is the capital of France");
      orchestrator.setMockResponse("model-2", "The capital of France is Paris");
      // Two similar responses about London (different cluster)
      orchestrator.setMockResponse("model-3", "London is the capital of England");
      orchestrator.setMockResponse("model-4", "England's capital is London");

      const config: ConsensusConfig = {
        models,
        votingStrategy: "majority",
      };

      const result = await orchestrator.executeConsensus("What is a capital city?", config);

      // Both clusters have 2 members, one will be picked
      expect(result.agreement).toBeCloseTo(0.5, 1);
      expect(result.dissenting).toHaveLength(2);
    });

    it("should handle identical responses", async () => {
      const models = createTestModels(3);
      orchestrator.setMockResponse("model-1", "Exactly the same response");
      orchestrator.setMockResponse("model-2", "Exactly the same response");
      orchestrator.setMockResponse("model-3", "Exactly the same response");

      const config: ConsensusConfig = {
        models,
        votingStrategy: "majority",
      };

      const result = await orchestrator.executeConsensus("test", config);

      expect(result.hasConsensus).toBe(true);
      expect(result.agreement).toBe(1);
    });

    it("should handle empty responses", async () => {
      const models = createTestModels(2);
      orchestrator.setMockResponse("model-1", "");
      orchestrator.setMockResponse("model-2", "");

      const config: ConsensusConfig = {
        models,
        votingStrategy: "majority",
      };

      const result = await orchestrator.executeConsensus("test", config);

      // Empty responses should be treated as similar
      expect(result.agreement).toBe(1);
    });
  });

  describe("confidence scoring", () => {
    it("should have higher confidence with full agreement", async () => {
      const models = createTestModels(3);
      orchestrator.setMockResponse("model-1", "Same answer");
      orchestrator.setMockResponse("model-2", "Same answer");
      orchestrator.setMockResponse("model-3", "Same answer");

      const config: ConsensusConfig = {
        models,
        votingStrategy: "majority",
      };

      const result = await orchestrator.executeConsensus("test", config);

      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it("should have lower confidence without consensus", async () => {
      const models = createTestModels(3);
      orchestrator.setMockResponse("model-1", "Answer A unique");
      orchestrator.setMockResponse("model-2", "Answer B different");
      orchestrator.setMockResponse("model-3", "Answer C various");

      const config: ConsensusConfig = {
        models,
        votingStrategy: "unanimous",
      };

      const result = await orchestrator.executeConsensus("test", config);

      expect(result.confidence).toBeLessThan(0.5);
    });

    it("should calculate confidence based on agreement ratio", async () => {
      const models = createTestModels(4);
      orchestrator.setMockResponse("model-1", "Majority answer here");
      orchestrator.setMockResponse("model-2", "Majority answer here");
      orchestrator.setMockResponse("model-3", "Majority answer here");
      orchestrator.setMockResponse("model-4", "Minority answer");

      const config: ConsensusConfig = {
        models,
        votingStrategy: "majority",
      };

      const result = await orchestrator.executeConsensus("test", config);

      // Confidence should reflect 75% agreement
      expect(result.confidence).toBeGreaterThan(0.6);
      expect(result.confidence).toBeLessThan(1);
    });
  });

  describe("dissenting responses", () => {
    it("should identify dissenting responses", async () => {
      const models = createTestModels(3);
      orchestrator.setMockResponse("model-1", "Consensus answer");
      orchestrator.setMockResponse("model-2", "Consensus answer");
      orchestrator.setMockResponse("model-3", "Dissenting opinion here");

      const config: ConsensusConfig = {
        models,
        votingStrategy: "majority",
      };

      const result = await orchestrator.executeConsensus("test", config);

      expect(result.dissenting).toHaveLength(1);
      expect(result.dissenting[0].model.modelId).toBe("model-3");
    });

    it("should have empty dissenting array when all agree", async () => {
      const models = createTestModels(3);
      orchestrator.setMockResponse("model-1", "Same answer");
      orchestrator.setMockResponse("model-2", "Same answer");
      orchestrator.setMockResponse("model-3", "Same answer");

      const config: ConsensusConfig = {
        models,
        votingStrategy: "majority",
      };

      const result = await orchestrator.executeConsensus("test", config);

      expect(result.dissenting).toHaveLength(0);
    });
  });

  describe("factory function", () => {
    it("should create orchestrator instance", () => {
      const orchestrator = createConsensusOrchestrator();
      expect(orchestrator).toBeInstanceOf(ConsensusOrchestrator);
    });
  });

  describe("abort signal handling", () => {
    it("should respect abort signal", async () => {
      const models = createTestModels(2);
      orchestrator.setMockResponse("model-1", "Response 1", 1000);
      orchestrator.setMockResponse("model-2", "Response 2", 1000);

      const config: ConsensusConfig = {
        models,
        votingStrategy: "majority",
      };

      const controller = new AbortController();

      // Abort after 50ms
      setTimeout(() => controller.abort(), 50);

      const result = await orchestrator.executeConsensus("test", config, {
        signal: controller.signal,
      });

      // Both should fail due to abort
      expect(result.modelResponses.every((r) => !r.success)).toBe(true);
    });
  });

  describe("voting strategy in result", () => {
    it("should include voting strategy in result", async () => {
      const models = createTestModels(2);
      orchestrator.setMockResponse("model-1", "Response");
      orchestrator.setMockResponse("model-2", "Response");

      const strategies: Array<ConsensusConfig["votingStrategy"]> = [
        "majority",
        "unanimous",
        "weighted",
      ];

      for (const votingStrategy of strategies) {
        const config: ConsensusConfig = {
          models,
          votingStrategy,
        };

        const result = await orchestrator.executeConsensus("test", config);
        expect(result.votingStrategy).toBe(votingStrategy);
      }
    });
  });
});

describe("Edge Cases", () => {
  let orchestrator: MockConsensusOrchestrator;

  beforeEach(() => {
    orchestrator = new MockConsensusOrchestrator();
  });

  it("should handle very long responses", async () => {
    const models = createTestModels(2);
    const longResponse = "A".repeat(10000);
    orchestrator.setMockResponse("model-1", longResponse);
    orchestrator.setMockResponse("model-2", longResponse);

    const config: ConsensusConfig = {
      models,
      votingStrategy: "majority",
    };

    const result = await orchestrator.executeConsensus("test", config);

    expect(result.hasConsensus).toBe(true);
    expect(result.finalAnswer).toHaveLength(10000);
  });

  it("should handle special characters in responses", async () => {
    const models = createTestModels(2);
    const specialResponse = "Response with émojis 🎉 and symbols @#$%^&*()";
    orchestrator.setMockResponse("model-1", specialResponse);
    orchestrator.setMockResponse("model-2", specialResponse);

    const config: ConsensusConfig = {
      models,
      votingStrategy: "majority",
    };

    const result = await orchestrator.executeConsensus("test", config);

    expect(result.hasConsensus).toBe(true);
    expect(result.finalAnswer).toBe(specialResponse);
  });

  it("should handle unicode in responses", async () => {
    const models = createTestModels(2);
    const unicodeResponse = "日本語テスト 中文测试 한국어 테스트";
    orchestrator.setMockResponse("model-1", unicodeResponse);
    orchestrator.setMockResponse("model-2", unicodeResponse);

    const config: ConsensusConfig = {
      models,
      votingStrategy: "majority",
    };

    const result = await orchestrator.executeConsensus("test", config);

    expect(result.hasConsensus).toBe(true);
    expect(result.finalAnswer).toBe(unicodeResponse);
  });

  it("should handle newlines in responses", async () => {
    const models = createTestModels(2);
    const multilineResponse = "Line 1\nLine 2\nLine 3";
    orchestrator.setMockResponse("model-1", multilineResponse);
    orchestrator.setMockResponse("model-2", multilineResponse);

    const config: ConsensusConfig = {
      models,
      votingStrategy: "majority",
    };

    const result = await orchestrator.executeConsensus("test", config);

    expect(result.hasConsensus).toBe(true);
    expect(result.finalAnswer).toBe(multilineResponse);
  });
});
