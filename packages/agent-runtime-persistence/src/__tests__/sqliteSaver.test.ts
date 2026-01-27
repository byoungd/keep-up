import type { NativeTokenizer } from "@ku0/tokenizer-rs";
import * as tokenizer from "@ku0/tokenizer-rs";
import Database from "better-sqlite3";
import { describe, expect, it, vi } from "vitest";
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

  it("uses zstd compression when native tokenizer is available", async () => {
    const db = new Database(":memory:");
    const saver = new SQLiteCheckpointSaver({ database: db, compressionThresholdBytes: 1 });

    const threadId = "thread-zstd";
    await saver.saveThread({
      threadId,
      metadata: { name: "primary", createdAt: 1, updatedAt: 1, checkpointCount: 0 },
    });

    const payload = "ZSTD payload";
    const checkpoint = createCheckpoint(threadId, "ckpt-zstd", 100, payload);

    const compressPayloadZstd = vi.fn(() => ({
      data: new Uint8Array([1, 2, 3]),
      originalBytes: 120,
      compressedBytes: 3,
      compressionRatio: 0.025,
      encoding: "zstd",
    }));

    const decompressPayloadZstd = vi.fn(
      () => new Uint8Array(Buffer.from(JSON.stringify({ messages: [payload] })))
    );

    const nativeTokenizer: NativeTokenizer = {
      countTokens: () => 0,
      countTokensBatch: () => [],
      estimateJsonTokens: () => 0,
      compressContext: () => ({
        messages: [],
        totalTokens: 0,
        removedCount: 0,
        compressionRatio: 0,
        selectedIndices: [],
      }),
      compressPayloadZstd,
      decompressPayloadZstd,
    };

    const tokenizerSpy = vi.spyOn(tokenizer, "getNativeTokenizer").mockReturnValue(nativeTokenizer);

    await saver.save(checkpoint);
    const loaded = await saver.get("ckpt-zstd");

    const row = db
      .prepare("SELECT state_encoding FROM checkpoints WHERE checkpoint_id = ?")
      .get("ckpt-zstd") as { state_encoding: string };

    expect(loaded?.state.messages[0]).toBe(payload);
    expect(row.state_encoding).toBe("zstd");
    expect(compressPayloadZstd).toHaveBeenCalled();
    expect(decompressPayloadZstd).toHaveBeenCalled();

    tokenizerSpy.mockRestore();
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
