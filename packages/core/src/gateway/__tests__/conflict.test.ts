/**
 * LFCC v0.9 RC - AI Gateway Conflict Safety Tests
 */

import { describe, expect, it } from "vitest";
import {
  checkAllPreconditions,
  checkConflicts,
  checkFrontier,
  checkSpanPrecondition,
  createConflictMiddleware,
  createMockDocumentProvider,
} from "../conflict.js";
import type { AIGatewayRequest, SpanState, TargetSpan } from "../types.js";

describe("AI Gateway Conflict Safety", () => {
  // Helper to create mock provider
  const createProvider = (config: {
    frontier?: string;
    spans?: Map<string, SpanState>;
    documents?: Set<string>;
  }) => {
    return createMockDocumentProvider({
      frontier: config.frontier ?? "frontier:v1",
      spans: config.spans ?? new Map(),
      documents: config.documents ?? new Set(["doc123"]),
    });
  };

  describe("checkFrontier", () => {
    it("returns ok for equal frontiers", () => {
      const provider = createProvider({ frontier: "frontier:v1" });
      const result = checkFrontier("frontier:v1", provider);
      expect(result.ok).toBe(true);
    });

    it("returns ok when client is behind server", () => {
      const provider = createProvider({ frontier: "frontier:v2" });
      const result = checkFrontier("frontier:v1", provider);
      expect(result.ok).toBe(true);
    });

    it("returns conflict when client is ahead", () => {
      const provider = createProvider({ frontier: "frontier:v1" });
      const result = checkFrontier("frontier:v2", provider);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.comparison).toBe("ahead");
      }
    });
  });

  describe("checkSpanPrecondition", () => {
    it("returns null for valid precondition", () => {
      const target: TargetSpan = {
        annotation_id: "a1",
        span_id: "s1",
        if_match_context_hash: "sha256:abc",
      };
      const state: SpanState = {
        span_id: "s1",
        annotation_id: "a1",
        block_id: "b1",
        text: "Hello",
        context_hash: "sha256:abc",
        is_verified: true,
      };

      const result = checkSpanPrecondition(target, state);
      expect(result).toBeNull();
    });

    it("returns span_missing for null state", () => {
      const target: TargetSpan = {
        annotation_id: "a1",
        span_id: "s1",
        if_match_context_hash: "sha256:abc",
      };

      const result = checkSpanPrecondition(target, null);
      expect(result).not.toBeNull();
      expect(result?.reason).toBe("span_missing");
    });

    it("returns span_missing for annotation mismatch", () => {
      const target: TargetSpan = {
        annotation_id: "a1",
        span_id: "s1",
        if_match_context_hash: "sha256:abc",
      };
      const state: SpanState = {
        span_id: "s1",
        annotation_id: "a2", // Different annotation
        block_id: "b1",
        text: "Hello",
        context_hash: "sha256:abc",
        is_verified: true,
      };

      const result = checkSpanPrecondition(target, state);
      expect(result).not.toBeNull();
      expect(result?.reason).toBe("span_missing");
    });

    it("returns unverified_target for unverified span", () => {
      const target: TargetSpan = {
        annotation_id: "a1",
        span_id: "s1",
        if_match_context_hash: "sha256:abc",
      };
      const state: SpanState = {
        span_id: "s1",
        annotation_id: "a1",
        block_id: "b1",
        text: "Hello",
        context_hash: "sha256:abc",
        is_verified: false, // Not verified
      };

      const result = checkSpanPrecondition(target, state);
      expect(result).not.toBeNull();
      expect(result?.reason).toBe("unverified_target");
    });

    it("returns hash_mismatch for different hash", () => {
      const target: TargetSpan = {
        annotation_id: "a1",
        span_id: "s1",
        if_match_context_hash: "sha256:abc",
      };
      const state: SpanState = {
        span_id: "s1",
        annotation_id: "a1",
        block_id: "b1",
        text: "Hello",
        context_hash: "sha256:xyz", // Different hash
        is_verified: true,
      };

      const result = checkSpanPrecondition(target, state);
      expect(result).not.toBeNull();
      expect(result?.reason).toBe("hash_mismatch");
      expect(result?.expected_hash).toBe("sha256:abc");
      expect(result?.actual_hash).toBe("sha256:xyz");
    });
  });

  describe("checkAllPreconditions", () => {
    it("returns empty array when all preconditions pass", () => {
      const spans = new Map<string, SpanState>([
        [
          "s1",
          {
            span_id: "s1",
            annotation_id: "a1",
            block_id: "b1",
            text: "A",
            context_hash: "h1",
            is_verified: true,
          },
        ],
        [
          "s2",
          {
            span_id: "s2",
            annotation_id: "a2",
            block_id: "b2",
            text: "B",
            context_hash: "h2",
            is_verified: true,
          },
        ],
      ]);
      const provider = createProvider({ spans });

      const targets: TargetSpan[] = [
        { annotation_id: "a1", span_id: "s1", if_match_context_hash: "h1" },
        { annotation_id: "a2", span_id: "s2", if_match_context_hash: "h2" },
      ];

      const failures = checkAllPreconditions(targets, provider);
      expect(failures).toHaveLength(0);
    });

    it("returns failures for invalid preconditions", () => {
      const spans = new Map<string, SpanState>([
        [
          "s1",
          {
            span_id: "s1",
            annotation_id: "a1",
            block_id: "b1",
            text: "A",
            context_hash: "h1",
            is_verified: true,
          },
        ],
      ]);
      const provider = createProvider({ spans });

      const targets: TargetSpan[] = [
        { annotation_id: "a1", span_id: "s1", if_match_context_hash: "wrong" },
        { annotation_id: "a2", span_id: "s2", if_match_context_hash: "h2" }, // Missing
      ];

      const failures = checkAllPreconditions(targets, provider);
      expect(failures).toHaveLength(2);
      expect(failures[0].reason).toBe("hash_mismatch");
      expect(failures[1].reason).toBe("span_missing");
    });
  });

  describe("checkConflicts", () => {
    it("returns ok for valid request", () => {
      const spans = new Map<string, SpanState>([
        [
          "s1",
          {
            span_id: "s1",
            annotation_id: "a1",
            block_id: "b1",
            text: "A",
            context_hash: "h1",
            is_verified: true,
          },
        ],
      ]);
      const provider = createProvider({ frontier: "frontier:v1", spans });

      const request: AIGatewayRequest = {
        doc_id: "doc123",
        doc_frontier_tag: "frontier:v1",
        target_spans: [{ annotation_id: "a1", span_id: "s1", if_match_context_hash: "h1" }],
        instructions: "Test",
        format: "html",
        request_id: "req-123",
      };

      const result = checkConflicts(request, provider);
      expect(result.ok).toBe(true);
    });

    it("returns 409 for missing document", () => {
      const provider = createProvider({ documents: new Set() }); // No documents

      const request: AIGatewayRequest = {
        doc_id: "doc123",
        doc_frontier_tag: "frontier:v1",
        target_spans: [],
        instructions: "Test",
        format: "html",
        request_id: "req-123",
      };

      const result = checkConflicts(request, provider);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.response.status).toBe(409);
        expect(result.response.reason).toBe("frontier_mismatch");
      }
    });

    it("returns 409 for stale frontier", () => {
      const provider = createProvider({ frontier: "frontier:v1" });

      const request: AIGatewayRequest = {
        doc_id: "doc123",
        doc_frontier_tag: "frontier:v2", // Ahead of server
        target_spans: [],
        instructions: "Test",
        format: "html",
        request_id: "req-123",
      };

      const result = checkConflicts(request, provider);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.response.status).toBe(409);
        expect(result.response.reason).toBe("frontier_mismatch");
      }
    });

    it("returns 409 for failed preconditions", () => {
      const spans = new Map<string, SpanState>([
        [
          "s1",
          {
            span_id: "s1",
            annotation_id: "a1",
            block_id: "b1",
            text: "A",
            context_hash: "h1",
            is_verified: true,
          },
        ],
      ]);
      const provider = createProvider({ frontier: "frontier:v1", spans });

      const request: AIGatewayRequest = {
        doc_id: "doc123",
        doc_frontier_tag: "frontier:v1",
        target_spans: [{ annotation_id: "a1", span_id: "s1", if_match_context_hash: "wrong" }],
        instructions: "Test",
        format: "html",
        request_id: "req-123",
      };

      const result = checkConflicts(request, provider);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.response.status).toBe(409);
        expect(result.response.reason).toBe("hash_mismatch");
        expect(result.response.failed_preconditions).toHaveLength(1);
      }
    });

    it("prioritizes unverified_target over hash_mismatch", () => {
      const spans = new Map<string, SpanState>([
        [
          "s1",
          {
            span_id: "s1",
            annotation_id: "a1",
            block_id: "b1",
            text: "A",
            context_hash: "h1",
            is_verified: false,
          },
        ],
        [
          "s2",
          {
            span_id: "s2",
            annotation_id: "a2",
            block_id: "b2",
            text: "B",
            context_hash: "h2",
            is_verified: true,
          },
        ],
      ]);
      const provider = createProvider({ frontier: "frontier:v1", spans });

      const request: AIGatewayRequest = {
        doc_id: "doc123",
        doc_frontier_tag: "frontier:v1",
        target_spans: [
          { annotation_id: "a1", span_id: "s1", if_match_context_hash: "h1" },
          { annotation_id: "a2", span_id: "s2", if_match_context_hash: "wrong" },
        ],
        instructions: "Test",
        format: "html",
        request_id: "req-123",
      };

      const result = checkConflicts(request, provider);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.response.reason).toBe("unverified_target");
      }
    });
  });

  describe("checkConflicts (targeting v1)", () => {
    it("accepts matching hard signals", () => {
      const spans = new Map<string, SpanState>([
        [
          "s1",
          {
            span_id: "s1",
            annotation_id: "a1",
            block_id: "b1",
            text: "Hello",
            context_hash: "h1",
            window_hash: "w1",
            structure_hash: "s1",
            is_verified: true,
          },
        ],
      ]);
      const provider = createProvider({ frontier: "frontier:v1", spans });
      const request: AIGatewayRequest = {
        doc_id: "doc123",
        doc_frontier_tag: "frontier:v1",
        target_spans: [],
        targeting: { version: "v1" },
        preconditions: [
          {
            v: 1,
            span_id: "s1",
            block_id: "b1",
            hard: { context_hash: "h1", window_hash: "w1", structure_hash: "s1" },
          },
        ],
        instructions: "Test",
        format: "html",
        request_id: "req-123",
      };

      const result = checkConflicts(request, provider);
      expect(result.ok).toBe(true);
    });

    it("reports hash_mismatch for window hash mismatch", () => {
      const spans = new Map<string, SpanState>([
        [
          "s1",
          {
            span_id: "s1",
            annotation_id: "a1",
            block_id: "b1",
            text: "Hello",
            context_hash: "h1",
            window_hash: "w1",
            is_verified: true,
          },
        ],
      ]);
      const provider = createProvider({ frontier: "frontier:v1", spans });
      const request: AIGatewayRequest = {
        doc_id: "doc123",
        doc_frontier_tag: "frontier:v1",
        target_spans: [],
        targeting: { version: "v1" },
        preconditions: [
          {
            v: 1,
            span_id: "s1",
            block_id: "b1",
            hard: { window_hash: "w2" },
          },
        ],
        instructions: "Test",
        format: "html",
        request_id: "req-123",
      };

      const result = checkConflicts(request, provider);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.response.reason).toBe("hash_mismatch");
        expect(result.response.failed_preconditions[0]?.expected_hash).toBe("w2");
        expect(result.response.failed_preconditions[0]?.actual_hash).toBe("w1");
      }
    });
  });

  describe("createConflictMiddleware", () => {
    it("creates reusable middleware function", () => {
      const spans = new Map<string, SpanState>([
        [
          "s1",
          {
            span_id: "s1",
            annotation_id: "a1",
            block_id: "b1",
            text: "A",
            context_hash: "h1",
            is_verified: true,
          },
        ],
      ]);
      const provider = createProvider({ frontier: "frontier:v1", spans });
      const middleware = createConflictMiddleware(provider);

      const request: AIGatewayRequest = {
        doc_id: "doc123",
        doc_frontier_tag: "frontier:v1",
        target_spans: [{ annotation_id: "a1", span_id: "s1", if_match_context_hash: "h1" }],
        instructions: "Test",
        format: "html",
        request_id: "req-123",
      };

      const result = middleware(request);
      expect(result.ok).toBe(true);
    });
  });

  describe("createMockDocumentProvider", () => {
    it("implements GatewayDocumentProvider interface", () => {
      const spans = new Map<string, SpanState>([
        [
          "s1",
          {
            span_id: "s1",
            annotation_id: "a1",
            block_id: "b1",
            text: "A",
            context_hash: "h1",
            is_verified: true,
          },
        ],
        [
          "s2",
          {
            span_id: "s2",
            annotation_id: "a2",
            block_id: "b2",
            text: "B",
            context_hash: "h2",
            is_verified: true,
          },
        ],
      ]);
      const provider = createProvider({
        frontier: "frontier:v1",
        spans,
        documents: new Set(["doc1", "doc2"]),
      });

      expect(provider.getFrontierTag()).toBe("frontier:v1");
      expect(provider.documentExists("doc1")).toBe(true);
      expect(provider.documentExists("doc3")).toBe(false);
      expect(provider.getSpanState("s1")?.text).toBe("A");
      expect(provider.getSpanState("s3")).toBeNull();

      const states = provider.getSpanStates(["s1", "s2", "s3"]);
      expect(states.size).toBe(2);
      expect(states.has("s1")).toBe(true);
      expect(states.has("s3")).toBe(false);
    });

    it("compares frontiers correctly", () => {
      const provider = createProvider({ frontier: "frontier:v2" });

      expect(provider.compareFrontiers("frontier:v2", "frontier:v2")).toBe("equal");
      expect(provider.compareFrontiers("frontier:v1", "frontier:v2")).toBe("behind");
      expect(provider.compareFrontiers("frontier:v3", "frontier:v2")).toBe("ahead");
    });
  });
});
