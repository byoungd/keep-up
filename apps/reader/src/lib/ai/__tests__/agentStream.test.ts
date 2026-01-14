import { describe, expect, it } from "vitest";
import { parseAgentStreamEvent } from "../agentStream";

describe("parseAgentStreamEvent", () => {
  it("returns event payloads", () => {
    const payload = JSON.stringify({
      event: {
        type: "tool:calling",
        timestamp: 123,
        turn: 2,
        data: { toolName: "file:read", arguments: { path: "README.md" } },
      },
    });

    expect(parseAgentStreamEvent(payload)).toEqual({
      type: "tool:calling",
      timestamp: 123,
      turn: 2,
      data: { toolName: "file:read", arguments: { path: "README.md" } },
    });
  });

  it("returns null for non-event payloads", () => {
    expect(parseAgentStreamEvent("not json")).toBeNull();
    expect(
      parseAgentStreamEvent(JSON.stringify({ choices: [{ delta: { content: "Hi" } }] }))
    ).toBeNull();
  });
});
