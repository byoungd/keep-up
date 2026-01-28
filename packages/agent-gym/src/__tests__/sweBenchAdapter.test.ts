import { describe, expect, it } from "vitest";
import {
  buildSweBenchPrompt,
  parseSweBenchJSONL,
  toExternalBenchmarkCases,
} from "../adapters/sweBench";

describe("SWE-bench adapter", () => {
  it("parses JSONL and enforces required fields", () => {
    const raw =
      '{"instance_id":"case-1","repo":"org/repo","base_commit":"abc","patch":"diff","problem_statement":"Fix bug"}\n';
    const entries = parseSweBenchJSONL(raw);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.instance_id).toBe("case-1");
  });

  it("builds prompt with optional hints", () => {
    const entry = {
      instance_id: "case-1",
      repo: "org/repo",
      base_commit: "abc",
      patch: "diff",
      problem_statement: "Fix bug",
      hints_text: "Check the parser",
    };
    const prompt = buildSweBenchPrompt(entry, { includeHints: true });
    expect(prompt).toContain("Repository: org/repo");
    expect(prompt).toContain("Base commit: abc");
    expect(prompt).toContain("Fix bug");
    expect(prompt).toContain("Hints:");
    expect(prompt).toContain("Check the parser");
  });

  it("sorts cases deterministically and applies maxCases", () => {
    const raw =
      '{"instance_id":"case-2","repo":"org/repo","base_commit":"b","patch":"diff","problem_statement":"B"}\n' +
      '{"instance_id":"case-1","repo":"org/repo","base_commit":"a","patch":"diff","problem_statement":"A"}\n';
    const entries = parseSweBenchJSONL(raw);
    const cases = toExternalBenchmarkCases(entries, { maxCases: 1 });
    expect(cases).toHaveLength(1);
    expect(cases[0]?.id).toBe("case-1");
  });
});
