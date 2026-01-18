/**
 * LFCC v0.9 RC - Track 13: Benchmark Runner
 *
 * Runs all benchmark scenarios and outputs results.
 */

import { type BenchmarkResult, formatResult } from "./harness";
import { runCollabBench } from "./scenarios/collab";
import { runFastPathBench } from "./scenarios/fastPath";
import { runStressBench } from "./scenarios/stress";
import { runVerifyPassBench } from "./scenarios/verifyPass";

const isJson = process.argv.includes("--json");

function writeLine(line: string): void {
  process.stdout.write(line.endsWith("\n") ? line : `${line}\n`);
}

function writeErrorLine(line: string): void {
  process.stderr.write(line.endsWith("\n") ? line : `${line}\n`);
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }
  return String(error);
}

async function main() {
  writeLine("🚀 LFCC v0.9 RC Benchmark Suite\n");

  const allResults: BenchmarkResult[] = [];

  // Fast Path
  writeLine("━━━ Fast Path Benchmarks ━━━");
  const fastPathResults = runFastPathBench();
  allResults.push(...fastPathResults);
  for (const r of fastPathResults) {
    writeLine(formatResult(r));
    writeLine("");
  }

  // Verify Pass
  writeLine("━━━ Verify Pass Benchmarks ━━━");
  const verifyResults = runVerifyPassBench();
  allResults.push(...verifyResults);
  for (const r of verifyResults) {
    writeLine(formatResult(r));
    writeLine("");
  }

  // Stress Tests
  writeLine("━━━ Stress Test Benchmarks ━━━");
  const stressResults = runStressBench();
  allResults.push(...stressResults);
  for (const r of stressResults) {
    writeLine(formatResult(r));
    writeLine("");
  }

  // Collaboration Sync
  writeLine("━━━ Collaboration Sync Benchmarks ━━━");
  const collabResults = runCollabBench();
  allResults.push(...collabResults);
  for (const r of collabResults) {
    writeLine(formatResult(r));
    writeLine("");
  }

  // Summary
  writeLine("━━━ Summary ━━━");
  writeLine(`Total benchmarks: ${allResults.length}`);
  const totalTime = allResults.reduce((acc, r) => acc + r.totalMs, 0);
  writeLine(`Total time: ${(totalTime / 1000).toFixed(2)}s`);

  if (isJson) {
    const output = {
      timestamp: new Date().toISOString(),
      results: allResults,
    };
    writeLine("\n📄 JSON Output:");
    writeLine(JSON.stringify(output, null, 2));
  }
}

main().catch((error) => {
  writeErrorLine(`Unhandled error: ${formatError(error)}`);
});
