import type { AIEnvelopeResponse, ReferenceStore } from "@ku0/core";
import { documentId, gateway } from "@ku0/core";
import { describe, expect, it } from "vitest";
import { createSecurityPolicy } from "../security";
import {
  type AIEnvelopeGateway,
  createLFCCToolServer,
  type MultiDocumentPolicy,
} from "../tools/lfcc/lfccServer";
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

function createEnvelopeGateway(): AIEnvelopeGateway {
  return {
    async processRequest(request): Promise<AIEnvelopeResponse> {
      const conflict = request.preconditions.find((pre) => pre.span_id === "s2");
      if (conflict) {
        return {
          status: 409,
          code: "CONFLICT",
          current_frontier: request.doc_frontier,
          failed_preconditions: [{ span_id: conflict.span_id, reason: "hash_mismatch" }],
          diagnostics: [],
        };
      }
      return {
        status: 200,
        applied_frontier: request.doc_frontier,
        diagnostics: [],
      };
    },
  };
}

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

  it("supports ops_xml targets via AI envelope gateway", async () => {
    const server = createLFCCToolServer({
      aiEnvelopeGateway: createEnvelopeGateway(),
      policyDomainResolver: () => "policy-1",
      multiDocumentPolicy: multiDocPolicy,
    });

    const request = {
      request_id: "req-multi-envelope",
      agent_id: "agent-1",
      intent_id: "intent-1",
      atomicity: "best_effort",
      documents: [
        {
          doc_id: "doc-a",
          role: "target",
          doc_frontier_tag: "peer-a:1",
          ops_xml: '<replace_spans annotation="anno-a"><span span_id="s1"/></replace_spans>',
          preconditions: [{ span_id: "s1", if_match_context_hash: "hash-1" }],
        },
        {
          doc_id: "doc-b",
          role: "target",
          doc_frontier_tag: "peer-b:1",
          ops_xml: '<replace_spans annotation="anno-b"><span span_id="s2"/></replace_spans>',
          preconditions: [{ span_id: "s2", if_match_context_hash: "hash-2" }],
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
    expect(docAResult.operations_applied).toBe(1);
    expect(docBResult.success).toBe(false);
    expect(docBResult.conflict.code).toBe("AI_PRECONDITION_FAILED");
    expect(docBResult.conflict.failed_preconditions[0].reason).toBe("hash_mismatch");
  });

  it("reports reference conflicts for non-target documents in best-effort mode", async () => {
    const docA = createGatewayFixture("doc-a", "peer-a:1");
    const docB = createGatewayFixture("doc-b", "peer-b:1");

    const referenceStore: ReferenceStore = {
      async createReference(record) {
        if (record.source.doc_id === documentId("doc-b")) {
          const error = new Error("hash mismatch") as Error & { code?: string };
          error.code = "REF_CONTEXT_HASH_MISMATCH";
          throw error;
        }
      },
      async updateReferenceStatus() {
        return;
      },
      async refreshVerification() {
        return true;
      },
      getReference() {
        return undefined;
      },
      getReferencesFromDoc() {
        return [];
      },
      getReferencesToDoc() {
        return [];
      },
      exportUpdates() {
        return new Uint8Array();
      },
      importUpdates() {
        return;
      },
      getFrontier() {
        return { loro_frontier: [] };
      },
    };

    const server = createLFCCToolServer({
      aiGatewayResolver: (docId) => {
        if (docId === "doc-a") {
          return docA.aiGateway;
        }
        return undefined;
      },
      policyDomainResolver: () => "policy-1",
      multiDocumentPolicy: multiDocPolicy,
      referenceStore,
    });

    const request = {
      request_id: "req-multi-ref",
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
          role: "source",
          doc_frontier_tag: docB.provider.getFrontierTag(),
        },
      ],
      references: [
        {
          ref_type: "citation",
          source: {
            doc_id: documentId("doc-b"),
            block_id: "block-a",
            start: { anchor: "anchor-start", bias: "right" },
            end: { anchor: "anchor-end", bias: "left" },
            if_match_context_hash: "hash-a",
          },
          target: {
            doc_id: documentId("doc-a"),
            block_id: "block-b",
            anchor: { anchor: "anchor-target", bias: "right" },
          },
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
    const docBResult = payload.results.find(
      (entry: { doc_id: string }) => entry.doc_id === "doc-b"
    );
    expect(docBResult.success).toBe(false);
    expect(docBResult.conflict.failed_references).toHaveLength(1);
    expect(docBResult.conflict.failed_references[0].ref_index).toBe(0);
  });
});
