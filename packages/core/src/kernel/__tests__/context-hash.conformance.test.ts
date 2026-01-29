/**
 * LFCC v0.9 RC — Context Hash Conformance
 * C4: Context and chain hashes must be deterministic with normalized inputs.
 */

import { describe, expect, it } from "vitest";
import { computeChainHash, computeContextHash } from "../integrity/hash.js";
import type { ChainData, SpanData } from "../integrity/types.js";

const baseSpan: SpanData = {
  span_id: "span-1",
  block_id: "block-1",
  text: "line1\nline2",
};

describe("Context hash conformance (C4)", () => {
  it("normalizes line endings for context hash", async () => {
    const lf = await computeContextHash(baseSpan);
    const crlf = await computeContextHash({
      ...baseSpan,
      span_id: "span-2",
      text: "line1\r\nline2",
    });

    expect(lf.hash).toBe(crlf.hash);
  });

  it("changes hash when block id changes", async () => {
    const base = await computeContextHash(baseSpan);
    const altered = await computeContextHash({
      ...baseSpan,
      span_id: "span-3",
      block_id: "block-2",
    });

    expect(base.hash).not.toBe(altered.hash);
  });

  it("computes stable chain hash", async () => {
    const chain: ChainData = {
      policy_kind: "bounded_gap",
      max_intervening_blocks: 2,
      block_ids: ["block-1", "block-2", "block-3"],
    };

    const first = await computeChainHash(chain);
    const second = await computeChainHash(chain);

    expect(first.hash).toBe(second.hash);
  });
});
