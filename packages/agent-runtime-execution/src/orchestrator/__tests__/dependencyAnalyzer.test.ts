/**
 * Dependency Analyzer Tests
 */

import { describe, expect, it } from "vitest";
import type { MCPToolCall } from "../../types";
import { DependencyAnalyzer } from "../dependencyAnalyzer";

function createCall(name: string): MCPToolCall {
  return { name, arguments: {} };
}

describe("DependencyAnalyzer concurrency hints", () => {
  it("serializes exclusive tools across the call list", () => {
    const analyzer = new DependencyAnalyzer((toolName) =>
      toolName === "exclusive:tool" ? "exclusive" : undefined
    );
    const calls = [createCall("exclusive:tool"), createCall("file:read")];

    const groups = analyzer.analyze(calls).groups;

    expect(groups).toHaveLength(2);
    expect(groups[0]).toEqual([calls[0]]);
    expect(groups[1]).toEqual([calls[1]]);
  });

  it("allows parallel hints to override serialized defaults", () => {
    const analyzer = new DependencyAnalyzer((toolName) =>
      toolName === "bash:execute" ? "parallel" : undefined
    );
    const calls = [createCall("bash:execute"), createCall("bash:execute")];

    const groups = analyzer.analyze(calls).groups;

    expect(groups).toHaveLength(1);
    expect(groups[0]).toEqual(calls);
  });
});
