/**
 * LFCC v0.9 RC - Track 13: Fast Path Benchmark
 *
 * Simulates 10k block typing burst to measure fast-path performance.
 */

import { LoroDoc } from "loro-crdt";
import { type BenchmarkResult, bench } from "../harness";

/**
 * Simulate block creation in Loro doc.
 */
function createBlocks(doc: LoroDoc, count: number): void {
  const list = doc.getList("blocks");
  for (let i = 0; i < count; i++) {
    const block = doc.getMap(`block_${i}`);
    block.set("id", `block_${i}`);
    block.set("type", "paragraph");
    block.set("text", `Content for block ${i}`);
    list.push(block.id);
  }
}

/**
 * Simulate text edits in blocks.
 */
function editBlocks(doc: LoroDoc, count: number): void {
  for (let i = 0; i < count; i++) {
    const blockId = `block_${i % 100}`; // cycle through first 100 blocks
    const block = doc.getMap(blockId);
    const existing = (block.get("text") as string) ?? "";
    block.set("text", `${existing}x`);
  }
}

export function runFastPathBench(): BenchmarkResult[] {
  const results: BenchmarkResult[] = [];

  // Scenario 1: Create 10k blocks
  results.push(
    bench(
      "create-10k-blocks",
      () => {
        const doc = new LoroDoc();
        createBlocks(doc, 10000);
        doc.commit();
      },
      { iterations: 10, warmup: 2, measureMemory: true }
    )
  );

  // Scenario 2: Edit existing blocks (fast path)
  const editDoc = new LoroDoc();
  createBlocks(editDoc, 100);
  editDoc.commit();

  results.push(
    bench(
      "edit-10k-operations",
      () => {
        editBlocks(editDoc, 10000);
        editDoc.commit();
      },
      { iterations: 10, warmup: 2 }
    )
  );

  return results;
}
