import { SECURITY_PRESETS, type ToolContext } from "@ku0/agent-runtime-core";
import type { gateway } from "@ku0/core";
import { describe, expect, it, vi } from "vitest";
import { LFCCToolServer, MockLFCCBridge } from "../lfccServer";

const readContext: ToolContext = { security: SECURITY_PRESETS.safe };
const writeContext: ToolContext = { security: SECURITY_PRESETS.balanced };

describe("LFCCToolServer", () => {
  it("rejects invalid list_documents parameters", async () => {
    const server = new LFCCToolServer({ bridge: new MockLFCCBridge() });

    const limitResult = await server.callTool(
      { name: "list_documents", arguments: { limit: "10" } },
      readContext
    );
    expect(limitResult.success).toBe(false);
    expect(limitResult.error?.code).toBe("INVALID_ARGUMENTS");

    const sortResult = await server.callTool(
      { name: "list_documents", arguments: { sortBy: "random" } },
      readContext
    );
    expect(sortResult.success).toBe(false);
    expect(sortResult.error?.code).toBe("INVALID_ARGUMENTS");
  });

  it("rejects missing document ids", async () => {
    const server = new LFCCToolServer({ bridge: new MockLFCCBridge() });

    const result = await server.callTool(
      { name: "get_document", arguments: { docId: " " } },
      readContext
    );
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("INVALID_ARGUMENTS");
  });

  it("rejects invalid insert_block inputs", async () => {
    const bridge = new MockLFCCBridge();
    const insertSpy = vi.spyOn(bridge, "insertBlock");
    const server = new LFCCToolServer({ bridge });

    const typeResult = await server.callTool(
      { name: "insert_block", arguments: { docId: "doc", content: "hi", type: "bad" } },
      writeContext
    );
    expect(typeResult.success).toBe(false);
    expect(typeResult.error?.code).toBe("INVALID_ARGUMENTS");
    expect(insertSpy).not.toHaveBeenCalled();

    const afterResult = await server.callTool(
      { name: "insert_block", arguments: { docId: "doc", content: "hi", afterBlockId: 12 } },
      writeContext
    );
    expect(afterResult.success).toBe(false);
    expect(afterResult.error?.code).toBe("INVALID_ARGUMENTS");
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("rejects invalid update_block content", async () => {
    const bridge = new MockLFCCBridge();
    const updateSpy = vi.spyOn(bridge, "updateBlock");
    const server = new LFCCToolServer({ bridge });

    const result = await server.callTool(
      { name: "update_block", arguments: { docId: "doc", blockId: "block", content: 1 } },
      writeContext
    );
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("INVALID_ARGUMENTS");
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("rejects invalid search inputs", async () => {
    const server = new LFCCToolServer({ bridge: new MockLFCCBridge() });

    const queryResult = await server.callTool(
      { name: "search", arguments: { query: " " } },
      readContext
    );
    expect(queryResult.success).toBe(false);
    expect(queryResult.error?.code).toBe("INVALID_ARGUMENTS");

    const limitResult = await server.callTool(
      { name: "search", arguments: { query: "test", limit: 0 } },
      readContext
    );
    expect(limitResult.success).toBe(false);
    expect(limitResult.error?.code).toBe("INVALID_ARGUMENTS");

    const semanticResult = await server.callTool(
      { name: "search", arguments: { query: "test", semantic: "yes" } },
      readContext
    );
    expect(semanticResult.success).toBe(false);
    expect(semanticResult.error?.code).toBe("INVALID_ARGUMENTS");
  });

  it("rejects invalid AI gateway requests before execution", async () => {
    const aiGateway = {
      processRequest: vi.fn(async () => ({
        status: 200,
        server_frontier_tag: "v1",
        diagnostics: [],
      })),
    } as unknown as gateway.AIGateway;

    const server = new LFCCToolServer({ bridge: new MockLFCCBridge(), aiGateway });

    const result = await server.callTool(
      { name: "ai_gateway_request", arguments: { request: { doc_frontier_tag: "v1" } } },
      writeContext
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("INVALID_ARGUMENTS");
    expect(aiGateway.processRequest).not.toHaveBeenCalled();
  });
});
