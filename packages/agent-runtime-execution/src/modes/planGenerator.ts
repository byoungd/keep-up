/**
 * Plan Artifact Generator
 *
 * Generates structured plan.md artifacts for Plan Mode.
 * When in Plan Mode, the agent generates plans instead of executing changes.
 */

/**
 * Proposed file change in a plan
 */
export interface PlanFileChange {
  /** File path relative to project root */
  path: string;
  /** Type of change */
  changeType: "create" | "modify" | "delete" | "rename";
  /** Description of the change */
  description: string;
  /** Diff preview (for modify) or content preview (for create) */
  preview?: string;
  /** New path for rename operations */
  newPath?: string;
}

/**
 * Step in the implementation plan
 */
export interface PlanStep {
  /** Step number */
  index: number;
  /** Step title */
  title: string;
  /** Detailed description */
  description: string;
  /** Files affected by this step */
  affectedFiles: string[];
  /** Estimated risk level */
  risk: "low" | "medium" | "high";
  /** Dependencies on other steps (by index) */
  dependsOn: number[];
}

/**
 * Complete plan artifact structure
 */
export interface PlanArtifact {
  /** Plan title */
  title: string;
  /** Problem summary */
  problemSummary: string;
  /** Goals of this plan */
  goals: string[];
  /** Proposed file changes */
  fileChanges: PlanFileChange[];
  /** Implementation steps */
  steps: PlanStep[];
  /** Identified risks */
  risks: string[];
  /** Success criteria */
  successCriteria: string[];
  /** Generated timestamp */
  createdAt: number;
}

/**
 * Generate plan.md content from a PlanArtifact
 */
export function generatePlanMd(plan: PlanArtifact): string {
  const sections: string[] = [];

  // Header
  sections.push(`# Plan: ${plan.title}\n`);
  sections.push(`> Generated at ${new Date(plan.createdAt).toISOString()}\n`);

  // Problem Summary
  sections.push("## Problem Summary\n");
  sections.push(`${plan.problemSummary}\n`);

  // Add optional sections
  addGoalsSection(sections, plan.goals);
  addFileChangesSection(sections, plan.fileChanges);
  addStepsSection(sections, plan.steps);
  addRisksSection(sections, plan.risks);
  addSuccessCriteriaSection(sections, plan.successCriteria);

  // Footer
  sections.push("---\n");
  sections.push("*Switch to Build Mode to execute this plan.*\n");

  return sections.join("\n");
}

function addGoalsSection(sections: string[], goals: string[]): void {
  if (goals.length === 0) {
    return;
  }
  sections.push("## Goals\n");
  for (const goal of goals) {
    sections.push(`- ${goal}`);
  }
  sections.push("");
}

function addFileChangesSection(sections: string[], fileChanges: PlanFileChange[]): void {
  if (fileChanges.length === 0) {
    return;
  }
  sections.push("## Proposed Changes\n");
  sections.push("| File | Action | Description |");
  sections.push("|------|--------|-------------|");
  for (const change of fileChanges) {
    const action = formatChangeType(change.changeType);
    sections.push(`| \`${change.path}\` | ${action} | ${change.description} |`);
  }
  sections.push("");

  // Detailed previews
  const withPreview = fileChanges.filter((c) => c.preview);
  if (withPreview.length > 0) {
    sections.push("### Change Previews\n");
    for (const change of withPreview) {
      sections.push(`#### \`${change.path}\`\n`);
      sections.push("```diff");
      sections.push(change.preview ?? "");
      sections.push("```\n");
    }
  }
}

function addStepsSection(sections: string[], steps: PlanStep[]): void {
  if (steps.length === 0) {
    return;
  }
  sections.push("## Implementation Steps\n");
  for (const step of steps) {
    const riskBadge = formatRiskBadge(step.risk);
    sections.push(`### Step ${step.index}: ${step.title} ${riskBadge}\n`);
    sections.push(`${step.description}\n`);
    if (step.affectedFiles.length > 0) {
      sections.push(`**Files:** ${step.affectedFiles.map((f) => `\`${f}\``).join(", ")}\n`);
    }
    if (step.dependsOn.length > 0) {
      sections.push(`**Depends on:** Steps ${step.dependsOn.join(", ")}\n`);
    }
  }
}

function addRisksSection(sections: string[], risks: string[]): void {
  if (risks.length === 0) {
    return;
  }
  sections.push("## Risks\n");
  for (const risk of risks) {
    sections.push(`- ⚠️ ${risk}`);
  }
  sections.push("");
}

function addSuccessCriteriaSection(sections: string[], criteria: string[]): void {
  if (criteria.length === 0) {
    return;
  }
  sections.push("## Success Criteria\n");
  for (const criterion of criteria) {
    sections.push(`- [ ] ${criterion}`);
  }
  sections.push("");
}

/**
 * Parse plan.md content back to PlanArtifact structure
 */
export function parsePlanMd(content: string): PlanArtifact | null {
  try {
    // Extract title
    const titleMatch = content.match(/^# Plan: (.+)$/m);
    const title = titleMatch?.[1] ?? "Untitled Plan";

    // Extract problem summary
    const problemMatch = content.match(/## Problem Summary\n\n([\s\S]*?)(?=\n## |$)/);
    const problemSummary = problemMatch?.[1]?.trim() ?? "";

    // Extract goals
    const goalsMatch = content.match(/## Goals\n\n([\s\S]*?)(?=\n## |$)/);
    const goals = goalsMatch
      ? goalsMatch[1]
          .split("\n")
          .filter((line) => line.startsWith("- "))
          .map((line) => line.substring(2).trim())
      : [];

    // Extract risks
    const risksMatch = content.match(/## Risks\n\n([\s\S]*?)(?=\n## |$)/);
    const risks = risksMatch
      ? risksMatch[1]
          .split("\n")
          .filter((line) => line.includes("⚠️"))
          .map((line) => line.replace(/^- ⚠️ /, "").trim())
      : [];

    // Extract success criteria
    const criteriaMatch = content.match(/## Success Criteria\n\n([\s\S]*?)(?=\n---|$)/);
    const successCriteria = criteriaMatch
      ? criteriaMatch[1]
          .split("\n")
          .filter((line) => line.startsWith("- [ ]"))
          .map((line) => line.substring(6).trim())
      : [];

    return {
      title,
      problemSummary,
      goals,
      fileChanges: [], // Would need more complex parsing
      steps: [], // Would need more complex parsing
      risks,
      successCriteria,
      createdAt: Date.now(),
    };
  } catch {
    return null;
  }
}

/**
 * Create an empty plan artifact template
 */
export function createEmptyPlan(title: string): PlanArtifact {
  return {
    title,
    problemSummary: "",
    goals: [],
    fileChanges: [],
    steps: [],
    risks: [],
    successCriteria: [],
    createdAt: Date.now(),
  };
}

function formatChangeType(type: PlanFileChange["changeType"]): string {
  const icons: Record<typeof type, string> = {
    create: "➕ Create",
    modify: "✏️ Modify",
    delete: "🗑️ Delete",
    rename: "📝 Rename",
  };
  return icons[type];
}

function formatRiskBadge(risk: PlanStep["risk"]): string {
  const badges: Record<typeof risk, string> = {
    low: "🟢",
    medium: "🟡",
    high: "🔴",
  };
  return badges[risk];
}
