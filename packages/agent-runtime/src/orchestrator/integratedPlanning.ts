/**
 * Integrated Planning Service
 *
 * Coordinates between PlanningEngine and TodoToolServer to provide unified
 * planning and task tracking. Inspired by Manus's pattern where:
 * - Task planning takes precedence over todo.md
 * - Todo.md contains more details and serves as live dashboard
 * - Updates sync automatically between plan steps and todo items
 *
 * This service ensures:
 * 1. When a plan is created, todos are auto-generated from steps
 * 2. When a step completes, the corresponding todo is marked complete
 * 3. Plan status is reflected in todo.md in real-time
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { TodoItem } from "../tools/core/todo";
import type { ExecutionPlan, PlanStep } from "./planning";
import { createPlanPersistence, type PlanPersistence } from "./planPersistence";

// ============================================================================
// Types
// ============================================================================

export interface IntegratedPlanningConfig {
  /** Base directory for agent files */
  baseDir: string;
  /** Working directory */
  workingDirectory?: string;
  /** Auto-generate todos from plan steps */
  autoGenerateTodos: boolean;
  /** Auto-sync step status to todos */
  autoSyncStatus: boolean;
}

export interface PlanTodoLink {
  planId: string;
  stepId: string;
  todoId: string;
}

// ============================================================================
// Integrated Planning Service
// ============================================================================

export class IntegratedPlanningService {
  private readonly config: IntegratedPlanningConfig;
  private readonly persistence: PlanPersistence;
  private readonly links = new Map<string, PlanTodoLink>();

  constructor(config: Partial<IntegratedPlanningConfig> = {}) {
    this.config = {
      baseDir: config.baseDir ?? ".agent",
      workingDirectory: config.workingDirectory,
      autoGenerateTodos: config.autoGenerateTodos ?? true,
      autoSyncStatus: config.autoSyncStatus ?? true,
    };

    this.persistence = createPlanPersistence({
      workingDirectory: this.config.workingDirectory,
    });
  }

  // ============================================================================
  // Plan Management
  // ============================================================================

  /**
   * Create a new plan and optionally generate todos from steps.
   */
  async createPlan(plan: ExecutionPlan): Promise<void> {
    // Save the plan
    await this.persistence.saveCurrent(plan);

    // Auto-generate todos if enabled
    if (this.config.autoGenerateTodos) {
      await this.generateTodosFromPlan(plan);
    }
  }

  /**
   * Update a step's status and sync to todo if enabled.
   */
  async updateStepStatus(
    planId: string,
    stepId: string,
    status: PlanStep["status"]
  ): Promise<void> {
    // Load current plan
    const plan = await this.persistence.loadCurrent();
    if (!plan || plan.id !== planId) {
      return;
    }

    // Update step
    const step = plan.steps.find((s) => s.id === stepId);
    if (!step) {
      return;
    }

    step.status = status;
    await this.persistence.saveCurrent(plan);

    // Sync to todo if enabled
    if (this.config.autoSyncStatus) {
      await this.syncStepToTodo(plan, step);
    }
  }

  /**
   * Mark a step as complete and update todo.
   */
  async completeStep(planId: string, stepId: string): Promise<void> {
    await this.updateStepStatus(planId, stepId, "complete");
  }

  /**
   * Get current plan with enriched status.
   */
  async getCurrentPlan(): Promise<ExecutionPlan | null> {
    return this.persistence.loadCurrent();
  }

  /**
   * Archive current plan and clean up todos.
   */
  async archivePlan(): Promise<void> {
    const plan = await this.persistence.loadCurrent();
    if (!plan) {
      return;
    }

    // Archive the plan
    await this.persistence.archiveCurrent();

    // Clean up completed todos (keep last few for reference)
    await this.cleanupCompletedTodos();
  }

  // ============================================================================
  // Todo Generation
  // ============================================================================

