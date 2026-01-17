/**
 * LFCC Conformance Kit - Test Runner (Part G)
 *
 * Orchestrates conformance test runs with multiple seeds.
 */

import type { AdapterFactory } from "../adapters/types";
import { createArtifactBundle, saveArtifacts } from "../artifacts/serializer";
import { createFailurePredicate, DoubleBlindHarness } from "../double-blind/harness";
import { DEFAULT_GEN_CONFIG, type GenConfig, generateProgram } from "../op-fuzzer/generator";
import { shrinkProgram } from "../op-fuzzer/shrinker";
import {
  DEFAULT_RUNNER_CONFIG,
  type RunnerConfig,
  type RunSummary,
  type SeedRunResult,
} from "./types";

/**
 * Conformance test runner
 */
export class ConformanceRunner {
  private factory: AdapterFactory;
  private config: RunnerConfig;
  private genConfig: GenConfig;

  constructor(
    factory: AdapterFactory,
    config: Partial<RunnerConfig> = {},
    genConfig: Partial<GenConfig> = {}
  ) {
    this.factory = factory;
    this.config = { ...DEFAULT_RUNNER_CONFIG, ...config };
    const hasCheckpointOverride = Object.hasOwn(config, "checkpointPolicy");
    if (!hasCheckpointOverride && this.config.stressMode === "structureStorm") {
      this.config.checkpointPolicy = "structureOnly";
    }
    this.genConfig = {
      ...DEFAULT_GEN_CONFIG,
      ...genConfig,
      stressMode: config.stressMode ?? genConfig.stressMode,
    };
  }

