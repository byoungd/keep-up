/**
 * Plan.md Synchronization
 *
 * Automatically syncs agent task state to a plan.md file in the workspace.
 * This provides persistent memory of workflow progress across sessions.
 */

import type { IVmProvider } from "./vm";

export interface PlanTask {
  id: string;
  title: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  subtasks?: PlanTask[];
}

export interface PlanSyncConfig {
  /** Path to plan.md file (relative to workspace root) */
  planPath?: string;
  /** VM provider for file operations (uses local fs if not provided) */
  vmProvider?: IVmProvider;
  /** Whether to create the file if it doesn't exist */
  createIfMissing?: boolean;
}

const DEFAULT_PLAN_PATH = "plan.md";

/**
 * Synchronizes task state to a plan.md file.
 */
export class PlanSync {
  private readonly planPath: string;
  private readonly vmProvider?: IVmProvider;
  private readonly createIfMissing: boolean;
  private tasks: PlanTask[] = [];

  constructor(config: PlanSyncConfig = {}) {
    this.planPath = config.planPath ?? DEFAULT_PLAN_PATH;
    this.vmProvider = config.vmProvider;
    this.createIfMissing = config.createIfMissing ?? true;
  }

  /**
   * Load existing plan from file if it exists.
   */
  async load(): Promise<void> {
    try {
      const content = await this.readFile();
      this.tasks = this.parsePlan(content);
    } catch {
      // File doesn't exist yet, start fresh
      this.tasks = [];
    }
  }

  /**
   * Add or update a task in the plan.
   */
  async updateTask(task: PlanTask): Promise<void> {
    const existingIndex = this.tasks.findIndex((t) => t.id === task.id);
    if (existingIndex >= 0) {
      this.tasks[existingIndex] = task;
    } else {
      this.tasks.push(task);
    }
    await this.save();
  }

  /**
   * Mark a task as completed.
   */
  async completeTask(taskId: string): Promise<void> {
    const task = this.tasks.find((t) => t.id === taskId);
    if (task) {
      task.status = "completed";
      await this.save();
    }
  }

  /**
   * Mark a task as in progress.
   */
  async startTask(taskId: string): Promise<void> {
    const task = this.tasks.find((t) => t.id === taskId);
    if (task) {
      task.status = "in_progress";
      await this.save();
    }
  }

  /**
   * Mark a task as failed.
   */
  async failTask(taskId: string): Promise<void> {
    const task = this.tasks.find((t) => t.id === taskId);
    if (task) {
      task.status = "failed";
      await this.save();
    }
  }

  /**
   * Get all tasks.
   */
  getTasks(): readonly PlanTask[] {
    return this.tasks;
  }

  /**
   * Generate markdown content from current tasks.
   */
  generateMarkdown(): string {
    const lines: string[] = ["# Plan", ""];
    for (const task of this.tasks) {
      lines.push(this.formatTask(task, 0));
    }
    return lines.join("\n");
  }

  private formatTask(task: PlanTask, indent: number): string {
    const prefix = "  ".repeat(indent);
    const checkbox = this.getCheckbox(task.status);
    const line = `${prefix}- ${checkbox} ${task.title}`;

    if (!task.subtasks || task.subtasks.length === 0) {
      return line;
    }

    const subtaskLines = task.subtasks.map((st) => this.formatTask(st, indent + 1));
    return [line, ...subtaskLines].join("\n");
  }

  private getCheckbox(status: PlanTask["status"]): string {
    switch (status) {
      case "completed":
        return "[x]";
      case "in_progress":
        return "[/]";
      case "failed":
        return "[!]";
      default:
        return "[ ]";
    }
  }

  private parsePlan(content: string): PlanTask[] {
    const tasks: PlanTask[] = [];
    const lines = content.split("\n");

    for (const line of lines) {
      const match = line.match(/^(\s*)- \[([ x/!])\] (.+)$/);
      if (match) {
        const status = this.parseCheckbox(match[2]);
        tasks.push({
          id: this.generateId(match[3]),
          title: match[3],
          status,
        });
      }
    }

    return tasks;
  }

  private parseCheckbox(char: string): PlanTask["status"] {
    switch (char) {
      case "x":
        return "completed";
      case "/":
        return "in_progress";
      case "!":
        return "failed";
      default:
        return "pending";
    }
  }

  private generateId(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 50);
  }

  private async save(): Promise<void> {
    const content = this.generateMarkdown();
    await this.writeFile(content);
  }

  private async readFile(): Promise<string> {
    if (this.vmProvider) {
      return this.vmProvider.readFileText(this.planPath);
    }
    // Fallback to Node.js fs for non-VM environments
    const fs = await import("node:fs/promises");
    return fs.readFile(this.planPath, "utf-8");
  }

  private async writeFile(content: string): Promise<void> {
    if (this.vmProvider) {
      await this.vmProvider.writeFile(this.planPath, content);
      return;
    }
    // Fallback to Node.js fs for non-VM environments
    const fs = await import("node:fs/promises");
    await fs.writeFile(this.planPath, content, "utf-8");
  }
}

export function createPlanSync(config?: PlanSyncConfig): PlanSync {
  return new PlanSync(config);
}