  /**
   * Generate todo items from plan steps.
   */
  private async generateTodosFromPlan(plan: ExecutionPlan): Promise<void> {
    const todos: TodoItem[] = [];

    for (const step of plan.steps) {
      const priority = this.stepToPriority(step, plan.steps.length);

      const todo: TodoItem = {
        id: `plan-${plan.id.slice(0, 8)}-step-${step.order}`,
        text: `[Step ${step.order}] ${step.description}`,
        status: this.stepStatusToTodoStatus(step.status),
        priority,
        createdAt: Date.now(),
      };

      todos.push(todo);

      // Track the link
      this.links.set(step.id, {
        planId: plan.id,
        stepId: step.id,
        todoId: todo.id,
      });
    }

    // Write todos to file
    await this.writeTodosForPlan(plan, todos);
  }

  /**
   * Sync a single step status to its linked todo.
   */
  private async syncStepToTodo(plan: ExecutionPlan, step: PlanStep): Promise<void> {
    const todos = await this.loadTodos();

    const todoId = `plan-${plan.id.slice(0, 8)}-step-${step.order}`;
    const todo = todos.find((t) => t.id === todoId);

    if (todo) {
      todo.status = this.stepStatusToTodoStatus(step.status);
      todo.updatedAt = Date.now();
      await this.saveTodos(todos);
    }
  }

  /**
   * Map step priority based on order.
   */
  private stepToPriority(step: PlanStep, totalSteps: number): TodoItem["priority"] {
    // First third = high, middle = medium, last third = low
    const position = step.order / totalSteps;
    if (position <= 0.33) {
      return "high";
    }
    if (position <= 0.66) {
      return "medium";
    }
    return "low";
  }

  /**
   * Map step status to todo status.
   */
  private stepStatusToTodoStatus(status?: PlanStep["status"]): TodoItem["status"] {
    switch (status) {
      case "complete":
        return "done";
      case "executing":
        return "in_progress";
      case "failed":
        return "in_progress"; // Keep visible for retry
      case "skipped":
        return "done";
      default:
        return "pending";
    }
  }

  // ============================================================================
  // Todo File Operations
  // ============================================================================

  private getTodoPath(): string {
    const workDir = this.config.workingDirectory ?? process.cwd();
    return path.join(workDir, this.config.baseDir, "TODO.md");
  }

  private async loadTodos(): Promise<TodoItem[]> {
    try {
      const content = await fs.readFile(this.getTodoPath(), "utf-8");
      return this.parseTodoMarkdown(content);
    } catch {
      return [];
    }
  }

  private async saveTodos(todos: TodoItem[]): Promise<void> {
    const content = this.formatTodoMarkdown(todos);
    await fs.mkdir(path.dirname(this.getTodoPath()), { recursive: true });
    await fs.writeFile(this.getTodoPath(), content, "utf-8");
  }

  private async writeTodosForPlan(plan: ExecutionPlan, newTodos: TodoItem[]): Promise<void> {
    // Load existing todos
    const existingTodos = await this.loadTodos();

    // Remove old todos for this plan
    const planPrefix = `plan-${plan.id.slice(0, 8)}-`;
    const filteredTodos = existingTodos.filter((t) => !t.id.startsWith(planPrefix));

    // Add plan header as a special todo
    const headerTodo: TodoItem = {
      id: `${planPrefix}header`,
      text: `📋 Plan: ${plan.goal}`,
      status: "in_progress",
      priority: "high",
      createdAt: Date.now(),
    };

    // Combine: existing non-plan todos + header + new plan todos
    const allTodos = [...filteredTodos, headerTodo, ...newTodos];

    await this.saveTodos(allTodos);
  }

  private async cleanupCompletedTodos(): Promise<void> {
    const todos = await this.loadTodos();

    // Keep only non-plan todos and recent done items
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    const filtered = todos.filter((todo) => {
      // Keep all pending/in-progress
      if (todo.status !== "done") {
        return true;
      }
      // Keep recently completed
      if (todo.updatedAt && todo.updatedAt > oneHourAgo) {
        return true;
      }
      // Remove old plan-related completed items
      return !todo.id.startsWith("plan-");
    });

    await this.saveTodos(filtered);
  }

