/**
 * Plan Persistence Module
 *
 * Persists execution plans to the filesystem for durability, auditing, and session recovery.
 * Inspired by OpenCode's `.opencode/plan/` pattern and Manus's file-based state management.
 *
 * Directory structure:
 * .agent-runtime/
 * ├── plans/
 * │   ├── current.md          <- Active plan
 * │   └── history/
 * │       └── {timestamp}-{goal-slug}.md
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ExecutionPlan, PlanStep } from "@ku0/agent-runtime-core";
import { DEFAULT_AGENT_RUNTIME_DIR } from "@ku0/agent-runtime-core";

// ============================================================================
// Types
// ============================================================================

export interface PlanPersistenceConfig {
  /** Base directory for agent files (default: .agent-runtime) */
  baseDir: string;
  /** Maximum history files to keep (default: 50) */
  maxHistoryFiles: number;
  /** Working directory (default: process.cwd()) */
  workingDirectory?: string;
}

export interface PersistedPlanMetadata {
  id: string;
  goal: string;
  createdAt: number;
  completedAt?: number;
  status: ExecutionPlan["status"];
  stepCount: number;
  completedSteps: number;
}

// ============================================================================
// Plan Persistence
// ============================================================================

export class PlanPersistence {
  private readonly config: PlanPersistenceConfig;

  constructor(config: Partial<PlanPersistenceConfig> = {}) {
    this.config = {
      baseDir: config.baseDir ?? DEFAULT_AGENT_RUNTIME_DIR,
      maxHistoryFiles: config.maxHistoryFiles ?? 50,
      workingDirectory: config.workingDirectory,
    };
  }

  // ============================================================================
  // Directory Management
  // ============================================================================

  private getWorkDir(): string {
    return this.config.workingDirectory ?? process.cwd();
  }

  private getPlansDir(): string {
    return path.join(this.getWorkDir(), this.config.baseDir, "plans");
  }

  private getHistoryDir(): string {
    return path.join(this.getPlansDir(), "history");
  }

  private getCurrentPlanPath(): string {
    return path.join(this.getPlansDir(), "current.md");
  }

  private async ensureDirectories(): Promise<void> {
    await fs.mkdir(this.getHistoryDir(), { recursive: true });
  }

  // ============================================================================
  // Plan Serialization
  // ============================================================================

  /**
   * Convert plan to Markdown format for human readability.
   */
  private planToMarkdown(plan: ExecutionPlan): string {
    const lines: string[] = [];

    this.appendHeader(lines, plan);
    this.appendSteps(lines, plan.steps);
    this.appendListSection(lines, "Context Required", plan.contextRequired);
    this.appendToolsSection(lines, plan.toolsNeeded);
    this.appendCriteriaSection(lines, plan.successCriteria);
    this.appendMetadata(lines, plan);

    return lines.join("\n");
  }

  private appendHeader(lines: string[], plan: ExecutionPlan): void {
    lines.push(`# Plan: ${plan.goal}`);
    lines.push("");
    lines.push(`> **ID**: ${plan.id}`);
    lines.push(`> **Status**: ${plan.status}`);
    lines.push(`> **Risk**: ${plan.riskAssessment}`);
    lines.push(`> **Created**: ${new Date(plan.createdAt).toISOString()}`);
    if (plan.requiresApproval) {
      lines.push("> **Requires Approval**: Yes");
    }
    lines.push("");
  }

  private appendSteps(lines: string[], steps: PlanStep[]): void {
    lines.push("## Steps");
    lines.push("");

    for (const step of steps) {
      const checkbox = this.getStepCheckbox(step);
      const current = step.status === "executing" ? " ← CURRENT" : "";
      lines.push(`${step.order}. [${checkbox}] ${step.description}${current}`);

      if (step.expectedOutcome) {
        lines.push(`   - Expected: ${step.expectedOutcome}`);
      }
      if (step.tools.length > 0) {
        lines.push(`   - Tools: ${step.tools.join(", ")}`);
      }
      if (step.dependencies.length > 0) {
        lines.push(`   - Depends on: ${step.dependencies.join(", ")}`);
      }
    }
    lines.push("");
  }

