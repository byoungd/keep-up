/**
 * TaskToolServer tests
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { MCPToolResult, ToolContext } from "@ku0/agent-runtime-core";
import { DEFAULT_AGENT_RUNTIME_DIR, SECURITY_PRESETS } from "@ku0/agent-runtime-core";
import { describe, expect, it } from "vitest";
import { TaskToolServer } from "../tools/core/task";

function createContext(options: {
  workingDirectory: string;
  filePermission: ToolContext["security"]["permissions"]["file"];
  maxOutputBytes?: number;
}): ToolContext {
  const base = SECURITY_PRESETS.balanced;
  return {
    security: {
      sandbox: { ...base.sandbox, workingDirectory: options.workingDirectory },
      permissions: { ...base.permissions, file: options.filePermission },
      limits: {
        ...base.limits,
        maxOutputBytes: options.maxOutputBytes ?? base.limits.maxOutputBytes,
      },
    },
  };
}

function getText(result: MCPToolResult): string {
  return result.content.find((item) => item.type === "text")?.text ?? "";
}

async function withTempDir<T>(run: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "task-tool-"));
  try {
    return await run(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

describe("TaskToolServer", () => {
  it("denies create when file writes are not allowed", async () => {
    await withTempDir(async (dir) => {
      const server = new TaskToolServer();
      const context = createContext({ workingDirectory: dir, filePermission: "read" });

      const result = await server.callTool(
        { name: "create", arguments: { title: "Test" } },
        context
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("PERMISSION_DENIED");
    });
  });

  it("creates a task and reports status", async () => {
    await withTempDir(async (dir) => {
      const server = new TaskToolServer();
      const context = createContext({ workingDirectory: dir, filePermission: "workspace" });

      const createResult = await server.callTool(
        { name: "create", arguments: { title: "Task", subtasks: ["a", "b"] } },
        context
      );

      expect(createResult.success).toBe(true);

      const statusResult = await server.callTool({ name: "status", arguments: {} }, context);
      const text = getText(statusResult);

      expect(statusResult.success).toBe(true);
      expect(text).toContain("Task:");
      expect(text).toContain("Subtasks:");
    });
  });

  it("rejects empty titles", async () => {
    await withTempDir(async (dir) => {
      const server = new TaskToolServer();
      const context = createContext({ workingDirectory: dir, filePermission: "workspace" });

      const result = await server.callTool(
        { name: "create", arguments: { title: "   " } },
        context
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("INVALID_ARGUMENTS");
    });
  });

  it("sanitizes subtask descriptions", async () => {
    await withTempDir(async (dir) => {
      const server = new TaskToolServer();
      const context = createContext({ workingDirectory: dir, filePermission: "workspace" });

      await server.callTool(
        {
          name: "create",
          arguments: { title: "Task", subtasks: [" a ", "", "b "] },
        },
        context
      );

      const taskPath = path.join(dir, DEFAULT_AGENT_RUNTIME_DIR, "TASKS.json");
      const content = await fs.readFile(taskPath, "utf-8");
      const store = JSON.parse(content) as { tasks: { subtasks: { description: string }[] }[] };

      expect(store.tasks[0].subtasks.map((subtask) => subtask.description)).toEqual(["a", "b"]);
    });
  });

  it("truncates large outputs", async () => {
    await withTempDir(async (dir) => {
      const server = new TaskToolServer();
      const context = createContext({
        workingDirectory: dir,
        filePermission: "workspace",
        maxOutputBytes: 80,
      });

      const subtasks = Array.from({ length: 20 }, (_, i) => `subtask-${i + 1}`);
      await server.callTool({ name: "create", arguments: { title: "Task", subtasks } }, context);

      const statusResult = await server.callTool({ name: "status", arguments: {} }, context);
      const text = getText(statusResult);

      expect(text).toContain("Output truncated");
    });
  });
});
