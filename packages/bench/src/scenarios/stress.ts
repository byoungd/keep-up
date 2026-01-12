/**
 * LFCC v0.9 RC - Track 13: Stress Test Benchmark
 *
 * Simulates reorder/split operations under stress.
 */

import { LoroDoc } from "loro-crdt";
import { type BenchmarkResult, bench } from "../harness";

/**
 * Simulate block reordering (move operations).
 */
function reorderBlocks(doc: LoroDoc, moves: number): void {
  const list = doc.getList("blocks");
  const len = list.length;
  if (len < 2) {
    return;
  }

  for (let i = 0; i < moves; i++) {
    const from = i % len;
    const to = (i * 7) % len; // pseudo-random destination
    // Simulate move by read + delete + insert (Loro pattern)
    const item = list.get(from);
    if (item !== undefined && from !== to) {
      list.delete(from, 1);
      list.insert(to, item);
    }
  }
}

/**
 * Simulate block splits (insert new block after split point).
 */
function splitBlocks(doc: LoroDoc, splits: number): void {
  const list = doc.getList("blocks");

  for (let i = 0; i < splits; i++) {
    const newId = `split_block_${i}`;
    const block = doc.getMap(newId);
    block.set("id", newId);
    block.set("type", "paragraph");
    block.set("text", `Split content ${i}`);
    list.insert(i % Math.max(1, list.length), block.id);
  }
}

export function runStressBench(): BenchmarkResult[] {
  const results: BenchmarkResult[] = [];

  // Setup: Create initial doc with 100 blocks
  const setupDoc = (): LoroDoc => {
    const doc = new LoroDoc();
    const list = doc.getList("blocks");
    for (let i = 0; i < 100; i++) {
      const block = doc.getMap(`block_${i}`);
      block.set("id", `block_${i}`);
      block.set("type", "paragraph");
      block.set("text", `Block ${i}`);
      list.push(block.id);
    }
    doc.commit();
    return doc;
  };

  // Scenario 1: 500 reorder operations
  results.push(
    bench(
      "reorder-500-ops",
      () => {
        const doc = setupDoc();
        reorderBlocks(doc, 500);
        doc.commit();
      },
      { iterations: 20, warmup: 3, measureMemory: true }
    )
  );

  // Scenario 2: 200 split operations
  results.push(
    bench(
      "split-200-ops",
      () => {
        const doc = setupDoc();
        splitBlocks(doc, 200);
        doc.commit();
      },
      { iterations: 20, warmup: 3, measureMemory: true }
    )
  );

  return results;
}
