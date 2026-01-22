/**
 * BatchProcessor Tests
 */

import { describe, expect, it } from "vitest";
import { BatchProcessor } from "../utils/batch";

describe("BatchProcessor", () => {
  it("batches addMany into a single flush", async () => {
    const calls: number[] = [];
    const processor = new BatchProcessor<number, number>(
      { maxSize: 3, maxWaitMs: 1000 },
      async (batch) => {
        calls.push(batch.length);
        return batch.map((value) => value * 2);
      }
    );

    const results = await processor.addMany([1, 2, 3]);

    expect(calls).toEqual([3]);
    expect(results).toEqual([2, 4, 6]);
  });

  it("resolves duplicates by insertion order", async () => {
    const processor = new BatchProcessor<{ id: string }, { id: string; index: number }>(
      { maxSize: 3, maxWaitMs: 1000 },
      async (batch) => batch.map((item, index) => ({ id: item.id, index }))
    );

    const item = { id: "same" };
    const results = await Promise.all([
      processor.add(item),
      processor.add(item),
      processor.add({ id: "other" }),
    ]);

    expect(results.map((result) => result.index)).toEqual([0, 1, 2]);
  });

  it("flushes queued items added during processing", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    let calls = 0;
    const processor = new BatchProcessor<number, number>(
      { maxSize: 2, maxWaitMs: 1000 },
      async (batch) => {
        calls += 1;
        if (calls === 1) {
          await gate;
        }
        return batch.map((value) => value * 10);
      }
    );

    const first = processor.add(1);
    const second = processor.add(2);
    const third = processor.add(3);
    release?.();

    const results = await Promise.all([first, second, third]);

    expect(results).toEqual([10, 20, 30]);
    expect(calls).toBe(2);
  });
});
