import path from "node:path";
import { buildSweBenchSuite, readSweBenchFile, writeSweBenchSuite } from "../adapters/sweBench";

interface SweBenchCliOptions {
  inputPath: string;
  outputPath: string;
  includeHints: boolean;
  maxCases?: number;
  json: boolean;
}

const DEFAULT_OUTPUT = path.resolve(process.cwd(), "reports/swe-bench.json");

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const entries = await readSweBenchFile(options.inputPath);
  const suite = buildSweBenchSuite(entries, {
    includeHints: options.includeHints,
    maxCases: options.maxCases,
  });

  await writeSweBenchSuite(suite, options.outputPath);

  if (options.json) {
    process.stdout.write(`${JSON.stringify(suite, null, 2)}\n`);
  } else {
    process.stdout.write(
      `SWE-bench import: ${suite.count} cases -> ${path.relative(process.cwd(), options.outputPath)}\n`
    );
  }
}

function parseArgs(args: string[]): SweBenchCliOptions {
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  const inputPath = getFlagValue(args, "--input");
  if (!inputPath) {
    printHelp();
    throw new Error("--input is required");
  }

  const outputPath = getFlagValue(args, "--output") ?? DEFAULT_OUTPUT;
  const includeHints = args.includes("--include-hints");
  const maxCases = parseNumber(getFlagValue(args, "--max-cases"));
  const json = args.includes("--json");

  return {
    inputPath,
    outputPath,
    includeHints,
    maxCases,
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
  process.stdout.write(`SWE-bench Importer\n\n`);
  process.stdout.write(`Options:\n`);
  process.stdout.write(`  --input <path>\n`);
  process.stdout.write(`  --output <path> (default: reports/swe-bench.json)\n`);
  process.stdout.write(`  --max-cases <number>\n`);
  process.stdout.write(`  --include-hints\n`);
  process.stdout.write(`  --json\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
