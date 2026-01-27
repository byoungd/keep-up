import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { StorageEngine } from "../src/index.ts";

type BenchResult = {
  name: string;
  iterations: number;
  totalMs: number;
  avgMs: number;
  opsPerSec: number;
};

type BenchOptions = {
  iterations: number;
  warmup: number;
};

const DEFAULT_ITERATIONS = Number.parseInt(process.env.BENCH_ITERATIONS ?? "1", 10);
const DEFAULT_WARMUP = Number.parseInt(process.env.BENCH_WARMUP ?? "1", 10);
const CHECKPOINT_COUNT = Number.parseInt(process.env.BENCH_CHECKPOINTS ?? "200", 10);
const EVENT_COUNT = Number.parseInt(process.env.BENCH_EVENTS ?? "2000", 10);
const PAYLOAD_BYTES = Number.parseInt(process.env.BENCH_PAYLOAD_BYTES ?? "1024", 10);

function runBench(name: string, fn: () => void, options: BenchOptions): BenchResult {
  for (let i = 0; i < options.warmup; i += 1) {
    fn();
  }

  let totalMs = 0;
  for (let i = 0; i < options.iterations; i += 1) {
    const start = performance.now();
    fn();
    totalMs += performance.now() - start;
  }

  const avgMs = totalMs / options.iterations;
  return {
    name,
    iterations: options.iterations,
    totalMs,
    avgMs,
    opsPerSec: avgMs > 0 ? 1000 / avgMs : 0,
  };
}

function formatResult(result: BenchResult): string {
  return [
    `[bench] ${result.name}`,
    `   iterations: ${result.iterations}`,
    `   total: ${result.totalMs.toFixed(2)}ms`,
    `   avg: ${result.avgMs.toFixed(3)}ms`,
    `   ops/sec: ${result.opsPerSec.toFixed(2)}`,
  ].join("\n");
}

async function withEngine<T>(fn: (engine: StorageEngine, rootDir: string) => T): Promise<T> {
  const rootDir = await mkdtemp(join(tmpdir(), "storage-engine-bench-"));
  const engine = new StorageEngine(rootDir);
  try {
    return fn(engine, rootDir);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
}

async function benchCheckpointSave(options: BenchOptions): Promise<BenchResult> {
  return withEngine((engine) => {
    const payload = new Uint8Array(PAYLOAD_BYTES).fill(7);
    const ids = Array.from({ length: CHECKPOINT_COUNT }, (_, i) => `ckpt_${i}`);
    return runBench(
      `save_checkpoint (${CHECKPOINT_COUNT}x, ${PAYLOAD_BYTES}B)`,
      () => {
        for (const id of ids) {
          engine.saveCheckpoint(id, payload);
        }
      },
      options
    );
  });
}

async function benchCheckpointLoad(options: BenchOptions): Promise<BenchResult> {
  return withEngine((engine) => {
    const payload = new Uint8Array(PAYLOAD_BYTES).fill(3);
    const ids = Array.from({ length: CHECKPOINT_COUNT }, (_, i) => `ckpt_${i}`);
    for (const id of ids) {
      engine.saveCheckpoint(id, payload);
    }
    return runBench(
      `load_checkpoint (${CHECKPOINT_COUNT}x)`,
      () => {
        for (const id of ids) {
          engine.loadCheckpoint(id);
        }
      },
      options
    );
  });
}

async function benchAppendEvents(options: BenchOptions): Promise<BenchResult> {
  return withEngine((engine) => {
    const payload = new Uint8Array(PAYLOAD_BYTES).fill(5);
    return runBench(
      `append_event (${EVENT_COUNT}x, ${PAYLOAD_BYTES}B)`,
      () => {
        for (let i = 0; i < EVENT_COUNT; i += 1) {
          engine.appendEvent(payload);
        }
      },
      options
    );
  });
}

async function benchReplayEvents(options: BenchOptions): Promise<BenchResult> {
  return withEngine((engine) => {
    const payload = new Uint8Array(PAYLOAD_BYTES).fill(9);
    for (let i = 0; i < EVENT_COUNT; i += 1) {
      engine.appendEvent(payload);
    }
    return runBench(
      `replay_events (${EVENT_COUNT}x)`,
      () => {
        engine.replayEvents(0n);
      },
      options
    );
  });
}

async function benchPruneEvents(options: BenchOptions): Promise<BenchResult> {
  return withEngine((engine) => {
    const payload = new Uint8Array(PAYLOAD_BYTES).fill(4);
    for (let i = 0; i < EVENT_COUNT; i += 1) {
      engine.appendEvent(payload);
    }
    const cutoff = BigInt(Math.floor(EVENT_COUNT / 2));
    return runBench(
      `prune_events (before ${cutoff})`,
      () => {
        engine.pruneEvents(cutoff);
      },
      options
    );
  });
}

async function main() {
  const options: BenchOptions = {
    iterations:
      Number.isFinite(DEFAULT_ITERATIONS) && DEFAULT_ITERATIONS > 0 ? DEFAULT_ITERATIONS : 1,
    warmup: Number.isFinite(DEFAULT_WARMUP) && DEFAULT_WARMUP > 0 ? DEFAULT_WARMUP : 1,
  };

  const results = [
    await benchCheckpointSave(options),
    await benchCheckpointLoad(options),
    await benchAppendEvents(options),
    await benchReplayEvents(options),
    await benchPruneEvents(options),
  ];

  for (const result of results) {
    process.stdout.write(`${formatResult(result)}\n\n`);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`bench failed: ${message}\n`);
  process.exitCode = 1;
});
