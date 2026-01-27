/**
 * ScratchToolServer tests
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { MCPToolResult, ToolContext } from "@ku0/agent-runtime-core";
import { SECURITY_PRESETS } from "@ku0/agent-runtime-core";
import { describe, expect, it } from "vitest";
import { ScratchToolServer } from "../tools/core/scratch";

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
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "scratch-tool-"));
  try {
    return await run(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

describe("ScratchToolServer", () => {
  it("denies save when file permissions are read-only", async () => {
    await withTempDir(async (dir) => {
      const server = new ScratchToolServer();
      const context = createContext({ workingDirectory: dir, filePermission: "read" });

      const result = await server.callTool(
        { name: "save", arguments: { name: "note", content: "data" } },
        context
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("PERMISSION_DENIED");
    });
  });

  it("saves and loads scratch content", async () => {
    await withTempDir(async (dir) => {
      const server = new ScratchToolServer();
      const context = createContext({ workingDirectory: dir, filePermission: "workspace" });

      const saveResult = await server.callTool(
        { name: "save", arguments: { name: "note", content: "hello", type: "text" } },
        context
      );

      expect(saveResult.success).toBe(true);

      const loadResult = await server.callTool(
        { name: "load", arguments: { name: "note" } },
        context
      );

      const text = getText(loadResult);
      expect(loadResult.success).toBe(true);
      expect(text).toContain("hello");
    });
  });

  it("rejects empty names", async () => {
    await withTempDir(async (dir) => {
      const server = new ScratchToolServer();
      const context = createContext({ workingDirectory: dir, filePermission: "workspace" });

      const result = await server.callTool(
        { name: "save", arguments: { name: "   ", content: "data" } },
        context
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("INVALID_ARGUMENTS");
    });
  });

  it("rejects empty content", async () => {
    await withTempDir(async (dir) => {
      const server = new ScratchToolServer();
      const context = createContext({ workingDirectory: dir, filePermission: "workspace" });

      const result = await server.callTool(
        { name: "save", arguments: { name: "note", content: "   " } },
        context
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("INVALID_ARGUMENTS");
    });
  });

  it("truncates large outputs", async () => {
    await withTempDir(async (dir) => {
      const server = new ScratchToolServer();
      const context = createContext({
        workingDirectory: dir,
        filePermission: "workspace",
        maxOutputBytes: 80,
      });

      await server.callTool(
        { name: "save", arguments: { name: "big", content: "x".repeat(500) } },
        context
      );

      const loadResult = await server.callTool(
        { name: "load", arguments: { name: "big" } },
        context
      );

      const text = getText(loadResult);
      expect(text).toContain("Output truncated");
    });
  });
});
