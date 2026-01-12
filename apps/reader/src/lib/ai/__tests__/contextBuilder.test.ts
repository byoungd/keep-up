import { describe, expect, it } from "vitest";
import { buildChatMessages } from "../contextBuilder";

describe("buildChatMessages", () => {
  it("keeps user content within budget", () => {
    const result = buildChatMessages({
      prompt: "Short prompt",
      context: "x".repeat(5000),
      history: [
        { role: "user", content: "history-1" },
        { role: "assistant", content: "history-2" },
      ],
      charBudget: 100,
      minUserChars: 50,
    });

    const userMessage = result.messages[result.messages.length - 1];
    expect(userMessage?.role).toBe("user");
    expect(userMessage?.content.length).toBeLessThanOrEqual(100);
  });

  it("trims history to preserve user budget", () => {
    const history = Array.from({ length: 20 }, (_, idx) => ({
      role: idx % 2 === 0 ? "user" : "assistant",
      content: `message-${idx}`,
    }));
    const result = buildChatMessages({
      prompt: "Prompt",
      history: history as unknown as import("../contextBuilder").ChatMessage[],
      charBudget: 50,
      minUserChars: 20,
    });

    expect(result.messages.length).toBeGreaterThan(0);
    expect(result.messages[result.messages.length - 1]?.role).toBe("user");
  });
});
