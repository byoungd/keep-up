import { describe, expect, it } from "vitest";

import { createTokenId, tokenize } from "../src";

describe("tokenize", () => {
  it("creates stable ids for the same seed", () => {
    expect(createTokenId("hello")).toBe(createTokenId("hello"));
  });

  it("splits text into tokens", () => {
    const tokens = tokenize("hello world");
    expect(tokens).toHaveLength(2);
    expect(tokens[0]?.text).toBe("hello");
  });
});