  /**
   * Run conformance tests
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: runner logic is complex
  async run(): Promise<RunSummary> {
    const startTime = Date.now();
    const results: SeedRunResult[] = [];
    const failures: SeedRunResult[] = [];

    console.log(
      `Starting conformance run: ${this.config.seeds} seeds × ${this.config.steps} steps`
    );
    console.log(`Checkpoint policy: ${this.config.checkpointPolicy}`);
    if (this.config.stressMode) {
      console.log(`Stress mode: ${this.config.stressMode}`);
    }
    console.log("");

    for (let i = 0; i < this.config.seeds; i++) {
      const seed = this.config.startSeed + i;

      if (this.config.verbose) {
        console.log(`Running seed ${seed}...`);
      }

      const result = await this.runSeed(seed);
      results.push(result);

      if (!result.passed) {
        failures.push(result);
        console.log(`❌ Seed ${seed} FAILED at step ${result.failStep}`);

        if (result.artifactPath) {
          console.log(`   Artifacts: ${result.artifactPath}`);
        }

        if (this.config.stopOnFirstFailure) {
          break;
        }

        if (failures.length >= this.config.maxFailures) {
          console.log(`Max failures (${this.config.maxFailures}) reached, stopping.`);
          break;
        }
      } else if (this.config.verbose) {
        console.log(`✓ Seed ${seed} passed (${result.durationMs}ms)`);
      }

      // Progress indicator
      if (!this.config.verbose && (i + 1) % 10 === 0) {
        const passed = results.filter((r) => r.passed).length;
        const failed = results.filter((r) => !r.passed).length;
        console.log(`Progress: ${i + 1}/${this.config.seeds} (${passed} passed, ${failed} failed)`);
      }
    }

    const totalDurationMs = Date.now() - startTime;
    const passedSeeds = results.filter((r) => r.passed).length;
    const failedSeeds = results.filter((r) => !r.passed).length;

    const summary: RunSummary = {
      totalSeeds: results.length,
      passedSeeds,
      failedSeeds,
      totalSteps: results.reduce((sum, r) => sum + r.completedSteps, 0),
      totalDurationMs,
      failures,
      config: this.config,
    };

    this.printSummary(summary);

    return summary;
  }

  /**
   * Run a single seed
   */
  private async runSeed(seed: number): Promise<SeedRunResult> {
    const startTime = Date.now();

    try {
      // Create adapters
      const loro = this.factory.createLoroAdapter();
      const shadow = this.factory.createShadowAdapter();
      const canonicalizer = this.factory.createCanonicalizerAdapter();

      // Setup initial document with some content
      this.setupInitialDocument(loro, shadow);

      // Generate program
      const ops = generateProgram(seed, this.config.steps, this.genConfig, loro);

      // Reset adapters for clean run
      const initialSnapshot = loro.exportSnapshot();
      loro.loadSnapshot(initialSnapshot);
      shadow.loadSnapshot(initialSnapshot);

      // Create harness and run
      const harness = new DoubleBlindHarness(loro, shadow, canonicalizer, {
        checkpointPolicy: this.config.checkpointPolicy,
        checkpointInterval: this.config.checkpointInterval,
        stopOnMismatch: true,
        verbose: false,
      });

      const result = await harness.run(seed, ops, initialSnapshot);

      if (result.passed) {
        return {
          seed,
          passed: true,
          steps: ops.length,
          completedSteps: result.completedSteps,
          durationMs: Date.now() - startTime,
        };
      }

      // Failure - shrink and save artifacts
      let shrunkOps = null;
      if (this.config.enableShrinking && result.firstMismatch) {
        const predicate = createFailurePredicate(
          () => this.factory.createLoroAdapter(),
          () => this.factory.createShadowAdapter(),
          () => this.factory.createCanonicalizerAdapter(),
          initialSnapshot
        );

        const shrinkResult = await shrinkProgram(ops, predicate);
        shrunkOps = shrinkResult.shrunkOps;

        if (this.config.verbose) {
          console.log(
            `  Shrunk from ${shrinkResult.originalLength} to ${shrinkResult.shrunkLength} ops`
          );
        }
      }

      // Save artifacts
      let artifactPath: string | undefined;
      if (result.firstMismatch && result.canonLoro && result.canonShadow) {
        const bundle = createArtifactBundle(
          seed,
          this.genConfig,
          ops,
          shrunkOps,
          result.firstMismatch,
          result.canonLoro,
          result.canonShadow,
          harness.getFrontierLog(),
          initialSnapshot
        );

        artifactPath = await saveArtifacts(this.config.artifactsDir, bundle);
      }

      return {
        seed,
        passed: false,
        steps: ops.length,
        completedSteps: result.completedSteps,
        durationMs: Date.now() - startTime,
        failStep: result.firstMismatch?.stepIndex,
        artifactPath,
      };
    } catch (error) {
      return {
        seed,
        passed: false,
        steps: this.config.steps,
        completedSteps: 0,
        durationMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Setup initial document with content for testing
   */
  private setupInitialDocument(loro: unknown, shadow: unknown): void {
    // Use type assertion for mock adapters that have addBlock
    const loroMock = loro as { addBlock?: (type: string, text: string) => string };
    const shadowMock = shadow as { addBlock?: (type: string, text: string) => string };

    if (loroMock.addBlock && shadowMock.addBlock) {
      // Add some initial paragraphs
      loroMock.addBlock("paragraph", "Hello world");
      loroMock.addBlock("paragraph", "This is a test document");
      loroMock.addBlock("paragraph", "With multiple paragraphs");

      shadowMock.addBlock("paragraph", "Hello world");
      shadowMock.addBlock("paragraph", "This is a test document");
      shadowMock.addBlock("paragraph", "With multiple paragraphs");
    }
  }

  /**
   * Print run summary
   */
  private printSummary(summary: RunSummary): void {
    console.log("");
    console.log("=".repeat(60));
    console.log("CONFORMANCE RUN SUMMARY");
    console.log("=".repeat(60));
    console.log(`Total seeds:    ${summary.totalSeeds}`);
    console.log(`Passed:         ${summary.passedSeeds}`);
    console.log(`Failed:         ${summary.failedSeeds}`);
    console.log(`Total steps:    ${summary.totalSteps}`);
    console.log(`Duration:       ${(summary.totalDurationMs / 1000).toFixed(2)}s`);
    console.log("");

    if (summary.failures.length > 0) {
      console.log("FAILURES:");
      for (const f of summary.failures) {
        console.log(`  - Seed ${f.seed}: step ${f.failStep ?? "?"}`);
        if (f.artifactPath) {
          console.log(`    Artifacts: ${f.artifactPath}`);
        }
        if (f.error) {
          console.log(`    Error: ${f.error}`);
        }
      }
      console.log("");
    }

    if (summary.failedSeeds === 0) {
      console.log("✓ ALL TESTS PASSED");
    } else {
      console.log(`✗ ${summary.failedSeeds} TESTS FAILED`);
    }
    console.log("=".repeat(60));
  }
}

/**
 * Quick run helper
 */
export async function runConformance(
  factory: AdapterFactory,
  config: Partial<RunnerConfig> = {}
): Promise<RunSummary> {
  const runner = new ConformanceRunner(factory, config);
  return runner.run();
}
