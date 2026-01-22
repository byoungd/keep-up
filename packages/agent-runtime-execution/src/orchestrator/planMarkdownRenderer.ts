/**
 * Plan Markdown Renderer
 *
 * Renders execution plans as rich Markdown with Mermaid diagrams.
 * Supports parsing edited Markdown back into ExecutionPlan objects.
 *
 * Features:
 * - Mermaid flowchart for plan overview
 * - Mermaid Gantt chart for timeline visualization
 * - Structured Markdown with all plan details
 * - Round-trip parsing for user edits
 */

import type { ExecutionPlan, PlanStep } from "@ku0/agent-runtime-core";
import type { ClarifyingQuestion } from "./clarifyingQuestionsEngine";
import type { AlternativeApproach } from "./planModeController";

// ============================================================================
// Types
// ============================================================================

/**
 * Extended plan with additional rendering data.
 */
export interface RenderablePlan extends ExecutionPlan {
  /** Overview diagram in Mermaid */
  overviewDiagram?: string;
  /** Research summary from codebase research phase */
  researchSummary?: string;
  /** Clarifications from Q&A phase */
  clarifications?: ClarifyingQuestion[];
  /** Alternative approaches considered */
  alternativeApproaches?: AlternativeApproach[];
}

/**
 * Configuration for plan rendering.
 */
export interface PlanRenderConfig {
  /** Include Mermaid flowchart */
  includeFlowchart: boolean;
  /** Include Mermaid Gantt chart */
  includeGantt: boolean;
  /** Include clarifications section */
  includeClarifications: boolean;
  /** Include research summary */
  includeResearchSummary: boolean;
  /** Include alternative approaches */
  includeAlternatives: boolean;
  /** Include step details */
  includeStepDetails: boolean;
  /** Include risk assessment */
  includeRiskAssessment: boolean;
}

export const DEFAULT_RENDER_CONFIG: PlanRenderConfig = {
  includeFlowchart: true,
  includeGantt: false,
  includeResearchSummary: true,
  includeClarifications: true,
  includeAlternatives: true,
  includeStepDetails: true,
  includeRiskAssessment: true,
};

// ============================================================================
// Plan Markdown Renderer
// ============================================================================

/**
 * Renders execution plans as Markdown with Mermaid diagrams.
 */
export class PlanMarkdownRenderer {
  private readonly config: PlanRenderConfig;

  constructor(config: Partial<PlanRenderConfig> = {}) {
    this.config = { ...DEFAULT_RENDER_CONFIG, ...config };
  }

