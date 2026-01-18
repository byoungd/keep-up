import { gateway } from "@ku0/core";
import { describe, expect, it } from "vitest";
import { createSecurityPolicy } from "../security";
import { createLFCCToolServer } from "../tools/lfcc/lfccServer";
import type { ToolContext } from "../types";

const baseContext: ToolContext = {
  security: createSecurityPolicy("balanced"),
};

function createGatewayFixture() {
  const spanState: gateway.SpanState = {
    span_id: "s1",
    annotation_id: "a1",
    block_id: "b1",
    text: "Hello",
    context_hash: "hash-1",
    is_verified: true,
  };
  const spans = new Map<string, gateway.SpanState>([["s1", spanState]]);
  const provider = gateway.createMockDocumentProvider({
    frontier: "f2",
    spans,
    documents: new Set(["doc-1"]),
  });
  const aiGateway = gateway.createAIGatewayWithDefaults(provider);

  return { aiGateway, provider, spanState, spans };
}

describe("LFCCToolServer AI Gateway", () => {
  it("returns a 409 conflict response for hash mismatch", async () => {
    const { aiGateway, provider } = createGatewayFixture();
    const server = createLFCCToolServer({ aiGateway });

    const request = gateway.createGatewayRequest({
      docId: "doc-1",
      docFrontierTag: provider.getFrontierTag(),
      targetSpans: [
        {
          annotation_id: "a1",
          span_id: "s1",
          if_match_context_hash: "wrong-hash",
        },
      ],
      instructions: "Replace greeting",
      format: "html",
      payload: "Hi",
      requestId: "req-409",
      clientRequestId: "req-409",
      agentId: "agent-1",
    });

    const result = await server.callTool(
      { name: "ai_gateway_request", arguments: { request } },
      baseContext
    );

    expect(result.success).toBe(true);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.status).toBe(409);
    expect(payload.reason).toBe("hash_mismatch");
  });

  it("retries after rebase and returns a successful gateway response", async () => {
    const { aiGateway, provider, spans } = createGatewayFixture();
    const rebaseProvider: gateway.RebaseProvider = {
      async fetchLatest(_docId, _spanIds) {
        return {
          success: true,
          newFrontier: provider.getFrontierTag(),
          updatedSpans: spans,
        };
      },
    };
    const relocationProvider: gateway.RelocationProvider = {
      findByContextHash() {
        return null;
      },
    };

    const server = createLFCCToolServer({
      aiGateway,
      rebaseProvider,
      relocationProvider,
    });

    const request = gateway.createGatewayRequest({
      docId: "doc-1",
      docFrontierTag: "f1",
      targetSpans: [
        {
          annotation_id: "a1",
          span_id: "s1",
          if_match_context_hash: "wrong-hash",
        },
      ],
      instructions: "Replace greeting",
      format: "html",
      payload: "Hi",
      requestId: "req-retry",
      clientRequestId: "req-retry",
      agentId: "agent-1",
    });

    const result = await server.callTool(
      { name: "ai_gateway_request", arguments: { request, retry: { enabled: true } } },
      baseContext
    );

    expect(result.success).toBe(true);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.initial.status).toBe(409);
    expect(payload.retry.success).toBe(true);
    expect(payload.result.status).toBe(200);
  });
});
