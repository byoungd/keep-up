/**
 * Model Router Tests
 */

import { describe, expect, it } from "vitest";
import { createModelRouter, type ModelRoutingDecision } from "../routing/modelRouter";

describe("ModelRouter", () => {
  it("routes high-risk requests to configured model", () => {
    const router = createModelRouter({
      defaultModel: "small",
      defaultBudget: { maxTokens: 1000 },
      rules: [
        {
          id: "high-risk",
          match: (request) => request.risk === "high",
          modelId: "large",
          fallbackModels: ["medium"],
          budgetOverride: { maxTokens: 2000 },
          reason: "high risk",
        },
      ],
    });

    const decision = router.route({
      taskType: "refactor",
      risk: "high",
      budget: { maxTokens: 800 },
    });

    expect(decision.modelId).toBe("large");
    expect(decision.budget.maxTokens).toBe(2000);
    expect(decision.fallbackModels).toEqual(["medium"]);
    expect(decision.policy).toBe("quality"); // default policy
  });

  it("falls back to default model with preferred alternatives", () => {
    const router = createModelRouter({
      defaultModel: "small",
      defaultBudget: { maxTokens: 500 },
    });

    const decision = router.route({
      taskType: "summary",
      risk: "low",
      budget: { maxTokens: 300 },
      preferredModels: ["small", "medium"],
    });

    expect(decision.modelId).toBe("small");
    expect(decision.fallbackModels).toEqual(["medium"]);
    expect(decision.policy).toBe("quality");
  });

  describe("resolveForTurn", () => {
    it("resolves model for a turn and emits decision", () => {
      const emittedDecisions: ModelRoutingDecision[] = [];
      const router = createModelRouter({
        defaultModel: "gpt-4",
        defaultBudget: { maxTokens: 4000 },
        onRoutingDecision: (decision) => emittedDecisions.push(decision),
      });

      const decision = router.resolveForTurn({
        taskType: "coding",
        risk: "medium",
        budget: { maxTokens: 2000 },
        turn: 1,
      });

      expect(decision.resolved).toBe("gpt-4");
      expect(decision.policy).toBe("quality");
      expect(emittedDecisions).toHaveLength(1);
      expect(emittedDecisions[0]).toEqual(decision);
    });

    it("uses policy from request", () => {
      const router = createModelRouter({
        defaultModel: "gpt-4",
        defaultBudget: { maxTokens: 4000 },
        defaultPolicy: "quality",
      });

      const decision = router.resolveForTurn({
        taskType: "summarize",
        risk: "low",
        budget: { maxTokens: 1000 },
        policy: "cost",
      });

      expect(decision.policy).toBe("cost");
    });

    it("supports phase-aware routing", () => {
      const router = createModelRouter({
        defaultModel: "small",
        defaultBudget: { maxTokens: 1000 },
        rules: [
          {
            id: "implement-phase",
            match: (request) => request.phaseContext === "implement",
            modelId: "large",
            reason: "implementation phase requires larger model",
            policy: "quality",
          },
        ],
      });

      const decision = router.resolveForTurn({
        taskType: "code",
        risk: "medium",
        budget: { maxTokens: 2000 },
        phaseContext: "implement",
      });

      expect(decision.resolved).toBe("large");
      expect(decision.reason).toBe("implementation phase requires larger model");
    });

    it("falls back to default on routing failure", () => {
      const emittedDecisions: ModelRoutingDecision[] = [];
      const router = createModelRouter({
        defaultModel: "fallback-model",
        defaultBudget: { maxTokens: 1000 },
        rules: [
          {
            id: "error-rule",
            match: () => {
              throw new Error("Routing error");
            },
            modelId: "unreachable",
            reason: "should not reach",
          },
        ],
        onRoutingDecision: (decision) => emittedDecisions.push(decision),
      });

      const decision = router.resolveForTurn({
        taskType: "test",
        risk: "low",
        budget: { maxTokens: 500 },
      });

      expect(decision.resolved).toBe("fallback-model");
      expect(decision.reason).toBe("fallback due to routing failure");
      expect(emittedDecisions).toHaveLength(1);
    });
  });

  describe("policy-based routing", () => {
    it("routes based on cost policy", () => {
      const router = createModelRouter({
        defaultModel: "medium",
        defaultBudget: { maxTokens: 2000 },
        rules: [
          {
            id: "cost-optimization",
            match: (request) => request.policy === "cost",
            modelId: "small",
            reason: "cost-optimized model",
            policy: "cost",
          },
        ],
      });

      const decision = router.route({
        taskType: "simple",
        risk: "low",
        budget: { maxTokens: 500 },
        policy: "cost",
      });

      expect(decision.modelId).toBe("small");
      expect(decision.policy).toBe("cost");
    });

    it("routes based on latency policy", () => {
      const router = createModelRouter({
        defaultModel: "large",
        defaultBudget: { maxTokens: 4000 },
        rules: [
          {
            id: "latency-optimization",
            match: (request) => request.policy === "latency",
            modelId: "fast-small",
            reason: "optimized for latency",
            policy: "latency",
          },
        ],
      });

      const decision = router.route({
        taskType: "quick-response",
        risk: "low",
        budget: { maxTokens: 1000 },
        policy: "latency",
      });

      expect(decision.modelId).toBe("fast-small");
      expect(decision.policy).toBe("latency");
    });
  });
});
