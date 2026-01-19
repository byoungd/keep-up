import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { searchCode } from "../search";

const fixturePath = fileURLToPath(new URL("./fixtures/sample.ts", import.meta.url));

describe("searchCode", () => {
  it("finds matches within a file", async () => {
    const result = await searchCode("helperFunction", { path: fixturePath });

    expect(result.matchCount).toBeGreaterThan(0);
    expect(result.matches.some((match) => match.path === fixturePath)).toBe(true);
    expect(result.matches.some((match) => match.content.includes("helperFunction"))).toBe(true);
  });
});
