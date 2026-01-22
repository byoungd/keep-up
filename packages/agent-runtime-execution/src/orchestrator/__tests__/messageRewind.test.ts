import { describe, expect, it } from "vitest";
import type { AgentMessage } from "../../types";
import { MessageRewindManager } from "../messageRewind";

const TOOL_RESULT = {
  success: true,
  content: [
    {
      type: "text" as const,
      text: "payload\n[Content truncated, 10 characters removed]",
    },
  ],
};

describe("MessageRewindManager", () => {
  it("removes summary messages and truncation markers", () => {
    const messages: AgentMessage[] = [
      { role: "system", content: "system prompt" },
      { role: "user", content: "hello" },
      { role: "system", content: "[Conversation Summary]\nold summary" },
      {
        role: "assistant",
        content: "response\n[Content truncated, 5 characters removed]",
      },
      { role: "tool", toolName: "dummy", result: TOOL_RESULT },
    ];

    const manager = new MessageRewindManager();
    const result = manager.rewindToIndex(messages, messages.length);

    expect(result.removedSummaries).toBe(1);
    expect(result.removedTruncationMarkers).toBe(2);
    expect(result.removedCount).toBe(1);
    expect(
      result.messages.find((msg) => msg.role === "system" && msg.content.includes("Summary"))
    ).toBeUndefined();

    const assistant = result.messages.find((msg) => msg.role === "assistant") as Extract<
      AgentMessage,
      { role: "assistant" }
    >;
    expect(assistant.content).not.toContain("Content truncated");

    const tool = result.messages.find((msg) => msg.role === "tool") as Extract<
      AgentMessage,
      { role: "tool" }
    >;
    expect(tool.result.content[0].type).toBe("text");
    if (tool.result.content[0].type === "text") {
      expect(tool.result.content[0].text).not.toContain("Content truncated");
    }
  });
});
