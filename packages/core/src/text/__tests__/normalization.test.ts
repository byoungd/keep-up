import { describe, expect, it } from "vitest";
import { canonicalizeText, computeCanonicalHash } from "../normalization.js";

describe("text normalization", () => {
  const raw = "  Alpha  \n\n  \nBeta\n\nGamma  ";
  const expectedBlocks = ["Alpha", "Beta", "Gamma"];
  const expectedCanonicalText = "Alpha\n\nBeta\n\nGamma";
  const expectedBlockHashes = ["0348724b", "16617be7", "75e618aa"];
  const expectedDocHash = "126fbf2e";

  it("canonicalizes text into stable blocks", () => {
    const canonical = canonicalizeText(raw);
    expect(canonical.blocks).toEqual(expectedBlocks);
    expect(canonical.canonicalText).toBe(expectedCanonicalText);
  });

  it("computes stable canonical hashes", () => {
    const canonical = canonicalizeText(raw);
    const hash = computeCanonicalHash(canonical.blocks.map((text) => ({ text })));
    expect(hash.blockHashes).toEqual(expectedBlockHashes);
    expect(hash.docHash).toBe(expectedDocHash);
  });
});
