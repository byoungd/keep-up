import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ScenarioSource } from "../scenarioLoader";
import { runSuite, writeReport } from "../suite";
import type { GymCategory, GymDifficulty, GymReport } from "../types";

const DEFAULT_REPORT = path.resolve(process.cwd(), "reports/latest.json");
const DEFAULT_BENCHMARKS = path.resolve(process.cwd(), "benchmarks");

const ALL_DIFFICULTIES: GymDifficulty[] = ["easy", "medium", "hard"];
const ALL_CATEGORIES: GymCategory[] = [
  "syntax-repair",
  "refactor",
  "feature-add",
  "cross-file",
  "perception-accuracy",
  "memory-recall",
  "plan-quality",
  "execution-scale",
  "visual-layout",
  "visual-diff",
  "policy-safety",
];

interface CliOptions {
  suite: GymDifficulty[];
  categories: GymCategory[];
  benchmarksPath: string;
  reportPath: string;
  baselinePath?: string;
  minScore?: number;
  json: boolean;
  preserveWorkspace: boolean;
  benchmarkSource?: ScenarioSource;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await runSuite({
    benchmarksPath: options.benchmarksPath,
    difficulties: options.suite,
    categories: options.categories,
    preserveWorkspace: options.preserveWorkspace,
    benchmarkSource: options.benchmarkSource,
  });

  await writeReport(result.report, options.reportPath);

  const { summary } = result.report;
  const iqScore = summary.total.iqScore;
  const failures = summary.total.failed;

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result.report, null, 2)}\n`);
  } else {
    process.stdout.write(
      `KeepUpGym: ${summary.total.passed}/${summary.total.total} passed, IQ ${iqScore}\n`
    );
  }

  let exitCode = failures > 0 ? 1 : 0;

  if (options.minScore !== undefined && iqScore < options.minScore) {
    process.stderr.write(`IQ score ${iqScore} below minimum ${options.minScore}.\n`);
    exitCode = 1;
  }

  if (options.baselinePath) {
    const baselineScore = await readBaselineScore(options.baselinePath);
    if (iqScore < baselineScore) {
      process.stderr.write(`IQ score ${iqScore} below baseline ${baselineScore}.\n`);
      exitCode = 1;
    }
  }

  process.exit(exitCode);
}

function parseArgs(args: string[]): CliOptions {
  const suiteFlag = getFlagValue(args, "--suite") ?? "all";
  const suite = parseSuite(suiteFlag);
  const categories = parseCategories(args);
  const benchmarksPath = getFlagValue(args, "--benchmarks") ?? DEFAULT_BENCHMARKS;
  const reportPath = getFlagValue(args, "--report") ?? DEFAULT_REPORT;
  const baselinePath = getFlagValue(args, "--baseline");
  const minScore = parseNumber(getFlagValue(args, "--min-score"));
  const json = args.includes("--json");
  const preserveWorkspace = args.includes("--preserve-workspace");
  const adapterId = getFlagValue(args, "--adapter");
  const defaultCategory = parseCategory(getFlagValue(args, "--adapter-default-category"));
  const defaultDifficulty = parseDifficulty(getFlagValue(args, "--adapter-default-difficulty"));
  const adapterLimit = parseNumber(getFlagValue(args, "--adapter-limit"));
  const adapterMaxTurns = parseNumber(getFlagValue(args, "--adapter-max-turns"));

  const benchmarkSource = buildBenchmarkSource({
    adapterId,
    benchmarksPath,
    defaultCategory,
    defaultDifficulty,
    adapterLimit,
    adapterMaxTurns,
  });

  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  return {
    suite,
    categories,
    benchmarksPath,
    reportPath,
    baselinePath,
    minScore,
    json,
    preserveWorkspace,
    benchmarkSource,
  };
}

function getFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  return args[index + 1];
}

function parseSuite(value: string): GymDifficulty[] {
  if (value === "easy") {
    return ["easy"];
  }
  if (value === "medium") {
    return ["medium"];
  }
  if (value === "hard") {
    return ["hard"];
  }
  return ALL_DIFFICULTIES;
}

function parseDifficulty(value: string | undefined): GymDifficulty | undefined {
  if (!value) {
    return undefined;
  }
  if (ALL_DIFFICULTIES.includes(value as GymDifficulty)) {
    return value as GymDifficulty;
  }
  return undefined;
}

function parseCategory(value: string | undefined): GymCategory | undefined {
  if (!value) {
    return undefined;
  }
  if (ALL_CATEGORIES.includes(value as GymCategory)) {
    return value as GymCategory;
  }
  return undefined;
}

function parseCategories(args: string[]): GymCategory[] {
  const values = collectFlagValues(args, "--category");
  if (values.length === 0) {
    return ALL_CATEGORIES;
  }
  return values.filter((value) => ALL_CATEGORIES.includes(value as GymCategory)) as GymCategory[];
}

function collectFlagValues(args: string[], flag: string): string[] {
  const values: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === flag && args[i + 1]) {
      values.push(args[i + 1]);
      i += 1;
    }
  }
  return values;
}

function parseNumber(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function buildBenchmarkSource(input: {
  adapterId?: string;
  benchmarksPath: string;
  defaultCategory?: GymCategory;
  defaultDifficulty?: GymDifficulty;
  adapterLimit?: number;
  adapterMaxTurns?: number;
}): ScenarioSource | undefined {
  if (!input.adapterId || input.adapterId === "local") {
    return undefined;
  }

  return {
    type: "external",
    path: input.benchmarksPath,
    adapterId: input.adapterId,
    defaultCategory: input.defaultCategory,
    defaultDifficulty: input.defaultDifficulty,
    limit: input.adapterLimit,
    maxTurns: input.adapterMaxTurns,
  } satisfies ScenarioSource;
}

async function readBaselineScore(baselinePath: string): Promise<number> {
  const raw = await readFile(baselinePath, "utf-8");
  const parsed = JSON.parse(raw) as GymReport;
  if (!parsed.summary?.total?.iqScore) {
    throw new Error(`Baseline ${baselinePath} missing summary.total.iqScore`);
  }
  return parsed.summary.total.iqScore;
}

function printHelp(): void {
  process.stdout.write(`KeepUpGym Runner\n\n`);
  process.stdout.write(`Options:\n`);
  process.stdout.write(`  --suite <easy|medium|hard|all>\n`);
  process.stdout.write(`  --category <category> (repeatable)\n`);
  process.stdout.write(`  --benchmarks <path>\n`);
  process.stdout.write(`  --adapter <local|swe-bench>\n`);
  process.stdout.write(`  --adapter-default-category <category>\n`);
  process.stdout.write(`  --adapter-default-difficulty <easy|medium|hard>\n`);
  process.stdout.write(`  --adapter-limit <number>\n`);
  process.stdout.write(`  --adapter-max-turns <number>\n`);
  process.stdout.write(`  --report <path>\n`);
  process.stdout.write(`  --baseline <path>\n`);
  process.stdout.write(`  --min-score <number>\n`);
  process.stdout.write(`  --json\n`);
  process.stdout.write(`  --preserve-workspace\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
