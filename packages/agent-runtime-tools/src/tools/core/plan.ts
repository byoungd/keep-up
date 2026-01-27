/**
 * Plan Tool Server
 *
 * Provides tools for creating, managing, and tracking execution plans.
 * Designed for use by the constrained plan agent.
 *
 * Updated to support Manus spec phase-based tracking:
 * - Plans are structured as phases (not just steps)
 * - Current phase tracking for UI progress visualization
 * - Phase completion status
 *
 * Tools:
 * - plan:save - Save/update the current plan
 * - plan:load - Load the current plan
 * - plan:list - List plan history
 * - plan:status - Get current plan execution status
 * - plan:step - Update a step's status
 * - plan:advance - Advance to next phase
 * - plan:update - Update plan (for refinements)
 */

import type { ExecutionPlan, MCPToolResult, PlanStep, ToolContext } from "@ku0/agent-runtime-core";
import { DEFAULT_AGENT_PLANS_DIR } from "@ku0/agent-runtime-core";
import { createPlanPersistence, type PlanPersistence } from "../../orchestrator/planPersistence";
import { BaseToolServer, errorResult, textResult } from "../mcp/baseServer";

// ============================================================================
// Extended Plan Types for Phase Support
// ============================================================================

/**
 * Phase in a plan (Manus spec concept).
 */
export interface PlanPhase {
  id: string;
  name: string;
  description: string;
  steps: PlanStep[];
  status: "pending" | "in_progress" | "completed" | "failed";
  order: number;
}

// ============================================================================
// Plan Tool Server
// ============================================================================

export class PlanToolServer extends BaseToolServer {
  readonly name = "plan";
  readonly description = "Create and manage execution plans";

  private persistence: PlanPersistence;
  private readonly currentPlanPath = `${DEFAULT_AGENT_PLANS_DIR}/current.md`;

  constructor(options: { persistence?: PlanPersistence } = {}) {
    super();
    this.persistence = options.persistence ?? createPlanPersistence();
    this.registerTools();
  }