  // ============================================================================
  // Markdown Parsing (simplified version)
  // ============================================================================

  private parseTodoMarkdown(content: string): TodoItem[] {
    const items: TodoItem[] = [];
    const lines = content.split("\n");

    for (const line of lines) {
      const match = line.match(/^- \[([ x/])\] (.+)$/);
      if (!match) {
        continue;
      }

      const [, checkbox, rest] = match;
      const status: TodoItem["status"] =
        checkbox === "x" ? "done" : checkbox === "/" ? "in_progress" : "pending";

      const idMatch = rest.match(/@id:(\S+)/);
      const priorityMatch = rest.match(/@priority:(high|medium|low)/);
      const createdMatch = rest.match(/@created:(\d+)/);

      const text = rest
        .replace(/@id:\S+/g, "")
        .replace(/@priority:\S+/g, "")
        .replace(/@created:\d+/g, "")
        .trim();

      if (text) {
        items.push({
          id: idMatch?.[1] ?? `t${Date.now().toString(36)}`,
          text,
          status,
          priority: priorityMatch?.[1] as TodoItem["priority"],
          createdAt: createdMatch ? Number.parseInt(createdMatch[1], 10) : Date.now(),
        });
      }
    }

    return items;
  }

  private formatTodoMarkdown(todos: TodoItem[]): string {
    const lines = ["# TODO", ""];

    // Group by status
    const pending = todos.filter((t) => t.status === "pending");
    const inProgress = todos.filter((t) => t.status === "in_progress");
    const done = todos.filter((t) => t.status === "done");

    // Sort by priority then created
    const sortItems = (a: TodoItem, b: TodoItem) => {
      const priorityOrder = { high: 0, medium: 1, low: 2, undefined: 3 };
      const pA = priorityOrder[a.priority ?? "undefined"];
      const pB = priorityOrder[b.priority ?? "undefined"];
      if (pA !== pB) {
        return pA - pB;
      }
      return a.createdAt - b.createdAt;
    };

    if (inProgress.length > 0) {
      lines.push("## In Progress", "");
      for (const item of inProgress.sort(sortItems)) {
        lines.push(this.formatTodoItem(item, "/"));
      }
      lines.push("");
    }

    if (pending.length > 0) {
      lines.push("## Pending", "");
      for (const item of pending.sort(sortItems)) {
        lines.push(this.formatTodoItem(item, " "));
      }
      lines.push("");
    }

    if (done.length > 0) {
      lines.push("## Done", "");
      for (const item of done.slice(-10)) {
        lines.push(this.formatTodoItem(item, "x"));
      }
      lines.push("");
    }

    return lines.join("\n");
  }

  private formatTodoItem(item: TodoItem, checkbox: string): string {
    let line = `- [${checkbox}] ${item.text}`;
    line += ` @id:${item.id}`;
    if (item.priority) {
      line += ` @priority:${item.priority}`;
    }
    line += ` @created:${item.createdAt}`;
    return line;
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create an integrated planning service.
 *
 * @example
 * ```typescript
 * const planning = createIntegratedPlanningService();
 *
 * // Create a plan - todos are auto-generated
 * await planning.createPlan({
 *   id: 'plan-123',
 *   goal: 'Implement user authentication',
 *   steps: [
 *     { id: 's1', order: 1, description: 'Design auth flow', ... },
 *     { id: 's2', order: 2, description: 'Implement JWT tokens', ... },
 *   ],
 *   ...
 * });
 *
 * // Complete a step - todo is auto-updated
 * await planning.completeStep('plan-123', 's1');
 * ```
 */
export function createIntegratedPlanningService(
  config?: Partial<IntegratedPlanningConfig>
): IntegratedPlanningService {
  return new IntegratedPlanningService(config);
}
