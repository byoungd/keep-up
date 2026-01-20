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

describe("SQLiteCheckpointSaver Boundary Conditions", () => {
  it("should auto-create thread when saving checkpoint to non-existent thread", async () => {
    const db = new Database(":memory:");
    const saver = new SQLiteCheckpointSaver({ database: db });

    const checkpoint = createCheckpoint("auto-created", "ckpt-1", 100, "data");
    // Implementation auto-creates thread via INSERT OR IGNORE
    await expect(saver.save(checkpoint)).resolves.not.toThrow();

    const thread = await saver.getThread("auto-created");
    expect(thread).toBeDefined();

    saver.close();
  });

  it("should upsert duplicate checkpoint ID", async () => {
    const db = new Database(":memory:");
    const saver = new SQLiteCheckpointSaver({ database: db });
    const threadId = "thread-1";
    await saver.saveThread({
      threadId,
      metadata: { name: "test", createdAt: 1, updatedAt: 1, checkpointCount: 0 },
    });

    const checkpoint = createCheckpoint(threadId, "ckpt-1", 100, "original");
    await saver.save(checkpoint);

    // Upsert with same ID updates existing checkpoint
    const updated = createCheckpoint(threadId, "ckpt-1", 200, "updated");
    await expect(saver.save(updated)).resolves.not.toThrow();

    const loaded = await saver.get("ckpt-1");
    expect(loaded?.state.messages[0]).toBe("updated");

    saver.close();
  });

  it("should return undefined for non-existent checkpoint", async () => {
    const db = new Database(":memory:");
    const saver = new SQLiteCheckpointSaver({ database: db });

    const result = await saver.get("non-existent");
    expect(result).toBeUndefined();

    saver.close();
  });

  it("should handle very large payloads", async () => {
    const db = new Database(":memory:");
    const saver = new SQLiteCheckpointSaver({ database: db });
    const threadId = "thread-1";
    await saver.saveThread({
      threadId,
      metadata: { name: "test", createdAt: 1, updatedAt: 1, checkpointCount: 0 },
    });

    const largePayload = "X".repeat(1024 * 1024); // 1MB
    const checkpoint = createCheckpoint(threadId, "ckpt-1", 100, largePayload);
    await saver.save(checkpoint);

    const loaded = await saver.get("ckpt-1");
    expect(loaded?.state.messages[0]).toBe(largePayload);

    saver.close();
  });
});
