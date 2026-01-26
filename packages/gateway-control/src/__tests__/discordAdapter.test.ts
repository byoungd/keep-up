import { describe, expect, it } from "vitest";
import { extractDiscordMessage } from "../channels/discordAdapter";

const baseMessage = {
  id: "123",
  content: "hello",
  timestamp: "2025-01-01T00:00:00.000Z",
  author: { id: "user-1", username: "test" },
};

describe("extractDiscordMessage", () => {
  it("extracts text messages", () => {
    const message = extractDiscordMessage(baseMessage, "channel-1");
    expect(message).not.toBeNull();
    expect(message?.text).toBe("hello");
    expect(message?.conversationId).toBe("channel-1");
    expect(message?.senderId).toBe("user-1");
  });

  it("returns null for empty content", () => {
    const message = extractDiscordMessage({ ...baseMessage, content: "   " }, "channel-1");
    expect(message).toBeNull();
  });
});
