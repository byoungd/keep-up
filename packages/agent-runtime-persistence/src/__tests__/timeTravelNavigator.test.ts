import { describe, expect, it } from "vitest";
import { InMemoryCheckpointStore } from "../checkpoint/threads";
import { TimeTravelNavigator } from "../timetravel/navigator";

function createCheckpoint(threadId: string, id: string, timestamp: number, value: string) {
  return {
    id,
    threadId,
    timestamp,
    state: { messages: [value], custom: { value } },
    metadata: { label: value, trigger: "turn", compressed: false, sizeBytes: 0 },
  };
}

describe("TimeTravelNavigator", () => {
  it("navigates and diffs checkpoints", async () => {
    const store = new InMemoryCheckpointStore();
    const threadId = "thread-alpha";

    await store.saveThread({
      threadId,
      metadata: { name: "alpha", createdAt: 1, updatedAt: 1, checkpointCount: 0 },
    });

    const first = createCheckpoint(threadId, "c1", 100, "one");
    const second = createCheckpoint(threadId, "c2", 200, "two");
    await store.save(first);
    await store.save(second);

    const applied: Array<unknown> = [];
    const navigator = new TimeTravelNavigator(store, {
      apply: async (state) => {
        applied.push(state);
      },
    });

    const result = await navigator.navigateTo("c2");
    expect(result.availableActions.some((action) => action.type === "backward")).toBe(true);
    expect(applied).toHaveLength(1);

    const diff = await navigator.getDiff("c1", "c2");
    expect(diff.entries.length).toBeGreaterThan(0);
  });

  it("replays checkpoint path", async () => {
    const store = new InMemoryCheckpointStore();
    const threadId = "thread-beta";

    await store.saveThread({
      threadId,
      metadata: { name: "beta", createdAt: 1, updatedAt: 1, checkpointCount: 0 },
    });

    await store.save(createCheckpoint(threadId, "c1", 100, "one"));
    await store.save(createCheckpoint(threadId, "c2", 200, "two"));
    await store.save(createCheckpoint(threadId, "c3", 300, "three"));

    const applied: string[] = [];
    const navigator = new TimeTravelNavigator(store, {
      apply: async (state) => {
        applied.push(String((state.custom as { value: string }).value));
      },
    });

    await navigator.replay("c1", "c3", {
      onStep: (step) => {
        applied.push(String((step.state.custom as { value: string }).value));
      },
    });

    expect(applied).toContain("one");
    expect(applied).toContain("three");
  });
});
