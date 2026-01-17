import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createChatMessageStore } from "../storage/chatMessageStore";
import type { CoworkChatMessage } from "../storage/types";

describe("ChatMessageStore", () => {
  let tempDir: string | null = null;

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it("stores and orders messages by createdAt", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "cowork-chat-"));
    const store = createChatMessageStore(join(tempDir, "chat.json"));
    const sessionId = "session-1";

    const older: CoworkChatMessage = {
      messageId: "m1",
      sessionId,
      role: "user",
      content: "First",
      createdAt: 100,
      status: "done",
    };
    const newer: CoworkChatMessage = {
      messageId: "m2",
      sessionId,
      role: "assistant",
      content: "Second",
      createdAt: 200,
      status: "done",
    };

    await store.create(newer);
    await store.create(older);

    const messages = await store.getBySession(sessionId);
    expect(messages.map((m) => m.messageId)).toEqual(["m1", "m2"]);
  });

  it("looks up by clientRequestId", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "cowork-chat-"));
    const store = createChatMessageStore(join(tempDir, "chat.json"));
    const message: CoworkChatMessage = {
      messageId: "m3",
      sessionId: "session-2",
      role: "assistant",
      content: "Hello",
      createdAt: Date.now(),
      status: "done",
      clientRequestId: "req-123",
    };

    await store.create(message);
    const found = await store.getByClientRequestId("req-123");
    expect(found?.messageId).toBe("m3");
  });
});
