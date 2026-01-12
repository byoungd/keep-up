/**
 * Todo Tool Server
 *
 * Agent-readable TODO list following top-tier patterns (Cursor, Claude).
 * Provides todoRead and todoWrite operations for persistent task tracking.
 *
 * The TODO list is stored as a markdown file (.agent/TODO.md) in the workspace.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { MCPToolResult, ToolContext } from "../../types";
import { BaseToolServer, errorResult, textResult } from "../mcp/baseServer";

// ============================================================================
// Types
// ============================================================================

export interface TodoItem {
  id: string;
  text: string;
  status: "pending" | "in_progress" | "done";
  priority?: "high" | "medium" | "low";
  createdAt: number;
  updatedAt?: number;
}

// ============================================================================
// Todo Tool Server
// ============================================================================

export class TodoToolServer extends BaseToolServer {
  readonly name = "todo";
  readonly description = "Read and write TODO items for task tracking";

  private readonly todoFileName = "TODO.md";
  private readonly agentDir = ".agent";

  constructor() {
    super();
    this.registerTools();
  }

  private registerTools(): void {
    // todoRead - Read the current TODO list
    this.registerTool(
      {
        name: "read",
        description:
          "Read the current TODO list. Returns all pending, in-progress, and completed tasks.",
        inputSchema: {
          type: "object",
          properties: {
            filter: {
              type: "string",
              description: "Filter by status: 'all', 'pending', 'in_progress', 'done'",
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
      this.handleRead.bind(this)
    );

    // todoWrite - Add or update TODO items
    this.registerTool(
      {
        name: "write",
        description: "Add new TODO items or update existing ones. Use to track tasks and progress.",
        inputSchema: {
          type: "object",
          properties: {
            action: {
              type: "string",
              description: "Action to perform: 'add', 'update', 'remove', 'complete'",
              enum: ["add", "update", "remove", "complete"],
            },
            id: {
              type: "string",
              description: "Task ID (required for update/remove/complete)",
            },
            text: {
              type: "string",
              description: "Task description (required for add, optional for update)",
            },
            status: {
              type: "string",
              description: "New status for update action",
              enum: ["pending", "in_progress", "done"],
            },
            priority: {
              type: "string",
              description: "Task priority",
              enum: ["high", "medium", "low"],
            },
          },
          required: ["action"],
        },
        annotations: {
          category: "core",
          requiresConfirmation: false,
          readOnly: false,
          estimatedDuration: "fast",
        },
      },
      this.handleWrite.bind(this)
    );
  }

  private getTodoPath(context: ToolContext): string {
    const workDir = context.security.sandbox.workingDirectory ?? process.cwd();
    return path.join(workDir, this.agentDir, this.todoFileName);
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

  private async loadTodos(context: ToolContext): Promise<TodoItem[]> {
    try {
      const todoPath = this.getTodoPath(context);
      const content = await fs.readFile(todoPath, "utf-8");
      return this.parseTodoMarkdown(content);
    } catch {
      return [];
    }
  }

  private async saveTodos(todos: TodoItem[], context: ToolContext): Promise<void> {
    await this.ensureAgentDir(context);
    const todoPath = this.getTodoPath(context);
    const content = this.formatTodoMarkdown(todos);
    await fs.writeFile(todoPath, content, "utf-8");
  }

  private parseTodoMarkdown(content: string): TodoItem[] {
    const items: TodoItem[] = [];
    const lines = content.split("\n");

    for (const line of lines) {
      // Match: - [ ] text @id:xxx @priority:xxx @created:xxx
      // Or: - [x] text @id:xxx
      // Or: - [/] text @id:xxx (in-progress)
      const match = line.match(/^- \[([ x/])\] (.+)$/);
      if (!match) {
        continue;
      }

      const [, checkbox, rest] = match;
      const status: TodoItem["status"] =
        checkbox === "x" ? "done" : checkbox === "/" ? "in_progress" : "pending";

      // Extract metadata
      const idMatch = rest.match(/@id:(\S+)/);
      const priorityMatch = rest.match(/@priority:(high|medium|low)/);
      const createdMatch = rest.match(/@created:(\d+)/);

      // Remove metadata from text
      const text = rest
        .replace(/@id:\S+/g, "")
        .replace(/@priority:\S+/g, "")
        .replace(/@created:\d+/g, "")
        .trim();

      if (text) {
        items.push({
          id: idMatch?.[1] ?? this.generateId(),
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
    const lines = ["# TODO", "", "## Pending", ""];

    const pending = todos.filter((t) => t.status === "pending");
    const inProgress = todos.filter((t) => t.status === "in_progress");
    const done = todos.filter((t) => t.status === "done");

    // High priority first, then by created date
    const sortItems = (a: TodoItem, b: TodoItem) => {
      const priorityOrder = { high: 0, medium: 1, low: 2, undefined: 3 };
      const pA = priorityOrder[a.priority ?? "undefined"];
      const pB = priorityOrder[b.priority ?? "undefined"];
      if (pA !== pB) {
        return pA - pB;
      }
      return a.createdAt - b.createdAt;
    };

    for (const item of pending.sort(sortItems)) {
      lines.push(this.formatItem(item, " "));
    }

    if (inProgress.length > 0) {
      lines.push("", "## In Progress", "");
      for (const item of inProgress.sort(sortItems)) {
        lines.push(this.formatItem(item, "/"));
      }
    }

    if (done.length > 0) {
      lines.push("", "## Done", "");
      for (const item of done.slice(-10)) {
        // Keep last 10 done items
        lines.push(this.formatItem(item, "x"));
      }
    }

    return `${lines.join("\n")}\n`;
  }

  private formatItem(item: TodoItem, checkbox: string): string {
    let line = `- [${checkbox}] ${item.text}`;
    line += ` @id:${item.id}`;
    if (item.priority) {
      line += ` @priority:${item.priority}`;
    }
    line += ` @created:${item.createdAt}`;
    return line;
  }

  private generateId(): string {
    return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  }

  // ============================================================================
  // Handlers
  // ============================================================================

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: todo read handler with multiple filter paths
  private async handleRead(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    const filter = (args.filter as string) ?? "all";

    try {
      let todos = await this.loadTodos(context);

      if (filter !== "all") {
        todos = todos.filter((t) => t.status === filter);
      }

      if (todos.length === 0) {
        return textResult(`No ${filter === "all" ? "" : `${filter} `}tasks found.`);
      }

      const output: string[] = [];
      for (const item of todos) {
        const statusIcon = item.status === "done" ? "✓" : item.status === "in_progress" ? "→" : "○";
        const priorityTag = item.priority ? ` [${item.priority}]` : "";
        output.push(`${statusIcon} ${item.id}: ${item.text}${priorityTag}`);
      }

      return textResult(output.join("\n"));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult("EXECUTION_FAILED", `Failed to read todos: ${message}`);
    }
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: todo write handler with multiple action cases
  private async handleWrite(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    const action = args.action as string;
    const id = args.id as string | undefined;
    const text = args.text as string | undefined;
    const status = args.status as TodoItem["status"] | undefined;
    const priority = args.priority as TodoItem["priority"] | undefined;

    try {
      const todos = await this.loadTodos(context);

      switch (action) {
        case "add": {
          if (!text) {
            return errorResult("INVALID_ARGUMENTS", "Text is required for add action");
          }
          const newItem: TodoItem = {
            id: this.generateId(),
            text,
            status: "pending",
            priority,
            createdAt: Date.now(),
          };
          todos.push(newItem);
          await this.saveTodos(todos, context);
          return textResult(`Added task: ${newItem.id} - ${text}`);
        }

        case "update": {
          if (!id) {
            return errorResult("INVALID_ARGUMENTS", "ID is required for update action");
          }
          const item = todos.find((t) => t.id === id);
          if (!item) {
            return errorResult("RESOURCE_NOT_FOUND", `Task not found: ${id}`);
          }
          if (text) {
            item.text = text;
          }
          if (status) {
            item.status = status;
          }
          if (priority) {
            item.priority = priority;
          }
          item.updatedAt = Date.now();
          await this.saveTodos(todos, context);
          return textResult(`Updated task: ${id}`);
        }

        case "complete": {
          if (!id) {
            return errorResult("INVALID_ARGUMENTS", "ID is required for complete action");
          }
          const item = todos.find((t) => t.id === id);
          if (!item) {
            return errorResult("RESOURCE_NOT_FOUND", `Task not found: ${id}`);
          }
          item.status = "done";
          item.updatedAt = Date.now();
          await this.saveTodos(todos, context);
          return textResult(`Completed task: ${id} - ${item.text}`);
        }

        case "remove": {
          if (!id) {
            return errorResult("INVALID_ARGUMENTS", "ID is required for remove action");
          }
          const idx = todos.findIndex((t) => t.id === id);
          if (idx === -1) {
            return errorResult("RESOURCE_NOT_FOUND", `Task not found: ${id}`);
          }
          const removed = todos.splice(idx, 1)[0];
          await this.saveTodos(todos, context);
          return textResult(`Removed task: ${id} - ${removed.text}`);
        }

        default:
          return errorResult("INVALID_ARGUMENTS", `Unknown action: ${action}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult("EXECUTION_FAILED", `Failed to write todo: ${message}`);
    }
  }
}

/**
 * Create a Todo tool server.
 */
export function createTodoToolServer(): TodoToolServer {
  return new TodoToolServer();
}
