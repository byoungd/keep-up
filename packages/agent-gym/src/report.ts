import { toScenarioResult } from "./runner";
import type {
  GymCategory,
  GymDifficulty,
  GymReport,
  GymScenarioResult,
  GymScenarioRun,
  GymSummary,
  GymSummaryBucket,
} from "./types";

export interface ReportOptions {
  runId: string;
  startedAt: Date;
  finishedAt: Date;
  suite: {
    difficulties: GymDifficulty[];
    categories: GymCategory[];
  };
}

export function buildReport(runs: GymScenarioRun[], options: ReportOptions): GymReport {
  const scenarios = runs.map(toScenarioResult);
  const summary = buildSummary(scenarios);

  return {
    runId: options.runId,
    startedAt: options.startedAt.toISOString(),
    finishedAt: options.finishedAt.toISOString(),
    durationMs: options.finishedAt.getTime() - options.startedAt.getTime(),
    suite: options.suite,
    summary,
    scenarios,
  };
}

function buildSummary(results: GymScenarioResult[]): GymSummary {
  const byDifficulty = initializeDifficultyBuckets();
  const byCategory = initializeCategoryBuckets();

  let durationMs = 0;
  let turnsTotal = 0;
  let toolCallsTotal = 0;

  for (const result of results) {
    durationMs += result.durationMs;
    turnsTotal += result.turns;
    toolCallsTotal += result.toolCalls;

    updateBucket(byDifficulty[result.difficulty], result.pass);
    updateBucket(byCategory[result.category], result.pass);
  }

  const totalBucket = summarizeBuckets(results.length, byDifficulty);
  totalBucket.durationMs = durationMs;
  totalBucket.avgTurns = results.length > 0 ? turnsTotal / results.length : 0;
  totalBucket.avgToolCalls = results.length > 0 ? toolCallsTotal / results.length : 0;
  totalBucket.iqScore = Number((totalBucket.passRate * 100).toFixed(2));

  finalizeBuckets(byDifficulty);
  finalizeBuckets(byCategory);

  return {
    total: totalBucket,
    byDifficulty,
    byCategory,
  };
}

function initializeDifficultyBuckets(): Record<GymDifficulty, GymSummaryBucket> {
  return {
    easy: createBucket(),
    medium: createBucket(),
    hard: createBucket(),
  };
}

function initializeCategoryBuckets(): Record<GymCategory, GymSummaryBucket> {
  return {
    "syntax-repair": createBucket(),
    refactor: createBucket(),
    "feature-add": createBucket(),
    "cross-file": createBucket(),
  };
}

function createBucket(): GymSummaryBucket {
  return { total: 0, passed: 0, failed: 0, passRate: 0 };
}

function updateBucket(bucket: GymSummaryBucket, pass: boolean): void {
  bucket.total += 1;
  if (pass) {
    bucket.passed += 1;
  } else {
    bucket.failed += 1;
  }
}

function finalizeBuckets<T extends Record<string, GymSummaryBucket>>(buckets: T): void {
  for (const bucket of Object.values(buckets)) {
    bucket.passRate = bucket.total > 0 ? bucket.passed / bucket.total : 0;
  }
}

function summarizeBuckets(
  totalScenarios: number,
  buckets: Record<string, GymSummaryBucket>
): GymSummary["total"] {
  let passed = 0;
  let failed = 0;
  for (const bucket of Object.values(buckets)) {
    passed += bucket.passed;
    failed += bucket.failed;
  }

  const passRate = totalScenarios > 0 ? passed / totalScenarios : 0;

  return {
    total: totalScenarios,
    passed,
    failed,
    passRate,
    durationMs: 0,
    avgTurns: 0,
    avgToolCalls: 0,
    iqScore: 0,
  };
}
