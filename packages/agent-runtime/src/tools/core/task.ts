/**
 * Task Tool Server
 *
 * Agent task management following top-tier patterns (Cursor, Claude).
 * Provides structured task breakdown with subtasks, dependencies, and progress tracking.
 *
 * Tasks are stored in .agent/TASKS.json for machine-readable format.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { MCPToolResult, ToolContext } from "../../types";
import { BaseToolServer, errorResult, textResult } from "../mcp/baseServer";

// ============================================================================
// Types
// ============================================================================

export interface ToolSubtask {
  id: string;
  description: string;
  status: "pending" | "in_progress" | "done" | "blocked";
  blockedBy?: string[];
}

export interface ToolTask {
  id: string;
  title: string;
  description: string;
  status: "pending" | "in_progress" | "done" | "cancelled";
  subtasks: ToolSubtask[];
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}

export interface TaskStore {
  version: 1;
  currentTaskId: string | null;
  tasks: ToolTask[];
}

// ============================================================================
// Task Tool Server
// ============================================================================

export class TaskToolServer extends BaseToolServer {
  readonly name = "task";
  readonly description = "Manage structured tasks with subtasks and dependencies";

  private readonly taskFileName = "TASKS.json";
  private readonly agentDir = ".agent";

  constructor() {
    super();
    this.registerTools();
  }

  private registerTools(): void {
    // task:create - Create a new task
    this.registerTool(
      {
        name: "create",
        description: "Create a new task with title and optional subtasks",
        inputSchema: {
          type: "object",
          properties: {
            title: { type: "string", description: "Task title" },
            description: { type: "string", description: "Task description" },
            subtasks: {
              type: "array",
              items: { type: "string" },
              description: "List of subtask descriptions",
            },
            setAsCurrent: {
              type: "boolean",
              description: "Set this as the current active task",
            },
          },
          required: ["title"],
        },
        annotations: {
          category: "core",
          requiresConfirmation: false,
          readOnly: false,
          estimatedDuration: "fast",
        },
      },
      this.handleCreate.bind(this)
    );

    // task:status - Get current task status
    this.registerTool(
      {
        name: "status",
        description: "Get the status of current or specified task",
        inputSchema: {
          type: "object",
          properties: {
            taskId: { type: "string", description: "Task ID (uses current if not specified)" },
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
      this.handleStatus.bind(this)
    );

    // task:update - Update task or subtask
    this.registerTool(
      {
        name: "update",
        description: "Update task or subtask status/details",
        inputSchema: {
          type: "object",
          properties: {
            taskId: { type: "string", description: "Task ID" },
            subtaskId: { type: "string", description: "Subtask ID (if updating subtask)" },
            status: {
              type: "string",
              description: "New status",
              enum: ["pending", "in_progress", "done", "blocked", "cancelled"],
            },
            addSubtask: { type: "string", description: "Add a new subtask" },
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

    // task:list - List all tasks
    this.registerTool(
      {
        name: "list",
        description: "List all tasks with their status",
        inputSchema: {
          type: "object",
          properties: {
            filter: {
              type: "string",
              description: "Filter by status",
              enum: ["all", "pending", "in_progress", "done"],
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
  }

  private getTaskPath(context: ToolContext): string {
    const workDir = context.security.sandbox.workingDirectory ?? process.cwd();
    return path.join(workDir, this.agentDir, this.taskFileName);
  }

  private async ensureAgentDir(context: ToolContext): Promise<void> {
    const workDir = context.security.sandbox.workingDirectory ?? process.cwd();
    const agentPath = path.join(workDir, this.agentDir);
    try {
      await fs.mkdir(agentPath, { recursive: true });
    } catch {
      // Directory may already exist
    }
  }

  private async loadStore(context: ToolContext): Promise<TaskStore> {
    try {
      const taskPath = this.getTaskPath(context);
      const content = await fs.readFile(taskPath, "utf-8");
      return JSON.parse(content) as TaskStore;
    } catch {
      return { version: 1, currentTaskId: null, tasks: [] };
    }
  }

  private async saveStore(store: TaskStore, context: ToolContext): Promise<void> {
    await this.ensureAgentDir(context);
    const taskPath = this.getTaskPath(context);
    await fs.writeFile(taskPath, JSON.stringify(store, null, 2), "utf-8");
  }

  private generateId(): string {
    return `task_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  }

  // ============================================================================
  // Handlers
  // ============================================================================

  private async handleCreate(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    const title = args.title as string;
    const description = (args.description as string) ?? "";
    const subtaskDescs = (args.subtasks as string[]) ?? [];
    const setAsCurrent = (args.setAsCurrent as boolean) ?? true;

    try {
      const store = await this.loadStore(context);
      const now = Date.now();

      const task: ToolTask = {
        id: this.generateId(),
        title,
        description,
        status: "pending",
        subtasks: subtaskDescs.map((desc, i) => ({
          id: `st_${i + 1}`,
          description: desc,
          status: "pending",
        })),
        createdAt: now,
        updatedAt: now,
      };

      store.tasks.push(task);
      if (setAsCurrent) {
        store.currentTaskId = task.id;
      }

      await this.saveStore(store, context);

      const output = [`Created task: ${task.id}`, `Title: ${title}`];
      if (task.subtasks.length > 0) {
        output.push(`Subtasks: ${task.subtasks.length}`);
        for (const st of task.subtasks) {
          output.push(`  - ${st.id}: ${st.description}`);
        }
      }

      return textResult(output.join("\n"));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult("EXECUTION_FAILED", `Failed to create task: ${message}`);
    }
  }

  private async handleStatus(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    const taskId = args.taskId as string | undefined;

    try {
      const store = await this.loadStore(context);
      const targetId = taskId ?? store.currentTaskId;

      if (!targetId) {
        return textResult("No current task set. Use task:create to create one.");
      }

      const task = store.tasks.find((t) => t.id === targetId);
      if (!task) {
        return errorResult("RESOURCE_NOT_FOUND", `Task not found: ${targetId}`);
      }

      const doneCount = task.subtasks.filter((s) => s.status === "done").length;
      const totalCount = task.subtasks.length;

      const output = [
        `Task: ${task.id}`,
        `Title: ${task.title}`,
        `Status: ${task.status}`,
        `Progress: ${doneCount}/${totalCount} subtasks done`,
        "",
        "Subtasks:",
      ];

      for (const st of task.subtasks) {
        const icon = st.status === "done" ? "✓" : st.status === "in_progress" ? "→" : "○";
        output.push(`  ${icon} ${st.id}: ${st.description} [${st.status}]`);
      }

      return textResult(output.join("\n"));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult("EXECUTION_FAILED", `Failed to get status: ${message}`);
    }
  }

  private async handleUpdate(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    const taskId = args.taskId as string | undefined;
    const subtaskId = args.subtaskId as string | undefined;
    const status = args.status as ToolTask["status"] | ToolSubtask["status"] | undefined;
    const addSubtask = args.addSubtask as string | undefined;

    try {
      const store = await this.loadStore(context);
      const targetId = taskId ?? store.currentTaskId;

      if (!targetId) {
        return errorResult("INVALID_ARGUMENTS", "No task ID provided and no current task set");
      }

      const task = store.tasks.find((t) => t.id === targetId);
      if (!task) {
        return errorResult("RESOURCE_NOT_FOUND", `Task not found: ${targetId}`);
      }

      const updates: string[] = [];

      // Add subtask
      if (addSubtask) {
        const newSubtask: ToolSubtask = {
          id: `st_${task.subtasks.length + 1}`,
          description: addSubtask,
          status: "pending",
        };
        task.subtasks.push(newSubtask);
        updates.push(`Added subtask: ${newSubtask.id}`);
      }

      // Update subtask status
      if (subtaskId && status) {
        const subtask = task.subtasks.find((s) => s.id === subtaskId);
        if (!subtask) {
          return errorResult("RESOURCE_NOT_FOUND", `Subtask not found: ${subtaskId}`);
        }
        subtask.status = status as ToolSubtask["status"];
        updates.push(`Updated ${subtaskId} status to ${status}`);
      }
      // Update task status
      else if (status && !subtaskId) {
        task.status = status as ToolTask["status"];
        updates.push(`Updated task status to ${status}`);
      }

      task.updatedAt = Date.now();
      await this.saveStore(store, context);

      return textResult(updates.length > 0 ? updates.join("\n") : "No updates made");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult("EXECUTION_FAILED", `Failed to update task: ${message}`);
    }
  }

  private async handleList(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    const filter = (args.filter as string) ?? "all";

    try {
      const store = await this.loadStore(context);
      let tasks = store.tasks;

      if (filter !== "all") {
        tasks = tasks.filter((t) => t.status === filter);
      }

      if (tasks.length === 0) {
        return textResult(`No ${filter === "all" ? "" : `${filter} `}tasks found.`);
      }

      const output: string[] = [];
      for (const task of tasks) {
        const doneCount = task.subtasks.filter((s) => s.status === "done").length;
        const current = task.id === store.currentTaskId ? " [CURRENT]" : "";
        output.push(
          `${task.id}: ${task.title} [${task.status}] (${doneCount}/${task.subtasks.length})${current}`
        );
      }

      return textResult(output.join("\n"));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult("EXECUTION_FAILED", `Failed to list tasks: ${message}`);
    }
  }
}

/**
 * Create a Task tool server.
 */
export function createTaskToolServer(): TaskToolServer {
  return new TaskToolServer();
}
