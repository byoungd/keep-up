import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

type StorageEngineConstructor = typeof import("@ku0/storage-engine-rs").StorageEngine;

async function loadStorageEngine(): Promise<StorageEngineConstructor | null> {
  try {
    const module = await import("@ku0/storage-engine-rs");
    return module.StorageEngine;
  } catch {
    return null;
  }
}

const StorageEngine = await loadStorageEngine();
const describeIfStorageEngine = StorageEngine ? describe : describe.skip;

describeIfStorageEngine("Native Storage Engine Integration", () => {
  let rootDir: string;

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), "native-storage-test-"));
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  it("should initialize and perform basic operations", () => {
    if (!StorageEngine) {
      throw new Error("StorageEngine module not available");
    }
    const engine = new StorageEngine(rootDir);
    expect(engine).toBeDefined();

    // Checkpoint
    const ckptId = "test-ckpt";
    const data = new Uint8Array([1, 2, 3, 4]);
    engine.saveCheckpoint(ckptId, data);

    const loaded = engine.loadCheckpoint(ckptId);
    if (!loaded) {
      throw new Error("Failed to load checkpoint");
    }
    expect(new Uint8Array(loaded)).toEqual(data);

    // Events
    const seq1 = engine.appendEvent(new Uint8Array([10]));
    const seq2 = engine.appendEvent(new Uint8Array([20]));

    expect(typeof seq1).toBe("bigint");
    expect(seq1).toBe(0n);
    expect(seq2).toBe(1n);

    // Replay
    const events = engine.replayEvents(0n);
    expect(events).toHaveLength(2);
    expect(new Uint8Array(events[0])).toEqual(new Uint8Array([10]));
    expect(new Uint8Array(events[1])).toEqual(new Uint8Array([20]));
  });
});
