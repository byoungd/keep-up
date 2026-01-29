import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  parseSweBenchJsonl,
  type SweBenchScenarioOptions,
  sweBenchToScenario,
} from "../adapters/sweBench";
import type { GymCategory, GymDifficulty, GymScenario } from "../types";

interface CliOptions {
  input: string;
  output?: string;
  limit?: number;
  difficulty?: GymDifficulty;
  category?: GymCategory;
  maxTurns?: number;
  json: boolean;
}

interface SweBenchImportReport {
  source: string;
  importedAt: string;
  totalRecords: number;
  converted: number;
  skipped: number;
  errors: Array<{ line: number; reason: string; raw: string }>;
  scenarios: GymScenario[];
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  const raw = await readFile(options.input, "utf-8");
  const { records, errors } = parseSweBenchJsonl(raw);

  const limited = options.limit ? records.slice(0, options.limit) : records;
  const scenarioOptions: SweBenchScenarioOptions = {
    difficulty: options.difficulty,
    category: options.category,
    maxTurns: options.maxTurns,
  };

  const scenarios = limited.map((record) => sweBenchToScenario(record, scenarioOptions));

  const report: SweBenchImportReport = {
    source: path.resolve(options.input),
    importedAt: new Date().toISOString(),
    totalRecords: records.length,
    converted: scenarios.length,
    skipped: errors.length,
    errors,
    scenarios,
  };

  const output = JSON.stringify(report, null, 2);

  if (options.output) {
    await mkdir(path.dirname(options.output), { recursive: true });
    await writeFile(options.output, output, "utf-8");
  }

  if (options.json || !options.output) {
    process.stdout.write(`${output}\n`);
  }

  process.stderr.write(
    `SWE-bench import: ${report.converted} scenarios, ${report.skipped} skipped.\n`
  );
}

function parseArgs(args: string[]): CliOptions {
  const input = getFlagValue(args, "--input");
  const output = getFlagValue(args, "--output");
  const limit = parseNumber(getFlagValue(args, "--limit"));
  const maxTurns = parseNumber(getFlagValue(args, "--max-turns"));
  const difficulty = getFlagValue(args, "--difficulty") as GymDifficulty | undefined;
  const category = getFlagValue(args, "--category") as GymCategory | undefined;
  const json = args.includes("--json");

  if (args.includes("--help") || args.includes("-h") || !input) {
    printHelp();
    process.exit(input ? 0 : 1);
  }

  return {
    input,
    output,
    limit: limit ?? undefined,
    difficulty,
    category,
    maxTurns: maxTurns ?? undefined,
    json,
  };
}

function getFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  return args[index + 1];
}

function parseNumber(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function printHelp(): void {
  process.stdout.write("KeepUpGym SWE-bench Import\n\n");
  process.stdout.write("Options:\n");
  process.stdout.write("  --input <path> (required)\n");
  process.stdout.write("  --output <path>\n");
  process.stdout.write("  --limit <number>\n");
  process.stdout.write("  --difficulty <easy|medium|hard>\n");
  process.stdout.write("  --category <category>\n");
  process.stdout.write("  --max-turns <number>\n");
  process.stdout.write("  --json\n");
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
