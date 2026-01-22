/**
 * Plan Mode Controller Tests
 *
 * Tests for the multi-phase planning workflow inspired by Cursor's Plan Mode.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createClarifyingQuestionsEngine } from "../clarifyingQuestionsEngine";
import { createCodebaseResearchEngine } from "../codebaseResearchEngine";
import {
  createPlanModeController,
  type PlanModeController,
  type PlanModeEvent,
} from "../planModeController";

describe("PlanModeController", () => {
  let controller: PlanModeController;

  beforeEach(() => {
    controller = createPlanModeController({
      requireClarification: false,
      requireCodebaseResearch: false,
    });
  });

  describe("initialization", () => {
    it("should start in idle phase", () => {
      expect(controller.getPhase()).toBe("idle");
      expect(controller.isActive()).toBe(false);
    });

    it("should be enabled by default", () => {
      expect(controller.isEnabled()).toBe(true);
    });

    it("should accept custom configuration", () => {
      const customController = createPlanModeController({
        enabled: false,
        requireClarification: true,
        maxClarificationRounds: 5,
      });
      expect(customController.isEnabled()).toBe(false);
      expect(customController.getConfig().maxClarificationRounds).toBe(5);
    });
  });

  describe("start()", () => {
    it("should transition from idle to drafting when no clarification/research required", async () => {
      await controller.start("Add a new feature");
      expect(controller.getPhase()).toBe("drafting");
      expect(controller.isActive()).toBe(true);
    });

    it("should store the user request", async () => {
      await controller.start("Implement user authentication");
      expect(controller.getState().userRequest).toBe("Implement user authentication");
    });

    it("should throw if already active", async () => {
      await controller.start("First request");
      await expect(controller.start("Second request")).rejects.toThrow();
    });
  });

  describe("clarifying phase", () => {
    let clarifyingController: PlanModeController;

    beforeEach(() => {
      clarifyingController = createPlanModeController({
        requireClarification: true,
        requireCodebaseResearch: false,
      });
      clarifyingController.setClarifyingEngine(createClarifyingQuestionsEngine());
    });

    it("should transition to clarifying phase when required", async () => {
      await clarifyingController.start("Add API endpoints");
      expect(clarifyingController.getPhase()).toBe("clarifying");
    });

    it("should generate clarifying questions", async () => {
      await clarifyingController.start("Add API endpoints");
      const unanswered = clarifyingController.getUnansweredQuestions();
      expect(unanswered.length).toBeGreaterThan(0);
    });

    it("should allow answering questions", async () => {
      await clarifyingController.start("Add API endpoints");
      const questions = clarifyingController.getUnansweredQuestions();
      const firstQuestion = questions[0];

      await clarifyingController.answerQuestion(firstQuestion.id, "Use REST");

      const state = clarifyingController.getState();
      const answered = state.clarifyingQuestions.find((q) => q.id === firstQuestion.id);
      expect(answered?.answer).toBe("Use REST");
    });

    it("should allow skipping clarification", async () => {
      await clarifyingController.start("Add API endpoints");
      await clarifyingController.skipClarification();
      expect(clarifyingController.getPhase()).toBe("drafting");
    });
  });

  describe("research phase", () => {
    let researchController: PlanModeController;

    beforeEach(() => {
      researchController = createPlanModeController({
        requireClarification: false,
        requireCodebaseResearch: true,
      });
      researchController.setResearchEngine(createCodebaseResearchEngine());
    });

    it("should transition through research phase", async () => {
      await researchController.start("Refactor the auth module");
      // Should complete research and move to drafting
      expect(researchController.getPhase()).toBe("drafting");
    });
  });

  describe("drafting phase", () => {
    it("should accept a draft plan", async () => {
      await controller.start("Create a new component");

      const mockPlan = {
        id: "plan-123",
        goal: "Create a new component",
        steps: [
          {
            id: "step-1",
            order: 1,
            description: "Create component file",
            tools: ["write_file"],
            expectedOutcome: "Component file created",
            dependencies: [],
            parallelizable: false,
          },
        ],
        estimatedDuration: 5000,
        riskAssessment: "high" as const, // High risk won't be auto-approved
        toolsNeeded: ["write_file"],
        contextRequired: [],
        successCriteria: ["Component renders correctly"],
        createdAt: Date.now(),
        status: "draft" as const,
        requiresApproval: false,
      };

      controller.submitDraftPlan(mockPlan);
      expect(controller.getPhase()).toBe("reviewing");
      expect(controller.getDraftPlan()?.id).toBe("plan-123");
    });
  });

  describe("review phase", () => {
    beforeEach(async () => {
      await controller.start("Add feature");
      controller.submitDraftPlan({
        id: "plan-1",
        goal: "Add feature",
        steps: [],
        estimatedDuration: 1000,
        riskAssessment: "low",
        toolsNeeded: [],
        contextRequired: [],
        successCriteria: [],
        createdAt: Date.now(),
        status: "draft",
        requiresApproval: false,
      });
    });

    it("should auto-approve low-risk plans in hybrid mode", () => {
      // The default config is hybrid mode with autoApproveLowRisk
      expect(controller.getPhase()).toBe("executing");
    });

    it("should wait for manual approval when configured", async () => {
      const manualController = createPlanModeController({
        planApprovalMode: "manual",
        requireClarification: false,
        requireCodebaseResearch: false,
      });

      await manualController.start("Add feature");
      manualController.submitDraftPlan({
        id: "plan-2",
        goal: "Add feature",
        steps: [],
        estimatedDuration: 1000,
        riskAssessment: "low",
        toolsNeeded: [],
        contextRequired: [],
        successCriteria: [],
        createdAt: Date.now(),
        status: "draft",
        requiresApproval: false,
      });

      expect(manualController.getPhase()).toBe("reviewing");

      manualController.approvePlan("Looks good");
      expect(manualController.getPhase()).toBe("executing");
    });

    it("should return to drafting when plan is rejected", async () => {
      const manualController = createPlanModeController({
        planApprovalMode: "manual",
        requireClarification: false,
        requireCodebaseResearch: false,
      });

      await manualController.start("Add feature");
      manualController.submitDraftPlan({
        id: "plan-3",
        goal: "Add feature",
        steps: [],
        estimatedDuration: 1000,
        riskAssessment: "low",
        toolsNeeded: [],
        contextRequired: [],
        successCriteria: [],
        createdAt: Date.now(),
        status: "draft",
        requiresApproval: false,
      });

      manualController.rejectPlan("Need more detail");
      expect(manualController.getPhase()).toBe("drafting");
      expect(manualController.getState().approvalFeedback).toBe("Need more detail");
    });
  });

  describe("execution phase", () => {
    it("should complete execution and transition to completed", async () => {
      await controller.start("Add feature");
      controller.submitDraftPlan({
        id: "plan-4",
        goal: "Add feature",
        steps: [],
        estimatedDuration: 1000,
        riskAssessment: "low",
        toolsNeeded: [],
        contextRequired: [],
        successCriteria: [],
        createdAt: Date.now(),
        status: "draft",
        requiresApproval: false,
      });

      controller.completeExecution();
      expect(controller.getPhase()).toBe("completed");
      expect(controller.isActive()).toBe(false);
    });
  });

  describe("event handling", () => {
    it("should emit events on phase transitions", async () => {
      const events: PlanModeEvent[] = [];
      controller.onEvent((event) => events.push(event));

      await controller.start("Test feature");

      expect(events.some((e) => e.type === "phase_changed")).toBe(true);
    });

    it("should allow unsubscribing from events", async () => {
      const events: PlanModeEvent[] = [];
      const unsubscribe = controller.onEvent((event) => events.push(event));

      unsubscribe();

      await controller.start("Test feature");
      expect(events.length).toBe(0);
    });
  });

  describe("reset()", () => {
    it("should reset to idle state", async () => {
      await controller.start("Feature");
      controller.reset();

      expect(controller.getPhase()).toBe("idle");
      expect(controller.getState().userRequest).toBe("");
    });
  });

  describe("complexity assessment", () => {
    it("should assess simple requests as simple", () => {
      expect(controller.assessComplexity("Fix typo")).toBe("simple");
    });

    it("should assess multi-file changes as moderate", () => {
      expect(controller.assessComplexity("Update files across multiple directories")).toBe(
        "moderate"
      );
    });

    it("should assess refactoring as complex", () => {
      expect(controller.assessComplexity("Refactor the entire auth system")).toBe("complex");
    });

    it("should assess architecture changes as complex", () => {
      expect(controller.assessComplexity("Design a new architecture for the API")).toBe("complex");
    });
  });
});
