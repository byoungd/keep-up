/**
 * LFCC v0.9 RC - Track 13: Benchmark Harness
 *
 * Core benchmark utilities for measuring performance.
 */

export type BenchmarkResult = {
  name: string;
  iterations: number;
  totalMs: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  opsPerSec: number;
  memoryDelta?: number;
};

export type BenchmarkOptions = {
  /** Number of warmup iterations */
  warmup?: number;
  /** Number of measured iterations */
  iterations?: number;
  /** Measure memory usage */
  measureMemory?: boolean;
};

const DEFAULT_OPTIONS: Required<BenchmarkOptions> = {
  warmup: 5,
  iterations: 100,
  measureMemory: false,
};

/**
 * Run a synchronous benchmark.
 */
export function bench(
  name: string,
  fn: () => void,
  options: BenchmarkOptions = {}
): BenchmarkResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const times: number[] = [];

  // Warmup
  for (let i = 0; i < opts.warmup; i++) {
    fn();
  }

  // Force GC if available
  const gc = (globalThis as unknown as { gc?: () => void }).gc;
  if (gc) {
    gc();
  }

  const memBefore = opts.measureMemory ? process.memoryUsage().heapUsed : 0;

  // Measured runs
  for (let i = 0; i < opts.iterations; i++) {
    const start = performance.now();
    fn();
    const end = performance.now();
    times.push(end - start);
  }

  const memAfter = opts.measureMemory ? process.memoryUsage().heapUsed : 0;

  return computeStats(name, times, opts.measureMemory ? memAfter - memBefore : undefined);
}

/**
 * Run an async benchmark.
 */
export async function benchAsync(
  name: string,
  fn: () => Promise<void>,
  options: BenchmarkOptions = {}
): Promise<BenchmarkResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const times: number[] = [];

  // Warmup
  for (let i = 0; i < opts.warmup; i++) {
    await fn();
  }

  // Force GC if available
  const gc = (globalThis as unknown as { gc?: () => void }).gc;
  if (gc) {
    gc();
  }

  const memBefore = opts.measureMemory ? process.memoryUsage().heapUsed : 0;

  // Measured runs
  for (let i = 0; i < opts.iterations; i++) {
    const start = performance.now();
    await fn();
    const end = performance.now();
    times.push(end - start);
  }

  const memAfter = opts.measureMemory ? process.memoryUsage().heapUsed : 0;

  return computeStats(name, times, opts.measureMemory ? memAfter - memBefore : undefined);
}

function computeStats(name: string, times: number[], memoryDelta?: number): BenchmarkResult {
  const sorted = [...times].sort((a, b) => a - b);
  const total = times.reduce((a, b) => a + b, 0);
  const avg = total / times.length;

  return {
    name,
    iterations: times.length,
    totalMs: total,
    avgMs: avg,
    minMs: sorted[0],
    maxMs: sorted[sorted.length - 1],
    p50Ms: sorted[Math.floor(sorted.length * 0.5)],
    p95Ms: sorted[Math.floor(sorted.length * 0.95)],
    p99Ms: sorted[Math.floor(sorted.length * 0.99)],
    opsPerSec: 1000 / avg,
    memoryDelta,
  };
}

/**
 * Format benchmark result for console output.
 */
export function formatResult(result: BenchmarkResult): string {
  const lines = [
    `📊 ${result.name}`,
    `   iterations: ${result.iterations}`,
    `   avg: ${result.avgMs.toFixed(3)}ms`,
    `   p50: ${result.p50Ms.toFixed(3)}ms`,
    `   p95: ${result.p95Ms.toFixed(3)}ms`,
    `   p99: ${result.p99Ms.toFixed(3)}ms`,
    `   ops/sec: ${result.opsPerSec.toFixed(2)}`,
  ];

  if (result.memoryDelta !== undefined) {
    lines.push(`   mem Δ: ${(result.memoryDelta / 1024 / 1024).toFixed(2)}MB`);
  }

  return lines.join("\n");
}

/**
 * Compare two results and return regression status.
 */
export function compareResults(
  baseline: BenchmarkResult,
  current: BenchmarkResult,
  threshold = 0.1
): { regressed: boolean; changePercent: number } {
  const changePercent = (current.avgMs - baseline.avgMs) / baseline.avgMs;
  return {
    regressed: changePercent > threshold,
    changePercent,
  };
}