  private appendListSection(lines: string[], title: string, items: string[]): void {
    if (items.length === 0) {
      return;
    }
    lines.push(`## ${title}`);
    lines.push("");
    for (const item of items) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }

  private appendToolsSection(lines: string[], tools: string[]): void {
    if (tools.length === 0) {
      return;
    }
    lines.push("## Tools Needed");
    lines.push("");
    for (const tool of tools) {
      lines.push(`- \`${tool}\``);
    }
    lines.push("");
  }

  private appendCriteriaSection(lines: string[], criteria: string[]): void {
    if (criteria.length === 0) {
      return;
    }
    lines.push("## Success Criteria");
    lines.push("");
    for (const criterion of criteria) {
      lines.push(`- [ ] ${criterion}`);
    }
    lines.push("");
  }

  private appendMetadata(lines: string[], plan: ExecutionPlan): void {
    lines.push("---");
    lines.push("");
    lines.push("<!-- METADATA");
    lines.push(JSON.stringify(this.extractMetadata(plan), null, 2));
    lines.push("-->");
  }

  private getStepCheckbox(step: PlanStep): string {
    switch (step.status) {
      case "complete":
        return "x";
      case "executing":
        return "/";
      case "failed":
        return "!";
      case "skipped":
        return "-";
      default:
        return " ";
    }
  }

  /**
   * Parse plan from Markdown format.
   */
  private markdownToPlan(content: string): ExecutionPlan | null {
    // Extract metadata from HTML comment
    const metadataMatch = content.match(/<!-- METADATA\n([\s\S]*?)\n-->/);
    if (!metadataMatch) {
      return null;
    }

    try {
      const metadata = JSON.parse(metadataMatch[1]) as PersistedPlanMetadata;

      // Parse steps from markdown
      const steps = this.parseStepsFromMarkdown(content);

      // Reconstruct plan
      const plan: ExecutionPlan = {
        id: metadata.id,
        goal: metadata.goal,
        steps,
        createdAt: metadata.createdAt,
        status: metadata.status,
        requiresApproval: false,
        estimatedDuration: 0,
        riskAssessment: "low",
        toolsNeeded: [],
        contextRequired: [],
        successCriteria: [],
      };

      // Parse additional fields from markdown
      this.parseAdditionalFields(content, plan);

      return plan;
    } catch {
      return null;
    }
  }

  private parseStepsFromMarkdown(content: string): PlanStep[] {
    const steps: PlanStep[] = [];
    const lines = this.getStepsSectionLines(content);
    if (lines.length === 0) {
      return steps;
    }

    let current: PlanStep | null = null;
    for (const line of lines) {
      if (line.trim() === "") {
        continue;
      }

      const parsed = this.parseStepLine(line);
      if (parsed) {
        if (current) {
          steps.push(current);
        }
        current = this.buildPlanStep(parsed.order, parsed.status, parsed.description);
        continue;
      }

      if (current) {
        this.applyStepDetail(current, line);
      }
    }

    if (current) {
      steps.push(current);
    }

    return steps;
  }

  private getStepsSectionLines(content: string): string[] {
    const lines = content.split(/\r?\n/);
    const stepsHeaderIndex = lines.findIndex((line) => line.trim() === "## Steps");
    if (stepsHeaderIndex === -1) {
      return [];
    }

    const section: string[] = [];
    for (let i = stepsHeaderIndex + 1; i < lines.length; i += 1) {
      const line = lines[i];
      if (line.trim().startsWith("## ") && line.trim() !== "## Steps") {
        break;
      }
      section.push(line);
    }
    return section;
  }

