import { gateway } from "@ku0/core";
import { describe, expect, it } from "vitest";
import { createSecurityPolicy } from "../security";
import { createLFCCToolServer, type MultiDocumentPolicy } from "../tools/lfcc/lfccServer";
import type { ToolContext } from "../types";

const baseContext: ToolContext = {
  security: createSecurityPolicy("balanced"),
};

function createGatewayFixture(docId: string, frontier: string) {
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
    frontier,
    spans,
    documents: new Set([docId]),
  });
  const aiGateway = gateway.createAIGatewayWithDefaults(provider);

  return { aiGateway, provider };
}

const multiDocPolicy: MultiDocumentPolicy = {
  version: "v1",
  enabled: true,
  max_documents_per_request: 5,
  max_total_ops: 10,
  allowed_atomicity: ["all_or_nothing", "best_effort"],
  allow_atomicity_downgrade: false,
  max_reference_creations: 5,
  require_target_preconditions: true,
  require_citation_preconditions: false,
};

describe("LFCCToolServer multi-document AI Gateway", () => {
  it("returns best-effort results when one document conflicts", async () => {
    const docA = createGatewayFixture("doc-a", "peer-a:1");
    const docB = createGatewayFixture("doc-b", "peer-b:1");

    const server = createLFCCToolServer({
      aiGatewayResolver: (docId) => {
        if (docId === "doc-a") {
          return docA.aiGateway;
        }
        if (docId === "doc-b") {
          return docB.aiGateway;
        }
        return undefined;
      },
      policyDomainResolver: () => "policy-1",
      multiDocumentPolicy: multiDocPolicy,
    });

    const request = {
      request_id: "req-multi-best",
      agent_id: "agent-1",
      intent_id: "intent-1",
      atomicity: "best_effort",
      documents: [
        {
          doc_id: "doc-a",
          role: "target",
          gateway_request: gateway.createGatewayRequest({
            docId: "doc-a",
            docFrontierTag: docA.provider.getFrontierTag(),
            targetSpans: [
              {
                annotation_id: "a1",
                span_id: "s1",
                if_match_context_hash: "hash-1",
              },
            ],
            instructions: "Replace greeting",
            format: "html",
            payload: "Hi",
            requestId: "req-a",
            clientRequestId: "req-a",
            agentId: "agent-1",
          }),
        },
        {
          doc_id: "doc-b",
          role: "target",
          gateway_request: gateway.createGatewayRequest({
            docId: "doc-b",
            docFrontierTag: docB.provider.getFrontierTag(),
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
            requestId: "req-b",
            clientRequestId: "req-b",
            agentId: "agent-1",
          }),
        },
      ],
    };

    const result = await server.callTool(
      { name: "ai_gateway_multi_request", arguments: { request } },
      baseContext
    );

    expect(result.success).toBe(true);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.status).toBe(200);
    const docAResult = payload.results.find(
      (entry: { doc_id: string }) => entry.doc_id === "doc-a"
    );
    const docBResult = payload.results.find(
      (entry: { doc_id: string }) => entry.doc_id === "doc-b"
    );
    expect(docAResult.success).toBe(true);
    expect(docBResult.success).toBe(false);
    expect(docBResult.conflict.code).toBe("AI_PRECONDITION_FAILED");
  });

  it("returns 409 for all-or-nothing when any document conflicts", async () => {
    const docA = createGatewayFixture("doc-a", "peer-a:1");
    const docB = createGatewayFixture("doc-b", "peer-b:1");

    const server = createLFCCToolServer({
      aiGatewayResolver: (docId) => {
        if (docId === "doc-a") {
          return docA.aiGateway;
        }
        if (docId === "doc-b") {
          return docB.aiGateway;
        }
        return undefined;
      },
      policyDomainResolver: () => "policy-1",
      multiDocumentPolicy: multiDocPolicy,
    });

    const request = {
      request_id: "req-multi-all",
      agent_id: "agent-1",
      intent_id: "intent-1",
      atomicity: "all_or_nothing",
      documents: [
        {
          doc_id: "doc-a",
          role: "target",
          gateway_request: gateway.createGatewayRequest({
            docId: "doc-a",
            docFrontierTag: docA.provider.getFrontierTag(),
            targetSpans: [
              {
                annotation_id: "a1",
                span_id: "s1",
                if_match_context_hash: "hash-1",
              },
            ],
            instructions: "Replace greeting",
            format: "html",
            payload: "Hi",
            requestId: "req-a",
            clientRequestId: "req-a",
            agentId: "agent-1",
          }),
        },
        {
          doc_id: "doc-b",
          role: "target",
          gateway_request: gateway.createGatewayRequest({
            docId: "doc-b",
            docFrontierTag: docB.provider.getFrontierTag(),
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
            requestId: "req-b",
            clientRequestId: "req-b",
            agentId: "agent-1",
          }),
        },
      ],
    };

    const result = await server.callTool(
      { name: "ai_gateway_multi_request", arguments: { request } },
      baseContext
    );

    expect(result.success).toBe(true);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.status).toBe(409);
    expect(payload.code).toBe("AI_PRECONDITION_FAILED");
    expect(payload.failed_documents).toHaveLength(1);
  });

  it("treats per-doc request id changes as idempotent", async () => {
    const docA = createGatewayFixture("doc-a", "peer-a:1");
    const server = createLFCCToolServer({
      aiGatewayResolver: (docId) => (docId === "doc-a" ? docA.aiGateway : undefined),
      policyDomainResolver: () => "policy-1",
      multiDocumentPolicy: multiDocPolicy,
    });

    const baseGatewayRequest = gateway.createGatewayRequest({
      docId: "doc-a",
      docFrontierTag: docA.provider.getFrontierTag(),
      targetSpans: [
        {
          annotation_id: "a1",
          span_id: "s1",
          if_match_context_hash: "hash-1",
        },
      ],
      instructions: "Replace greeting",
      format: "html",
      payload: "Hi",
      requestId: "req-a",
      clientRequestId: "req-a",
      agentId: "agent-1",
    });

    const request = {
      request_id: "req-multi-idem",
      agent_id: "agent-1",
      intent_id: "intent-1",
      atomicity: "best_effort",
      documents: [
        {
          doc_id: "doc-a",
          role: "target",
          gateway_request: baseGatewayRequest,
        },
      ],
    };

    const first = await server.callTool(
      { name: "ai_gateway_multi_request", arguments: { request } },
      baseContext
    );
    expect(first.success).toBe(true);
    const firstPayload = JSON.parse(first.content[0].text);
    expect(firstPayload.status).toBe(200);

    const replayRequest = {
      ...request,
      documents: [
        {
          ...request.documents[0],
          gateway_request: {
            ...baseGatewayRequest,
            request_id: "req-a-2",
            client_request_id: "req-a-2",
          },
        },
      ],
    };

    const replay = await server.callTool(
      { name: "ai_gateway_multi_request", arguments: { request: replayRequest } },
      baseContext
    );
    expect(replay.success).toBe(true);
    const replayPayload = JSON.parse(replay.content[0].text);
    expect(replayPayload.status).toBe(200);
    expect(replayPayload.operation_id).toBe(firstPayload.operation_id);
  });

  it("rejects per-doc agent_id overrides", async () => {
    const docA = createGatewayFixture("doc-a", "peer-a:1");
    const server = createLFCCToolServer({
      aiGatewayResolver: (docId) => (docId === "doc-a" ? docA.aiGateway : undefined),
      policyDomainResolver: () => "policy-1",
      multiDocumentPolicy: multiDocPolicy,
    });

    const request = {
      request_id: "req-multi-agent",
      agent_id: "agent-1",
      intent_id: "intent-1",
      atomicity: "best_effort",
      documents: [
        {
          doc_id: "doc-a",
          role: "target",
          gateway_request: gateway.createGatewayRequest({
            docId: "doc-a",
            docFrontierTag: docA.provider.getFrontierTag(),
            targetSpans: [
              {
                annotation_id: "a1",
                span_id: "s1",
                if_match_context_hash: "hash-1",
              },
            ],
            instructions: "Replace greeting",
            format: "html",
            payload: "Hi",
            requestId: "req-a",
            clientRequestId: "req-a",
            agentId: "agent-2",
          }),
        },
      ],
    };

    const result = await server.callTool(
      { name: "ai_gateway_multi_request", arguments: { request } },
      baseContext
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("INVALID_ARGUMENTS");
  });

  it("counts gateway_request spans even when ops_xml undercounts", async () => {
    const docA = createGatewayFixture("doc-a", "peer-a:1");
    const server = createLFCCToolServer({
      aiGatewayResolver: (docId) => (docId === "doc-a" ? docA.aiGateway : undefined),
      policyDomainResolver: () => "policy-1",
      multiDocumentPolicy: { ...multiDocPolicy, max_total_ops: 1 },
    });

    const request = {
      request_id: "req-multi-ops",
      agent_id: "agent-1",
      intent_id: "intent-1",
      atomicity: "best_effort",
      documents: [
        {
          doc_id: "doc-a",
          role: "target",
          ops_xml: '<replace_spans><span span_id="s1"></span></replace_spans>',
          gateway_request: gateway.createGatewayRequest({
            docId: "doc-a",
            docFrontierTag: docA.provider.getFrontierTag(),
            targetSpans: [
              {
                annotation_id: "a1",
                span_id: "s1",
                if_match_context_hash: "hash-1",
              },
              {
                annotation_id: "a1",
                span_id: "s2",
                if_match_context_hash: "hash-2",
              },
            ],
            instructions: "Replace greeting",
            format: "html",
            payload: "Hi",
            requestId: "req-a",
            clientRequestId: "req-a",
            agentId: "agent-1",
          }),
        },
      ],
    };

    const result = await server.callTool(
      { name: "ai_gateway_multi_request", arguments: { request } },
      baseContext
    );

    expect(result.success).toBe(true);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.status).toBe(400);
    expect(payload.code).toBe("AI_MULTI_DOCUMENT_LIMIT_EXCEEDED");
  });
});