  /**
   * Render a full plan as Markdown.
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Markdown rendering is inherently complex
  render(plan: RenderablePlan): string {
    const sections: string[] = [];

    // Header
    sections.push(`# Execution Plan: ${plan.goal}`);
    sections.push("");
    sections.push(`**Plan ID:** \`${plan.id}\``);
    sections.push(`**Status:** ${this.formatStatus(plan.status)}`);
    sections.push(`**Created:** ${new Date(plan.createdAt).toISOString()}`);

    if (this.config.includeRiskAssessment) {
      sections.push(`**Risk Assessment:** ${this.formatRisk(plan.riskAssessment)}`);
    }

    sections.push(`**Estimated Duration:** ${this.formatDuration(plan.estimatedDuration)}`);
    sections.push("");

    // Overview diagram
    if (this.config.includeFlowchart && plan.steps.length > 0) {
      sections.push("## Plan Overview");
      sections.push("");
      sections.push(this.renderFlowchart(plan));
      sections.push("");
    }

    // Research summary
    if (this.config.includeResearchSummary && plan.researchSummary) {
      sections.push("## Research Summary");
      sections.push("");
      sections.push(plan.researchSummary);
      sections.push("");
    }

    // Clarifications
    if (
      this.config.includeClarifications &&
      plan.clarifications &&
      plan.clarifications.length > 0
    ) {
      sections.push("## Clarifications");
      sections.push("");
      for (const q of plan.clarifications) {
        if (q.answer) {
          sections.push(`**Q:** ${q.question}`);
          sections.push(`**A:** ${q.answer}`);
          sections.push("");
        }
      }
    }

    // Steps
    sections.push("## Execution Steps");
    sections.push("");

    for (const step of plan.steps.sort((a, b) => a.order - b.order)) {
      sections.push(this.renderStep(step));
    }

    // Gantt chart
    if (this.config.includeGantt && plan.steps.length > 1) {
      sections.push("## Timeline");
      sections.push("");
      sections.push(this.renderGantt(plan));
      sections.push("");
    }

    // Alternative approaches
    if (
      this.config.includeAlternatives &&
      plan.alternativeApproaches &&
      plan.alternativeApproaches.length > 0
    ) {
      sections.push("## Alternative Approaches Considered");
      sections.push("");
      for (const alt of plan.alternativeApproaches) {
        sections.push(`### ${alt.title}`);
        sections.push("");
        sections.push(alt.description);
        sections.push("");
        if (alt.prosAndCons.pros.length > 0) {
          sections.push("**Pros:**");
          for (const pro of alt.prosAndCons.pros) {
            sections.push(`- ✅ ${pro}`);
          }
        }
        if (alt.prosAndCons.cons.length > 0) {
          sections.push("**Cons:**");
          for (const con of alt.prosAndCons.cons) {
            sections.push(`- ❌ ${con}`);
          }
        }
        if (alt.rejected && alt.rejectionReason) {
          sections.push("");
          sections.push(`> **Not chosen:** ${alt.rejectionReason}`);
        }
        sections.push("");
      }
    }

    // Success criteria
    if (plan.successCriteria.length > 0) {
      sections.push("## Success Criteria");
      sections.push("");
      for (const criterion of plan.successCriteria) {
        sections.push(`- [ ] ${criterion}`);
      }
      sections.push("");
    }

    // Tools and context
    sections.push("## Resources");
    sections.push("");
    sections.push("### Tools Required");
    for (const tool of plan.toolsNeeded) {
      sections.push(`- \`${tool}\``);
    }
    sections.push("");

    if (plan.contextRequired.length > 0) {
      sections.push("### Context/Files Needed");
      for (const ctx of plan.contextRequired) {
        sections.push(`- \`${ctx}\``);
      }
      sections.push("");
    }

    return sections.join("\n");
  }

  /**
   * Render a single step.
   */
  renderStep(step: PlanStep): string {
    const lines: string[] = [];

    const statusIcon = this.getStepStatusIcon(step.status);
    lines.push(`### ${statusIcon} Step ${step.order}: ${step.description}`);
    lines.push("");

    if (this.config.includeStepDetails) {
      lines.push(`**ID:** \`${step.id}\``);

      if (step.tools.length > 0) {
        lines.push(`**Tools:** ${step.tools.map((t) => `\`${t}\``).join(", ")}`);
      }

      lines.push(`**Expected Outcome:** ${step.expectedOutcome}`);

      if (step.estimatedDuration) {
        lines.push(`**Estimated Duration:** ${this.formatDuration(step.estimatedDuration)}`);
      }

      if (step.dependencies.length > 0) {
        lines.push(`**Dependencies:** ${step.dependencies.map((d) => `\`${d}\``).join(", ")}`);
      }

      if (step.parallelizable) {
        lines.push("**Parallelizable:** ✅ Yes");
      }
    }

    lines.push("");
    return lines.join("\n");
  }

  /**
   * Render Mermaid flowchart for plan overview.
   */
  renderFlowchart(plan: RenderablePlan): string {
    const lines: string[] = [];
    lines.push("```mermaid");
    lines.push("flowchart TD");

    const idMap = this.buildMermaidIdMap(plan.steps);

    // Add nodes
    for (const step of plan.steps) {
      const safeDesc = step.description.replace(/"/g, "'").slice(0, 40);
      const statusClass = this.getStepStatusClass(step.status);
      const nodeId = idMap.get(step.id) ?? `step_${step.order}`;
      lines.push(`    ${nodeId}["Step ${step.order}: ${safeDesc}"]${statusClass}`);
    }

    // Add edges for dependencies
    for (const step of plan.steps) {
      const nodeId = idMap.get(step.id) ?? `step_${step.order}`;
      for (const dep of step.dependencies) {
        const depId = idMap.get(dep);
        if (depId) {
          lines.push(`    ${depId} --> ${nodeId}`);
        }
      }
    }

    // If no dependencies, create sequential flow
    const stepsWithNoDeps = plan.steps.filter((s) => s.dependencies.length === 0);
    if (stepsWithNoDeps.length === plan.steps.length && plan.steps.length > 1) {
      const sorted = [...plan.steps].sort((a, b) => a.order - b.order);
      for (let i = 0; i < sorted.length - 1; i++) {
        const fromId = idMap.get(sorted[i].id) ?? `step_${sorted[i].order}`;
        const toId = idMap.get(sorted[i + 1].id) ?? `step_${sorted[i + 1].order}`;
        lines.push(`    ${fromId} --> ${toId}`);
      }
    }

    // Style definitions
    lines.push("    classDef pending fill:#f0f0f0,stroke:#999");
    lines.push("    classDef executing fill:#fff3cd,stroke:#ffc107");
    lines.push("    classDef complete fill:#d4edda,stroke:#28a745");
    lines.push("    classDef failed fill:#f8d7da,stroke:#dc3545");

    lines.push("```");
    return lines.join("\n");
  }

  /**
   * Render Mermaid Gantt chart.
   */
  renderGantt(plan: RenderablePlan): string {
    const lines: string[] = [];
    lines.push("```mermaid");
    lines.push("gantt");
    lines.push(`    title ${plan.goal}`);
    lines.push("    dateFormat X");
    lines.push("    axisFormat %s");
    lines.push("");
    lines.push("    section Steps");

    let cumulative = 0;
    for (const step of plan.steps.sort((a, b) => a.order - b.order)) {
      const duration = step.estimatedDuration ?? 5000;
      const durationSec = Math.ceil(duration / 1000);
      const safeDesc = step.description.replace(/:/g, "-").slice(0, 30);
      lines.push(`    ${safeDesc} :${cumulative}, ${durationSec}s`);
      cumulative += durationSec;
    }

    lines.push("```");
    return lines.join("\n");
  }

  /**
   * Parse Markdown back into a plan.
   * Note: This is a best-effort parser for user-edited plans.
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Markdown parsing requires multiple conditions
  parsePlan(markdown: string): Partial<RenderablePlan> {
    const plan: Partial<RenderablePlan> = {};

    // Extract goal from title
    const titleMatch = markdown.match(/^#\s+Execution Plan:\s*(.+)$/m);
    if (titleMatch) {
      plan.goal = titleMatch[1].trim();
    }

    // Extract plan ID
    const idMatch = markdown.match(/\*\*Plan ID:\*\*\s*`([^`]+)`/);
    if (idMatch) {
      plan.id = idMatch[1];
    }

    // Extract steps
    const stepRegex = /###\s*[^\n]*Step\s+(\d+):\s*(.+)\n([\s\S]*?)(?=###|## |$)/g;
    const steps: PlanStep[] = [];
    let match: RegExpExecArray | null = stepRegex.exec(markdown);

    while (match !== null) {
      const order = parseInt(match[1], 10);
      const description = match[2].trim();
      const content = match[3];

      // Extract ID from content
      const stepIdMatch = content.match(/\*\*ID:\*\*\s*`([^`]+)`/);
      const id = stepIdMatch ? stepIdMatch[1] : `step-${order}`;

      // Extract tools
      const toolsMatch = content.match(/\*\*Tools:\*\*\s*(.+)/);
      const tools = toolsMatch
        ? (toolsMatch[1].match(/`([^`]+)`/g)?.map((t) => t.replace(/`/g, "")) ?? [])
        : [];

      // Extract expected outcome
      const outcomeMatch = content.match(/\*\*Expected Outcome:\*\*\s*(.+)/);
      const expectedOutcome = outcomeMatch ? outcomeMatch[1].trim() : "";

      // Extract dependencies
      const depsMatch = content.match(/\*\*Dependencies:\*\*\s*(.+)/);
      const dependencies = depsMatch
        ? (depsMatch[1].match(/`([^`]+)`/g)?.map((d) => d.replace(/`/g, "")) ?? [])
        : [];

      // Extract parallelizable
      const parallelizable = /\*\*Parallelizable:\*\*\s*✅/.test(content);

      steps.push({
        id,
        order,
        description,
        tools,
        expectedOutcome,
        dependencies,
        parallelizable,
      });
      match = stepRegex.exec(markdown);
    }

    if (steps.length > 0) {
      plan.steps = steps;
    }

    // Extract success criteria
    const criteriaRegex = /##\s*Success Criteria[\s\S]*?(?=##|$)/;
    const criteriaSection = markdown.match(criteriaRegex);
    if (criteriaSection) {
      const criteria = criteriaSection[0].match(/- \[[ x]\]\s*(.+)/g);
      if (criteria) {
        plan.successCriteria = criteria.map((c) => c.replace(/- \[[ x]\]\s*/, ""));
      }
    }

    return plan;
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private formatStatus(status: ExecutionPlan["status"]): string {
    const icons = {
      draft: "📝 Draft",
      approved: "✅ Approved",
      rejected: "❌ Rejected",
      executed: "🎯 Executed",
    };
    return icons[status] ?? status;
  }

  private formatRisk(risk: ExecutionPlan["riskAssessment"]): string {
    const icons = {
      low: "🟢 Low",
      medium: "🟡 Medium",
      high: "🔴 High",
    };
    return icons[risk] ?? risk;
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) {
      return `${ms}ms`;
    }
    if (ms < 60000) {
      return `${Math.round(ms / 1000)}s`;
    }
    if (ms < 3600000) {
      return `${Math.round(ms / 60000)}m`;
    }
    return `${Math.round(ms / 3600000)}h`;
  }

  private getStepStatusIcon(status?: PlanStep["status"]): string {
    const icons = {
      pending: "⏳",
      executing: "🔄",
      complete: "✅",
      failed: "❌",
      skipped: "⏭️",
    };
    return icons[status ?? "pending"] ?? "⏳";
  }

  private getStepStatusClass(status?: PlanStep["status"]): string {
    const classes: Record<NonNullable<PlanStep["status"]>, string> = {
      pending: ":::pending",
      executing: ":::executing",
      complete: ":::complete",
      failed: ":::failed",
      skipped: "",
    };
    return classes[status ?? "pending"] ?? "";
  }

  private buildMermaidIdMap(steps: PlanStep[]): Map<string, string> {
    const map = new Map<string, string>();
    const used = new Set<string>();

    const toSafeId = (raw: string, fallback: string): string => {
      const base = raw.replace(/[^a-zA-Z0-9_]/g, "_");
      const seed = base.length > 0 ? base : fallback;
      let candidate = seed;
      let counter = 1;
      while (used.has(candidate)) {
        candidate = `${seed}_${counter}`;
        counter += 1;
      }
      used.add(candidate);
      return candidate;
    };

    for (const [index, step] of steps.entries()) {
      const fallback = `step_${index + 1}`;
      map.set(step.id, toSafeId(step.id, fallback));
    }

    return map;
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a plan Markdown renderer.
 */
export function createPlanMarkdownRenderer(
  config?: Partial<PlanRenderConfig>
): PlanMarkdownRenderer {
  return new PlanMarkdownRenderer(config);
}
