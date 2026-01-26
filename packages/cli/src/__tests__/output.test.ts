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

  it("formats json output with metadata", () => {
    const state: AgentState = {
      turn: 1,
      status: "complete",
      messages: [{ role: "assistant", content: "done" }],
      pendingToolCalls: [],
    };

    const output = formatAgentOutput(state, "json", {
      sessionId: "session-1",
      toolCalls: [
        {
          name: "tool",
          arguments: {},
          status: "completed",
          startedAt: 0,
          result: {
            success: true,
            content: [{ type: "text", text: "ok" }],
          },
        },
      ],
      approvals: [
        {
          id: "approval-1",
          kind: "tool",
          status: "approved",
          request: { toolName: "tool" },
          requestedAt: 0,
        },
      ],
    });

    const parsed = JSON.parse(output) as {
      toolCalls: Array<{ result?: { success: boolean; content: Array<{ type: string }> } }>;
      approvals: Array<{ id: string }>;
    };

    expect(parsed.toolCalls[0]?.result?.success).toBe(true);
    expect(parsed.toolCalls[0]?.result?.content[0]?.type).toBe("text");
    expect(parsed.approvals[0]?.id).toBe("approval-1");
  });
});
