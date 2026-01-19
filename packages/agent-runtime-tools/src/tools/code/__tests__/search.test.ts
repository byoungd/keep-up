import * as path from "node:path";
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

  it("respects case sensitivity", async () => {
    const result = await searchCode("HELPERFUNCTION", { path: fixturePath, caseSensitive: true });
    expect(result.matchCount).toBe(0);

    const resultInsensitive = await searchCode("HELPERFUNCTION", {
      path: fixturePath,
      caseSensitive: false,
    });
    expect(resultInsensitive.matchCount).toBeGreaterThan(0);
  });

  it("supports regex search", async () => {
    const result = await searchCode("helper.*ion", { path: fixturePath, isRegex: true });
    expect(result.matchCount).toBeGreaterThan(0);
    expect(result.matches[0].content).toContain("helperFunction");
  });

  it("searches across directories", async () => {
    const searchDir = path.dirname(fixturePath);
    const result = await searchCode("export class", { path: searchDir });
    expect(result.matchCount).toBeGreaterThan(0);
    expect(result.matches.some((m) => m.path.endsWith("sample.ts"))).toBe(true);
  });

  it("limits results based on maxResults", async () => {
    const result = await searchCode("e", { path: fixturePath, maxResults: 1 });
    expect(result.matches.length).toBe(1);
    expect(result.truncated).toBe(true);
  });
});
