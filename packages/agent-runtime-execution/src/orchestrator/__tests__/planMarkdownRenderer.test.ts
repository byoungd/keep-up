/**
 * Plan Markdown Renderer Tests
 *
 * Tests for rendering plans as Markdown with Mermaid diagrams.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  createPlanMarkdownRenderer,
  type PlanMarkdownRenderer,
  type RenderablePlan,
} from "../planMarkdownRenderer";

describe("PlanMarkdownRenderer", () => {
  let renderer: PlanMarkdownRenderer;
  let samplePlan: RenderablePlan;

  beforeEach(() => {
    renderer = createPlanMarkdownRenderer();
    samplePlan = {
      id: "plan-test-123",
      goal: "Implement user authentication",
      steps: [
        {
          id: "step-1",
          order: 1,
          description: "Create auth module",
          tools: ["write_file", "read_file"],
          expectedOutcome: "Auth module file created",
          dependencies: [],
          parallelizable: false,
          status: "pending",
        },
        {
          id: "step-2",
          order: 2,
          description: "Add login endpoint",
          tools: ["write_file"],
          expectedOutcome: "Login endpoint works",
          dependencies: ["step-1"],
          parallelizable: false,
          status: "pending",
        },
      ],
      estimatedDuration: 30000,
      riskAssessment: "medium",
      toolsNeeded: ["write_file", "read_file", "run_tests"],
      contextRequired: ["src/auth/", "package.json"],
      successCriteria: ["Login works", "Tests pass"],
      createdAt: Date.now(),
      status: "draft",
      requiresApproval: true,
    };
  });

  describe("render()", () => {
    it("should render plan header", () => {
      const markdown = renderer.render(samplePlan);
      expect(markdown).toContain("# Execution Plan: Implement user authentication");
      expect(markdown).toContain(`**Plan ID:** \`${samplePlan.id}\``);
      expect(markdown).toContain("**Status:** 📝 Draft");
    });

    it("should render risk assessment", () => {
      const markdown = renderer.render(samplePlan);
      expect(markdown).toContain("**Risk Assessment:** 🟡 Medium");
    });

    it("should render steps", () => {
      const markdown = renderer.render(samplePlan);
      expect(markdown).toContain("## Execution Steps");
      expect(markdown).toContain("Step 1: Create auth module");
      expect(markdown).toContain("Step 2: Add login endpoint");
    });

    it("should include Mermaid flowchart", () => {
      const markdown = renderer.render(samplePlan);
      expect(markdown).toContain("```mermaid");
      expect(markdown).toContain("flowchart TD");
      expect(markdown).toContain("step_1");
      expect(markdown).toContain("step_2");
    });

    it("should render success criteria", () => {
      const markdown = renderer.render(samplePlan);
      expect(markdown).toContain("## Success Criteria");
      expect(markdown).toContain("- [ ] Login works");
      expect(markdown).toContain("- [ ] Tests pass");
    });

    it("should render tools and context", () => {
      const markdown = renderer.render(samplePlan);
      expect(markdown).toContain("### Tools Required");
      expect(markdown).toContain("`write_file`");
      expect(markdown).toContain("### Context/Files Needed");
      expect(markdown).toContain("`src/auth/`");
    });
  });

  describe("render with clarifications", () => {
    it("should render clarifications section", () => {
      const planWithClarifications: RenderablePlan = {
        ...samplePlan,
        clarifications: [
          {
            id: "q-1",
            question: "What auth method?",
            category: "requirements",
            priority: "blocking",
            answer: "JWT tokens",
            answeredAt: Date.now(),
          },
        ],
      };

      const markdown = renderer.render(planWithClarifications);
      expect(markdown).toContain("## Clarifications");
      expect(markdown).toContain("**Q:** What auth method?");
      expect(markdown).toContain("**A:** JWT tokens");
    });
  });

  describe("render with research summary", () => {
    it("should render research summary", () => {
      const planWithResearch: RenderablePlan = {
        ...samplePlan,
        researchSummary: "Found existing auth patterns in src/utils/auth.ts",
      };

      const markdown = renderer.render(planWithResearch);
      expect(markdown).toContain("## Research Summary");
      expect(markdown).toContain("Found existing auth patterns");
    });
  });

  describe("render with alternative approaches", () => {
    it("should render alternative approaches", () => {
      const planWithAlternatives: RenderablePlan = {
        ...samplePlan,
        alternativeApproaches: [
          {
            id: "alt-1",
            title: "Use OAuth",
            description: "External OAuth provider",
            prosAndCons: {
              pros: ["Less code", "More secure"],
              cons: ["External dependency"],
            },
            rejected: true,
            rejectionReason: "Adds complexity for our use case",
          },
        ],
      };

      const markdown = renderer.render(planWithAlternatives);
      expect(markdown).toContain("## Alternative Approaches Considered");
      expect(markdown).toContain("### Use OAuth");
      expect(markdown).toContain("✅ Less code");
      expect(markdown).toContain("❌ External dependency");
      expect(markdown).toContain("**Not chosen:** Adds complexity for our use case");
    });
  });

  describe("renderStep()", () => {
    it("should render step with status icon", () => {
      const step = samplePlan.steps[0];
      step.status = "complete";
      const stepMarkdown = renderer.renderStep(step);
      expect(stepMarkdown).toContain("✅");
    });

    it("should render step details", () => {
      const stepMarkdown = renderer.renderStep(samplePlan.steps[0]);
      expect(stepMarkdown).toContain("**ID:** `step-1`");
      expect(stepMarkdown).toContain("**Tools:** `write_file`, `read_file`");
      expect(stepMarkdown).toContain("**Expected Outcome:** Auth module file created");
    });
  });

  describe("renderFlowchart()", () => {
    it("should create valid Mermaid flowchart", () => {
      const flowchart = renderer.renderFlowchart(samplePlan);
      expect(flowchart).toContain("```mermaid");
      expect(flowchart).toContain("flowchart TD");
      expect(flowchart).toContain("```");
    });

    it("should include dependency edges", () => {
      const flowchart = renderer.renderFlowchart(samplePlan);
      expect(flowchart).toContain("step_1 --> step_2");
    });
  });

  describe("renderGantt()", () => {
    it("should create valid Mermaid Gantt chart", () => {
      const ganttRenderer = createPlanMarkdownRenderer({ includeGantt: true });
      const planWithMultipleSteps = {
        ...samplePlan,
        steps: [
          ...samplePlan.steps,
          {
            id: "step-3",
            order: 3,
            description: "Write tests",
            tools: ["write_file"],
            expectedOutcome: "Tests pass",
            dependencies: ["step-2"],
            parallelizable: true,
            estimatedDuration: 10000,
          },
        ],
      };

      const gantt = ganttRenderer.renderGantt(planWithMultipleSteps);
      expect(gantt).toContain("```mermaid");
      expect(gantt).toContain("gantt");
      expect(gantt).toContain("title Implement user authentication");
    });
  });

  describe("parsePlan()", () => {
    it("should parse goal from markdown", () => {
      const markdown = renderer.render(samplePlan);
      const parsed = renderer.parsePlan(markdown);
      expect(parsed.goal).toBe("Implement user authentication");
    });

    it("should parse plan ID from markdown", () => {
      const markdown = renderer.render(samplePlan);
      const parsed = renderer.parsePlan(markdown);
      expect(parsed.id).toBe("plan-test-123");
    });

    it("should parse steps from markdown", () => {
      const markdown = renderer.render(samplePlan);
      const parsed = renderer.parsePlan(markdown);
      expect(parsed.steps?.length).toBe(2);
      expect(parsed.steps?.[0].description).toBe("Create auth module");
    });

    it("should parse success criteria from markdown", () => {
      const markdown = renderer.render(samplePlan);
      const parsed = renderer.parsePlan(markdown);
      expect(parsed.successCriteria).toContain("Login works");
      expect(parsed.successCriteria).toContain("Tests pass");
    });
  });

  describe("configuration", () => {
    it("should respect includeFlowchart config", () => {
      const noFlowchartRenderer = createPlanMarkdownRenderer({
        includeFlowchart: false,
      });
      const markdown = noFlowchartRenderer.render(samplePlan);
      expect(markdown).not.toContain("```mermaid");
    });

    it("should respect includeRiskAssessment config", () => {
      const noRiskRenderer = createPlanMarkdownRenderer({
        includeRiskAssessment: false,
      });
      const markdown = noRiskRenderer.render(samplePlan);
      expect(markdown).not.toContain("Risk Assessment");
    });
  });
});
