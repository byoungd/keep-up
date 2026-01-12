/**
 * LFCC v0.9 RC - Track 13: Collaboration Sync Benchmark
 *
 * Simulates multi-peer update fan-out and merge behavior.
 */

import { LoroDoc } from "loro-crdt";
import { type BenchmarkResult, bench } from "../harness";

function seedDoc(doc: LoroDoc, blockCount: number): void {
  const text = doc.getText("body");
  for (let i = 0; i < blockCount; i++) {
    text.insert(0, `seed-${i} `);
  }
  doc.commit();
}

function fanoutUpdate(source: LoroDoc, peers: LoroDoc[]): void {
  const update = source.export({ mode: "update" });
  for (const peer of peers) {
    if (peer !== source) {
      peer.import(update);
    }
  }
}

function simulateCollab(peersCount: number, edits: number, seedBlocks: number): void {
  const peers: LoroDoc[] = [];
  for (let i = 0; i < peersCount; i++) {
    const doc = new LoroDoc();
    doc.setPeerId(i + 1);
    peers.push(doc);
  }

  seedDoc(peers[0], seedBlocks);
  const snapshot = peers[0].export({ mode: "snapshot" });
  for (let i = 1; i < peers.length; i++) {
    peers[i].import(snapshot);
  }

  for (let i = 0; i < edits; i++) {
    const target = peers[i % peersCount];
    const text = target.getText("body");
    text.insert(0, `edit-${i} `);
    target.commit();
    fanoutUpdate(target, peers);
  }
}

export function runCollabBench(): BenchmarkResult[] {
  const results: BenchmarkResult[] = [];

  results.push(
    bench(
      "collab-5peers-100edits",
      () => {
        simulateCollab(5, 100, 20);
      },
      { iterations: 10, warmup: 2, measureMemory: true }
    )
  );

  results.push(
    bench(
      "collab-10peers-200edits",
      () => {
        simulateCollab(10, 200, 50);
      },
      { iterations: 6, warmup: 2, measureMemory: true }
    )
  );

  return results;
}
