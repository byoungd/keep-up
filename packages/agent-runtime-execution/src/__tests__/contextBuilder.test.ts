/**
 * Tiered Context Builder Tests
 */

import { describe, expect, it } from "vitest";
import { type ContextItem, TieredContextBuilder } from "../context/contextBuilder";

describe("TieredContextBuilder", () => {
  it("prioritizes tiers under the token budget", () => {
    const builder = new TieredContextBuilder({
      maxTokens: 4,
      estimateTokens: (text) => text.split(" ").length,
    });

    const items: ContextItem[] = [
      {
        id: "short-1",
        tier: "short_term",
        content: "short term",
        priority: 1,
      },
      {
        id: "project-1",
        tier: "project",
        content: "project context here",
        priority: 1,
      },
    ];

    const result = builder.build(items);

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.id).toBe("short-1");
    expect(result.truncated).toBe(true);
  });

  it("orders items by tier and priority", () => {
    const builder = new TieredContextBuilder({
      maxTokens: 20,
      estimateTokens: (text) => text.split(" ").length,
    });

    const items: ContextItem[] = [
      { id: "project-1", tier: "project", content: "project one", priority: 1 },
      { id: "short-2", tier: "short_term", content: "short two", priority: 2 },
      { id: "short-1", tier: "short_term", content: "short one", priority: 1 },
    ];

    const result = builder.build(items);

    expect(result.items[0]?.id).toBe("short-2");
    expect(result.items[1]?.id).toBe("short-1");
    expect(result.items[2]?.id).toBe("project-1");
  });
});
