import type { AgentState } from "@ku0/agent-runtime-core";
import { describe, expect, it } from "vitest";
import { extractAssistantText, formatAgentOutput } from "../utils/output";

describe("output formatting", () => {
  it("extracts the last assistant message", () => {
    const state: AgentState = {
      turn: 1,
      status: "complete",
      messages: [
        { role: "user", content: "hello" },
        { role: "assistant", content: "first" },
        { role: "assistant", content: "second" },
      ],
      pendingToolCalls: [],
    };

    expect(extractAssistantText(state)).toBe("second");
  });

  it("formats json output", () => {
    const state: AgentState = {
      turn: 1,
      status: "complete",
      messages: [{ role: "assistant", content: "done" }],
      pendingToolCalls: [],
    };

    expect(formatAgentOutput(state, "json")).toContain('"messages"');
  });
});
