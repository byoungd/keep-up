/**
 * Model Router Tests
 */

import { describe, expect, it } from "vitest";
import { createModelRouter } from "../routing/modelRouter";

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
  });
});
