import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ToolCoordinator } from "@ku0/agent-runtime-tools";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CommandToolServer, CoordinatorToolServerAdapter } from "../tools/workbench/sources";
import type { ToolContext } from "../types";
import { SECURITY_PRESETS } from "../types";

const baseContext: ToolContext = { security: { ...SECURITY_PRESETS.safe } };

const commandScriptLines = [
  "const mode = process.argv[2];",
  "if (mode === 'list') {",
  "  const tools = [{ name: 'echo', description: 'Echo', inputSchema: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'] } }];",
  "  console.log(JSON.stringify(tools));",
  "} else if (mode === 'call') {",
  "  const toolName = process.argv[3] ?? '';",
  "  let input = '';",
  "  process.stdin.on('data', (chunk) => { input += chunk; });",
  "  process.stdin.on('end', () => {",
  "    let args = {};",
  "    if (input.trim()) {",
  "      try { args = JSON.parse(input); } catch {}",
  "    }",
  "    const message = typeof args.message === 'string' ? args.message : '';",
  "    const result = { success: true, content: [{ type: 'text', text: toolName + ':' + message }] };",
  "    console.log(JSON.stringify(result));",
  "  });",
  "} else {",
  "  process.stderr.write('unknown mode');",
  "  process.exit(1);",
  "}",
];

const commandScript = `${commandScriptLines.join("\n")}\n`;

function getMessage(params: unknown): string | undefined {
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    return undefined;
  }
  const record = params as Record<string, unknown>;
  const value = record.message;
  if (typeof value === "string") {
    return value;
  }
  return undefined;
}

describe("CommandToolServer", () => {
  let tempDir = "";
  let scriptPath = "";

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "workbench-"));
    scriptPath = path.join(tempDir, "tool-server.js");
    fs.writeFileSync(scriptPath, commandScript, "utf8");
  });

  afterEach(() => {
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("loads tools from command output and executes calls", async () => {
    const listCommand = `"${process.execPath}" "${scriptPath}" list`;
    const callCommand = `"${process.execPath}" "${scriptPath}" call`;

    const server = new CommandToolServer({
      name: "cmd",
      listCommand,
      callCommand,
      timeoutMs: 2000,
    });

    await server.initialize();
    expect(server.listTools().map((tool) => tool.name)).toEqual(["echo"]);

    const result = await server.callTool(
      { name: "echo", arguments: { message: "hi" } },
      baseContext
    );

    expect(result.success).toBe(true);
    expect(result.content[0]?.text).toBe("echo:hi");
  });
});

describe("CoordinatorToolServerAdapter", () => {
  it("maps coordinator tools and surfaces validation errors", async () => {
    const coordinator = new ToolCoordinator();
    const schema = {
      type: "object",
      properties: { message: { type: "string" } },
      required: ["message"],
    };

    coordinator.register({
      name: "echo",
      description: "Echo message",
      schema,
      validate: (params) => {
        const message = getMessage(params);
        if (!message) {
          return { valid: false, errors: ["message required"] };
        }
        return { valid: true };
      },
      execute: async (params) => {
        const message = getMessage(params) ?? "";
        return `echo:${message}`;
      },
    });

    const adapter = new CoordinatorToolServerAdapter(coordinator);
    const tools = adapter.listTools();

    expect(tools).toHaveLength(1);
    expect(tools[0]?.name).toBe("echo");
    expect(tools[0]?.inputSchema).toEqual(schema);

    const okResult = await adapter.callTool(
      { name: "echo", arguments: { message: "hello" } },
      baseContext
    );

    expect(okResult.success).toBe(true);
    expect(okResult.content[0]?.text).toBe("echo:hello");

    const badResult = await adapter.callTool({ name: "echo", arguments: {} }, baseContext);

    expect(badResult.success).toBe(false);
    expect(badResult.error?.code).toBe("INVALID_ARGUMENTS");
  });
});
