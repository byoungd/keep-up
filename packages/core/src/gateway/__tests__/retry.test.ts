/**
 * LFCC v0.9 RC - AI Gateway Retry Playbook Tests
 */

import { describe, expect, it } from "vitest";
import {
  createAggressiveRetryPolicy,
  createLenientRetryPolicy,
  createRetryState,
  createStrictRetryPolicy,
  INITIAL_RETRY_STATE,
  isRetryable,
  relocateAllSpans,
  relocateSpan,
  updateRequestAfterRebase,
  updateRetryState,
} from "../retry.js";
import type {
  AIGateway409Response,
  AIGatewayRequest,
  FailedPrecondition,
  RebaseResult,
  RelocationProvider,
  RetryPolicy,
  SpanState,
} from "../types.js";
import { DEFAULT_RETRY_POLICY } from "../types.js";

describe("AI Gateway Retry Playbook", () => {
  describe("INITIAL_RETRY_STATE", () => {
    it("has correct initial values", () => {
      expect(INITIAL_RETRY_STATE.attempt).toBe(0);
      expect(INITIAL_RETRY_STATE.relocated_spans.size).toBe(0);
      expect(INITIAL_RETRY_STATE.should_continue).toBe(true);
      expect(INITIAL_RETRY_STATE.next_backoff_ms).toBe(100);
    });
  });

  describe("createRetryState", () => {
    it("creates state with policy backoff", () => {
      const policy: RetryPolicy = {
        max_retries: 5,
        relocation_level: 2,
        backoff_base_ms: 50,
        backoff_multiplier: 2,
        max_backoff_ms: 1000,
      };

      const state = createRetryState(policy);
      expect(state.attempt).toBe(0);
      expect(state.next_backoff_ms).toBe(50);
    });
  });

  describe("updateRetryState", () => {
    it("increments attempt count", () => {
      const state = createRetryState(DEFAULT_RETRY_POLICY);
      const conflict: AIGateway409Response = {
        status: 409,
        reason: "hash_mismatch",
        server_frontier_tag: "f1",
        failed_preconditions: [],
        message: "test",
      };

      const updated = updateRetryState(state, conflict, DEFAULT_RETRY_POLICY);
      expect(updated.attempt).toBe(1);
    });

    it("calculates exponential backoff", () => {
      const policy: RetryPolicy = {
        max_retries: 5,
        relocation_level: 1,
        backoff_base_ms: 100,
        backoff_multiplier: 2,
        max_backoff_ms: 5000,
      };

      let state = createRetryState(policy);
      const conflict: AIGateway409Response = {
        status: 409,
        reason: "hash_mismatch",
        server_frontier_tag: "f1",
        failed_preconditions: [],
        message: "test",
      };

      state = updateRetryState(state, conflict, policy);
      expect(state.next_backoff_ms).toBe(200); // 100 * 2

      state = updateRetryState(state, conflict, policy);
      expect(state.next_backoff_ms).toBe(400); // 200 * 2

      state = updateRetryState(state, conflict, policy);
      expect(state.next_backoff_ms).toBe(800); // 400 * 2
    });

    it("caps backoff at max", () => {
      const policy: RetryPolicy = {
        max_retries: 10,
        relocation_level: 1,
        backoff_base_ms: 1000,
        backoff_multiplier: 10,
        max_backoff_ms: 5000,
      };

      let state = createRetryState(policy);
      const conflict: AIGateway409Response = {
        status: 409,
        reason: "hash_mismatch",
        server_frontier_tag: "f1",
        failed_preconditions: [],
        message: "test",
      };

      state = updateRetryState(state, conflict, policy);
      expect(state.next_backoff_ms).toBe(5000); // Capped at max
    });

    it("sets should_continue false when max retries reached", () => {
      const policy: RetryPolicy = {
        max_retries: 2,
        relocation_level: 1,
        backoff_base_ms: 100,
        backoff_multiplier: 2,
        max_backoff_ms: 5000,
      };

      let state = createRetryState(policy);
      const conflict: AIGateway409Response = {
        status: 409,
        reason: "hash_mismatch",
        server_frontier_tag: "f1",
        failed_preconditions: [],
        message: "test",
      };

      state = updateRetryState(state, conflict, policy);
      expect(state.should_continue).toBe(true);

      state = updateRetryState(state, conflict, policy);
      expect(state.should_continue).toBe(false);
    });

    it("sets should_continue false for non-retryable reasons", () => {
      const state = createRetryState(DEFAULT_RETRY_POLICY);
      const conflict: AIGateway409Response = {
        status: 409,
        reason: "schema_reject",
        server_frontier_tag: "f1",
        failed_preconditions: [],
        message: "test",
      };

      const updated = updateRetryState(state, conflict, DEFAULT_RETRY_POLICY);
      expect(updated.should_continue).toBe(false);
    });

    it("stores last conflict", () => {
      const state = createRetryState(DEFAULT_RETRY_POLICY);
      const conflict: AIGateway409Response = {
        status: 409,
        reason: "hash_mismatch",
        server_frontier_tag: "f1",
        failed_preconditions: [{ span_id: "s1", annotation_id: "a1", reason: "hash_mismatch" }],
        message: "test",
      };

      const updated = updateRetryState(state, conflict, DEFAULT_RETRY_POLICY);
      expect(updated.last_conflict).toEqual(conflict);
    });
  });

  describe("isRetryable", () => {
    it("returns true for retryable reasons", () => {
      expect(isRetryable("frontier_mismatch")).toBe(true);
      expect(isRetryable("hash_mismatch")).toBe(true);
      expect(isRetryable("unverified_target")).toBe(true);
      expect(isRetryable("span_missing")).toBe(true);
    });

    it("returns false for non-retryable reasons", () => {
      expect(isRetryable("schema_reject")).toBe(false);
      expect(isRetryable("sanitization_reject")).toBe(false);
    });
  });

  describe("relocateSpan", () => {
    const createMockProvider = (
      hashMatch?: SpanState,
      fuzzyMatch?: SpanState,
      semanticMatch?: SpanState
    ): RelocationProvider => ({
      findByContextHash: (_docId, hash) => (hashMatch?.context_hash === hash ? hashMatch : null),
      findByFuzzyText: fuzzyMatch ? () => fuzzyMatch : undefined,
      findBySemantic: semanticMatch ? () => semanticMatch : undefined,
    });

    it("relocates by exact hash match (Level 1)", () => {
      const matchedSpan: SpanState = {
        span_id: "s2",
        annotation_id: "a1",
        block_id: "b1",
        text: "Hello",
        context_hash: "sha256:abc",
        is_verified: true,
      };
      const provider = createMockProvider(matchedSpan);

      const failure: FailedPrecondition = {
        span_id: "s1",
        annotation_id: "a1",
        reason: "hash_mismatch",
        expected_hash: "sha256:abc",
      };

      const result = relocateSpan(failure, "Hello", 1, provider, "doc1");
      expect(result.success).toBe(true);
      expect(result.new_span_id).toBe("s2");
      expect(result.method).toBe("exact_hash");
    });

    it("does not use fuzzy matching at Level 1", () => {
      const fuzzyMatch: SpanState = {
        span_id: "s2",
        annotation_id: "a1",
        block_id: "b1",
        text: "Hello",
        context_hash: "sha256:xyz",
        is_verified: true,
      };
      const provider = createMockProvider(undefined, fuzzyMatch);

      const failure: FailedPrecondition = {
        span_id: "s1",
        annotation_id: "a1",
        reason: "hash_mismatch",
        expected_hash: "sha256:abc",
      };

      const result = relocateSpan(failure, "Hello", 1, provider, "doc1");
      expect(result.success).toBe(false);
    });

    it("uses fuzzy matching at Level 2", () => {
      const fuzzyMatch: SpanState = {
        span_id: "s2",
        annotation_id: "a1",
        block_id: "b1",
        text: "Hello",
        context_hash: "sha256:xyz",
        is_verified: true,
      };
      const provider = createMockProvider(undefined, fuzzyMatch);

      const failure: FailedPrecondition = {
        span_id: "s1",
        annotation_id: "a1",
        reason: "hash_mismatch",
        expected_hash: "sha256:abc",
      };

      const result = relocateSpan(failure, "Hello", 2, provider, "doc1");
      expect(result.success).toBe(true);
      expect(result.method).toBe("fuzzy_text");
    });

    it("uses semantic matching at Level 3", () => {
      const semanticMatch: SpanState = {
        span_id: "s2",
        annotation_id: "a1",
        block_id: "b1",
        text: "Greetings",
        context_hash: "sha256:xyz",
        is_verified: true,
      };
      const provider = createMockProvider(undefined, undefined, semanticMatch);

      const failure: FailedPrecondition = {
        span_id: "s1",
        annotation_id: "a1",
        reason: "hash_mismatch",
        expected_hash: "sha256:abc",
      };

      const result = relocateSpan(failure, "Hello", 3, provider, "doc1");
      expect(result.success).toBe(true);
      expect(result.method).toBe("semantic");
    });

    it("returns failure when no match found", () => {
      const provider = createMockProvider();

      const failure: FailedPrecondition = {
        span_id: "s1",
        annotation_id: "a1",
        reason: "hash_mismatch",
        expected_hash: "sha256:abc",
      };

      const result = relocateSpan(failure, "Hello", 3, provider, "doc1");
      expect(result.success).toBe(false);
    });
  });

  describe("relocateAllSpans", () => {
    it("relocates multiple spans", () => {
      const provider: RelocationProvider = {
        findByContextHash: (_docId, hash) => {
          if (hash === "h1") {
            return {
              span_id: "s1-new",
              annotation_id: "a1",
              block_id: "b1",
              text: "A",
              context_hash: "h1",
              is_verified: true,
            };
          }
          if (hash === "h2") {
            return {
              span_id: "s2-new",
              annotation_id: "a2",
              block_id: "b2",
              text: "B",
              context_hash: "h2",
              is_verified: true,
            };
          }
          return null;
        },
      };

      const failures: FailedPrecondition[] = [
        { span_id: "s1", annotation_id: "a1", reason: "hash_mismatch", expected_hash: "h1" },
        { span_id: "s2", annotation_id: "a2", reason: "hash_mismatch", expected_hash: "h2" },
      ];

      const originalTexts = new Map([
        ["s1", "A"],
        ["s2", "B"],
      ]);

      const results = relocateAllSpans(failures, originalTexts, 1, provider, "doc1");
      expect(results.size).toBe(2);
      expect(results.get("s1")?.success).toBe(true);
      expect(results.get("s2")?.success).toBe(true);
    });

    it("skips non-relocatable failures", () => {
      const provider: RelocationProvider = {
        findByContextHash: () => null,
      };

      const failures: FailedPrecondition[] = [
        { span_id: "s1", annotation_id: "a1", reason: "unverified_target" },
      ];

      const results = relocateAllSpans(failures, new Map(), 1, provider, "doc1");
      expect(results.get("s1")?.success).toBe(false);
    });
  });

  describe("updateRequestAfterRebase", () => {
    it("updates frontier and span hashes", () => {
      const request: AIGatewayRequest = {
        doc_id: "doc1",
        doc_frontier_tag: "f1",
        target_spans: [{ annotation_id: "a1", span_id: "s1", if_match_context_hash: "old-h1" }],
        instructions: "Test",
        format: "html",
        request_id: "req-123",
      };

      const rebaseResult: RebaseResult = {
        newFrontier: "f2",
        updatedSpans: new Map([
          [
            "s1",
            {
              span_id: "s1",
              annotation_id: "a1",
              block_id: "b1",
              text: "A",
              context_hash: "new-h1",
              is_verified: true,
            },
          ],
        ]),
        success: true,
      };

      const updated = updateRequestAfterRebase(request, rebaseResult, new Map());
      expect(updated.doc_frontier_tag).toBe("f2");
      expect(updated.target_spans[0].if_match_context_hash).toBe("new-h1");
    });

    it("uses relocated spans when available", () => {
      const request: AIGatewayRequest = {
        doc_id: "doc1",
        doc_frontier_tag: "f1",
        target_spans: [{ annotation_id: "a1", span_id: "s1", if_match_context_hash: "old-h1" }],
        instructions: "Test",
        format: "html",
        request_id: "req-123",
      };

      const rebaseResult: RebaseResult = {
        newFrontier: "f2",
        updatedSpans: new Map(),
        success: true,
      };

      const relocations = new Map([
        [
          "s1",
          {
            success: true,
            new_span_id: "s1-relocated",
            new_context_hash: "relocated-h1",
            method: "exact_hash" as const,
          },
        ],
      ]);

      const updated = updateRequestAfterRebase(request, rebaseResult, relocations);
      expect(updated.target_spans[0].span_id).toBe("s1-relocated");
      expect(updated.target_spans[0].if_match_context_hash).toBe("relocated-h1");
    });

    it("keeps original when no update available", () => {
      const request: AIGatewayRequest = {
        doc_id: "doc1",
        doc_frontier_tag: "f1",
        target_spans: [{ annotation_id: "a1", span_id: "s1", if_match_context_hash: "h1" }],
        instructions: "Test",
        format: "html",
        request_id: "req-123",
      };

      const rebaseResult: RebaseResult = {
        newFrontier: "f2",
        updatedSpans: new Map(),
        success: true,
      };

      const updated = updateRequestAfterRebase(request, rebaseResult, new Map());
      expect(updated.target_spans[0].span_id).toBe("s1");
      expect(updated.target_spans[0].if_match_context_hash).toBe("h1");
    });
  });

  describe("Retry Policy Factories", () => {
    describe("createStrictRetryPolicy", () => {
      it("creates Level 1 policy", () => {
        const policy = createStrictRetryPolicy();
        expect(policy.relocation_level).toBe(1);
        expect(policy.max_retries).toBe(3);
      });

      it("accepts custom max retries", () => {
        const policy = createStrictRetryPolicy(5);
        expect(policy.max_retries).toBe(5);
      });
    });

    describe("createLenientRetryPolicy", () => {
      it("creates Level 2 policy", () => {
        const policy = createLenientRetryPolicy();
        expect(policy.relocation_level).toBe(2);
        expect(policy.max_retries).toBe(5);
      });
    });

    describe("createAggressiveRetryPolicy", () => {
      it("creates Level 3 policy", () => {
        const policy = createAggressiveRetryPolicy();
        expect(policy.relocation_level).toBe(3);
        expect(policy.max_retries).toBe(7);
      });
    });
  });

  describe("DEFAULT_RETRY_POLICY", () => {
    it("has sensible defaults", () => {
      expect(DEFAULT_RETRY_POLICY.max_retries).toBe(3);
      expect(DEFAULT_RETRY_POLICY.relocation_level).toBe(1);
      expect(DEFAULT_RETRY_POLICY.backoff_base_ms).toBe(100);
      expect(DEFAULT_RETRY_POLICY.backoff_multiplier).toBe(2);
      expect(DEFAULT_RETRY_POLICY.max_backoff_ms).toBe(5000);
    });
  });
});
