import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { SymbolGraph } from "../packages/agent-runtime-execution/src/lsp/symbolGraph";
import { NativeTaskGraphEventLog } from "../packages/agent-runtime-execution/src/tasks/taskGraphEventLog";
import { countTokens } from "../packages/agent-runtime-execution/src/utils/tokenCounter";
import { createSandbox, SandboxManager, WORKSPACE_POLICY } from "../packages/sandbox-rs/src/index";
import { isNativeStorageEngineAvailable } from "../packages/storage-engine-rs/src/index";
import { createSymbolIndex } from "../packages/symbol-index-rs/src/index";
import { getNativeTokenizer, getNativeTokenizerError } from "../packages/tokenizer-rs/src/node";
import type { LspSymbol } from "../packages/tool-lsp/src/types";

type SummaryStats = {
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  minMs: number;
  maxMs: number;
  iterations: number;
};

type MetricResult = SummaryStats & { note?: string };

const OUTPUT_PATH = "artifacts/perf-metrics.json";

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[index];
}

function summarize(samples: number[]): SummaryStats {
  const sorted = [...samples].sort((a, b) => a - b);
  const total = samples.reduce((sum, value) => sum + value, 0);
  const avg = samples.length > 0 ? total / samples.length : 0;

  return {
    avgMs: avg,
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    p99Ms: percentile(sorted, 0.99),
    minMs: sorted[0] ?? 0,
    maxMs: sorted[sorted.length - 1] ?? 0,
    iterations: samples.length,
  };
}

function measure(fn: () => void, iterations: number, warmup = 5): SummaryStats {
  const samples: number[] = [];
  const totalRuns = iterations + warmup;

  for (let i = 0; i < totalRuns; i += 1) {
    const start = performance.now();
    fn();
    const end = performance.now();
    if (i >= warmup) {
      samples.push(end - start);
    }
  }

  return summarize(samples);
}

function makeTokenSample(wordCount: number): string {
  const words = Array.from({ length: wordCount }, () => "token");
  return words.join(" ");
}

function sampleQueries(): string[] {
  return ["Component", "handler", "useState", "render", "update", "SymbolGraph"];
}

async function measureSandboxStartup(): Promise<{
  available: boolean;
  stats: MetricResult;
}> {
  try {
    const stats = measure(
      () => {
        const policy = createSandbox({
          networkAccess: "none",
          fsIsolation: "workspace",
          workingDirectory: process.cwd(),
        });
        const manager = new SandboxManager(WORKSPACE_POLICY, process.cwd());
        if (!policy || !manager) {
          throw new Error("Sandbox policy or manager not created.");
        }
      },
      50,
      5
    );

    return { available: true, stats };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      available: false,
      stats: { ...summarize([]), note: message },
    };
  }
}

async function measureEventLog(): Promise<MetricResult> {
  if (!isNativeStorageEngineAvailable()) {
    return { ...summarize([]), note: "Native storage engine binding not available." };
  }

  const rootDir = path.join(".tmp", "bench", `event-log-${Date.now()}`);
  await mkdir(rootDir, { recursive: true });
  const log = new NativeTaskGraphEventLog({ rootDir });
  const event = {
    id: "baseline-event",
    sequenceId: 0,
    eventVersion: 1,
    nodeId: "node-0",
    type: "node_created",
    timestamp: new Date().toISOString(),
    payload: { title: "Baseline" },
  };

  const stats = measure(
    () => {
      log.append(event);
    },
    1000,
    50
  );

  return stats;
}

function measureTokenCounting(): {
  stats: MetricResult;
  tokens: number;
  per10kAvgMs: number;
  per10kP99Ms: number;
  backend: string;
} {
  const sample = makeTokenSample(10000);
  const tokenCount = countTokens(sample);
  const stats = measure(
    () => {
      countTokens(sample);
    },
    200,
    20
  );

  const perTokenAvg = tokenCount > 0 ? stats.avgMs / tokenCount : 0;
  const perTokenP99 = tokenCount > 0 ? stats.p99Ms / tokenCount : 0;
  const per10kAvgMs = perTokenAvg * 10000;
  const per10kP99Ms = perTokenP99 * 10000;
  const native = getNativeTokenizer();
  const backend = native ? "native" : "js";

  if (!native && getNativeTokenizerError()) {
    stats.note = getNativeTokenizerError()?.message;
  }

  return {
    stats,
    tokens: tokenCount,
    per10kAvgMs,
    per10kP99Ms,
    backend,
  };
}

function buildSymbolDataset(fileCount: number, symbolsPerFile: number) {
  const files: Array<{ file: string; symbols: LspSymbol[] }> = [];
  let counter = 0;

  for (let fileIndex = 0; fileIndex < fileCount; fileIndex += 1) {
    const file = `src/file-${fileIndex}.ts`;
    const symbols: LspSymbol[] = [];
    for (let i = 0; i < symbolsPerFile; i += 1) {
      symbols.push({
        name: `Component${counter}`,
        kind: "function",
        file,
        line: i + 1,
        column: 1,
        endLine: i + 1,
        endColumn: 10,
        detail: `detail-${counter}`,
      });
      counter += 1;
    }
    files.push({ file, symbols });
  }

  return { files, totalSymbols: counter };
}

function measureSymbolQuery(): { stats: MetricResult; backend: string; symbolCount: number } {
  const nativeIndex = createSymbolIndex();
  const backend = nativeIndex ? "native" : "memory";

  const graph = new SymbolGraph();
  const dataset = buildSymbolDataset(200, 50);
  for (const entry of dataset.files) {
    graph.updateFileSymbols(entry.file, entry.symbols);
  }

  const queries = sampleQueries();
  let queryIndex = 0;
  const stats = measure(
    () => {
      const query = queries[queryIndex % queries.length];
      queryIndex += 1;
      graph.query(query, { limit: 20 });
    },
    500,
    50
  );

  return { stats, backend, symbolCount: dataset.totalSymbols };
}

async function main() {
  const sandbox = await measureSandboxStartup();
  const eventLog = await measureEventLog();
  const tokenCounting = measureTokenCounting();
  const symbolQuery = measureSymbolQuery();

  const payload = {
    generatedAt: new Date().toISOString(),
    environment: {
      hostname: os.hostname(),
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      nodeVersion: process.version,
      cpuCount: os.cpus().length,
      totalMemoryGb: Number((os.totalmem() / 1024 / 1024 / 1024).toFixed(2)),
    },
    metrics: {
      sandboxStartup: {
        available: sandbox.available,
        ...sandbox.stats,
      },
      eventLogAppend: eventLog,
      tokenCounting: {
        ...tokenCounting.stats,
        tokensPerSample: tokenCounting.tokens,
        avgMsPer10kTokens: Number(tokenCounting.per10kAvgMs.toFixed(4)),
        p99MsPer10kTokens: Number(tokenCounting.per10kP99Ms.toFixed(4)),
        backend: tokenCounting.backend,
      },
      symbolQuery: {
        ...symbolQuery.stats,
        backend: symbolQuery.backend,
        symbolCount: symbolQuery.symbolCount,
      },
    },
  };

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  process.stdout.write(`Baseline metrics written to ${OUTPUT_PATH}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Baseline metrics failed: ${message}\n`);
  process.exitCode = 1;
});
