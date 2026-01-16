/**
 * Context Frame Builder Tests
 */

import { describe, expect, it } from "vitest";
import type { ContextItem } from "../context/contextBuilder";
import { ContextFrameBuilder } from "../context/contextFrame";

describe("ContextFrameBuilder", () => {
  it("builds frame sources and redactions", () => {
    const builder = new ContextFrameBuilder({ maxTokens: 100, frameIdFactory: () => "frame-1" });
    const items: ContextItem[] = [
      { id: "short-1", tier: "short_term", content: "Short", source: "msg:1" },
      {
        id: "proj-1",
        tier: "project",
        content: "Project",
        source: "doc:plan",
        sourceType: "project",
      },
      {
        id: "mem-1",
        tier: "redacted",
        content: "Secret",
        source: "mem:1",
        sourceType: "memory",
        redacted: true,
      },
      {
        id: "tool-1",
        tier: "project",
        content: "Tool output",
        source: "tool:ls",
        sourceType: "tools",
      },
    ];

    const result = builder.build(items);

    expect(result.frame.frameId).toBe("frame-1");
    expect(result.frame.sources.shortTerm).toEqual(["msg:1"]);
    expect(result.frame.sources.project).toEqual(["doc:plan"]);
    expect(result.frame.sources.memory).toEqual(["mem:1"]);
    expect(result.frame.sources.tools).toEqual(["tool:ls"]);
    expect(result.frame.redactions).toEqual(["mem-1"]);
  });

  it("respects token budget and marks truncation", () => {
    const builder = new ContextFrameBuilder({
      maxTokens: 10,
      estimateTokens: () => 5,
      frameIdFactory: () => "frame-2",
    });
    const items: ContextItem[] = [
      { id: "short-1", tier: "short_term", content: "A" },
      { id: "short-2", tier: "short_term", content: "B" },
      { id: "short-3", tier: "short_term", content: "C" },
    ];

    const result = builder.build(items, { maxTokens: 10 });

    expect(result.truncated).toBe(true);
    expect(result.frame.tokenBudget.usedTokens).toBe(10);
  });
});
