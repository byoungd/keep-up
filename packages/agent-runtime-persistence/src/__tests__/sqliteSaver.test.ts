import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { SQLiteCheckpointSaver } from "../checkpoint/sqliteSaver";
import type { Checkpoint } from "../checkpoint/threads";

function createCheckpoint(
  threadId: string,
  id: string,
  timestamp: number,
  payload: string
): Checkpoint {
  return {
    id,
    threadId,
    timestamp,
    state: { messages: [payload] },
    metadata: {
      label: "snapshot",
      trigger: "manual",
      compressed: false,
      sizeBytes: 0,
    },
  };
}

describe("SQLiteCheckpointSaver", () => {
  it("stores and retrieves checkpoints with compression", async () => {
    const db = new Database(":memory:");
    const saver = new SQLiteCheckpointSaver({ database: db, compressionThresholdBytes: 50 });

    const threadId = "thread-1";
    await saver.saveThread({
      threadId,
      metadata: { name: "primary", createdAt: 1, updatedAt: 1, checkpointCount: 0 },
    });

    const payload = "A".repeat(200);
    const checkpoint = createCheckpoint(threadId, "ckpt-1", 100, payload);
    await saver.save(checkpoint);

    const loaded = await saver.get("ckpt-1");
    expect(loaded?.state.messages[0]).toBe(payload);
    expect(loaded?.metadata.compressed).toBe(true);
    expect(loaded?.metadata.sizeBytes).toBeGreaterThan(0);

    saver.close();
  });

  it("returns latest checkpoint", async () => {
    const db = new Database(":memory:");
    const saver = new SQLiteCheckpointSaver({ database: db });
    const threadId = "thread-2";

    await saver.saveThread({
      threadId,
      metadata: { name: "primary", createdAt: 1, updatedAt: 1, checkpointCount: 0 },
    });

    await saver.save(createCheckpoint(threadId, "ckpt-1", 100, "one"));
    await saver.save(createCheckpoint(threadId, "ckpt-2", 200, "two"));

    const latest = await saver.getLatest(threadId);
    expect(latest?.id).toBe("ckpt-2");

    saver.close();
  });
});
