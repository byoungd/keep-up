#!/usr/bin/env node
/**
 * LFCC Conformance Kit - Replay CLI
 *
 * Replay a saved operation sequence for debugging.
 *
 * Usage:
 *   pnpm conformance:replay artifacts/<runId>
 *   pnpm conformance:replay artifacts/<runId>/ops.shrunk.json
 */

import * as fs from "node:fs";
import { join } from "node:path";
import { MockAdapterFactory } from "../adapters/mock";
import { generateCanonDiff } from "../double-blind/comparator";
import { DoubleBlindHarness } from "../double-blind/harness";
import { deserializeOps } from "../op-fuzzer/types";

type ReplayOptions = {
  inputPath: string;
  verbose: boolean;
  stopAtStep?: number;
  showHelp: boolean;
};

function printHelp(): void {
  console.log(`
LFCC Conformance Kit - Replay

Usage:
  pnpm conformance:replay <artifact-dir|ops-file.json> [options]

Options:
  --verbose, -v    Show each step
  --step <n>       Stop at step N
  --help, -h       Show this help

Examples:
  pnpm conformance:replay artifacts/123-456
  pnpm conformance:replay artifacts/123-456/ops.shrunk.json
  pnpm conformance:replay ops.json --verbose
  pnpm conformance:replay ops.json --step 10
`);
}

function parseArgs(args: string[]): ReplayOptions {
  const showHelp = args.length === 0 || args[0] === "--help" || args[0] === "-h";
  const inputPath = args[0] ?? "";
  let verbose = false;
  let stopAtStep: number | undefined;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--verbose" || args[i] === "-v") {
      verbose = true;
    } else if (args[i] === "--step") {
      stopAtStep = Number.parseInt(args[i + 1], 10);
      i++;
    }
  }

  return { inputPath, verbose, stopAtStep, showHelp };
}

async function fileExists(path: string): Promise<boolean> {
  return fs.promises
    .stat(path)
    .then(() => true)
    .catch(() => false);
}

async function resolveReplayInput(
  inputPath: string
): Promise<{ opsFile: string; snapshotBytes: Uint8Array | null }> {
  const stat = await fs.promises.stat(inputPath);
  if (!stat.isDirectory()) {
    return { opsFile: inputPath, snapshotBytes: null };
  }

  const shrunkPath = join(inputPath, "ops.shrunk.json");
  const originalPath = join(inputPath, "ops.original.json");
  const snapshotPath = join(inputPath, "initial_snapshot.loro.bin");

  const hasShrunk = await fileExists(shrunkPath);
  const hasOriginal = await fileExists(originalPath);

  let opsFile = inputPath;
  if (hasShrunk) {
    opsFile = shrunkPath;
  } else if (hasOriginal) {
    opsFile = originalPath;
  } else {
    throw new Error(`No ops file found in artifact dir: ${inputPath}`);
  }

  const snapshotBytes = (await fileExists(snapshotPath))
    ? await fs.promises.readFile(snapshotPath)
    : null;

  return { opsFile, snapshotBytes };
}

function seedInitialDocument(loro: unknown, shadow: unknown): void {
  const loroMock = loro as { addBlock: (type: string, text: string) => string };
  const shadowMock = shadow as { addBlock: (type: string, text: string) => string };
  loroMock.addBlock("paragraph", "Hello world");
  loroMock.addBlock("paragraph", "This is a test document");
  loroMock.addBlock("paragraph", "With multiple paragraphs");
  shadowMock.addBlock("paragraph", "Hello world");
  shadowMock.addBlock("paragraph", "This is a test document");
  shadowMock.addBlock("paragraph", "With multiple paragraphs");
}

async function main(): Promise<void> {
  const { inputPath, verbose, stopAtStep, showHelp } = parseArgs(process.argv.slice(2));

  if (showHelp) {
    printHelp();
    process.exit(0);
  }

  const { opsFile, snapshotBytes } = await resolveReplayInput(inputPath);

  // Load ops
  console.log(`Loading ops from: ${opsFile}`);
  const opsJson = await fs.promises.readFile(opsFile, "utf-8");
  let ops = deserializeOps(opsJson);

  if (stopAtStep !== undefined) {
    ops = ops.slice(0, stopAtStep);
    console.log(`Stopping at step ${stopAtStep}`);
  }

  console.log(`Replaying ${ops.length} operations...`);
  console.log("");

  // Create adapters
  const factory = new MockAdapterFactory();
  const loro = factory.createLoroAdapter();
  const shadow = factory.createShadowAdapter();
  const canonicalizer = factory.createCanonicalizerAdapter();

  let initialSnapshot: Uint8Array;
  if (snapshotBytes) {
    initialSnapshot = snapshotBytes;
  } else {
    seedInitialDocument(loro, shadow);
    initialSnapshot = loro.exportSnapshot();
  }

  // Create harness
  const harness = new DoubleBlindHarness(loro, shadow, canonicalizer, {
    checkpointPolicy: "everyStep",
    stopOnMismatch: true,
    verbose,
  });

  // Run
  const result = await harness.run(0, ops, initialSnapshot);

  // Print results
  console.log("");
  console.log("=".repeat(60));
  console.log("REPLAY RESULT");
  console.log("=".repeat(60));
  console.log(`Steps: ${result.completedSteps}/${result.totalSteps}`);
  console.log(`Duration: ${result.durationMs}ms`);
  console.log(`Result: ${result.passed ? "PASSED" : "FAILED"}`);

  if (result.firstMismatch) {
    console.log("");
    console.log("MISMATCH DETAILS:");
    console.log(`  Step: ${result.firstMismatch.stepIndex}`);
    console.log(`  Path: ${result.firstMismatch.path}`);
    console.log(`  Description: ${result.firstMismatch.description}`);
    console.log("");
    console.log("Loro value:", JSON.stringify(result.firstMismatch.loroValue, null, 2));
    console.log("Shadow value:", JSON.stringify(result.firstMismatch.shadowValue, null, 2));
  }

  if (result.canonLoro && result.canonShadow) {
    console.log("");
    console.log("CANONICAL DIFF:");
    console.log(generateCanonDiff(result.canonLoro, result.canonShadow));
  }

  console.log("=".repeat(60));

  process.exit(result.passed ? 0 : 1);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
