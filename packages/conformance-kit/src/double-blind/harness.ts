/**
 * LFCC Conformance Kit - Double-Blind Harness (Part E)
 *
 * Runs same program against Loro and Shadow, compares canonical output.
 */

import type { CanonicalizerAdapter, LoroAdapter, ShadowAdapter } from "../adapters/types";
import type { FuzzOp } from "../op-fuzzer/types";
import { getOpCategory } from "../op-fuzzer/types";
import { compareCanonTrees } from "./comparator";
import {
  DEFAULT_HARNESS_CONFIG,
  type FrontierLogEntry,
  type HarnessConfig,
  type HarnessResult,
  type StepResult,
} from "./types";

/**
 * Double-blind harness for comparing Loro and Shadow implementations
 */
export class DoubleBlindHarness {
  private loro: LoroAdapter;
  private shadow: ShadowAdapter;
  private canonicalizer: CanonicalizerAdapter;
  private config: HarnessConfig;
  private frontierLog: FrontierLogEntry[] = [];

  constructor(
    loro: LoroAdapter,
    shadow: ShadowAdapter,
    canonicalizer: CanonicalizerAdapter,
    config: Partial<HarnessConfig> = {}
  ) {
    this.loro = loro;
    this.shadow = shadow;
    this.canonicalizer = canonicalizer;
    this.config = { ...DEFAULT_HARNESS_CONFIG, ...config };
  }

  /**
   * Run a program and compare results
   */
  async run(seed: number, ops: FuzzOp[], initialSnapshot?: Uint8Array): Promise<HarnessResult> {
    const startTime = Date.now();
    this.frontierLog = [];

    // Load initial snapshot if provided
    if (initialSnapshot) {
      this.loro.loadSnapshot(initialSnapshot);
      this.shadow.loadSnapshot(initialSnapshot);
    }

    const { stepResults, completedSteps, mismatch } = await this.executeSequence(ops);

    return this.finalizeRun(seed, ops.length, completedSteps, mismatch, stepResults, startTime);
  }

  private async executeSequence(ops: FuzzOp[]): Promise<{
    stepResults: StepResult[];
    completedSteps: number;
    mismatch?: StepResult["mismatch"];
  }> {
    const stepResults: StepResult[] = [];
    let completedSteps = 0;
    let mismatch: StepResult["mismatch"];

    for (let i = 0; i < ops.length; i++) {
      const op = ops[i];
      const stepResult = this.executeStep(i, op);
      stepResults.push(stepResult);

      this.frontierLog.push({
        stepIndex: i,
        loroFrontier: stepResult.loroFrontier ?? "",
        timestamp: Date.now(),
      });

      if (stepResult.mismatch) {
        mismatch = stepResult.mismatch;
        if (this.config.stopOnMismatch) {
          break;
        }
      }

      completedSteps++;

      if (this.config.verbose) {
        process.stdout.write(
          `Step ${i}: ${op.type} - ${stepResult.mismatch ? "MISMATCH" : "OK"}\n`
        );
      }
    }
    return { stepResults, completedSteps, mismatch };
  }

  private finalizeRun(
    seed: number,
    totalSteps: number,
    completedSteps: number,
    firstMismatch: StepResult["mismatch"],
    stepResults: StepResult[],
    startTime: number
  ): HarnessResult {
    // Final canonicalization
    const canonLoro = this.canonicalizer.canonicalizeFromLoro(this.loro);
    const canonShadow = this.canonicalizer.canonicalizeFromShadow(this.shadow);

    let mismatch = firstMismatch;

    // Final comparison if no mismatch found yet
    if (!mismatch) {
      const finalCompare = compareCanonTrees(canonLoro, canonShadow, completedSteps);
      if (!finalCompare.equal) {
        mismatch = finalCompare.mismatch;
      }
    }

    return {
      seed,
      totalSteps,
      completedSteps,
      passed: !mismatch,
      firstMismatch: mismatch,
      stepResults,
      canonLoro,
      canonShadow,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Execute a single step
   */
  private executeStep(stepIndex: number, op: FuzzOp): StepResult {
    // Apply to both implementations
    const loroResult = this.loro.applyOp(op);
    const shadowResult = this.shadow.applyOp(op);

    const result: StepResult = {
      stepIndex,
      op,
      loroSuccess: loroResult.success,
      shadowSuccess: shadowResult.success,
      loroError: loroResult.success ? undefined : loroResult.error,
      shadowError: shadowResult.success ? undefined : shadowResult.error,
      checkpointed: false,
      loroFrontier: this.loro.getFrontierTag(),
    };

    // Check if we should checkpoint
    const shouldCheckpoint = this.shouldCheckpoint(stepIndex, op);

    if (shouldCheckpoint) {
      result.checkpointed = true;

      // Canonicalize and compare
      const canonLoro = this.canonicalizer.canonicalizeFromLoro(this.loro);
      const canonShadow = this.canonicalizer.canonicalizeFromShadow(this.shadow);

      const compareResult = compareCanonTrees(canonLoro, canonShadow, stepIndex);
      if (!compareResult.equal) {
        result.mismatch = compareResult.mismatch;
      }
    }

    // Check for apply result mismatch
    if (loroResult.success !== shadowResult.success) {
      result.mismatch = {
        stepIndex,
        path: "applyResult",
        loroValue: loroResult.success,
        shadowValue: shadowResult.success,
        description: `Apply result mismatch: loro=${loroResult.success}, shadow=${shadowResult.success}`,
      };
    }

    return result;
  }

  /**
   * Determine if we should checkpoint at this step
   */
  private shouldCheckpoint(stepIndex: number, op: FuzzOp): boolean {
    switch (this.config.checkpointPolicy) {
      case "everyStep":
        return true;

      case "everyN":
        return (stepIndex + 1) % this.config.checkpointInterval === 0;

      case "structureOnly": {
        const category = getOpCategory(op);
        return category === "structural" || category === "table";
      }

      default:
        return false;
    }
  }

  /**
   * Get frontier log
   */
  getFrontierLog(): FrontierLogEntry[] {
    return [...this.frontierLog];
  }

  /**
   * Export current state snapshots
   */
  exportSnapshots(): { loro: Uint8Array; shadow: Uint8Array } {
    return {
      loro: this.loro.exportSnapshot(),
      shadow: this.shadow.exportSnapshot(),
    };
  }
}

/**
 * Create a failure predicate for shrinking
 */
export function createFailurePredicate(
  loroFactory: () => LoroAdapter,
  shadowFactory: () => ShadowAdapter,
  canonicalizerFactory: () => CanonicalizerAdapter,
  initialSnapshot?: Uint8Array
): (ops: FuzzOp[]) => Promise<boolean> {
  return async (ops: FuzzOp[]) => {
    const harness = new DoubleBlindHarness(loroFactory(), shadowFactory(), canonicalizerFactory(), {
      stopOnMismatch: true,
      checkpointPolicy: "everyStep",
    });

    const result = await harness.run(0, ops, initialSnapshot);
    return !result.passed;
  };
}
