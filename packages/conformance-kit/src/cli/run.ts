#!/usr/bin/env node
/**
 * LFCC Conformance Kit - CLI Runner
 *
 * Usage:
 *   pnpm conformance:run --seeds 50 --steps 200
 *   pnpm conformance:run --seeds 500 --steps 2000 --stress
 */

import { MockAdapterFactory } from "../adapters/mock";
import { RealAdapterFactory } from "../adapters/real";
import type { StressMode } from "../op-fuzzer/generator";
import { ConformanceRunner } from "../runner/runner";
import { CI_FAST_CONFIG, CI_NIGHTLY_CONFIG, type RunnerConfig } from "../runner/types";

type AdapterKind = "mock" | "real";

type CLIConfig = {
  runner: Partial<RunnerConfig>;
  adapterKind: AdapterKind;
};

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

function parseArgs(): CLIConfig {
  const args = process.argv.slice(2);
  const config: Partial<RunnerConfig> = {};
  let adapterKind: AdapterKind = "real";

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case "--seeds":
        config.seeds = Number.parseInt(next, 10);
        i++;
        break;
      case "--steps":
        config.steps = Number.parseInt(next, 10);
        i++;
        break;
      case "--start-seed":
        config.startSeed = Number.parseInt(next, 10);
        i++;
        break;
      case "--checkpoint-every":
        config.checkpointInterval = Number.parseInt(next, 10);
        config.checkpointPolicy = "everyN";
        i++;
        break;
      case "--checkpoint-all":
        config.checkpointPolicy = "everyStep";
        break;
      case "--checkpoint-structure":
        config.checkpointPolicy = "structureOnly";
        break;
      case "--stress":
        config.stressMode = "structureStorm";
        break;
      case "--stress-mode":
        config.stressMode = next as StressMode;
        i++;
        break;
      case "--artifacts":
        config.artifactsDir = next;
        i++;
        break;
      case "--stop-on-failure":
        config.stopOnFirstFailure = true;
        break;
      case "--max-failures":
        config.maxFailures = Number.parseInt(next, 10);
        i++;
        break;
      case "--verbose":
      case "-v":
        config.verbose = true;
        break;
      case "--no-shrink":
        config.enableShrinking = false;
        break;
      case "--ci-fast":
        Object.assign(config, CI_FAST_CONFIG);
        break;
      case "--ci-nightly":
        Object.assign(config, CI_NIGHTLY_CONFIG);
        break;
      case "--adapters":
        if (next === "mock" || next === "real") {
          adapterKind = next;
        }
        i++;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
      default:
        if (arg.startsWith("--adapters=")) {
          const value = arg.split("=")[1];
          if (value === "mock" || value === "real") {
            adapterKind = value;
          }
        }
    }
  }

  return { runner: config, adapterKind };
}

function printHelp(): void {
  writeLine(`
LFCC Conformance Kit - Test Runner

Usage:
  pnpm conformance:run [options]

Options:
  --seeds <n>              Number of seeds to run (default: 50)
  --steps <n>              Steps per seed (default: 200)
  --start-seed <n>         Starting seed number (default: 1)
  --checkpoint-every <n>   Checkpoint every N steps (default: 10)
  --checkpoint-all         Checkpoint every step
  --checkpoint-structure   Checkpoint only after structural ops
  --stress                 Enable structure storm stress mode
  --stress-mode <mode>     Stress mode: typingBurst, structureStorm, markChaos, balanced
  --artifacts <dir>        Artifacts output directory (default: ./artifacts)
  --stop-on-failure        Stop on first failure
  --max-failures <n>       Maximum failures to collect (default: 10)
  --verbose, -v            Verbose output
  --no-shrink              Disable program shrinking
  --ci-fast                Use CI fast gate configuration
  --ci-nightly             Use CI nightly stress configuration
  --adapters <mock|real>   Adapter layer (default: real)
  --help, -h               Show this help

Examples:
  pnpm conformance:run --seeds 50 --steps 200
  pnpm conformance:run --ci-fast
  pnpm conformance:run --ci-nightly --artifacts ./nightly-artifacts
  pnpm conformance:run --seeds 10 --steps 100 --verbose --stress
`);
}

async function main(): Promise<void> {
  const { runner: config, adapterKind } = parseArgs();

  writeLine("LFCC Conformance Kit v0.9 RC");
  writeLine("============================");
  writeLine("");

  const factory = adapterKind === "mock" ? new MockAdapterFactory() : new RealAdapterFactory();

  const runner = new ConformanceRunner(factory, config);
  const summary = await runner.run();

  // Exit with error code if failures
  process.exit(summary.failedSeeds > 0 ? 1 : 0);
}

main().catch((error) => {
  writeErrorLine(`Fatal error: ${formatError(error)}`);
  process.exit(1);
});