  private registerTools(): void {
    // plan:save - Save the current plan
    this.registerTool(
      {
        name: "save",
        description: `Save or update the current execution plan. Use this to persist your plan to ${this.currentPlanPath}`,
        inputSchema: {
          type: "object",
          properties: {
            goal: {
              type: "string",
              description: "High-level goal of the plan",
            },
            steps: {
              type: "array",
              description: "Ordered list of execution steps",
              items: {
                type: "object",
                properties: {
                  description: {
                    type: "string",
                    description: "Step description",
                  },
                  tools: {
                    type: "array",
                    items: { type: "string" },
                    description: "Tools needed for this step",
                  },
                  expectedOutcome: {
                    type: "string",
                    description: "Expected outcome of this step",
                  },
                },
                required: ["description"],
              },
            },
            riskAssessment: {
              type: "string",
              enum: ["low", "medium", "high"],
              description: "Risk level of the plan",
            },
            successCriteria: {
              type: "array",
              items: { type: "string" },
              description: "Criteria for plan success",
            },
          },
          required: ["goal", "steps"],
        },
        annotations: {
          category: "core",
          requiresConfirmation: false,
          readOnly: false,
          estimatedDuration: "fast",
          policyAction: "connector.action",
        },
      },
      this.handleSave.bind(this)
    );

    // plan:load - Load the current plan
    this.registerTool(
      {
        name: "load",
        description: `Load the current execution plan from ${this.currentPlanPath}`,
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
        annotations: {
          category: "core",
          requiresConfirmation: false,
          readOnly: true,
          estimatedDuration: "fast",
          policyAction: "connector.read",
        },
      },
      this.handleLoad.bind(this)
    );

    // plan:list - List plan history
    this.registerTool(
      {
        name: "list",
        description: "List recent plans from history",
        inputSchema: {
          type: "object",
          properties: {
            limit: {
              type: "number",
              description: "Maximum number of plans to return (default: 10)",
            },
          },
          required: [],
        },
        annotations: {
          category: "core",
          requiresConfirmation: false,
          readOnly: true,
          estimatedDuration: "fast",
          policyAction: "connector.read",
        },
      },
      this.handleList.bind(this)
    );

    // plan:status - Get current plan status
    this.registerTool(
      {
        name: "status",
        description: "Get the status of the current plan including step progress",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
        annotations: {
          category: "core",
          requiresConfirmation: false,
          readOnly: true,
          estimatedDuration: "fast",
          policyAction: "connector.read",
        },
      },
      this.handleStatus.bind(this)
    );

    // plan:step - Update step status
    this.registerTool(
      {
        name: "step",
        description: "Update the status of a specific step in the current plan",
        inputSchema: {
          type: "object",
          properties: {
            stepNumber: {
              type: "number",
              description: "Step number to update (1-indexed)",
            },
            status: {
              type: "string",
              enum: ["pending", "executing", "complete", "failed", "skipped"],
              description: "New status for the step",
            },
          },
          required: ["stepNumber", "status"],
        },
        annotations: {
          category: "core",
          requiresConfirmation: false,
          readOnly: false,
          estimatedDuration: "fast",
          policyAction: "connector.action",
        },
      },
      this.handleStep.bind(this)
    );

    // plan:archive - Archive current plan to history
    this.registerTool(
      {
        name: "archive",
        description: "Archive the current plan to history (marks as completed)",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
        annotations: {
          category: "core",
          requiresConfirmation: false,
          readOnly: false,
          estimatedDuration: "fast",
          policyAction: "connector.action",
        },
      },
      this.handleArchive.bind(this)
    );

    // plan:advance - Advance to next phase (Manus spec)
    this.registerTool(
      {
        name: "advance",
        description: "Advance to the next phase in the plan",
        inputSchema: {
          type: "object",
          properties: {
            phase_id: {
              type: "string",
              description: "ID of the phase to advance to (optional, defaults to next)",
            },
          },
          required: [],
        },
        annotations: {
          category: "core",
          requiresConfirmation: false,
          readOnly: false,
          estimatedDuration: "fast",
          policyAction: "connector.action",
        },
      },
      this.handleAdvance.bind(this)
    );

    // plan:update - Update plan with refinements
    this.registerTool(
      {
        name: "update",
        description: "Update the current plan with refinements or changes",
        inputSchema: {
          type: "object",
          properties: {
            goal: {
              type: "string",
              description: "Updated goal (optional)",
            },
            add_steps: {
              type: "array",
              description: "New steps to add",
              items: {
                type: "object",
                properties: {
                  description: { type: "string" },
                  tools: { type: "array", items: { type: "string" } },
                  expectedOutcome: { type: "string" },
                  insertAfter: { type: "number", description: "Insert after step number" },
                },
                required: ["description"],
              },
            },
            remove_steps: {
              type: "array",
              items: { type: "number" },
              description: "Step numbers to remove",
            },
          },
          required: [],
        },
        annotations: {
          category: "core",
          requiresConfirmation: false,
          readOnly: false,
          estimatedDuration: "fast",
          policyAction: "connector.action",
        },
      },
      this.handleUpdate.bind(this)
    );
  }

  // ============================================================================
  // Handlers
  // ============================================================================

