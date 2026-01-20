import { readFile } from "node:fs/promises";
import path from "node:path";
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
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await runSuite({
    benchmarksPath: options.benchmarksPath,
    difficulties: options.suite,
    categories: options.categories,
    preserveWorkspace: options.preserveWorkspace,
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
