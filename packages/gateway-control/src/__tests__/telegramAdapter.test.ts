import { describe, expect, it } from "vitest";
import { extractTelegramMessage } from "../channels/telegramAdapter";

const baseUpdate = {
  update_id: 42,
  message: {
    message_id: 7,
    date: 1_700_000_000,
    text: "hello",
    chat: { id: 123, type: "private" },
    from: { id: 456, username: "test" },
  },
};

describe("extractTelegramMessage", () => {
  it("extracts text messages", () => {
    const message = extractTelegramMessage(baseUpdate);
    expect(message).not.toBeNull();
    expect(message?.text).toBe("hello");
    expect(message?.conversationId).toBe("123");
    expect(message?.senderId).toBe("456");
  });

  it("returns null for non-text messages", () => {
    const update = {
      update_id: 1,
      message: {
        message_id: 2,
        date: 1_700_000_000,
        chat: { id: 999, type: "private" },
      },
    };

    const message = extractTelegramMessage(update);
    expect(message).toBeNull();
  });
});
