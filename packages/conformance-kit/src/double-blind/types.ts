/**
 * LFCC Conformance Kit - Double-Blind Harness Types (Part E)
 */

import type { CanonNode } from "@keepup/core";
import type { FuzzOp } from "../op-fuzzer/types";

/** Checkpoint policy */
export type CheckpointPolicy = "everyStep" | "everyN" | "structureOnly";

/** Harness configuration */
export type HarnessConfig = {
  /** Checkpoint policy */
  checkpointPolicy: CheckpointPolicy;
  /** Checkpoint interval (for everyN policy) */
  checkpointInterval: number;
  /** Stop on first mismatch */
  stopOnMismatch: boolean;
  /** Enable verbose logging */
  verbose: boolean;
  /** Run dirty vs full scan guard */
  enableDirtyScanGuard: boolean;
};

/** Default harness configuration */
export const DEFAULT_HARNESS_CONFIG: HarnessConfig = {
  checkpointPolicy: "everyN",
  checkpointInterval: 10,
  stopOnMismatch: true,
  verbose: false,
  enableDirtyScanGuard: false,
};

/** Step result */
export type StepResult = {
  stepIndex: number;
  op: FuzzOp;
  loroSuccess: boolean;
  shadowSuccess: boolean;
  loroError?: string;
  shadowError?: string;
  checkpointed: boolean;
  mismatch?: MismatchInfo;
  loroFrontier?: string;
};

/** Mismatch information */
export type MismatchInfo = {
  stepIndex: number;
  path: string;
  loroValue: unknown;
  shadowValue: unknown;
  description: string;
};

/** Harness run result */
export type HarnessResult = {
  seed: number;
  totalSteps: number;
  completedSteps: number;
  passed: boolean;
  firstMismatch?: MismatchInfo;
  stepResults: StepResult[];
  canonLoro?: CanonNode;
  canonShadow?: CanonNode;
  durationMs: number;
  missedSpans?: string[]; // For dirty scan guard
};

/** Frontier log entry */
export type FrontierLogEntry = {
  stepIndex: number;
  loroFrontier: string;
  timestamp: number;
};
