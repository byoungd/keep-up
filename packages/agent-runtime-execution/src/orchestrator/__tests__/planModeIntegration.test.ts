/**
 * Plan Mode Integration Tests
 *
 * Tests for orchestrator integration with Plan Mode.
 */

import type { ExecutionPlan } from "@ku0/agent-runtime-core";
import { beforeEach, describe, expect, it } from "vitest";
import { createClarifyingQuestionsEngine } from "../clarifyingQuestionsEngine";
import { createCodebaseResearchEngine } from "../codebaseResearchEngine";
import { createPlanMarkdownRenderer } from "../planMarkdownRenderer";
import { createPlanModeController } from "../planModeController";
import {
  createPlanModeIntegration,
  type PlanModeIntegration,
  type PlanModeIntegrationEvent,
} from "../planModeIntegration";

describe("PlanModeIntegration", () => {
  let integration: PlanModeIntegration;
  let samplePlan: ExecutionPlan;

  beforeEach(() => {
    const controller = createPlanModeController({
      requireClarification: false,
      requireCodebaseResearch: false,
    });

    integration = createPlanModeIntegration({
      controller,
      clarifyingEngine: createClarifyingQuestionsEngine(),
      researchEngine: createCodebaseResearchEngine(),
      markdownRenderer: createPlanMarkdownRenderer(),
    });

    samplePlan = {
      id: "plan-1",
      goal: "Test goal",
      steps: [
        {
          id: "step-1",
          order: 1,
          description: "Test step",
          tools: ["test_tool"],
          expectedOutcome: "Result",
          dependencies: [],
          parallelizable: false,
        },
      ],
      estimatedDuration: 5000,
      riskAssessment: "low",
      toolsNeeded: ["test_tool"],
      contextRequired: [],
      successCriteria: ["Works"],
      createdAt: Date.now(),
      status: "draft",
      requiresApproval: false,
    };
  });

  describe("shouldActivate()", () => {
    it("should return true for complex requests when auto-activate is enabled", () => {
      expect(integration.shouldActivate("Refactor the entire authentication system")).toBe(true);
    });

    it("should return false for simple requests", () => {
      expect(integration.shouldActivate("Fix typo")).toBe(false);
    });

    it("should respect auto-activate config", () => {
      const disabledIntegration = createPlanModeIntegration({
        controller: createPlanModeController(),
        config: { autoActivate: false },
      });

      expect(disabledIntegration.shouldActivate("Refactor the entire authentication system")).toBe(
        false
      );
    });
  });

  describe("activate()", () => {
    it("should activate Plan Mode", async () => {
      await integration.activate("Add new feature");
      expect(integration.isActive()).toBe(true);
      expect(integration.getCurrentPhase()).toBe("drafting");
    });

    it("should emit started event", async () => {
      const events: PlanModeIntegrationEvent[] = [];
      integration.onEvent((e) => events.push(e));

      await integration.activate("Add new feature");

      expect(events.some((e) => e.type === "plan_mode:started")).toBe(true);
    });
  });

  describe("phase workflow", () => {
    beforeEach(async () => {
      await integration.activate("Add feature");
    });

    it("should accept a plan submission", async () => {
      await integration.submitPlan(samplePlan);
      // Low risk plans are auto-approved
      expect(integration.getCurrentPhase()).toBe("executing");
    });

    it("should allow manual approval", async () => {
      // Submit high-risk plan that won't be auto-approved
      const highRiskPlan = { ...samplePlan, riskAssessment: "high" as const };
      await integration.submitPlan(highRiskPlan);

      expect(integration.getCurrentPhase()).toBe("reviewing");

      integration.approvePlan("Approved");
      expect(integration.getCurrentPhase()).toBe("executing");
    });

    it("should allow rejection with feedback", async () => {
      const highRiskPlan = { ...samplePlan, riskAssessment: "high" as const };
      await integration.submitPlan(highRiskPlan);

      integration.rejectPlan("Need more detail");
      expect(integration.getCurrentPhase()).toBe("drafting");
    });

    it("should complete execution", async () => {
      await integration.submitPlan(samplePlan);
      integration.completeExecution();
      expect(integration.getCurrentPhase()).toBe("completed");
    });
  });

  describe("renderPlanAsMarkdown()", () => {
    it("should render plan as markdown", () => {
      const markdown = integration.renderPlanAsMarkdown(samplePlan);
      expect(markdown).toContain("Test goal");
      expect(markdown).toContain("Test step");
    });
  });

  describe("getPromptInjection()", () => {
    it("should return null when idle", () => {
      expect(integration.getPromptInjection()).toBeNull();
    });

    it("should return drafting instructions when drafting", async () => {
      await integration.activate("Add feature");
      const injection = integration.getPromptInjection();
      expect(injection).toContain("DRAFTING PHASE");
      expect(injection).toContain("execution plan");
    });

    it("should return review instructions when reviewing", async () => {
      await integration.activate("Add feature");
      const highRiskPlan = { ...samplePlan, riskAssessment: "high" as const };
      await integration.submitPlan(highRiskPlan);

      const injection = integration.getPromptInjection();
      expect(injection).toContain("REVIEW PHASE");
    });

    it("should return execution instructions when executing", async () => {
      await integration.activate("Add feature");
      await integration.submitPlan(samplePlan);

      const injection = integration.getPromptInjection();
      expect(injection).toContain("EXECUTION PHASE");
      expect(injection).toContain("Follow the approved plan");
    });
  });

  describe("getPreferredTools()", () => {
    it("should return empty for idle phase", () => {
      expect(integration.getPreferredTools()).toEqual([]);
    });

    it("should return plan tools needed when executing", async () => {
      await integration.activate("Add feature");
      await integration.submitPlan(samplePlan);

      const tools = integration.getPreferredTools();
      expect(tools).toContain("test_tool");
    });
  });

  describe("event handling", () => {
    it("should forward controller events", async () => {
      const events: PlanModeIntegrationEvent[] = [];
      integration.onEvent((e) => events.push(e));

      await integration.activate("Add feature");
      await integration.submitPlan({ ...samplePlan, riskAssessment: "high" as const });
      integration.approvePlan();

      const eventTypes = events.map((e) => e.type);
      expect(eventTypes).toContain("plan_mode:started");
      expect(eventTypes).toContain("plan_mode:phase_changed");
      expect(eventTypes).toContain("plan_mode:plan_drafted");
      expect(eventTypes).toContain("plan_mode:plan_approved");
    });

    it("should allow unsubscribing", async () => {
      const events: PlanModeIntegrationEvent[] = [];
      const unsubscribe = integration.onEvent((e) => events.push(e));

      unsubscribe();

      await integration.activate("Add feature");
      expect(events.length).toBe(0);
    });
  });

  describe("reset()", () => {
    it("should reset Plan Mode", async () => {
      await integration.activate("Add feature");
      expect(integration.isActive()).toBe(true);

      integration.reset();
      expect(integration.isActive()).toBe(false);
    });
  });

  describe("dispose()", () => {
    it("should clean up resources", async () => {
      const events: PlanModeIntegrationEvent[] = [];
      integration.onEvent((e) => events.push(e));

      integration.dispose();

      // Should not receive events after dispose
      await createPlanModeController().start("Test");
      expect(events.length).toBe(0);
    });
  });
});
