/**
 * PlanToolServer tests
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { MCPToolResult, ToolContext } from "@ku0/agent-runtime-core";
import { SECURITY_PRESETS } from "@ku0/agent-runtime-core";
import { describe, expect, it } from "vitest";
import { createPlanPersistence } from "../orchestrator/planPersistence";
import { PlanToolServer } from "../tools/core/plan";

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
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "plan-tool-"));
  try {
    return await run(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

describe("PlanToolServer", () => {
  it("denies save when file writes are not allowed", async () => {
    await withTempDir(async (dir) => {
      const persistence = createPlanPersistence({ workingDirectory: dir });
      const server = new PlanToolServer({ persistence });
      const context = createContext({ workingDirectory: dir, filePermission: "read" });

      const result = await server.callTool(
        { name: "save", arguments: { goal: "Goal", steps: [{ description: "Step" }] } },
        context
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("PERMISSION_DENIED");
    });
  });

  it("saves and loads plans with write permission", async () => {
    await withTempDir(async (dir) => {
      const persistence = createPlanPersistence({ workingDirectory: dir });
      const server = new PlanToolServer({ persistence });
      const context = createContext({ workingDirectory: dir, filePermission: "workspace" });

      const saveResult = await server.callTool(
        { name: "save", arguments: { goal: "Goal", steps: [{ description: "Step" }] } },
        context
      );

      expect(saveResult.success).toBe(true);

      const loadResult = await server.callTool({ name: "load", arguments: {} }, context);
      const text = getText(loadResult);

      expect(loadResult.success).toBe(true);
      expect(text).toContain("# Goal");
    });
  });

  it("truncates large outputs", async () => {
    await withTempDir(async (dir) => {
      const persistence = createPlanPersistence({ workingDirectory: dir });
      const server = new PlanToolServer({ persistence });
      const context = createContext({
        workingDirectory: dir,
        filePermission: "workspace",
        maxOutputBytes: 80,
      });

      const steps = Array.from({ length: 20 }, (_, i) => ({ description: `Step ${i + 1}` }));
      await server.callTool({ name: "save", arguments: { goal: "Goal", steps } }, context);

      const loadResult = await server.callTool({ name: "load", arguments: {} }, context);
      const text = getText(loadResult);

      expect(text).toContain("Output truncated");
    });
  });
});
