import { describe, expect, test } from "vitest";
import { type BlockTransform, createBlockMapping } from "../mapping/axioms";

/**
 * Performance test stability (P1.1):
 * - Use multiple iterations with median
 * - Warm up before measuring
 * - Use percentile-based guardrails
 * - Apply a runtime cap to avoid hangs on slow CI
 */

function warmUp(iterations = 5): void {
  const transforms: BlockTransform[] = [];
  for (let i = 0; i < 100; i++) {
    transforms.push({
      kind: "unchanged",
      oldId: `old-${i}`,
      newId: `new-${i}`,
    });
  }
  for (let i = 0; i < iterations; i++) {
    createBlockMapping(transforms);
  }
}

function measureTimes(fn: () => void, iterations = 20, maxDurationMs = 1000): number[] {
  const times: number[] = [];
  const deadline = performance.now() + maxDurationMs;

  for (let i = 0; i < iterations; i++) {
    if (performance.now() > deadline) {
      break;
    }
    const start = performance.now();
    fn();
    const end = performance.now();
    times.push(end - start);
  }

  return times;
}

function median(times: number[]): number {
  const sorted = [...times].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function percentile(times: number[], p: number): number {
  const sorted = [...times].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

describe("BlockMapping Performance (PERF-001/RISK-002)", () => {
  test("mapping generation is O(N) linear time", () => {
    warmUp();
    const perItemTimes: number[] = [];
    const sizes = [1000, 5000];

    for (const size of sizes) {
      const transforms: BlockTransform[] = [];
      for (let i = 0; i < size; i++) {
        transforms.push({
          kind: "unchanged",
          oldId: `old-${i}`,
          newId: `new-${i}`,
        });
      }

      const sample = measureTimes(() => createBlockMapping(transforms), 10, 500);
      expect(sample.length).toBeGreaterThan(0);
      const medianTime = median(sample);
      perItemTimes.push(medianTime / size);
    }

    expect(perItemTimes.length).toBe(2);
    // Compare per-item cost to avoid tiny baselines skewing ratios
    const ratio = perItemTimes[1] / perItemTimes[0];
    const ratioLimit = Number(process.env.LFCC_BLOCK_MAPPING_RATIO ?? (process.env.CI ? "4" : "5"));
    expect(ratio).toBeLessThan(ratioLimit);
  });

  test("10k blocks full mapping generation meets performance target", () => {
    warmUp();

    const transforms: BlockTransform[] = [];
    for (let i = 0; i < 10000; i++) {
      transforms.push({
        kind: "unchanged",
        oldId: `old-${i}`,
        newId: `new-${i}`,
      });
    }

    const iterations = 25;
    const times = measureTimes(() => createBlockMapping(transforms), iterations, 1500);
    expect(times.length).toBeGreaterThan(5);

    const medianTime = median(times);
    const p95 = percentile(times, 95);

    const maxMedian = Number(
      process.env.LFCC_BLOCK_MAPPING_MEDIAN_MS ?? (process.env.CI ? "150" : "400")
    );
    const maxP95 = Number(
      process.env.LFCC_BLOCK_MAPPING_P95_MS ?? (process.env.CI ? "200" : "600")
    );

    // Target: tune via env vars for CI variability; defaults are conservative.
    expect(medianTime).toBeLessThan(maxMedian);
    expect(p95).toBeLessThan(maxP95);
  });
});
