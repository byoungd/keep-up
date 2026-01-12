import { type BenchmarkResult, bench } from "../harness";

type MockAnnotation = {
  id: string;
  spans: Array<{ blockId: string; startTokenId: string; endTokenId: string }>;
  state: "active" | "active_unverified";
};

/**
 * Simulate verification of annotations.
 */
function verifyAnnotations(
  annotations: MockAnnotation[],
  blockIndex: Map<string, boolean>
): number {
  let verified = 0;
  for (const anno of annotations) {
    let allValid = true;
    for (const span of anno.spans) {
      if (!blockIndex.has(span.blockId)) {
        allValid = false;
        break;
      }
    }
    if (allValid) {
      verified++;
    }
  }
  return verified;
}

export function runVerifyPassBench(): BenchmarkResult[] {
  const results: BenchmarkResult[] = [];

  // Setup: Create 1k annotations with 2 spans each
  const annotations: MockAnnotation[] = [];
  const blockIndex = new Map<string, boolean>();

  for (let i = 0; i < 200; i++) {
    blockIndex.set(`block_${i}`, true);
  }

  for (let i = 0; i < 1000; i++) {
    annotations.push({
      id: `anno_${i}`,
      spans: [
        { blockId: `block_${i % 200}`, startTokenId: "t0", endTokenId: "t10" },
        { blockId: `block_${(i + 1) % 200}`, startTokenId: "t0", endTokenId: "t5" },
      ],
      state: "active_unverified",
    });
  }

  results.push(
    bench(
      "verify-1k-annotations",
      () => {
        verifyAnnotations(annotations, blockIndex);
      },
      { iterations: 100, warmup: 10 }
    )
  );

  return results;
}
