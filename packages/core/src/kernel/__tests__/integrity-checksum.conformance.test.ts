/**
 * LFCC v0.9 RC — Integrity Checksum Conformance
 * C2: Document checksums must be deterministic and sensitive to content changes.
 */

import { describe, expect, it } from "vitest";
import { canonicalizeDocument } from "../canonicalizer/index.js";
import type { CanonInputNode } from "../canonicalizer/types.js";
import { computeDocumentChecksumTier2 } from "../integrity/hash.js";

function buildDoc(text: string, blockId: string): CanonInputNode {
  return {
    kind: "element",
    tag: "p",
    attrs: { block_id: blockId },
    children: [{ kind: "text", text }],
  };
}

describe("Integrity checksum conformance (C2)", () => {
  it("produces stable checksum for identical input", async () => {
    const canonical = canonicalizeDocument({ root: buildDoc("hello", "block-1") }).root;
    const first = await computeDocumentChecksumTier2(canonical);
    const second = await computeDocumentChecksumTier2(canonical);

    expect(first.checksum).toBe(second.checksum);
    expect(first.blocks.length).toBeGreaterThan(0);
  });

  it("changes checksum when content changes", async () => {
    const canonicalA = canonicalizeDocument({ root: buildDoc("hello", "block-1") }).root;
    const canonicalB = canonicalizeDocument({ root: buildDoc("hello!", "block-1") }).root;

    const checksumA = await computeDocumentChecksumTier2(canonicalA);
    const checksumB = await computeDocumentChecksumTier2(canonicalB);

    expect(checksumA.checksum).not.toBe(checksumB.checksum);
  });
});
