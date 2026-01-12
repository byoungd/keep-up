/**
 * LFCC Conformance Kit - Runner Types
 */

import type { CheckpointPolicy } from "../double-blind/types";
import type { StressMode } from "../op-fuzzer/generator";

/** Runner configuration */
export type RunnerConfig = {
  /** Number of seeds to run */
  seeds: number;
  /** Starting seed (for reproducibility) */
  startSeed: number;
  /** Steps per seed */
  steps: number;
  /** Checkpoint policy */
  checkpointPolicy: CheckpointPolicy;
  /** Checkpoint interval (for everyN) */
  checkpointInterval: number;
  /** Stress mode */
  stressMode?: StressMode;
  /** Artifacts output directory */
  artifactsDir: string;
  /** Stop on first failure */
  stopOnFirstFailure: boolean;
  /** Maximum failures to collect */
  maxFailures: number;
  /** Verbose output */
  verbose: boolean;
  /** Enable shrinking */
  enableShrinking: boolean;
  /** Parallel workers (0 = sequential) */
  parallelWorkers: number;
};

/** Default runner configuration */
export const DEFAULT_RUNNER_CONFIG: RunnerConfig = {
  seeds: 50,
  startSeed: 1,
  steps: 200,
  checkpointPolicy: "everyN",
  checkpointInterval: 10,
  artifactsDir: "./artifacts",
  stopOnFirstFailure: false,
  maxFailures: 10,
  verbose: false,
  enableShrinking: true,
  parallelWorkers: 0,
};

/** CI fast gate configuration */
export const CI_FAST_CONFIG: Partial<RunnerConfig> = {
  seeds: 50,
  steps: 200,
  checkpointInterval: 10,
  stressMode: "balanced",
  stopOnFirstFailure: true,
  enableShrinking: true,
};

/** CI nightly stress configuration */
export const CI_NIGHTLY_CONFIG: Partial<RunnerConfig> = {
  seeds: 500,
  steps: 2000,
  checkpointPolicy: "everyStep",
  stressMode: "structureStorm",
  stopOnFirstFailure: false,
  maxFailures: 20,
  enableShrinking: true,
};

/** Single seed run result */
export type SeedRunResult = {
  seed: number;
  passed: boolean;
  steps: number;
  completedSteps: number;
  durationMs: number;
  failStep?: number;
  artifactPath?: string;
  error?: string;
};

/** Full run summary */
export type RunSummary = {
  totalSeeds: number;
  passedSeeds: number;
  failedSeeds: number;
  totalSteps: number;
  totalDurationMs: number;
  failures: SeedRunResult[];
  config: RunnerConfig;
};
