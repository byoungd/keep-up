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
      if (this.createIfMissing) {
        const exists = await this.exists();
        if (!exists) {
          await this.save();
        }
      }
    }
  }

  /**
   * Add or update a task in the plan.
   */
  async updateTask(task: PlanTask): Promise<void> {
    if (!this.replaceTask(this.tasks, task)) {
      this.tasks.push(task);
    }
    await this.save();
  }

  /**
   * Mark a task as completed.
   */
  async completeTask(taskId: string): Promise<void> {
    const task = this.findTask(taskId, this.tasks);
    if (task) {
      task.status = "completed";
      await this.save();
    }
  }

  /**
   * Mark a task as in progress.
   */
  async startTask(taskId: string): Promise<void> {
    const task = this.findTask(taskId, this.tasks);
    if (task) {
      task.status = "in_progress";
      await this.save();
    }
  }

  /**
   * Mark a task as failed.
   */
  async failTask(taskId: string): Promise<void> {
    const task = this.findTask(taskId, this.tasks);
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
    const stack: PlanTask[] = [];

    for (const line of lines) {
      const match = line.match(/^(\s*)- \[([ x/!])\] (.+)$/);
      if (match) {
        const indent = match[1].replace(/\t/g, "  ").length;
        const desiredDepth = Math.floor(indent / 2);
        const depth = Math.min(desiredDepth, stack.length);
        const status = this.parseCheckbox(match[2]);
        const task: PlanTask = {
          id: this.generateId(match[3]),
          title: match[3],
          status,
        };

        if (depth === 0 || stack.length === 0) {
          tasks.push(task);
          stack.length = 0;
          stack.push(task);
        } else {
          const parent = stack[depth - 1] ?? stack[stack.length - 1];
          if (!parent.subtasks) {
            parent.subtasks = [];
          }
          parent.subtasks.push(task);
          stack.length = depth;
          stack.push(task);
        }
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

  private async exists(): Promise<boolean> {
    if (this.vmProvider) {
      return this.vmProvider.exists(this.planPath);
    }
    const fs = await import("node:fs/promises");
    try {
      await fs.access(this.planPath);
      return true;
    } catch {
      return false;
    }
  }

  private findTask(taskId: string, tasks: PlanTask[]): PlanTask | undefined {
    for (const task of tasks) {
      if (task.id === taskId) {
        return task;
      }
      if (task.subtasks) {
        const match = this.findTask(taskId, task.subtasks);
        if (match) {
          return match;
        }
      }
    }
    return undefined;
  }

  private replaceTask(tasks: PlanTask[], updated: PlanTask): boolean {
    for (let i = 0; i < tasks.length; i += 1) {
      const task = tasks[i];
      if (task.id === updated.id) {
        tasks[i] = updated;
        return true;
      }
      if (task.subtasks && this.replaceTask(task.subtasks, updated)) {
        return true;
      }
    }
    return false;
  }
}

export function createPlanSync(config?: PlanSyncConfig): PlanSync {
  return new PlanSync(config);
}
