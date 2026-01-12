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

async function main() {
  console.log("🚀 LFCC v0.9 RC Benchmark Suite\n");

  const allResults: BenchmarkResult[] = [];

  // Fast Path
  console.log("━━━ Fast Path Benchmarks ━━━");
  const fastPathResults = runFastPathBench();
  allResults.push(...fastPathResults);
  for (const r of fastPathResults) {
    console.log(formatResult(r));
    console.log();
  }

  // Verify Pass
  console.log("━━━ Verify Pass Benchmarks ━━━");
  const verifyResults = runVerifyPassBench();
  allResults.push(...verifyResults);
  for (const r of verifyResults) {
    console.log(formatResult(r));
    console.log();
  }

  // Stress Tests
  console.log("━━━ Stress Test Benchmarks ━━━");
  const stressResults = runStressBench();
  allResults.push(...stressResults);
  for (const r of stressResults) {
    console.log(formatResult(r));
    console.log();
  }

  // Collaboration Sync
  console.log("━━━ Collaboration Sync Benchmarks ━━━");
  const collabResults = runCollabBench();
  allResults.push(...collabResults);
  for (const r of collabResults) {
    console.log(formatResult(r));
    console.log();
  }

  // Summary
  console.log("━━━ Summary ━━━");
  console.log(`Total benchmarks: ${allResults.length}`);
  const totalTime = allResults.reduce((acc, r) => acc + r.totalMs, 0);
  console.log(`Total time: ${(totalTime / 1000).toFixed(2)}s`);

  if (isJson) {
    const output = {
      timestamp: new Date().toISOString(),
      results: allResults,
    };
    console.log("\n📄 JSON Output:");
    console.log(JSON.stringify(output, null, 2));
  }
}

main().catch(console.error);
