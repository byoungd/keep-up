import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type SessionRecord, SessionStore } from "../utils/sessionStore";

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("SessionStore", () => {
  it("saves and lists sessions", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "keepup-cli-"));
    const store = new SessionStore({ baseDir: tempDir });

    const session: SessionRecord = {
      id: "session-1",
      title: "Test Session",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      toolCalls: [],
    };

    await store.save(session);
    const sessions = await store.list();

    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe("session-1");
  });
});
