/**
 * TodoToolServer tests
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { MCPToolResult, ToolContext } from "@ku0/agent-runtime-core";
import { DEFAULT_AGENT_RUNTIME_DIR, SECURITY_PRESETS } from "@ku0/agent-runtime-core";
import { describe, expect, it } from "vitest";
import { TodoToolServer } from "../tools/core/todo";

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
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "todo-tool-"));
  try {
    return await run(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

describe("TodoToolServer", () => {
  it("denies writes when file permissions are read-only", async () => {
    await withTempDir(async (dir) => {
      const server = new TodoToolServer();
      const context = createContext({ workingDirectory: dir, filePermission: "read" });

      const result = await server.callTool(
        { name: "write", arguments: { action: "add", text: "Do it" } },
        context
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("PERMISSION_DENIED");
    });
  });

  it("adds items and reads them back", async () => {
    await withTempDir(async (dir) => {
      const server = new TodoToolServer();
      const context = createContext({ workingDirectory: dir, filePermission: "workspace" });

      const writeResult = await server.callTool(
        { name: "write", arguments: { action: "add", text: "Ship it", priority: "high" } },
        context
      );

      expect(writeResult.success).toBe(true);

      const readResult = await server.callTool({ name: "read", arguments: {} }, context);
      const text = getText(readResult);

      expect(readResult.success).toBe(true);
      expect(text).toContain("Ship it");
    });
  });

  it("rejects empty todo text", async () => {
    await withTempDir(async (dir) => {
      const server = new TodoToolServer();
      const context = createContext({ workingDirectory: dir, filePermission: "workspace" });

      const result = await server.callTool(
        { name: "write", arguments: { action: "add", text: "   " } },
        context
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("INVALID_ARGUMENTS");
    });
  });

  it("trims todo text before saving", async () => {
    await withTempDir(async (dir) => {
      const server = new TodoToolServer();
      const context = createContext({ workingDirectory: dir, filePermission: "workspace" });

      await server.callTool(
        { name: "write", arguments: { action: "add", text: "  Ship it  " } },
        context
      );

      const todoPath = path.join(dir, DEFAULT_AGENT_RUNTIME_DIR, "TODO.md");
      const content = await fs.readFile(todoPath, "utf-8");

      expect(content).toContain("Ship it");
      expect(content).not.toContain("  Ship it  ");
    });
  });

  it("truncates large outputs", async () => {
    await withTempDir(async (dir) => {
      const server = new TodoToolServer();
      const context = createContext({
        workingDirectory: dir,
        filePermission: "workspace",
        maxOutputBytes: 80,
      });

      for (let i = 0; i < 12; i++) {
        await server.callTool(
          { name: "write", arguments: { action: "add", text: `Task ${i + 1}` } },
          context
        );
      }

      const readResult = await server.callTool({ name: "read", arguments: {} }, context);
      const text = getText(readResult);

      expect(text).toContain("Output truncated");
    });
  });
});
