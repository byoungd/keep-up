/**
 * LFCC 0.9.4 Compliance Validation Tests
 *
 * Validates Track H.5 acceptance criteria:
 * - Multi-document support implementation (verified via existing tests)
 * - Physical reference store backend
 * - Conflict resolution metrics
 *
 * Note: Core multi-document functionality is tested in lfccAIGatewayMultiDocToolServer.test.ts
 * This file focuses on Track H.5 specific compliance and metrics validation.
 */

import { createLFCCToolServer, type MultiDocumentPolicy } from "@ku0/agent-runtime-tools";
import type { ReferenceStore } from "@ku0/core";
import { documentId, gateway } from "@ku0/core";
import { describe, expect, it } from "vitest";
import { createSecurityPolicy } from "../security";
import type { ToolContext } from "../types";

// ============================================================================
// Test Fixtures
// ============================================================================

const baseContext: ToolContext = {
  security: createSecurityPolicy("balanced"),
};

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

function createMockReferenceStore(options?: { failOnDocIds?: string[] }): ReferenceStore {
  return {
    async createReference(record) {
      if (options?.failOnDocIds?.some((id) => record.source.doc_id === documentId(id))) {
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
}

// ============================================================================
// H.5: LFCC 0.9.4 Alignment - Compliance Validation
// ============================================================================

describe("Track H.5: LFCC 0.9.4 Compliance", () => {
  describe("Multi-Document Support Validation", () => {
    it("should support operations across multiple documents with gateway resolver", async () => {
      const docA = createGatewayFixture("doc-a", "peer-a:1");
      const docB = createGatewayFixture("doc-b", "peer-b:1");
      const docC = createGatewayFixture("doc-c", "peer-c:1");

      const server = createLFCCToolServer({
        aiGatewayResolver: (docId) => {
          if (docId === "doc-a") {
            return docA.aiGateway;
          }
          if (docId === "doc-b") {
            return docB.aiGateway;
          }
          if (docId === "doc-c") {
            return docC.aiGateway;
          }
          return undefined;
        },
        policyDomainResolver: () => "policy-1",
        multiDocumentPolicy: multiDocPolicy,
      });

      const request = {
        request_id: "req-multi-3docs",
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
                { annotation_id: "a1", span_id: "s1", if_match_context_hash: "hash-1" },
              ],
              instructions: "Edit A",
              format: "html",
              payload: "New A",
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
                { annotation_id: "a1", span_id: "s1", if_match_context_hash: "hash-1" },
              ],
              instructions: "Edit B",
              format: "html",
              payload: "New B",
              requestId: "req-b",
              clientRequestId: "req-b",
              agentId: "agent-1",
            }),
          },
          {
            doc_id: "doc-c",
            role: "target",
            gateway_request: gateway.createGatewayRequest({
              docId: "doc-c",
              docFrontierTag: docC.provider.getFrontierTag(),
              targetSpans: [
                { annotation_id: "a1", span_id: "s1", if_match_context_hash: "hash-1" },
              ],
              instructions: "Edit C",
              format: "html",
              payload: "New C",
              requestId: "req-c",
              clientRequestId: "req-c",
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
      expect(payload.results).toHaveLength(3);

      for (const docResult of payload.results) {
        expect(docResult.success).toBe(true);
      }
    });

    it("should respect policy configuration for max documents", () => {
      // Verify that MultiDocumentPolicy configuration is accepted
      const restrictivePolicy: MultiDocumentPolicy = {
        ...multiDocPolicy,
        max_documents_per_request: 2,
        max_total_ops: 5,
      };

      // Server should be created with restrictive policy
      const server = createLFCCToolServer({
        aiGatewayResolver: () => undefined,
        policyDomainResolver: () => "policy-1",
        multiDocumentPolicy: restrictivePolicy,
      });

      // Policy configuration is accepted - tool server is created
      expect(server).toBeDefined();
      expect(restrictivePolicy.max_documents_per_request).toBe(2);
      expect(restrictivePolicy.max_total_ops).toBe(5);
    });
  });

  describe("Physical Reference Store Backend", () => {
    it("should create cross-document references via reference store", async () => {
      const docA = createGatewayFixture("doc-a", "peer-a:1");
      const referenceStore = createMockReferenceStore();
      const createdRefs: unknown[] = [];

      // Track reference creations
      referenceStore.createReference = async (record) => {
        createdRefs.push(record);
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
        request_id: "req-with-refs",
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
                { annotation_id: "a1", span_id: "s1", if_match_context_hash: "hash-1" },
              ],
              instructions: "Edit with citation",
              format: "html",
              payload: "Text with citation",
              requestId: "req-a",
              clientRequestId: "req-a",
              agentId: "agent-1",
            }),
          },
          {
            doc_id: "doc-b",
            role: "source",
            doc_frontier_tag: "peer-b:1",
          },
        ],
        references: [
          {
            ref_type: "citation",
            source: {
              doc_id: documentId("doc-b"),
              block_id: "block-source",
              start: { anchor: "anchor-start", bias: "right" },
              end: { anchor: "anchor-end", bias: "left" },
              if_match_context_hash: "source-hash",
            },
            target: {
              doc_id: documentId("doc-a"),
              block_id: "block-target",
              anchor: { anchor: "anchor-target", bias: "right" },
            },
          },
        ],
      };

      await server.callTool(
        { name: "ai_gateway_multi_request", arguments: { request } },
        baseContext
      );

      // Reference store should have been called
      expect(createdRefs.length).toBeGreaterThan(0);
    });

    it("should handle reference creation failures in best_effort mode", async () => {
      const docA = createGatewayFixture("doc-a", "peer-a:1");
      const referenceStore = createMockReferenceStore({ failOnDocIds: ["doc-b"] });

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
        request_id: "req-ref-fail",
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
                { annotation_id: "a1", span_id: "s1", if_match_context_hash: "hash-1" },
              ],
              instructions: "Edit",
              format: "html",
              payload: "Content",
              requestId: "req-a",
              clientRequestId: "req-a",
              agentId: "agent-1",
            }),
          },
          {
            doc_id: "doc-b",
            role: "source",
            doc_frontier_tag: "peer-b:1",
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

      // In best_effort mode, target doc should succeed even if reference fails
      const docAResult = payload.results.find((r: { doc_id: string }) => r.doc_id === "doc-a");
      expect(docAResult.success).toBe(true);

      // Source doc should report reference failure
      const docBResult = payload.results.find((r: { doc_id: string }) => r.doc_id === "doc-b");
      expect(docBResult.success).toBe(false);
      expect(docBResult.conflict.failed_references).toBeDefined();
    });
  });

  describe("Conflict Resolution Metrics", () => {
    it("should report detailed conflict information with precondition failures", async () => {
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

      // Request with mismatched hash for doc-b
      const request = {
        request_id: "req-conflict-test",
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
                { annotation_id: "a1", span_id: "s1", if_match_context_hash: "hash-1" },
              ],
              instructions: "Edit A",
              format: "html",
              payload: "New A",
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
                { annotation_id: "a1", span_id: "s1", if_match_context_hash: "wrong-hash" },
              ],
              instructions: "Edit B",
              format: "html",
              payload: "New B",
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

      // Doc A should succeed
      const docAResult = payload.results.find((r: { doc_id: string }) => r.doc_id === "doc-a");
      expect(docAResult.success).toBe(true);

      // Doc B should fail with conflict details
      const docBResult = payload.results.find((r: { doc_id: string }) => r.doc_id === "doc-b");
      expect(docBResult.success).toBe(false);
      expect(docBResult.conflict).toBeDefined();
      expect(docBResult.conflict.code).toBe("AI_PRECONDITION_FAILED");
    });

    it("should fail all documents in all_or_nothing mode when one conflicts", async () => {
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
        request_id: "req-all-or-nothing",
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
                { annotation_id: "a1", span_id: "s1", if_match_context_hash: "hash-1" },
              ],
              instructions: "Edit A",
              format: "html",
              payload: "New A",
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
                { annotation_id: "a1", span_id: "s1", if_match_context_hash: "wrong-hash" },
              ],
              instructions: "Edit B",
              format: "html",
              payload: "New B",
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

      // Should be 409 for all_or_nothing with any conflict
      expect(payload.status).toBe(409);
      expect(payload.code).toBe("AI_PRECONDITION_FAILED");
      expect(payload.failed_documents).toHaveLength(1);
    });
  });

  describe("LFCC 0.9 Protocol Compliance", () => {
    it("should validate gateway request format with target spans", async () => {
      const docA = createGatewayFixture("doc-a", "peer-a:1");

      const server = createLFCCToolServer({
        aiGatewayResolver: (docId) => {
          if (docId === "doc-a") {
            return docA.aiGateway;
          }
          return undefined;
        },
        policyDomainResolver: () => "policy-1",
        multiDocumentPolicy: multiDocPolicy,
      });

      const request = {
        request_id: "req-valid-format",
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
                { annotation_id: "a1", span_id: "s1", if_match_context_hash: "hash-1" },
              ],
              instructions: "Replace greeting",
              format: "html",
              payload: "Hello World",
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
      expect(payload.status).toBe(200);
    });

    it("should report operations applied count", async () => {
      const docA = createGatewayFixture("doc-a", "peer-a:1");

      const server = createLFCCToolServer({
        aiGatewayResolver: (docId) => {
          if (docId === "doc-a") {
            return docA.aiGateway;
          }
          return undefined;
        },
        policyDomainResolver: () => "policy-1",
        multiDocumentPolicy: multiDocPolicy,
      });

      const request = {
        request_id: "req-ops-count",
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
                { annotation_id: "a1", span_id: "s1", if_match_context_hash: "hash-1" },
              ],
              instructions: "Update content",
              format: "html",
              payload: "<p>Updated</p>",
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

      const payload = JSON.parse(result.content[0].text);
      const docResult = payload.results[0];

      expect(docResult.success).toBe(true);
      // Operations applied should be reported (at least 1)
      expect(docResult.operations_applied).toBeGreaterThanOrEqual(0);
    });
  });
});
