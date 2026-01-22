/**
 * Plan Prioritizer Tests
 */

import type { ExecutionPlan, PlanStep } from "@ku0/agent-runtime-core";
import { describe, expect, it } from "vitest";
import { createPlanPrioritizer, PlanPrioritizer } from "../planPrioritizer";

// Helper to create test steps
function createStep(id: string, order: number, deps: string[] = [], duration?: number): PlanStep {
  return {
    id,
    order,
    description: `Step ${id}`,
    tools: [],
    expectedOutcome: "done",
    dependencies: deps,
    estimatedDuration: duration,
    parallelizable: true,
  };
}

// Helper to create test plan
function createPlan(steps: PlanStep[]): ExecutionPlan {
  return {
    id: "test-plan",
    goal: "Test goal",
    steps,
    estimatedDuration: 10000,
    riskAssessment: "low",
    toolsNeeded: [],
    contextRequired: [],
    successCriteria: [],
    createdAt: Date.now(),
    status: "draft",
    requiresApproval: false,
  };
}

describe("PlanPrioritizer", () => {
  it("should create prioritizer with default config", () => {
    const prioritizer = createPlanPrioritizer();
    expect(prioritizer).toBeInstanceOf(PlanPrioritizer);
  });

  it("should create prioritizer with custom config", () => {
    const prioritizer = createPlanPrioritizer({
      defaultStepDurationMs: 10000,
      criticalPathWeight: 50,
    });
    expect(prioritizer).toBeInstanceOf(PlanPrioritizer);
  });

  describe("prioritize", () => {
    it("should prioritize a simple linear plan", () => {
      const steps = [createStep("a", 1), createStep("b", 2, ["a"]), createStep("c", 3, ["b"])];
      const plan = createPlan(steps);
      const prioritizer = createPlanPrioritizer();

      const result = prioritizer.prioritize(plan);

      expect(result.orderedSteps).toHaveLength(3);
      expect(result.orderedSteps[0].id).toBe("a");
      expect(result.orderedSteps[1].id).toBe("b");
      expect(result.orderedSteps[2].id).toBe("c");
      expect(result.criticalPath).toHaveLength(3);
    });

    it("should detect critical path in diamond dependency", () => {
      // Diamond: A -> B, A -> C, B -> D, C -> D
      const steps = [
        createStep("a", 1, [], 1000),
        createStep("b", 2, ["a"], 3000), // Longer path
        createStep("c", 3, ["a"], 1000),
        createStep("d", 4, ["b", "c"], 1000),
      ];
      const plan = createPlan(steps);
      const prioritizer = createPlanPrioritizer();

      const result = prioritizer.prioritize(plan);

      // Critical path should be A -> B -> D (longest)
      expect(result.criticalPath).toContain("a");
      expect(result.criticalPath).toContain("b");
      expect(result.criticalPath).toContain("d");
    });

    it("should calculate parallel duration correctly", () => {
      // Two parallel branches
      const steps = [createStep("a", 1, [], 1000), createStep("b", 2, [], 1000)];
      const plan = createPlan(steps);
      const prioritizer = createPlanPrioritizer();

      const result = prioritizer.prioritize(plan);

      // Parallel duration should be max of parallel branches
      expect(result.estimatedParallelMs).toBe(1000);
      expect(result.estimatedTotalMs).toBe(2000);
    });
  });

  describe("reorderSteps", () => {
    it("should reorder steps by priority", () => {
      const steps = [createStep("a", 1), createStep("b", 2), createStep("c", 3)];
      const plan = createPlan(steps);
      const prioritizer = createPlanPrioritizer();

      const { priorities } = prioritizer.prioritize(plan);
      const reordered = prioritizer.reorderSteps(steps, priorities);

      expect(reordered).toHaveLength(3);
    });
  });

  describe("getParallelGroups", () => {
    it("should group independent steps together", () => {
      const steps = [createStep("a", 1), createStep("b", 2), createStep("c", 3, ["a", "b"])];
      const plan = createPlan(steps);
      const prioritizer = createPlanPrioritizer();

      const { priorities } = prioritizer.prioritize(plan);
      const groups = prioritizer.getParallelGroups(steps, priorities);

      expect(groups).toHaveLength(2);
      expect(groups[0]).toHaveLength(2); // a, b in parallel
      expect(groups[1]).toHaveLength(1); // c alone
    });

    it("should run non-parallelizable steps alone", () => {
      const nonParallelStep: PlanStep = {
        ...createStep("a", 1),
        parallelizable: false,
      };
      const steps = [nonParallelStep, createStep("b", 2)];
      const plan = createPlan(steps);
      const prioritizer = createPlanPrioritizer();

      const { priorities } = prioritizer.prioritize(plan);
      const groups = prioritizer.getParallelGroups(steps, priorities);

      expect(groups).toHaveLength(2);
      expect(groups[0]).toHaveLength(1);
      expect(groups[0][0].id).toBe("a");
    });
  });
});
