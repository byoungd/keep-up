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
  warmup?: number;
  iterations?: number;
  measureMemory?: boolean;
};

const DEFAULT_OPTIONS: Required<BenchmarkOptions> = {
  warmup: 5,
  iterations: 100,
  measureMemory: false,
};

export function bench(
  name: string,
  fn: () => void,
  options: BenchmarkOptions = {}
): BenchmarkResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const times: number[] = [];

  for (let i = 0; i < opts.warmup; i++) {
    fn();
  }

  const gc = (globalThis as { gc?: () => void }).gc;
  if (gc) {
    gc();
  }

  const memBefore = opts.measureMemory ? process.memoryUsage().heapUsed : 0;

  for (let i = 0; i < opts.iterations; i++) {
    const start = performance.now();
    fn();
    const end = performance.now();
    times.push(end - start);
  }

  const memAfter = opts.measureMemory ? process.memoryUsage().heapUsed : 0;

  return computeStats(name, times, opts.measureMemory ? memAfter - memBefore : undefined);
}

export async function benchAsync(
  name: string,
  fn: () => Promise<void>,
  options: BenchmarkOptions = {}
): Promise<BenchmarkResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const times: number[] = [];

  for (let i = 0; i < opts.warmup; i++) {
    await fn();
  }

  const gc = (globalThis as { gc?: () => void }).gc;
  if (gc) {
    gc();
  }

  const memBefore = opts.measureMemory ? process.memoryUsage().heapUsed : 0;

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
    minMs: sorted[0] ?? 0,
    maxMs: sorted[sorted.length - 1] ?? 0,
    p50Ms: sorted[Math.floor(sorted.length * 0.5)] ?? 0,
    p95Ms: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
    p99Ms: sorted[Math.floor(sorted.length * 0.99)] ?? 0,
    opsPerSec: avg > 0 ? 1000 / avg : 0,
    memoryDelta,
  };
}
