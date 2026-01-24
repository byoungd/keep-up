import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import type {
  Checkpoint,
  CheckpointMessage,
  CheckpointToolCall,
  CheckpointToolResult,
} from "../packages/agent-runtime-core/src/index";
import { SymbolGraph } from "../packages/agent-runtime-execution/src/lsp/symbolGraph";
import { createFileToolOutputSpooler } from "../packages/agent-runtime-execution/src/spooling";
import { NativeTaskGraphEventLog } from "../packages/agent-runtime-execution/src/tasks/taskGraphEventLog";
import { countTokens } from "../packages/agent-runtime-execution/src/utils/tokenCounter";
import {
  MessagePackCheckpointStorage,
  RustCheckpointStorage,
} from "../packages/agent-runtime-persistence/src/checkpoint";
import { createTwoFilesPatch } from "../packages/diff-rs/src/index";
import { loadNativeBinding as loadDiffBinding } from "../packages/diff-rs/src/native.js";
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
type MemoryStats = {
  avgMb: number;
  p50Mb: number;
  p95Mb: number;
  p99Mb: number;
  minMb: number;
  maxMb: number;
  iterations: number;
};

const OUTPUT_PATH = "artifacts/perf-metrics.json";
const MB = 1024 * 1024;

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

function summarizeMb(samples: number[]): MemoryStats {
  const sorted = [...samples].sort((a, b) => a - b);
  const total = samples.reduce((sum, value) => sum + value, 0);
  const avg = samples.length > 0 ? total / samples.length : 0;

  return {
    avgMb: avg,
    p50Mb: percentile(sorted, 0.5),
    p95Mb: percentile(sorted, 0.95),
    p99Mb: percentile(sorted, 0.99),
    minMb: sorted[0] ?? 0,
    maxMb: sorted[sorted.length - 1] ?? 0,
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

async function measureAsync(
  fn: () => Promise<void>,
  iterations: number,
  warmup = 5
): Promise<SummaryStats> {
  const samples: number[] = [];
  const totalRuns = iterations + warmup;

  for (let i = 0; i < totalRuns; i += 1) {
    const start = performance.now();
    await fn();
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

function buildDiffSample(
  lineCount: number,
  changeEvery: number
): { oldText: string; newText: string } {
  const oldLines: string[] = [];
  const newLines: string[] = [];

  for (let i = 0; i < lineCount; i += 1) {
    const base = `line-${i}-value`;
    oldLines.push(base);
    if (i % changeEvery === 0) {
      newLines.push(`${base}-updated`);
    } else {
      newLines.push(base);
    }
  }

  return {
    oldText: `${oldLines.join("\n")}\n`,
    newText: `${newLines.join("\n")}\n`,
  };
}

function buildLargeText(targetBytes: number): string {
  const chunk = "baseline-output-line-0123456789abcdefghijklmnopqrstuvwxyz\n";
  const chunkBytes = Buffer.byteLength(chunk);
  const repeats = Math.max(1, Math.ceil(targetBytes / chunkBytes));
  return chunk.repeat(repeats);
}

function buildCheckpointMessages(count: number, startTimestamp: number): CheckpointMessage[] {
  const payload = "Baseline message payload for checkpoint storage benchmarking.";
  const messages: CheckpointMessage[] = [];

  for (let i = 0; i < count; i += 1) {
    messages.push({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `${payload} #${i}`,
      timestamp: startTimestamp + i,
    });
  }

  return messages;
}

function buildCheckpointToolCalls(count: number, startTimestamp: number): CheckpointToolCall[] {
  const calls: CheckpointToolCall[] = [];
  for (let i = 0; i < count; i += 1) {
    calls.push({
      id: `call-${i}`,
      name: "baseline-tool",
      arguments: { query: `query-${i}`, depth: i % 3 },
      timestamp: startTimestamp + i,
    });
  }
  return calls;
}

function buildCheckpointToolResults(count: number, startTimestamp: number): CheckpointToolResult[] {
  const results: CheckpointToolResult[] = [];
  for (let i = 0; i < count; i += 1) {
    results.push({
      callId: `call-${i}`,
      name: "baseline-tool",
      arguments: { query: `query-${i}` },
      result: { ok: true, index: i },
      success: true,
      durationMs: 12 + i,
      timestamp: startTimestamp + i,
    });
  }
  return results;
}

function buildCheckpointSamples(count: number): {
  samples: Checkpoint[];
  messagesPerCheckpoint: number;
} {
  const startTimestamp = Date.now();
  const baseMessages = buildCheckpointMessages(24, startTimestamp);
  const pendingToolCalls = buildCheckpointToolCalls(6, startTimestamp + 1000);
  const completedToolCalls = buildCheckpointToolResults(6, startTimestamp + 2000);
  const samples: Checkpoint[] = [];

  for (let i = 0; i < count; i += 1) {
    const messages = [
      ...baseMessages,
      {
        role: "assistant",
        content: `Checkpoint step ${i}`,
        timestamp: startTimestamp + 3000 + i,
      },
    ];

    samples.push({
      id: `baseline-${i}`,
      version: 1,
      createdAt: startTimestamp + i,
      task: "Baseline checkpoint",
      agentType: "runtime",
      agentId: "baseline-agent",
      status: "pending",
      messages,
      pendingToolCalls,
      completedToolCalls,
      currentStep: i,
      maxSteps: 100,
      metadata: { baseline: true, iteration: i },
      childCheckpointIds: [],
    });
  }

  return { samples, messagesPerCheckpoint: baseMessages.length + 1 };
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
  } catch (_error) {
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

async function measureCheckpointStorage(): Promise<{
  save: MetricResult;
  load: MetricResult;
  loadCold: MetricResult;
  backend: string;
  checkpointCount: number;
  messagesPerCheckpoint: number;
  note?: string;
}> {
  const iterations = 100;
  const warmup = 10;
  const totalRuns = iterations + warmup;
  const { samples, messagesPerCheckpoint } = buildCheckpointSamples(totalRuns);
  const rootDir = path.join(".tmp", "bench", `checkpoint-${Date.now()}`);

  let storage: RustCheckpointStorage | MessagePackCheckpointStorage;
  let backend = "native";
  try {
    storage = new RustCheckpointStorage({ rootDir });
  } catch (_error) {
    backend = "messagepack";
    storage = new MessagePackCheckpointStorage({ rootDir });
  }

  const createStorage = () =>
    backend === "native"
      ? new RustCheckpointStorage({ rootDir })
      : new MessagePackCheckpointStorage({ rootDir });

  const saveSamples = samples;
  let saveIndex = 0;
  const saveStats = await measureAsync(
    async () => {
      const checkpoint = saveSamples[saveIndex];
      saveIndex += 1;
      if (!checkpoint) {
        return;
      }
      await storage.save(checkpoint);
    },
    iterations,
    warmup
  );

  const ids = saveSamples.map((checkpoint) => checkpoint.id);
  let loadIndex = 0;
  const loadStats = await measureAsync(
    async () => {
      const id = ids[loadIndex % ids.length];
      loadIndex += 1;
      if (!id) {
        return;
      }
      await storage.load(id);
    },
    iterations,
    warmup
  );

  const coldIterations = 30;
  const coldWarmup = 5;
  let coldIndex = 0;
  const loadColdStats = await measureAsync(
    async () => {
      const id = ids[coldIndex % ids.length];
      coldIndex += 1;
      if (!id) {
        return;
      }
      const coldStorage = createStorage();
      await coldStorage.load(id);
    },
    coldIterations,
    coldWarmup
  );

  return {
    save: saveStats,
    load: loadStats,
    loadCold: loadColdStats,
    backend,
    checkpointCount: iterations,
    messagesPerCheckpoint,
  };
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

function measureDiffPatch(): { stats: MetricResult; backend: string; lineCount: number } {
  const { oldText, newText } = buildDiffSample(2000, 20);
  const backend = loadDiffBinding() ? "native" : "js";
  const stats = measure(
    () => {
      createTwoFilesPatch("baseline-old.txt", "baseline-new.txt", oldText, newText);
    },
    200,
    20
  );

  return { stats, backend, lineCount: 2000 };
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

async function measureSpoolerMemory(): Promise<{
  heapDeltaMb: MemoryStats;
  rssDeltaMb: MemoryStats;
  outputBytes: number;
  note?: string;
}> {
  try {
    const rootDir = path.join(".tmp", "bench", `spool-${Date.now()}`);
    const spooler = createFileToolOutputSpooler({ rootDir });
    const text = buildLargeText(512 * 1024);
    const content = [{ type: "text", text }] as const;
    const outputBytes = Buffer.byteLength(text);
    const heapSamples: number[] = [];
    const rssSamples: number[] = [];
    const iterations = 40;
    const warmup = 5;
    const totalRuns = iterations + warmup;

    for (let i = 0; i < totalRuns; i += 1) {
      const before = process.memoryUsage();
      await spooler.spool({
        toolName: "baseline",
        toolCallId: `spool-${i}`,
        content,
      });
      const after = process.memoryUsage();
      if (i >= warmup) {
        heapSamples.push(Math.max(0, (after.heapUsed - before.heapUsed) / MB));
        rssSamples.push(Math.max(0, (after.rss - before.rss) / MB));
      }
    }

    return {
      heapDeltaMb: summarizeMb(heapSamples),
      rssDeltaMb: summarizeMb(rssSamples),
      outputBytes,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      heapDeltaMb: summarizeMb([]),
      rssDeltaMb: summarizeMb([]),
      outputBytes: 0,
      note: message,
    };
  }
}

async function main() {
  const sandbox = await measureSandboxStartup();
  const eventLog = await measureEventLog();
  const checkpointStorage = await measureCheckpointStorage();
  const tokenCounting = measureTokenCounting();
  const diffPatch = measureDiffPatch();
  const symbolQuery = measureSymbolQuery();
  const spoolerMemory = await measureSpoolerMemory();

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
      checkpointSave: {
        ...checkpointStorage.save,
        backend: checkpointStorage.backend,
        checkpointCount: checkpointStorage.checkpointCount,
        messagesPerCheckpoint: checkpointStorage.messagesPerCheckpoint,
      },
      checkpointLoad: {
        ...checkpointStorage.load,
        backend: checkpointStorage.backend,
        checkpointCount: checkpointStorage.checkpointCount,
        messagesPerCheckpoint: checkpointStorage.messagesPerCheckpoint,
      },
      checkpointLoadCold: {
        ...checkpointStorage.loadCold,
        backend: checkpointStorage.backend,
        checkpointCount: checkpointStorage.checkpointCount,
        messagesPerCheckpoint: checkpointStorage.messagesPerCheckpoint,
      },
      tokenCounting: {
        ...tokenCounting.stats,
        tokensPerSample: tokenCounting.tokens,
        avgMsPer10kTokens: Number(tokenCounting.per10kAvgMs.toFixed(4)),
        p99MsPer10kTokens: Number(tokenCounting.per10kP99Ms.toFixed(4)),
        backend: tokenCounting.backend,
      },
      diffPatch: {
        ...diffPatch.stats,
        backend: diffPatch.backend,
        lineCount: diffPatch.lineCount,
      },
      symbolQuery: {
        ...symbolQuery.stats,
        backend: symbolQuery.backend,
        symbolCount: symbolQuery.symbolCount,
      },
      spoolerMemory: {
        heapDeltaMb: spoolerMemory.heapDeltaMb,
        rssDeltaMb: spoolerMemory.rssDeltaMb,
        outputBytes: spoolerMemory.outputBytes,
        note: spoolerMemory.note,
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
