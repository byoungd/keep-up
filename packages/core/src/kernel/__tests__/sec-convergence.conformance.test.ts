/**
 * LFCC v0.9 RC - SEC Convergence Conformance
 * @see docs/specs/lfcc/engineering/08_Conformance_Test_Suite_Plan.md Section 3 (Determinism & Convergence)
 */

import { describe, expect, it } from "vitest";
import { DEFAULT_FUZZ_CONFIG, runSECAssertion } from "../testing/index.js";

const TEST_SEED = process.env.CONFORMANCE_SEED
  ? Number.parseInt(process.env.CONFORMANCE_SEED, 10)
  : 424242;

describe("SEC Convergence (INV-DET-001)", () => {
  it("converges deterministically for the same seed", () => {
    const config = {
      ...DEFAULT_FUZZ_CONFIG,
      seed: TEST_SEED,
      iterations: 1,
      ops_per_iteration: 3,
      replicas: 3,
      scenario: "baseline",
      max_drain_ticks: 200,
    };

    const first = runSECAssertion(config);
    const second = runSECAssertion(config);

    if (!first.passed || !second.passed) {
      process.stderr.write(
        `\nSEC repro: CONFORMANCE_SEED=${TEST_SEED} pnpm vitest --run sec-convergence.conformance.test.ts\n`
      );
    }

    expect(first.passed).toBe(true);
    expect(second.passed).toBe(true);
    expect(first.failures).toEqual(second.failures);
    expect(first.network_stats).toEqual(second.network_stats);
  });
});
