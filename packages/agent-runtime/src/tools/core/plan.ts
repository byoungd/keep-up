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

import { type PlanPersistence, createPlanPersistence } from "../../orchestrator/planPersistence";
import type { ExecutionPlan, PlanStep } from "../../orchestrator/planning";
import type { MCPToolResult, ToolContext } from "../../types";
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

  constructor() {
    super();
    this.persistence = createPlanPersistence();
    this.registerTools();
  }

  private registerTools(): void {
    // plan:save - Save the current plan
    this.registerTool(
      {
        name: "save",
        description:
          "Save or update the current execution plan. Use this to persist your plan to .agent/plans/current.md",
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
        },
      },
      this.handleSave.bind(this)
    );

    // plan:load - Load the current plan
    this.registerTool(
      {
        name: "load",
        description: "Load the current execution plan from .agent/plans/current.md",
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
    _context: ToolContext
  ): Promise<MCPToolResult> {
    try {
      const goal = args.goal as string;
      const stepsInput = args.steps as Array<{
        description: string;
        tools?: string[];
        expectedOutcome?: string;
      }>;
      const riskAssessment = (args.riskAssessment as ExecutionPlan["riskAssessment"]) ?? "low";
      const successCriteria = (args.successCriteria as string[]) ?? [];

      // Build plan steps
      const steps: PlanStep[] = stepsInput.map((s, index) => ({
        id: `step_${index + 1}_${Date.now().toString(36)}`,
        order: index + 1,
        description: s.description,
        tools: s.tools ?? [],
        expectedOutcome: s.expectedOutcome ?? "",
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

      return textResult(
        `Plan saved successfully!\n\nGoal: ${goal}\nSteps: ${steps.length}\nRisk: ${riskAssessment}\nLocation: .agent/plans/current.md`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult("EXECUTION_FAILED", `Failed to save plan: ${message}`);
    }
  }

  private async handleLoad(
    _args: Record<string, unknown>,
    _context: ToolContext
  ): Promise<MCPToolResult> {
    try {
      const plan = await this.persistence.loadCurrent();

      if (!plan) {
        return textResult("No active plan found. Create one with plan:save.");
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

      return textResult(lines.join("\n"));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult("EXECUTION_FAILED", `Failed to load plan: ${message}`);
    }
  }

  private async handleList(
    args: Record<string, unknown>,
    _context: ToolContext
  ): Promise<MCPToolResult> {
    try {
      const limit = (args.limit as number) ?? 10;
      const history = await this.persistence.listHistory();

      if (history.length === 0) {
        return textResult("No plan history found.");
      }

      const lines: string[] = ["# Plan History", ""];

      for (const meta of history.slice(0, limit)) {
        const date = new Date(meta.createdAt).toLocaleDateString();
        const progress = `${meta.completedSteps}/${meta.stepCount}`;
        lines.push(`- [${meta.status}] ${meta.goal} (${progress} steps) - ${date}`);
      }

      return textResult(lines.join("\n"));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult("EXECUTION_FAILED", `Failed to list plans: ${message}`);
    }
  }

  private async handleStatus(
    _args: Record<string, unknown>,
    _context: ToolContext
  ): Promise<MCPToolResult> {
    try {
      const plan = await this.persistence.loadCurrent();

      if (!plan) {
        return textResult("No active plan.");
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

      return textResult(lines.join("\n"));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult("EXECUTION_FAILED", `Failed to get status: ${message}`);
    }
  }

  private async handleStep(
    args: Record<string, unknown>,
    _context: ToolContext
  ): Promise<MCPToolResult> {
    try {
      const stepNumber = args.stepNumber as number;
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

      return textResult(`Step ${stepNumber} marked as ${status}: ${step.description}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult("EXECUTION_FAILED", `Failed to update step: ${message}`);
    }
  }

  private async handleArchive(
    _args: Record<string, unknown>,
    _context: ToolContext
  ): Promise<MCPToolResult> {
    try {
      const historyPath = await this.persistence.archiveCurrent();

      if (!historyPath) {
        return textResult("No active plan to archive.");
      }

      return textResult(`Plan archived to: ${historyPath}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult("EXECUTION_FAILED", `Failed to archive plan: ${message}`);
    }
  }

  private async handleAdvance(
    args: Record<string, unknown>,
    _context: ToolContext
  ): Promise<MCPToolResult> {
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
        return textResult(`Advanced to step ${nextStep.order}: ${nextStep.description}`);
      }

      return textResult("All steps completed. Plan finished.");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult("EXECUTION_FAILED", `Failed to advance phase: ${message}`);
    }
  }

  private async handleUpdate(
    args: Record<string, unknown>,
    _context: ToolContext
  ): Promise<MCPToolResult> {
    try {
      const goal = args.goal as string | undefined;
      const add_steps = args.add_steps as
        | Array<{
            description: string;
            tools?: string[];
            expectedOutcome?: string;
            insertAfter?: number;
          }>
        | undefined;
      const remove_steps = args.remove_steps as number[] | undefined;

      const plan = await this.persistence.loadCurrent();

      if (!plan) {
        return errorResult("RESOURCE_NOT_FOUND", "No active plan found.");
      }

      // Update goal if provided
      if (goal) {
        plan.goal = goal;
      }

      // Remove steps
      if (remove_steps && remove_steps.length > 0) {
        plan.steps = plan.steps.filter((s) => !remove_steps.includes(s.order));
        // Renumber remaining steps
        plan.steps.forEach((s, index) => {
          s.order = index + 1;
        });
      }

      // Add steps
      if (add_steps && add_steps.length > 0) {
        for (const newStep of add_steps) {
          const insertAfter = newStep.insertAfter ?? plan.steps.length;
          const step: PlanStep = {
            id: `step_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
            order: insertAfter + 1,
            description: newStep.description,
            tools: newStep.tools ?? [],
            expectedOutcome: newStep.expectedOutcome ?? "",
            dependencies: [],
            parallelizable: false,
            status: "pending",
          };

          // Insert at position
          plan.steps.splice(insertAfter, 0, step);
        }

        // Renumber all steps
        plan.steps.forEach((s, index) => {
          s.order = index + 1;
        });
      }

      await this.persistence.saveCurrent(plan);

      return textResult(
        `Plan updated successfully!\nGoal: ${plan.goal}\nSteps: ${plan.steps.length}`
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
