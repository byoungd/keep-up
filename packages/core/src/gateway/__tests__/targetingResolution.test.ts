/**
 * LFCC v0.9.4 - Targeting Resolution Tests
 */

import { describe, expect, it } from "vitest";
import { anchorFromAbsolute } from "../../kernel/mapping/anchors.js";
import { createMockDocumentProvider } from "../conflict.js";
import { resolveWeakPreconditions } from "../targetingResolution.js";
import {
  type AIGatewayRequest,
  DEFAULT_TARGETING_POLICY,
  type SpanState,
  type TargetRange,
} from "../types.js";

type ProviderConfig = {
  spans: Map<string, SpanState>;
};

function createProvider(config: ProviderConfig) {
  return createMockDocumentProvider({
    frontier: "frontier:v1",
    spans: config.spans,
    documents: new Set(["doc123"]),
  });
}

function buildRange(blockId: string, start: number, end: number): TargetRange {
  return {
    start: { anchor: anchorFromAbsolute(blockId, start, "after"), bias: "right" },
    end: { anchor: anchorFromAbsolute(blockId, end, "before"), bias: "left" },
  };
}

describe("resolveWeakPreconditions", () => {
  it("trims range when weak precondition fails", () => {
    const spans = new Map<string, SpanState>([
      [
        "s1",
        {
          span_id: "s1",
          annotation_id: "a1",
          block_id: "b1",
          span_start: 10,
          span_end: 20,
          text: "abcdefghij",
          context_hash: "h-new",
          is_verified: true,
        },
      ],
    ]);

    const request: AIGatewayRequest = {
      doc_id: "doc123",
      doc_frontier_tag: "frontier:v1",
      target_spans: [],
      instructions: "Test",
      format: "html",
      request_id: "req-trim",
      targeting: { version: "v1", allow_trim: true },
      layered_preconditions: {
        strong: [],
        weak: [
          {
            v: 1,
            span_id: "s1",
            block_id: "b1",
            range: buildRange("b1", 8, 22),
            hard: { context_hash: "h-old" },
            on_mismatch: "trim_range",
          },
        ],
      },
    };

    const result = resolveWeakPreconditions(
      request,
      createProvider({ spans }),
      DEFAULT_TARGETING_POLICY
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.request.target_spans[0]?.span_id).toBe("selection:req-trim:b1:10:20");
      expect(result.weakRecoveries[0]?.recovery_action).toBe("trim_range");
      expect(result.trimming[0]?.original_length).toBe(14);
      expect(result.trimming[0]?.trimmed_length).toBe(10);
      expect(result.trimming[0]?.preserved_ratio).toBeCloseTo(10 / 14, 4);
    }
  });

  it("retargets span when relocation is allowed", () => {
    const spans = new Map<string, SpanState>([
      [
        "s1",
        {
          span_id: "s1",
          annotation_id: "a1",
          block_id: "b1",
          span_start: 5,
          span_end: 7,
          text: "Old",
          context_hash: "h-new",
          is_verified: true,
          block_index: 0,
        },
      ],
      [
        "s2",
        {
          span_id: "s2",
          annotation_id: "a1",
          block_id: "b1",
          span_start: 12,
          span_end: 14,
          text: "Old",
          context_hash: "h-old",
          is_verified: true,
          block_index: 0,
        },
      ],
    ]);

    const request: AIGatewayRequest = {
      doc_id: "doc123",
      doc_frontier_tag: "frontier:v1",
      target_spans: [],
      instructions: "Test",
      format: "html",
      request_id: "req-retarget",
      targeting: { version: "v1", auto_retarget: true, relocate_policy: "same_block" },
      layered_preconditions: {
        strong: [],
        weak: [
          {
            v: 1,
            span_id: "s1",
            block_id: "b1",
            range: buildRange("b1", 5, 7),
            hard: { context_hash: "h-old" },
            on_mismatch: "relocate",
          },
        ],
      },
    };

    const policy = { ...DEFAULT_TARGETING_POLICY, allow_auto_retarget: true };
    const result = resolveWeakPreconditions(request, createProvider({ spans }), policy);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.request.target_spans[0]?.span_id).toBe("s2");
      expect(result.retargeting[0]?.resolved_span_id).toBe("s2");
      expect(result.retargeting[0]?.match_vector).toHaveLength(7);
      expect(result.weakRecoveries[0]?.recovery_action).toBe("relocate");
    }
  });
});
