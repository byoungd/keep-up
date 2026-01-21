import { describe, expect, test } from "vitest";
import { createStreamingParser } from "../streamingMarkdownParser";

function buildMarkdown(lines: number): string {
  let text = "";
  for (let i = 0; i < lines; i++) {
    text += `- item ${i}\n`;
    if (i % 7 === 0) {
      text += `> quote ${i}\n`;
    }
    if (i % 13 === 0) {
      text += `| A | B |\n| --- | --- |\n| ${i} | ${i + 1} |\n`;
    }
    if (i % 20 === 0) {
      text += "\n";
    }
  }
  return text;
}

function chunkText(text: string, chunkSize = 240): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return chunks;
}

function parseChunks(chunks: string[]): void {
  const parser = createStreamingParser();
  for (const chunk of chunks) {
    parser.push(chunk);
  }
  parser.flush();
}

function warmUp(chunks: string[], iterations = 4): void {
  for (let i = 0; i < iterations; i++) {
    parseChunks(chunks);
  }
}

function measureTimes(fn: () => void, iterations = 12, maxDurationMs = 1500): number[] {
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

describe("Streaming markdown performance (PERF-STREAM-001)", () => {
  test("streaming parser scales near-linearly", () => {
    const sizes = [1000, 5000];
    const perLineTimes: number[] = [];

    for (const size of sizes) {
      const chunks = chunkText(buildMarkdown(size));
      warmUp(chunks);
      const sample = measureTimes(() => parseChunks(chunks), 8, 900);
      expect(sample.length).toBeGreaterThan(0);
      const medianTime = median(sample);
      perLineTimes.push(medianTime / size);
    }

    const ratio = perLineTimes[1] / perLineTimes[0];
    const ratioLimit = Number(process.env.LFCC_STREAMING_MD_RATIO ?? (process.env.CI ? "5" : "7"));
    expect(ratio).toBeLessThan(ratioLimit);
  });

  test("10k line stream meets performance target", () => {
    const chunks = chunkText(buildMarkdown(10000));
    warmUp(chunks);

    const times = measureTimes(() => parseChunks(chunks), 12, 2500);
    expect(times.length).toBeGreaterThan(3);

    const medianTime = median(times);
    const p95 = percentile(times, 95);

    const maxMedian = Number(
      process.env.LFCC_STREAMING_MD_MEDIAN_MS ?? (process.env.CI ? "500" : "1200")
    );
    const maxP95 = Number(
      process.env.LFCC_STREAMING_MD_P95_MS ?? (process.env.CI ? "700" : "1600")
    );

    expect(medianTime).toBeLessThan(maxMedian);
    expect(p95).toBeLessThan(maxP95);
  });
});