  private parseStepLine(
    line: string
  ): { order: number; status: PlanStep["status"]; description: string } | null {
    const stepRegex = /^(\d+)\.\s*\[([x /!-])\]\s*(.+?)(?:\s*←\s*CURRENT)?$/;
    const match = stepRegex.exec(line);
    if (!match) {
      return null;
    }

    const [, orderStr, checkbox, description] = match;
    const order = Number.parseInt(orderStr, 10);
    if (Number.isNaN(order)) {
      return null;
    }

    return {
      order,
      status: this.checkboxToStatus(checkbox),
      description: description.trim(),
    };
  }

  private buildPlanStep(order: number, status: PlanStep["status"], description: string): PlanStep {
    return {
      id: `step_${order}_${Date.now().toString(36)}`,
      order,
      description,
      tools: [],
      expectedOutcome: "",
      dependencies: [],
      parallelizable: false,
      status,
    };
  }

  private applyStepDetail(step: PlanStep, line: string): void {
    const detailRegex = /^\s*-\s*(Expected|Tools|Depends on):\s*(.*)$/;
    const match = detailRegex.exec(line);
    if (!match) {
      return;
    }

    const [, field, valueRaw] = match;
    const value = valueRaw.trim();
    if (field === "Expected") {
      step.expectedOutcome = value;
      return;
    }
    if (field === "Tools") {
      step.tools = this.parseCommaList(value);
      return;
    }
    if (field === "Depends on") {
      step.dependencies = this.parseCommaList(value);
    }
  }

