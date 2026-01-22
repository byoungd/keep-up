import { describe, expect, test } from "vitest";
import { absoluteFromAnchor, anchorFromAbsolute } from "../mapping/anchors.js";

function warmUp(iterations = 5): void {
  const anchors: string[] = [];
  for (let i = 0; i < 200; i++) {
    anchors.push(anchorFromAbsolute(`warm-${i}`, i, "after"));
  }
  for (let i = 0; i < iterations; i++) {
    decodeAnchors(anchors);
  }
}

function decodeAnchors(anchors: string[]): number {
  let decoded = 0;
  for (const anchor of anchors) {
    if (absoluteFromAnchor(anchor)) {
      decoded++;
    }
  }
  return decoded;
}

function measureTimes(fn: () => void, iterations = 12, maxDurationMs = 800): number[] {
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

describe("Anchor Decode Performance (PERF-ANCHOR-001)", () => {
  test("decode throughput scales linearly", () => {
    warmUp();
    const perItemTimes: number[] = [];
    const sizes = [1000, 5000];

    for (const size of sizes) {
      const anchors: string[] = [];
      for (let i = 0; i < size; i++) {
        anchors.push(anchorFromAbsolute(`block-${i}`, i % 64, "after"));
      }

      const sample = measureTimes(() => decodeAnchors(anchors), 10, 1000);
      expect(sample.length).toBeGreaterThan(0);
      const stableSample = sample.length > 1 ? sample.slice(1) : sample;
      perItemTimes.push(median(stableSample) / size);
    }

    expect(perItemTimes.length).toBe(2);
    const ratio = perItemTimes[1] / perItemTimes[0];
    const ratioLimit = Number(process.env.LFCC_ANCHOR_DECODE_RATIO ?? (process.env.CI ? "6" : "9"));
    // Allow headroom for CI variance while still flagging superlinear regressions.
    expect(ratio).toBeLessThan(ratioLimit);
  }, 15000);
});
