import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SessionStore } from "../index";

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("SessionStore", () => {
  it("normalizes missing metadata arrays", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "keepup-tooling-"));
    const filePath = path.join(tempDir, "sessions.json");

    const legacy = [
      {
        id: "session-1",
        title: "Legacy",
        createdAt: 1,
        updatedAt: 2,
        messages: [],
      },
    ];

    await writeFile(filePath, JSON.stringify(legacy), "utf8");

    const store = new SessionStore({ baseDir: tempDir, fileName: "sessions.json" });
    const sessions = await store.list(1);

    expect(sessions).toHaveLength(1);
    expect(sessions[0].messages).toEqual([]);
    expect(sessions[0].toolCalls).toEqual([]);
    expect(sessions[0].approvals).toEqual([]);
  });
});
