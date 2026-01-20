/**
 * Tool Output Spooling Tests
 */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ToolExecutionPipeline } from "../executor";
import { createPermissionChecker, createSecurityPolicy } from "../security";
import { createFileToolOutputSpooler, FileToolOutputSpooler } from "../spooling";
import type {
  MCPTool,
  MCPToolCall,
  MCPToolResult,
  MCPToolServer,
  ToolContent,
  ToolContext,
} from "../types";

class MockToolRegistry {
  private readonly tool: MCPTool;
  private readonly result: MCPToolResult;

  constructor(toolName: string, result: MCPToolResult) {
    this.tool = {
      name: toolName,
      description: "mock tool",
      inputSchema: { type: "object" },
      annotations: { policyAction: "connector.read" },
    };
    this.result = result;
  }

  listTools(): MCPTool[] {
    return [this.tool];
  }

  async register(_server: MCPToolServer): Promise<void> {
    // no-op
  }

  async unregister(_serverName: string): Promise<void> {
    // no-op
  }

  async callTool(_call: MCPToolCall, _context: ToolContext): Promise<MCPToolResult> {
    return this.result;
  }

  getServer(): MCPToolServer | undefined {
    return undefined;
  }

  hasTool(name: string): boolean {
    return name === this.tool.name;
  }

  resolveToolServer(): string | undefined {
    return undefined;
  }

  on(_event: string, _handler: (event: { type: string }) => void): () => void {
    return () => undefined;
  }
}

describe("FileToolOutputSpooler", () => {
  let tmpRoot: string | undefined;

  afterEach(async () => {
    if (tmpRoot) {
      await rm(tmpRoot, { recursive: true, force: true });
      tmpRoot = undefined;
    }
  });

  it("spools large output with a deterministic record", async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), "tool-spool-"));
    const spooler = new FileToolOutputSpooler({
      rootDir: tmpRoot,
      policy: { maxBytes: 30, maxLines: 2 },
    });
    const content: ToolContent[] = [{ type: "text", text: "line-1\nline-2\nline-3\nline-4" }];

    const result = await spooler.spool({
      toolName: "test:tool",
      toolCallId: "call-1",
      content,
    });

    expect(result.spooled).toBe(true);
    expect(result.metadata?.stored).toBe(true);
    expect(result.metadata?.toolCallId).toBe("call-1");
    expect(result.output.find((item) => item.type === "resource")).toBeDefined();

    const payload = await readFile(result.metadata?.uri ?? "", "utf8");
    const record = JSON.parse(payload) as { content: ToolContent[] };
    expect(record.content).toEqual(content);
  });

  it("spools image payloads into binary resources", async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), "tool-spool-binary-"));
    const spooler = new FileToolOutputSpooler({
      rootDir: tmpRoot,
      policy: { maxBytes: 1, maxLines: 1 },
    });
    const data = Buffer.from("image-bytes").toString("base64");
    const content: ToolContent[] = [{ type: "image", data, mimeType: "image/png" }];

    const result = await spooler.spool({
      toolName: "test:image",
      toolCallId: "call-image",
      content,
    });

    expect(result.spooled).toBe(true);
    expect(result.metadata?.stored).toBe(true);

    const payload = await readFile(result.metadata?.uri ?? "", "utf8");
    const record = JSON.parse(payload) as { content: ToolContent[] };
    const resource = record.content.find((item) => item.type === "resource");
    expect(resource?.type).toBe("resource");

    const binaryPath = resource?.type === "resource" ? resource.uri : "";
    const binary = await readFile(binaryPath);
    expect(binary.equals(Buffer.from(data, "base64"))).toBe(true);
  });
});

describe("ToolExecutionPipeline spooling integration", () => {
  let tmpRoot: string | undefined;

  afterEach(async () => {
    if (tmpRoot) {
      await rm(tmpRoot, { recursive: true, force: true });
      tmpRoot = undefined;
    }
  });

  it("truncates output and references the spool file", async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), "tool-spool-exec-"));
    const registry = new MockToolRegistry("big-output", {
      success: true,
      content: [{ type: "text", text: "alpha\nbeta\ngamma\ndelta\nepsilon\nzeta" }],
    });

    const policy = createSecurityPolicy("balanced");
    const executor = new ToolExecutionPipeline({
      registry,
      policy: createPermissionChecker(policy),
      outputSpooler: createFileToolOutputSpooler({ rootDir: tmpRoot }),
      outputSpoolPolicy: { maxBytes: 40, maxLines: 2 },
    });

    const context: ToolContext = { security: policy };
    const result = await executor.execute(
      { id: "call-99", name: "big-output", arguments: {} },
      context
    );

    expect(result.success).toBe(true);
    const resource = result.content.find((item) => item.type === "resource");
    expect(resource?.type).toBe("resource");
    expect(result.meta?.outputSpool?.toolCallId).toBe("call-99");

    const payload = await readFile(result.meta?.outputSpool?.uri ?? "", "utf8");
    const record = JSON.parse(payload) as { content: ToolContent[] };
    expect(record.content[0]?.type).toBe("text");
  });
});