  private async handleSave(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    const writeAccess = this.ensureWriteAccess(context);
    if (writeAccess) {
      return writeAccess;
    }

    try {
      const goal = normalizeRequiredString(args.goal);
      if (!goal) {
        return errorResult("INVALID_ARGUMENTS", "Plan goal must be a non-empty string.");
      }

      const stepInput = normalizePlanSteps(args.steps);
      if (stepInput.invalidCount > 0) {
        return errorResult(
          "INVALID_ARGUMENTS",
          "Each plan step must include a non-empty description."
        );
      }
      if (stepInput.steps.length === 0) {
        return errorResult("INVALID_ARGUMENTS", "Provide at least one plan step.");
      }

      const riskAssessment = isRiskAssessment(args.riskAssessment) ? args.riskAssessment : "low";
      const successCriteria = normalizeStringArray(args.successCriteria);

      // Build plan steps
      const steps: PlanStep[] = stepInput.steps.map((s, index) => ({
        id: `step_${index + 1}_${Date.now().toString(36)}`,
        order: index + 1,
        description: s.description,
        tools: s.tools,
        expectedOutcome: s.expectedOutcome,
        dependencies: [],
        parallelizable: false,
        status: "pending" as const,
      }));

      const plan: ExecutionPlan = {
        id: crypto.randomUUID(),
        goal,
        steps,
        estimatedDuration: steps.length * 1000,
        riskAssessment,
        toolsNeeded: Array.from(new Set(steps.flatMap((s) => s.tools))),
        contextRequired: [],
        successCriteria,
        createdAt: Date.now(),
        status: "draft",
        requiresApproval: riskAssessment !== "low",
      };

      await this.persistence.saveCurrent(plan);

      return this.formatOutput(
        `Plan saved successfully!\n\nGoal: ${goal}\nSteps: ${steps.length}\nRisk: ${riskAssessment}\nLocation: ${this.currentPlanPath}`,
        context
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult("EXECUTION_FAILED", `Failed to save plan: ${message}`);
    }
  }

  private async handleLoad(
    _args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    const readAccess = this.ensureReadAccess(context);
    if (readAccess) {
      return readAccess;
    }

    try {
      const plan = await this.persistence.loadCurrent();

      if (!plan) {
        return this.formatOutput("No active plan found. Create one with plan:save.", context);
      }

      const lines: string[] = [
        `# ${plan.goal}`,
        "",
        `Status: ${plan.status}`,
        `Risk: ${plan.riskAssessment}`,
        `Created: ${new Date(plan.createdAt).toLocaleString()}`,
        "",
        "## Steps",
        "",
      ];

      for (const step of plan.steps) {
        const icon = this.getStepIcon(step.status);
        const current = step.status === "executing" ? " ← CURRENT" : "";
        lines.push(`${step.order}. ${icon} ${step.description}${current}`);
      }

      if (plan.successCriteria.length > 0) {
        lines.push("", "## Success Criteria", "");
        for (const criterion of plan.successCriteria) {
          lines.push(`- ${criterion}`);
        }
      }

      return this.formatOutput(lines.join("\n"), context);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult("EXECUTION_FAILED", `Failed to load plan: ${message}`);
    }
  }

  private async handleList(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    const readAccess = this.ensureReadAccess(context);
    if (readAccess) {
      return readAccess;
    }

    try {
      const limit = normalizeLimit(args.limit, 10, 50);
      const history = await this.persistence.listHistory();

      if (history.length === 0) {
        return this.formatOutput("No plan history found.", context);
      }

      const lines: string[] = ["# Plan History", ""];

      for (const meta of history.slice(0, limit)) {
        const date = new Date(meta.createdAt).toLocaleDateString();
        const progress = `${meta.completedSteps}/${meta.stepCount}`;
        lines.push(`- [${meta.status}] ${meta.goal} (${progress} steps) - ${date}`);
      }

      return this.formatOutput(lines.join("\n"), context);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult("EXECUTION_FAILED", `Failed to list plans: ${message}`);
    }
  }

  private async handleStatus(
    _args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    const readAccess = this.ensureReadAccess(context);
    if (readAccess) {
      return readAccess;
    }

    try {
      const plan = await this.persistence.loadCurrent();

      if (!plan) {
        return this.formatOutput("No active plan.", context);
      }

      const total = plan.steps.length;
      const completed = plan.steps.filter((s) => s.status === "complete").length;
      const current = plan.steps.find((s) => s.status === "executing");
      const failed = plan.steps.filter((s) => s.status === "failed").length;

      const lines: string[] = [
        `Plan: ${plan.goal}`,
        `Progress: ${completed}/${total} steps complete`,
      ];

      if (current) {
        lines.push(`Current: Step ${current.order} - ${current.description}`);
      }

      if (failed > 0) {
        lines.push(`Failed: ${failed} step(s)`);
      }

      // Progress bar
      const progressPct = Math.round((completed / total) * 100);
      const filled = Math.round(progressPct / 5);
      const empty = 20 - filled;
      lines.push(`[${"█".repeat(filled)}${"░".repeat(empty)}] ${progressPct}%`);

      return this.formatOutput(lines.join("\n"), context);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult("EXECUTION_FAILED", `Failed to get status: ${message}`);
    }
  }

  private async handleStep(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    const writeAccess = this.ensureWriteAccess(context);
    if (writeAccess) {
      return writeAccess;
    }

    try {
      const stepNumber = normalizePositiveInt(args.stepNumber);
      if (!stepNumber) {
        return errorResult(
          "INVALID_ARGUMENTS",
          "stepNumber must be a positive integer starting at 1."
        );
      }
      const status = args.status as PlanStep["status"];

      const plan = await this.persistence.loadCurrent();

      if (!plan) {
        return errorResult("RESOURCE_NOT_FOUND", "No active plan found.");
      }

      const step = plan.steps.find((s) => s.order === stepNumber);
      if (!step) {
        return errorResult("RESOURCE_NOT_FOUND", `Step ${stepNumber} not found.`);
      }

      step.status = status;
      await this.persistence.saveCurrent(plan);

      return this.formatOutput(
        `Step ${stepNumber} marked as ${status}: ${step.description}`,
        context
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult("EXECUTION_FAILED", `Failed to update step: ${message}`);
    }
  }

  private async handleArchive(
    _args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    const writeAccess = this.ensureWriteAccess(context);
    if (writeAccess) {
      return writeAccess;
    }

    try {
      const historyPath = await this.persistence.archiveCurrent();

      if (!historyPath) {
        return this.formatOutput("No active plan to archive.", context);
      }

      return this.formatOutput(`Plan archived to: ${historyPath}`, context);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult("EXECUTION_FAILED", `Failed to archive plan: ${message}`);
    }
  }

  private async handleAdvance(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    const writeAccess = this.ensureWriteAccess(context);
    if (writeAccess) {
      return writeAccess;
    }

    try {
      const _phase_id = args.phase_id as string | undefined;
      const plan = await this.persistence.loadCurrent();

      if (!plan) {
        return errorResult("RESOURCE_NOT_FOUND", "No active plan found.");
      }

      // For now, we'll track phase advancement via step status
      // In a full implementation, you'd extend ExecutionPlan to include phases
      const executing = plan.steps.find((s) => s.status === "executing");
      if (executing) {
        executing.status = "complete";
      }

      // Find next pending step and mark as executing
      const nextStep = plan.steps.find((s) => s.status === "pending");
      if (nextStep) {
        nextStep.status = "executing";
        await this.persistence.saveCurrent(plan);
        return this.formatOutput(
          `Advanced to step ${nextStep.order}: ${nextStep.description}`,
          context
        );
      }

      return this.formatOutput("All steps completed. Plan finished.", context);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult("EXECUTION_FAILED", `Failed to advance phase: ${message}`);
    }
  }

  private async handleUpdate(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    const writeAccess = this.ensureWriteAccess(context);
    if (writeAccess) {
      return writeAccess;
    }

    try {
      const updateInputs = parsePlanUpdateInputs(args);
      if (updateInputs.error) {
        return errorResult("INVALID_ARGUMENTS", updateInputs.error);
      }

      const plan = await this.persistence.loadCurrent();

      if (!plan) {
        return errorResult("RESOURCE_NOT_FOUND", "No active plan found.");
      }

      // Update goal if provided
      if (updateInputs.goal) {
        plan.goal = updateInputs.goal;
      }

      // Remove steps
      applyStepRemovals(plan, updateInputs.removeSteps);

      // Add steps
      applyStepInsertions(plan, updateInputs.addSteps);

      await this.persistence.saveCurrent(plan);

      return this.formatOutput(
        `Plan updated successfully!\nGoal: ${plan.goal}\nSteps: ${plan.steps.length}`,
        context
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult("EXECUTION_FAILED", `Failed to update plan: ${message}`);
    }
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private getStepIcon(status?: PlanStep["status"]): string {
    switch (status) {
      case "complete":
        return "✓";
      case "executing":
        return "→";
      case "failed":
        return "✗";
      case "skipped":
        return "−";
      default:
        return "○";
    }
  }

  private ensureReadAccess(context: ToolContext): MCPToolResult | null {
    if (context.security.permissions.file === "none") {
      return errorResult("PERMISSION_DENIED", "File access is disabled");
    }

    return null;
  }

  private ensureWriteAccess(context: ToolContext): MCPToolResult | null {
    if (
      context.security.permissions.file === "none" ||
      context.security.permissions.file === "read"
    ) {
      return errorResult("PERMISSION_DENIED", "File write access is disabled");
    }

    return null;
  }

  private formatOutput(output: string, context: ToolContext): MCPToolResult {
    const maxOutputBytes = context.security.limits.maxOutputBytes;
    if (Buffer.byteLength(output) > maxOutputBytes) {
      const truncated = Buffer.from(output).subarray(0, maxOutputBytes).toString();
      return textResult(`${truncated}\n\n[Output truncated at ${maxOutputBytes} bytes]`);
    }

    return textResult(output);
  }
}

type NormalizedPlanStepInput = {
  description: string;
  tools: string[];
  expectedOutcome: string;
  insertAfter?: number;
};

type PlanUpdateInputs = {
  goal?: string;
  addSteps: NormalizedPlanStepInput[];
  removeSteps: number[];
  error?: string;
};

function normalizeRequiredString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function normalizePositiveInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  const intValue = Math.floor(value);
  return intValue >= 1 ? intValue : null;
}

function normalizeLimit(value: unknown, fallback: number, max: number): number {
  const intValue = normalizePositiveInt(value);
  if (!intValue) {
    return fallback;
  }
  return Math.min(intValue, max);
}

function normalizeInsertAfter(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return Math.floor(value);
}

function normalizeNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is number => typeof item === "number" && Number.isFinite(item))
    .map((item) => Math.floor(item))
    .filter((item) => item >= 1);
}

function normalizePlanSteps(value: unknown): {
  steps: NormalizedPlanStepInput[];
  invalidCount: number;
} {
  if (!Array.isArray(value)) {
    return { steps: [], invalidCount: 0 };
  }

  const steps: NormalizedPlanStepInput[] = [];
  let invalidCount = 0;

  for (const raw of value) {
    if (!raw || typeof raw !== "object") {
      invalidCount += 1;
      continue;
    }

    const record = raw as Record<string, unknown>;
    const description = normalizeRequiredString(record.description);
    if (!description) {
      invalidCount += 1;
      continue;
    }

    const tools = normalizeStringArray(record.tools);
    const expectedOutcome = normalizeOptionalString(record.expectedOutcome) ?? "";
    const insertAfter = normalizeInsertAfter(record.insertAfter);

    const normalizedStep: NormalizedPlanStepInput = {
      description,
      tools,
      expectedOutcome,
    };
    if (insertAfter !== undefined) {
      normalizedStep.insertAfter = insertAfter;
    }

    steps.push(normalizedStep);
  }

  return { steps, invalidCount };
}

function isRiskAssessment(value: unknown): value is ExecutionPlan["riskAssessment"] {
  return value === "low" || value === "medium" || value === "high";
}

function hasOwn(args: Record<string, unknown>, key: string): boolean {
  return Object.hasOwn(args, key);
}

function parsePlanUpdateInputs(args: Record<string, unknown>): PlanUpdateInputs {
  const hasGoal = hasOwn(args, "goal");
  const goal = normalizeOptionalString(args.goal);
  if (hasGoal && !goal) {
    return { addSteps: [], removeSteps: [], error: "Plan goal must be a non-empty string." };
  }

  const hasAddSteps = hasOwn(args, "add_steps");
  const addStepsInput = normalizePlanSteps(args.add_steps);
  if (addStepsInput.invalidCount > 0) {
    return {
      addSteps: [],
      removeSteps: [],
      error: "Each added step must include a non-empty description.",
    };
  }
  if (hasAddSteps && addStepsInput.steps.length === 0) {
    return {
      addSteps: [],
      removeSteps: [],
      error: "add_steps must include at least one step.",
    };
  }

  const hasRemoveSteps = hasOwn(args, "remove_steps");
  const removeSteps = normalizeNumberArray(args.remove_steps);
  if (hasRemoveSteps && removeSteps.length === 0) {
    return {
      addSteps: [],
      removeSteps: [],
      error: "remove_steps must include at least one step number.",
    };
  }

  return {
    goal,
    addSteps: addStepsInput.steps,
    removeSteps,
  };
}

function applyStepRemovals(plan: ExecutionPlan, removeSteps: number[]): void {
  if (removeSteps.length === 0) {
    return;
  }

  plan.steps = plan.steps.filter((s) => !removeSteps.includes(s.order));
  plan.steps.forEach((s, index) => {
    s.order = index + 1;
  });
}

function applyStepInsertions(plan: ExecutionPlan, addSteps: NormalizedPlanStepInput[]): void {
  if (addSteps.length === 0) {
    return;
  }

  for (const newStep of addSteps) {
    const insertAfter = newStep.insertAfter ?? plan.steps.length;
    const step: PlanStep = {
      id: `step_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      order: insertAfter + 1,
      description: newStep.description,
      tools: newStep.tools,
      expectedOutcome: newStep.expectedOutcome,
      dependencies: [],
      parallelizable: false,
      status: "pending",
    };

    plan.steps.splice(insertAfter, 0, step);
  }

  plan.steps.forEach((s, index) => {
    s.order = index + 1;
  });
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a Plan tool server.
 */
export function createPlanToolServer(): PlanToolServer {
  return new PlanToolServer();
}
