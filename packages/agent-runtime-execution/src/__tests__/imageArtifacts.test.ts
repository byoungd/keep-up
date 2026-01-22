/**
 * Image artifact storage tests.
 */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createArtifactPipeline,
  createArtifactRegistry,
  createImageArtifactStore,
} from "@ku0/agent-runtime-persistence/artifacts";
import { afterEach, describe, expect, it } from "vitest";
import { ToolExecutionPipeline } from "../executor";
import { createPermissionChecker, createSecurityPolicy } from "../security";
import type { MCPTool, MCPToolCall, MCPToolResult, MCPToolServer, ToolContext } from "../types";

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

describe("ImageArtifactStore", () => {
  let tmpRoot: string | undefined;

  afterEach(async () => {
    if (tmpRoot) {
      await rm(tmpRoot, { recursive: true, force: true });
      tmpRoot = undefined;
    }
  });

  it("stores image artifacts and returns a resource", async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), "image-artifacts-"));
    const registry = createArtifactRegistry();
    const pipeline = createArtifactPipeline({ registry });
    const store = createImageArtifactStore({ pipeline, rootDir: tmpRoot });
    const data = Buffer.from("image-bytes").toString("base64");

    const result = await store.store({
      data,
      mimeType: "image/png",
      title: "Test image",
      sourceTool: "computer:screenshot",
    });

    expect(result.stored).toBe(true);
    expect(result.resource?.type).toBe("resource");
    const stored = registry.list().find((artifact) => artifact.type === "ImageArtifact");
    expect(stored).toBeDefined();

    const uri = result.resource?.type === "resource" ? result.resource.uri : "";
    const buffer = await readFile(uri);
    expect(buffer.equals(Buffer.from(data, "base64"))).toBe(true);
  });

  it("enforces image size limits", async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), "image-artifacts-limit-"));
    const registry = createArtifactRegistry();
    const pipeline = createArtifactPipeline({ registry });
    const store = createImageArtifactStore({
      pipeline,
      rootDir: tmpRoot,
      policy: { maxBytes: 1, allowedMimeTypes: ["image/png"] },
    });
    const data = Buffer.from("too-large").toString("base64");

    const result = await store.store({
      data,
      mimeType: "image/png",
      title: "Too large",
    });

    expect(result.stored).toBe(false);
    expect(result.skippedReason).toContain("Image exceeds max size");
  });
});

describe("ToolExecutionPipeline image artifacts", () => {
  let tmpRoot: string | undefined;

  afterEach(async () => {
    if (tmpRoot) {
      await rm(tmpRoot, { recursive: true, force: true });
      tmpRoot = undefined;
    }
  });

  it("replaces image content with stored resources", async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), "tool-image-artifacts-"));
    const registry = createArtifactRegistry();
    const pipeline = createArtifactPipeline({ registry });
    const store = createImageArtifactStore({ pipeline, rootDir: tmpRoot });
    const data = Buffer.from("image-bytes").toString("base64");
    const toolResult: MCPToolResult = {
      success: true,
      content: [{ type: "image", data, mimeType: "image/png" }],
    };

    const registryMock = new MockToolRegistry("image_tool", toolResult);
    const security = createSecurityPolicy("balanced");
    const executor = new ToolExecutionPipeline({
      registry: registryMock,
      policy: createPermissionChecker(security),
      imageArtifactStore: store,
      outputSpoolingEnabled: false,
    });

    const context: ToolContext = { security };
    const result = await executor.execute(
      { id: "call-image", name: "image_tool", arguments: {} },
      context
    );

    expect(result.success).toBe(true);
    expect(result.content[0]?.type).toBe("resource");
    expect(registry.list().some((artifact) => artifact.type === "ImageArtifact")).toBe(true);
  });
});
