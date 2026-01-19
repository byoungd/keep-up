import { performance } from "node:perf_hooks";

import { LRUCache } from "../src/utils/cache";

type CacheLike<T> = {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
};

type CacheFactory = () => CacheLike<number>;

type BenchOptions = {
  iterations: number;
  warmup: number;
  measureMemory?: boolean;
};

type BenchResult = {
  name: string;
  iterations: number;
  totalMs: number;
  avgMs: number;
  opsPerSec: number;
  memoryDeltaBytes?: number;
};

class NaiveMapCache<T> implements CacheLike<T> {
  private readonly map = new Map<string, T>();

  constructor(private readonly maxEntries: number) {}

  get(key: string): T | undefined {
    return this.map.get(key);
  }

  set(key: string, value: T): void {
    if (!this.map.has(key) && this.map.size >= this.maxEntries) {
      const firstKey = this.map.keys().next().value;
      if (firstKey !== undefined) {
        this.map.delete(firstKey);
      }
    }
    this.map.set(key, value);
  }
}

const MAX_ENTRIES = 1000;
const INSERT_COUNT = 10_000;
const READ_COUNT = 10_000;
const EVICT_COUNT = 1000;

const insertKeys = Array.from({ length: INSERT_COUNT }, (_, i) => `insert-${i}`);
const readKeys = Array.from({ length: READ_COUNT }, (_, i) =>
  i % 2 === 0 ? `seed-${i % MAX_ENTRIES}` : `miss-${i}`
);
const evictKeys = Array.from({ length: EVICT_COUNT }, (_, i) => `evict-${i}`);

const scenarios: Array<{
  name: string;
  measureMemory?: boolean;
  run: (cache: CacheLike<number>) => void;
}> = [
  {
    name: "insert",
    measureMemory: true,
    run: (cache) => {
      for (let i = 0; i < insertKeys.length; i++) {
        cache.set(insertKeys[i], i);
      }
    },
  },
  {
    name: "read (50% hit)",
    run: (cache) => {
      for (let i = 0; i < MAX_ENTRIES; i++) {
        cache.set(`seed-${i}`, i);
      }
      for (const key of readKeys) {
        cache.get(key);
      }
    },
  },
  {
    name: "evict",
    run: (cache) => {
      for (let i = 0; i < MAX_ENTRIES; i++) {
        cache.set(`seed-${i}`, i);
      }
      for (let i = 0; i < evictKeys.length; i++) {
        cache.set(evictKeys[i], i);
      }
    },
  },
];

function runBench(name: string, fn: () => void, options: BenchOptions): BenchResult {
  for (let i = 0; i < options.warmup; i++) {
    fn();
  }

  const gc = (globalThis as { gc?: () => void }).gc;
  if (gc) {
    gc();
  }

  const memBefore = options.measureMemory ? process.memoryUsage().heapUsed : 0;

  let totalMs = 0;
  for (let i = 0; i < options.iterations; i++) {
    const start = performance.now();
    fn();
    totalMs += performance.now() - start;
  }

  const memAfter = options.measureMemory ? process.memoryUsage().heapUsed : 0;

  return {
    name,
    iterations: options.iterations,
    totalMs,
    avgMs: totalMs / options.iterations,
    opsPerSec: totalMs > 0 ? 1000 / (totalMs / options.iterations) : 0,
    memoryDeltaBytes: options.measureMemory ? memAfter - memBefore : undefined,
  };
}

function formatResult(result: BenchResult): string {
  const lines = [
    `[bench] ${result.name}`,
    `   iterations: ${result.iterations}`,
    `   avg: ${result.avgMs.toFixed(3)}ms`,
    `   ops/sec: ${result.opsPerSec.toFixed(2)}`,
  ];

  if (result.memoryDeltaBytes !== undefined) {
    lines.push(`   mem Δ: ${(result.memoryDeltaBytes / 1024 / 1024).toFixed(2)}MB`);
  }

  return lines.join("\n");
}

async function loadExternalLruCache(): Promise<CacheFactory | null> {
  try {
    const module = await import("lru-cache");
    const ExternalLRUCache =
      (module as { LRUCache?: new (options: { max: number; ttl?: number }) => unknown }).LRUCache ??
      (module as { default?: new (options: { max: number; ttl?: number }) => unknown }).default;

    if (!ExternalLRUCache) {
      return null;
    }

    return () => {
      const cache = new ExternalLRUCache({ max: MAX_ENTRIES, ttl: 0 }) as CacheLike<number>;
      return {
        get: (key: string) => (cache.get as (k: string) => number | undefined)(key),
        set: (key: string, value: number) =>
          (cache.set as (k: string, v: number) => void)(key, value),
      };
    };
  } catch {
    return null;
  }
}

async function main() {
  const caches: Array<{ name: string; create: CacheFactory }> = [
    {
      name: "utils/LRUCache",
      create: () =>
        new LRUCache<number>({
          maxEntries: MAX_ENTRIES,
          defaultTtlMs: 0,
          maxSizeBytes: Number.POSITIVE_INFINITY,
        }),
    },
    { name: "naive Map", create: () => new NaiveMapCache<number>(MAX_ENTRIES) },
  ];

  const externalFactory = await loadExternalLruCache();
  if (externalFactory) {
    caches.push({ name: "lru-cache", create: externalFactory });
  } else {
    process.stdout.write("info: lru-cache not installed; skipping external comparison.\n\n");
  }

  const options: BenchOptions = { iterations: 20, warmup: 5 };

  for (const cacheDef of caches) {
    process.stdout.write(`━━━ ${cacheDef.name} ━━━\n`);
    for (const scenario of scenarios) {
      const result = runBench(
        `${cacheDef.name} :: ${scenario.name}`,
        () => {
          const cache = cacheDef.create();
          scenario.run(cache);
        },
        { ...options, measureMemory: scenario.measureMemory }
      );
      process.stdout.write(`${formatResult(result)}\n\n`);
    }
  }
}

main().catch((error) => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`Benchmark failed: ${message}\n`);
  process.exitCode = 1;
});
