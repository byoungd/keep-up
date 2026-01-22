/**
 * Parallel Plan Reviewer Tests
 *
 * Tests for multi-agent plan review functionality.
 */

import type { ExecutionPlan } from "@ku0/agent-runtime-core";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createParallelPlanReviewer,
  DEFAULT_REVIEWER_PROFILES,
  type ParallelPlanReviewer,
} from "../parallelPlanReviewer";

describe("ParallelPlanReviewer", () => {
  let reviewer: ParallelPlanReviewer;
  let samplePlan: ExecutionPlan;

  beforeEach(() => {
    reviewer = createParallelPlanReviewer();
    samplePlan = {
      id: "plan-test-1",
      goal: "Implement user authentication",
      steps: [
        {
          id: "step-1",
          order: 1,
          description: "Create auth module",
          tools: ["write_file"],
          expectedOutcome: "Module created",
          dependencies: [],
          parallelizable: false,
        },
        {
          id: "step-2",
          order: 2,
          description: "Add login endpoint",
          tools: ["write_file"],
          expectedOutcome: "Endpoint works",
          dependencies: ["step-1"],
          parallelizable: false,
        },
      ],
      estimatedDuration: 30000,
      riskAssessment: "medium",
      toolsNeeded: ["write_file"],
      contextRequired: [],
      successCriteria: ["Login works", "Tests pass"],
      createdAt: Date.now(),
      status: "draft",
      requiresApproval: true,
    };
  });

  describe("default profiles", () => {
    it("should have 4 default reviewer profiles", () => {
      expect(DEFAULT_REVIEWER_PROFILES.length).toBe(4);
    });

    it("should cover different focus areas", () => {
      const focuses = DEFAULT_REVIEWER_PROFILES.map((p) => p.focus);
      expect(focuses).toContain("correctness");
      expect(focuses).toContain("security");
      expect(focuses).toContain("completeness");
      expect(focuses).toContain("risk");
    });

    it("should have weights that could sum to 1", () => {
      const weightSum = DEFAULT_REVIEWER_PROFILES.reduce((sum, p) => sum + p.weight, 0);
      expect(weightSum).toBe(1);
    });
  });

  describe("submitForReview()", () => {
    it("should return consolidated review", async () => {
      const result = await reviewer.submitForReview({
        plan: samplePlan,
        reviewerProfiles: DEFAULT_REVIEWER_PROFILES,
        maxParallelReviews: 4,
        reviewTimeoutMs: 30000,
      });

      expect(result.planId).toBe(samplePlan.id);
      expect(result.reviews.length).toBeGreaterThan(0);
      expect(result.aggregatedScore).toBeGreaterThanOrEqual(0);
      expect(result.aggregatedScore).toBeLessThanOrEqual(100);
      expect(["approve", "revise", "reject"]).toContain(result.recommendation);
    });

    it("should use default profiles when none provided", async () => {
      const result = await reviewer.submitForReview({
        plan: samplePlan,
        reviewerProfiles: [],
        maxParallelReviews: 4,
        reviewTimeoutMs: 30000,
      });

      expect(result.reviews.length).toBe(4);
    });

    it("should respect maxParallelReviews limit", async () => {
      const result = await reviewer.submitForReview({
        plan: samplePlan,
        reviewerProfiles: DEFAULT_REVIEWER_PROFILES,
        maxParallelReviews: 2,
        reviewTimeoutMs: 30000,
      });

      expect(result.reviews.length).toBe(2);
    });
  });

  describe("mock reviews", () => {
    it("should penalize empty plans", async () => {
      const emptyPlan = {
        ...samplePlan,
        steps: [],
      };

      const result = await reviewer.submitForReview({
        plan: emptyPlan,
        reviewerProfiles: [DEFAULT_REVIEWER_PROFILES[0]],
        maxParallelReviews: 1,
        reviewTimeoutMs: 30000,
      });

      expect(result.aggregatedScore).toBeLessThan(50);
      expect(result.prioritizedChanges.length).toBeGreaterThan(0);
    });

    it("should penalize high-risk plans", async () => {
      const highRiskPlan = {
        ...samplePlan,
        riskAssessment: "high" as const,
      };

      const result = await reviewer.submitForReview({
        plan: highRiskPlan,
        reviewerProfiles: DEFAULT_REVIEWER_PROFILES,
        maxParallelReviews: 4,
        reviewTimeoutMs: 30000,
      });

      // High risk plans should score lower
      expect(result.aggregatedScore).toBeLessThan(75);
    });

    it("should penalize plans without success criteria", async () => {
      const noCriteriaPlan = {
        ...samplePlan,
        successCriteria: [],
      };

      const result = await reviewer.submitForReview({
        plan: noCriteriaPlan,
        reviewerProfiles: [DEFAULT_REVIEWER_PROFILES[0]],
        maxParallelReviews: 1,
        reviewTimeoutMs: 30000,
      });

      expect(
        result.prioritizedChanges.some((c) => c.description.includes("success criteria"))
      ).toBe(true);
    });
  });

  describe("consolidateReviews()", () => {
    it("should calculate weighted average score", () => {
      const reviews = [
        {
          reviewId: "r1",
          profile: { ...DEFAULT_REVIEWER_PROFILES[0], weight: 0.5 },
          score: 80,
          feedback: "Good",
          suggestedChanges: [],
          approved: true,
          reviewedAt: Date.now(),
          durationMs: 100,
        },
        {
          reviewId: "r2",
          profile: { ...DEFAULT_REVIEWER_PROFILES[1], weight: 0.5 },
          score: 60,
          feedback: "Needs work",
          suggestedChanges: [],
          approved: false,
          reviewedAt: Date.now(),
          durationMs: 100,
        },
      ];

      const result = reviewer.consolidateReviews("plan-1", reviews);

      // (80 * 0.5 + 60 * 0.5) / 1 = 70
      expect(result.aggregatedScore).toBe(70);
    });

    it("should recommend approve when threshold met", () => {
      const reviews = [
        {
          reviewId: "r1",
          profile: DEFAULT_REVIEWER_PROFILES[0],
          score: 80,
          feedback: "Good",
          suggestedChanges: [],
          approved: true,
          reviewedAt: Date.now(),
          durationMs: 100,
        },
        {
          reviewId: "r2",
          profile: DEFAULT_REVIEWER_PROFILES[1],
          score: 75,
          feedback: "Acceptable",
          suggestedChanges: [],
          approved: true,
          reviewedAt: Date.now(),
          durationMs: 100,
        },
      ];

      const result = reviewer.consolidateReviews("plan-1", reviews);
      expect(result.recommendation).toBe("approve");
      expect(result.approvedBy.length).toBe(2);
    });

    it("should recommend reject when score too low", () => {
      const reviews = [
        {
          reviewId: "r1",
          profile: DEFAULT_REVIEWER_PROFILES[0],
          score: 20,
          feedback: "Bad",
          suggestedChanges: [],
          approved: false,
          reviewedAt: Date.now(),
          durationMs: 100,
        },
      ];

      const result = reviewer.consolidateReviews("plan-1", reviews);
      expect(result.recommendation).toBe("reject");
    });

    it("should deduplicate and prioritize changes", () => {
      const reviews = [
        {
          reviewId: "r1",
          profile: DEFAULT_REVIEWER_PROFILES[0],
          score: 60,
          feedback: "Needs steps",
          suggestedChanges: [
            {
              type: "add_step" as const,
              description: "Add error handling",
              priority: "important" as const,
            },
            {
              type: "add_criteria" as const,
              description: "Add tests",
              priority: "suggestion" as const,
            },
          ],
          approved: false,
          reviewedAt: Date.now(),
          durationMs: 100,
        },
        {
          reviewId: "r2",
          profile: DEFAULT_REVIEWER_PROFILES[1],
          score: 50,
          feedback: "Security issues",
          suggestedChanges: [
            {
              type: "add_step" as const,
              description: "Add error handling",
              priority: "critical" as const,
            }, // Same change, higher priority
          ],
          approved: false,
          reviewedAt: Date.now(),
          durationMs: 100,
        },
      ];

      const result = reviewer.consolidateReviews("plan-1", reviews);

      // Should have 2 unique changes, not 3
      expect(result.prioritizedChanges.length).toBe(2);

      // Should be sorted by priority (critical first)
      expect(result.prioritizedChanges[0].priority).toBe("critical");
    });
  });

  describe("selectBestPlan()", () => {
    it("should select plan with highest score", () => {
      const plans = [
        { ...samplePlan, id: "plan-1" },
        { ...samplePlan, id: "plan-2" },
        { ...samplePlan, id: "plan-3" },
      ];

      // biome-ignore lint/suspicious/noExplicitAny: Test mock data with partial structure
      const reviews = new Map<string, any>([
        ["plan-1", { planId: "plan-1", aggregatedScore: 60 }],
        ["plan-2", { planId: "plan-2", aggregatedScore: 85 }],
        ["plan-3", { planId: "plan-3", aggregatedScore: 70 }],
      ]);

      const best = reviewer.selectBestPlan(plans, reviews);
      expect(best?.id).toBe("plan-2");
    });

    it("should return null for empty plans", () => {
      const best = reviewer.selectBestPlan([], new Map());
      expect(best).toBeNull();
    });
  });
});
