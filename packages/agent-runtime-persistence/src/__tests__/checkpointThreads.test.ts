import { describe, expect, it } from "vitest";
import { CheckpointThreadManager, InMemoryCheckpointStore } from "../checkpoint/threads";

const fixedNow = (() => {
  let current = 1_700_000_000_000;
  return () => {
    current += 1000;
    return current;
  };
})();

describe("CheckpointThreadManager", () => {
  it("creates threads and saves checkpoints", async () => {
    const store = new InMemoryCheckpointStore();
    const manager = new CheckpointThreadManager({
      saver: store,
      threadStore: store,
      frequency: { minIntervalMs: 0 },
      now: fixedNow,
    });

    const thread = await manager.createThread({ name: "primary" });
    const checkpoint = await manager.saveCheckpoint({
      threadId: thread.threadId,
      state: { messages: [{ role: "user", content: "hi" }] },
      metadata: { label: "start", trigger: "manual" },
    });

    const loaded = await store.get(checkpoint.id);
    expect(loaded?.threadId).toBe(thread.threadId);
    expect(loaded?.metadata.label).toBe("start");

    const latest = await store.getLatest(thread.threadId);
    expect(latest?.id).toBe(checkpoint.id);
  });

  it("deletes thread checkpoints", async () => {
    const store = new InMemoryCheckpointStore();
    const manager = new CheckpointThreadManager({
      saver: store,
      threadStore: store,
      now: fixedNow,
    });
    const thread = await manager.createThread({ name: "cleanup" });

    await manager.saveCheckpoint({
      threadId: thread.threadId,
      state: { messages: [] },
      metadata: { label: "one", trigger: "turn" },
    });

    await store.deleteThread(thread.threadId);
    const checkpoints = await store.list(thread.threadId);
    expect(checkpoints).toHaveLength(0);
  });
});
