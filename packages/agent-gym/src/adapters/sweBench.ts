import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type SweBenchRawCase = {
  instance_id: string;
  repo: string;
  base_commit: string;
  patch: string;
  problem_statement: string;
  hints_text?: string;
  test_patch?: string;
};

export type SweBenchAdapterOptions = {
  includeHints?: boolean;
  maxCases?: number;
};

export type ExternalBenchmarkCase = {
  id: string;
  source: "swe-bench";
  repo: string;
  baseCommit: string;
  prompt: string;
  patch: string;
  metadata: Record<string, unknown>;
};

export type ExternalBenchmarkSuite = {
  source: "swe-bench";
  generatedAt: string;
  count: number;
  cases: ExternalBenchmarkCase[];
};

export function parseSweBenchJSONL(raw: string): SweBenchRawCase[] {
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const cases: SweBenchRawCase[] = [];
  for (const line of lines) {
    const parsed = JSON.parse(line) as SweBenchRawCase;
    if (!parsed.instance_id || !parsed.repo || !parsed.base_commit || !parsed.patch) {
      throw new Error("SWE-bench record missing required fields");
    }
    if (!parsed.problem_statement) {
      throw new Error(`SWE-bench record ${parsed.instance_id} missing problem_statement`);
    }
    cases.push(parsed);
  }

  return cases;
}

export function buildSweBenchPrompt(
  entry: SweBenchRawCase,
  options: SweBenchAdapterOptions = {}
): string {
  const sections: string[] = [];
  sections.push(`Repository: ${entry.repo}`);
  sections.push(`Base commit: ${entry.base_commit}`);
  sections.push("");
  sections.push(entry.problem_statement.trim());

  if (options.includeHints && entry.hints_text) {
    sections.push("");
    sections.push("Hints:");
    sections.push(entry.hints_text.trim());
  }

  return sections.join("\n");
}

export function toExternalBenchmarkCases(
  entries: SweBenchRawCase[],
  options: SweBenchAdapterOptions = {}
): ExternalBenchmarkCase[] {
  const sorted = [...entries].sort((a, b) => a.instance_id.localeCompare(b.instance_id));
  const max = options.maxCases ?? sorted.length;
  return sorted.slice(0, max).map((entry) => ({
    id: entry.instance_id,
    source: "swe-bench",
    repo: entry.repo,
    baseCommit: entry.base_commit,
    prompt: buildSweBenchPrompt(entry, options),
    patch: entry.patch,
    metadata: {
      hints_text: entry.hints_text ?? null,
      test_patch: entry.test_patch ?? null,
    },
  }));
}

export function buildSweBenchSuite(
  entries: SweBenchRawCase[],
  options: SweBenchAdapterOptions = {}
): ExternalBenchmarkSuite {
  const cases = toExternalBenchmarkCases(entries, options);
  return {
    source: "swe-bench",
    generatedAt: new Date().toISOString(),
    count: cases.length,
    cases,
  };
}

export async function readSweBenchFile(inputPath: string): Promise<SweBenchRawCase[]> {
  const raw = await readFile(inputPath, "utf-8");
  return parseSweBenchJSONL(raw);
}

export async function writeSweBenchSuite(
  suite: ExternalBenchmarkSuite,
  outputPath: string
): Promise<void> {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(suite, null, 2), "utf-8");
}
