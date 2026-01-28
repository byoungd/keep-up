/**
 * LFCC v0.9 RC - AI Envelope Preconditions Conformance
 * @see docs/specs/lfcc/engineering/08_Conformance_Test_Suite_Plan.md Section 7.1 (Preconditions)
 */

import { describe, expect, it } from "vitest";
import { create409Conflict, is409Conflict, validatePreconditions } from "../ai/index.js";

describe("AI Preconditions (P0)", () => {
  it("returns hash_mismatch and span_missing failures", () => {
    const failures = validatePreconditions(
      [
        { span_id: "span-a", if_match_context_hash: "hash-a" },
        { span_id: "span-b", if_match_context_hash: "hash-b" },
      ],
      (spanId) => {
        if (spanId === "span-a") {
          return "hash-x";
        }
        return null;
      }
    );

    expect(failures).toEqual([
      { span_id: "span-a", reason: "hash_mismatch" },
      { span_id: "span-b", reason: "span_missing" },
    ]);
  });

  it("formats conflicts as 409 responses", () => {
    const conflict = create409Conflict({
      currentFrontier: "frontier:1",
      failedPreconditions: [
        { spanId: "span-a", reason: "hash_mismatch" },
        { spanId: "span-b", reason: "span_missing" },
      ],
      requestId: "req_test",
    });

    expect(is409Conflict(conflict)).toBe(true);
    expect(conflict.status).toBe(409);
    expect(conflict.failed_preconditions?.length).toBe(2);
  });
});
