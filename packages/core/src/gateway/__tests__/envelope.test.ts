/**
 * LFCC v0.9 RC - AI Gateway Envelope Tests
 */

import { describe, expect, it } from "vitest";
import {
  createGateway409,
  createGatewayError,
  createGatewayRequest,
  createGatewayResponse,
  createTargetSpan,
  isGateway409,
  isGatewayError,
  isGatewaySuccess,
  normalizeGatewayRequest,
  parseGatewayRequest,
  validateGatewayRequest,
} from "../envelope.js";
import type { AIGatewayRequest } from "../types.js";

describe("AI Gateway Envelope", () => {
  describe("createGatewayRequest", () => {
    it("creates a valid request envelope", () => {
      const request = createGatewayRequest({
        docId: "doc123",
        docFrontierTag: "frontier:abc",
        targetSpans: [{ annotation_id: "a1", span_id: "s1", if_match_context_hash: "sha256:xyz" }],
        instructions: "Fix the typo",
        format: "canonical_fragment",
      });

      expect(request.doc_id).toBe("doc123");
      expect(request.doc_frontier_tag).toBe("frontier:abc");
      expect(request.doc_frontier).toBe("frontier:abc");
      expect(request.target_spans).toHaveLength(1);
      expect(request.instructions).toBe("Fix the typo");
      expect(request.format).toBe("canonical_fragment");
    });

    it("includes optional fields when provided", () => {
      const request = createGatewayRequest({
        docId: "doc123",
        docFrontierTag: "frontier:abc",
        targetSpans: [],
        instructions: "Test",
        format: "html",
        model: "gpt-4",
        payload: "<p>Hello</p>",
        requestId: "req-123",
        clientRequestId: "legacy-123",
        returnCanonicalTree: true,
        policyContext: { policy_id: "policy-1", redaction_profile: "strict" },
      });

      expect(request.model).toBe("gpt-4");
      expect(request.payload).toBe("<p>Hello</p>");
      expect(request.request_id).toBe("req-123");
      expect(request.client_request_id).toBe("legacy-123");
      expect(request.options?.return_canonical_tree).toBe(true);
      expect(request.policy_context?.policy_id).toBe("policy-1");
    });

    it("accepts canonical doc_frontier and normalizes legacy field", () => {
      const request = createGatewayRequest({
        docId: "doc123",
        docFrontier: "frontier:canonical",
        targetSpans: [],
        instructions: "Test",
        format: "html",
        requestId: "req-1",
      });

      expect(request.doc_frontier).toBe("frontier:canonical");
      expect(request.doc_frontier_tag).toBe("frontier:canonical");
    });
  });

  describe("createTargetSpan", () => {
    it("creates a target span with precondition", () => {
      const span = createTargetSpan("ann-1", "span-1", "sha256:abc123");

      expect(span.annotation_id).toBe("ann-1");
      expect(span.span_id).toBe("span-1");
      expect(span.if_match_context_hash).toBe("sha256:abc123");
    });
  });

  describe("createGatewayResponse", () => {
    it("creates a successful response", () => {
      const response = createGatewayResponse({
        serverFrontierTag: "frontier:xyz",
        requestId: "req-123",
        clientRequestId: "legacy-123",
      });

      expect(response.status).toBe(200);
      expect(response.server_frontier_tag).toBe("frontier:xyz");
      expect(response.server_doc_frontier).toBe("frontier:xyz");
      expect(response.request_id).toBe("req-123");
      expect(response.client_request_id).toBe("legacy-123");
      expect(response.diagnostics).toEqual([]);
    });

    it("includes canonical fragment when provided", () => {
      const canonFragment = { id: "1", type: "paragraph", attrs: {}, children: [] };
      const response = createGatewayResponse({
        serverFrontierTag: "frontier:xyz",
        serverDocFrontier: "frontier:new",
        canonFragment,
      });

      expect(response.canon_fragment).toEqual(canonFragment);
      expect(response.server_doc_frontier).toBe("frontier:new");
    });

    it("includes apply plan when provided", () => {
      const applyPlan = {
        operations: [{ type: "replace" as const, span_id: "s1" }],
        affected_block_ids: ["b1"],
        estimated_size_bytes: 100,
      };
      const response = createGatewayResponse({
        serverFrontierTag: "frontier:xyz",
        applyPlan,
      });

      expect(response.apply_plan).toEqual(applyPlan);
    });
  });

  describe("createGateway409", () => {
    it("creates a 409 conflict response", () => {
      const response = createGateway409({
        reason: "hash_mismatch",
        serverFrontierTag: "frontier:xyz",
        serverDocFrontier: "frontier:new",
        failedPreconditions: [{ span_id: "s1", annotation_id: "a1", reason: "hash_mismatch" }],
        message: "Content has changed",
        requestId: "req-123",
      });

      expect(response.status).toBe(409);
      expect(response.reason).toBe("hash_mismatch");
      expect(response.server_frontier_tag).toBe("frontier:xyz");
      expect(response.server_doc_frontier).toBe("frontier:new");
      expect(response.failed_preconditions).toHaveLength(1);
      expect(response.message).toBe("Content has changed");
    });
  });

  describe("createGatewayError", () => {
    it("creates an error response", () => {
      const response = createGatewayError({
        status: 400,
        code: "INVALID_REQUEST",
        message: "Missing required field",
        requestId: "req-123",
      });

      expect(response.status).toBe(400);
      expect(response.code).toBe("INVALID_REQUEST");
      expect(response.message).toBe("Missing required field");
    });

    it("supports various status codes", () => {
      const statuses = [400, 401, 403, 500, 503] as const;
      for (const status of statuses) {
        const response = createGatewayError({
          status,
          code: "TEST",
          message: "Test",
        });
        expect(response.status).toBe(status);
      }
    });
  });

  describe("Type Guards", () => {
    it("isGatewaySuccess identifies 200 responses", () => {
      const success = createGatewayResponse({ serverFrontierTag: "f" });
      const conflict = createGateway409({
        reason: "hash_mismatch",
        serverFrontierTag: "f",
        failedPreconditions: [],
        message: "test",
      });
      const error = createGatewayError({ status: 400, code: "E", message: "m" });

      expect(isGatewaySuccess(success)).toBe(true);
      expect(isGatewaySuccess(conflict)).toBe(false);
      expect(isGatewaySuccess(error)).toBe(false);
    });

    it("isGateway409 identifies conflict responses", () => {
      const success = createGatewayResponse({ serverFrontierTag: "f" });
      const conflict = createGateway409({
        reason: "hash_mismatch",
        serverFrontierTag: "f",
        failedPreconditions: [],
        message: "test",
      });
      const error = createGatewayError({ status: 400, code: "E", message: "m" });

      expect(isGateway409(success)).toBe(false);
      expect(isGateway409(conflict)).toBe(true);
      expect(isGateway409(error)).toBe(false);
    });

    it("isGatewayError identifies error responses", () => {
      const success = createGatewayResponse({ serverFrontierTag: "f" });
      const conflict = createGateway409({
        reason: "hash_mismatch",
        serverFrontierTag: "f",
        failedPreconditions: [],
        message: "test",
      });
      const error = createGatewayError({ status: 400, code: "E", message: "m" });

      expect(isGatewayError(success)).toBe(false);
      expect(isGatewayError(conflict)).toBe(false);
      expect(isGatewayError(error)).toBe(true);
    });
  });

  describe("validateGatewayRequest", () => {
    it("returns empty array for valid request", () => {
      const request = {
        doc_id: "doc123",
        doc_frontier_tag: "frontier:abc",
        target_spans: [{ annotation_id: "a1", span_id: "s1", if_match_context_hash: "sha256:xyz" }],
        instructions: "Fix typo",
        format: "canonical_fragment",
        request_id: "req-123",
      };

      const errors = validateGatewayRequest(request);
      expect(errors).toHaveLength(0);
    });

    it("validates required fields", () => {
      const errors = validateGatewayRequest({});

      expect(errors.some((e) => e.field === "doc_id")).toBe(true);
      expect(errors.some((e) => e.field === "doc_frontier")).toBe(true);
      expect(errors.some((e) => e.field === "target_spans")).toBe(true);
      expect(errors.some((e) => e.field === "instructions")).toBe(true);
      expect(errors.some((e) => e.field === "format")).toBe(true);
      expect(errors.some((e) => e.field === "request_id")).toBe(true);
    });

    it("validates target_spans structure", () => {
      const request = {
        doc_id: "doc123",
        doc_frontier_tag: "frontier:abc",
        target_spans: [{ invalid: true }],
        instructions: "Test",
        format: "html",
        request_id: "req-123",
      };

      const errors = validateGatewayRequest(request);
      expect(errors.some((e) => e.field.includes("annotation_id"))).toBe(true);
      expect(errors.some((e) => e.field.includes("span_id"))).toBe(true);
      expect(errors.some((e) => e.field.includes("if_match_context_hash"))).toBe(true);
    });

    it("accepts v1 preconditions without target_spans", () => {
      const request = {
        doc_id: "doc123",
        doc_frontier_tag: "frontier:abc",
        preconditions: [
          {
            v: 1,
            span_id: "s1",
            block_id: "b1",
            hard: { context_hash: "sha256:xyz" },
          },
        ],
        instructions: "Test",
        format: "html",
        request_id: "req-123",
      };

      const errors = validateGatewayRequest(request);
      expect(errors.some((e) => e.field === "target_spans")).toBe(false);
      expect(errors).toHaveLength(0);
    });

    it("validates format enum", () => {
      const request = {
        doc_id: "doc123",
        doc_frontier_tag: "frontier:abc",
        target_spans: [],
        instructions: "Test",
        format: "invalid_format",
        request_id: "req-123",
      };

      const errors = validateGatewayRequest(request);
      expect(errors.some((e) => e.field === "format")).toBe(true);
    });

    it("rejects non-object input", () => {
      expect(validateGatewayRequest(null)).toHaveLength(1);
      expect(validateGatewayRequest("string")).toHaveLength(1);
      expect(validateGatewayRequest(123)).toHaveLength(1);
    });

    it("accepts canonical doc_frontier without legacy tag", () => {
      const errors = validateGatewayRequest({
        doc_id: "doc123",
        doc_frontier: "f:1",
        target_spans: [],
        instructions: "Test",
        format: "html",
        request_id: "req-123",
      });

      expect(errors).toHaveLength(0);
    });

    it("rejects empty policy_context.policy_id", () => {
      const errors = validateGatewayRequest({
        doc_id: "doc123",
        doc_frontier: "f:1",
        target_spans: [],
        instructions: "Test",
        format: "html",
        request_id: "req-123",
        policy_context: { policy_id: "" },
      });

      expect(errors.some((e) => e.field === "policy_context.policy_id")).toBe(true);
    });
  });

  describe("parseGatewayRequest", () => {
    it("returns typed request for valid input", () => {
      const input = {
        doc_id: "doc123",
        doc_frontier_tag: "frontier:abc",
        target_spans: [],
        instructions: "Test",
        format: "html",
        request_id: "req-123",
      };

      const result = parseGatewayRequest(input);
      expect(result).not.toBeNull();
      expect(result?.doc_id).toBe("doc123");
    });

    it("returns null for invalid input", () => {
      const result = parseGatewayRequest({ invalid: true });
      expect(result).toBeNull();
    });

    it("normalizes doc_frontier and request ids", () => {
      const input = {
        doc_id: "doc123",
        doc_frontier: "frontier:canonical",
        target_spans: [],
        instructions: "Test",
        format: "html",
        client_request_id: "legacy-1",
      };

      const result = parseGatewayRequest(input);
      expect(result?.doc_frontier_tag).toBe("frontier:canonical");
      expect(result?.request_id).toBe("legacy-1");
    });
  });

  describe("normalizeGatewayRequest", () => {
    it("fills missing canonical fields", () => {
      const normalized = normalizeGatewayRequest({
        doc_id: "doc1",
        doc_frontier_tag: "f1",
        instructions: "x",
        format: "html",
        client_request_id: "legacy-req",
      } as AIGatewayRequest);

      expect(normalized.doc_frontier).toBe("f1");
      expect(normalized.request_id).toBe("legacy-req");
      expect(normalized.target_spans).toEqual([]);
    });
  });
});
