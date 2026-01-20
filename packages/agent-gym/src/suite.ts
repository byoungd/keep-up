import crypto from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildReport } from "./report";
import { runScenario } from "./runner";
import { loadScenarios } from "./scenarioLoader";
import type { GymCategory, GymDifficulty, GymReport, GymScenarioRun } from "./types";

export interface SuiteRunOptions {
  benchmarksPath: string;
  difficulties: GymDifficulty[];
  categories: GymCategory[];
  preserveWorkspace?: boolean;
  now?: () => number;
}

export interface SuiteRunResult {
  report: GymReport;
  runs: GymScenarioRun[];
}

export async function runSuite(options: SuiteRunOptions): Promise<SuiteRunResult> {
  const now = options.now ?? (() => Date.now());
  const startedAt = new Date(now());
  const scenarios = await loadScenarios(options.benchmarksPath, {
    difficulties: options.difficulties,
    categories: options.categories,
  });

  const runs: GymScenarioRun[] = [];
  for (const scenario of scenarios) {
    runs.push(
      await runScenario(scenario, {
        preserveWorkspace: options.preserveWorkspace,
        now: options.now,
      })
    );
  }

  const finishedAt = new Date(now());
  const report = buildReport(runs, {
    runId: crypto.randomUUID(),
    startedAt,
    finishedAt,
    suite: {
      difficulties: options.difficulties,
      categories: options.categories,
    },
  });

  return { report, runs };
}

export async function writeReport(report: GymReport, outputPath: string): Promise<void> {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(report, null, 2), "utf-8");
}