  private parseCommaList(value: string): string[] {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  private checkboxToStatus(checkbox: string): PlanStep["status"] {
    switch (checkbox) {
      case "x":
        return "complete";
      case "/":
        return "executing";
      case "!":
        return "failed";
      case "-":
        return "skipped";
      default:
        return "pending";
    }
  }

  private parseAdditionalFields(content: string, plan: ExecutionPlan): void {
    // Parse risk assessment
    const riskMatch = content.match(/>\s*\*\*Risk\*\*:\s*(\w+)/);
    if (riskMatch) {
      plan.riskAssessment = riskMatch[1] as ExecutionPlan["riskAssessment"];
    }

    // Parse approval requirement
    const approvalMatch = content.match(/>\s*\*\*Requires Approval\*\*:\s*(Yes|No)/i);
    if (approvalMatch) {
      plan.requiresApproval = approvalMatch[1].toLowerCase() === "yes";
    }

    // Parse context required
    const contextSection = content.match(/## Context Required\n\n((?:- .+\n?)+)/);
    if (contextSection) {
      const contextMatches = contextSection[1].matchAll(/- (.+)/g);
      plan.contextRequired = Array.from(contextMatches).map((m) => m[1]);
    }

    // Parse tools needed
    const toolsSection = content.match(/## Tools Needed\n\n((?:- `[^`]+`\n?)+)/);
    if (toolsSection) {
      const toolMatches = toolsSection[1].matchAll(/- `([^`]+)`/g);
      plan.toolsNeeded = Array.from(toolMatches).map((m) => m[1]);
    }

    // Parse success criteria
    const criteriaSection = content.match(/## Success Criteria\n\n((?:- \[[ x]\] .+\n?)+)/);
    if (criteriaSection) {
      const criteriaMatches = criteriaSection[1].matchAll(/- \[[ x]\] (.+)/g);
      plan.successCriteria = Array.from(criteriaMatches).map((m) => m[1]);
    }
  }

  private extractMetadata(plan: ExecutionPlan): PersistedPlanMetadata {
    const completedSteps = plan.steps.filter((s) => s.status === "complete").length;

    return {
      id: plan.id,
      goal: plan.goal,
      createdAt: plan.createdAt,
      completedAt: plan.status === "executed" ? Date.now() : undefined,
      status: plan.status,
      stepCount: plan.steps.length,
      completedSteps,
    };
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Save the current active plan.
   */
  async saveCurrent(plan: ExecutionPlan): Promise<void> {
    await this.ensureDirectories();
    const markdown = this.planToMarkdown(plan);
    await fs.writeFile(this.getCurrentPlanPath(), markdown, "utf-8");
  }

  /**
   * Load the current active plan.
   */
  async loadCurrent(): Promise<ExecutionPlan | null> {
    try {
      const content = await fs.readFile(this.getCurrentPlanPath(), "utf-8");
      return this.markdownToPlan(content);
    } catch {
      return null;
    }
  }

  /**
   * Check if there's an active plan.
   */
  async hasActivePlan(): Promise<boolean> {
    try {
      await fs.access(this.getCurrentPlanPath());
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Update a specific step's status in the current plan.
   */
  async updateStepStatus(stepId: string, status: PlanStep["status"]): Promise<void> {
    const plan = await this.loadCurrent();
    if (!plan) {
      return;
    }

    const step = plan.steps.find((s) => s.id === stepId);
    if (step) {
      step.status = status;
      await this.saveCurrent(plan);
    }
  }

  /**
   * Archive the current plan to history.
   */
  async archiveCurrent(): Promise<string | null> {
    const plan = await this.loadCurrent();
    if (!plan) {
      return null;
    }

    await this.ensureDirectories();

    // Generate history filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const goalSlug = plan.goal
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 50);
    const filename = `${timestamp}-${goalSlug}.md`;
    const historyPath = path.join(this.getHistoryDir(), filename);

    // Mark as executed
    plan.status = "executed";

    // Save to history
    const markdown = this.planToMarkdown(plan);
    await fs.writeFile(historyPath, markdown, "utf-8");

    // Remove current
    await fs.unlink(this.getCurrentPlanPath());

    // Cleanup old history
    await this.cleanupHistory();

    return historyPath;
  }

  /**
   * List all plans in history.
   */
  async listHistory(): Promise<PersistedPlanMetadata[]> {
    try {
      const files = await fs.readdir(this.getHistoryDir());
      const mdFiles = files
        .filter((f) => f.endsWith(".md"))
        .sort()
        .reverse();

      const metadata: PersistedPlanMetadata[] = [];
      for (const file of mdFiles.slice(0, 20)) {
        const content = await fs.readFile(path.join(this.getHistoryDir(), file), "utf-8");
        const metaMatch = content.match(/<!-- METADATA\n([\s\S]*?)\n-->/);
        if (metaMatch) {
          try {
            metadata.push(JSON.parse(metaMatch[1]));
          } catch {
            // Skip malformed entries
          }
        }
      }

      return metadata;
    } catch {
      return [];
    }
  }

  /**
   * Load a specific plan from history by ID.
   */
  async loadFromHistory(planId: string): Promise<ExecutionPlan | null> {
    try {
      const files = await fs.readdir(this.getHistoryDir());

      for (const file of files) {
        const content = await fs.readFile(path.join(this.getHistoryDir(), file), "utf-8");
        const plan = this.markdownToPlan(content);
        if (plan?.id === planId) {
          return plan;
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Clear the current plan without archiving.
   */
  async clearCurrent(): Promise<void> {
    try {
      await fs.unlink(this.getCurrentPlanPath());
    } catch {
      // File may not exist
    }
  }

  /**
   * Keep only the most recent history files.
   */
  private async cleanupHistory(): Promise<void> {
    try {
      const files = await fs.readdir(this.getHistoryDir());
      const mdFiles = files.filter((f) => f.endsWith(".md")).sort();

      if (mdFiles.length > this.config.maxHistoryFiles) {
        const toDelete = mdFiles.slice(0, mdFiles.length - this.config.maxHistoryFiles);
        for (const file of toDelete) {
          await fs.unlink(path.join(this.getHistoryDir(), file));
        }
      }
    } catch {
      // Ignore cleanup errors
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a plan persistence instance.
 *
 * @example
 * ```typescript
 * const persistence = createPlanPersistence({ workingDirectory: '/project' });
 *
 * // Save a plan
 * await persistence.saveCurrent(plan);
 *
 * // Load on session restart
 * const existing = await persistence.loadCurrent();
 * if (existing) {
 *   console.log('Resuming plan:', existing.goal);
 * }
 * ```
 */
export function createPlanPersistence(config?: Partial<PlanPersistenceConfig>): PlanPersistence {
  return new PlanPersistence(config);
}
