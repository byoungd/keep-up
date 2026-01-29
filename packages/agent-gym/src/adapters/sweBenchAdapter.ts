import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { GymCategory, GymDifficulty, GymExpectation, GymScenario } from "../types";
import type { ExternalBenchmarkAdapter, ExternalBenchmarkLoadOptions } from "./types";

interface SweBenchRecord {
  instance_id?: string;
  id?: string;
  repo?: string;
  repository?: string;
  base_commit?: string;
  baseCommit?: string;
  problem_statement?: string;
  prompt?: string;
  description?: string;
  hints_text?: string | null;
  hints?: string | null;
  patch?: string | null;
  test_patch?: string | null;
  difficulty?: string;
  category?: string;
}

const DEFAULT_CATEGORY: GymCategory = "cross-file";
const DEFAULT_DIFFICULTY: GymDifficulty = "hard";
const DEFAULT_MAX_TURNS = 12;
const COMPLETION_TOOL = "completion:complete_task";

const GYM_CATEGORIES: GymCategory[] = [
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

const GYM_DIFFICULTIES: GymDifficulty[] = ["easy", "medium", "hard"];

export class SweBenchAdapter implements ExternalBenchmarkAdapter {
  readonly id = "swe-bench";
  readonly name = "SWE-bench";
  readonly description = "Load SWE-bench JSON/JSONL tasks into Gym scenarios.";

  async load(options: ExternalBenchmarkLoadOptions): Promise<GymScenario[]> {
    const sourceFile = await resolveSourceFile(options.sourcePath);
    const raw = await readFile(sourceFile, "utf-8");
    const records = sourceFile.endsWith(".jsonl")
      ? parseJsonLines(raw, sourceFile)
      : parseJson(raw, sourceFile);

    const scenarios = records.map((record, index) => toScenario(record, index, options));

    const filtered = scenarios.filter((scenario) => matchesFilter(scenario, options));
    if (options.limit && options.limit > 0) {
      return filtered.slice(0, options.limit);
    }
    return filtered;
  }
}

export function createSweBenchAdapter(): SweBenchAdapter {
  return new SweBenchAdapter();
}

async function resolveSourceFile(sourcePath: string): Promise<string> {
  const info = await stat(sourcePath);
  if (info.isFile()) {
    return sourcePath;
  }
  if (!info.isDirectory()) {
    throw new Error(`SWE-bench source must be a file or directory: ${sourcePath}`);
  }

  const entries = await readdir(sourcePath);
  const preferred = ["swe-bench.jsonl", "swe-bench.json", "data.jsonl", "data.json"];
  for (const name of preferred) {
    const candidate = path.join(sourcePath, name);
    try {
      const candidateInfo = await stat(candidate);
      if (candidateInfo.isFile()) {
        return candidate;
      }
    } catch {
      // Ignore missing candidates.
    }
  }

  const jsonl = entries
    .filter((entry) => entry.endsWith(".jsonl"))
    .sort()
    .map((entry) => path.join(sourcePath, entry));
  if (jsonl.length > 0) {
    return jsonl[0];
  }

  const json = entries
    .filter((entry) => entry.endsWith(".json"))
    .sort()
    .map((entry) => path.join(sourcePath, entry));
  if (json.length > 0) {
    return json[0];
  }

  throw new Error(`SWE-bench directory has no JSON/JSONL file: ${sourcePath}`);
}

function parseJson(raw: string, sourceFile: string): SweBenchRecord[] {
  const parsed = JSON.parse(raw) as unknown;
  if (Array.isArray(parsed)) {
    return parsed.map((entry, index) => ensureRecord(entry, sourceFile, index));
  }

  if (parsed && typeof parsed === "object") {
    const container = parsed as {
      data?: unknown;
      instances?: unknown;
      items?: unknown;
    };
    const list = container.data ?? container.instances ?? container.items;
    if (Array.isArray(list)) {
      return list.map((entry, index) => ensureRecord(entry, sourceFile, index));
    }
  }

  throw new Error(`SWE-bench source ${sourceFile} must be an array of records.`);
}

function parseJsonLines(raw: string, sourceFile: string): SweBenchRecord[] {
  const records: SweBenchRecord[] = [];
  const lines = raw.split(/\r?\n/);
  let index = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const parsed = JSON.parse(trimmed) as unknown;
    records.push(ensureRecord(parsed, sourceFile, index));
    index += 1;
  }

  if (records.length === 0) {
    throw new Error(`SWE-bench source ${sourceFile} is empty.`);
  }

  return records;
}

function ensureRecord(value: unknown, sourceFile: string, index: number): SweBenchRecord {
  if (!value || typeof value !== "object") {
    throw new Error(`SWE-bench record ${index} in ${sourceFile} is not an object.`);
  }
  return value as SweBenchRecord;
}

function toScenario(
  record: SweBenchRecord,
  index: number,
  options: ExternalBenchmarkLoadOptions
): GymScenario {
  const instanceId = pickInstanceId(record, index);
  const repo = firstString(record.repo, record.repository);
  const baseCommit = firstString(record.base_commit, record.baseCommit);
  const description = firstString(record.description);
  const problem = firstString(record.problem_statement, record.prompt, description);

  if (!problem) {
    throw new Error(`SWE-bench record ${instanceId} missing problem statement.`);
  }

  const hints = firstString(record.hints_text ?? undefined, record.hints ?? undefined);
  const prompt = buildPrompt(instanceId, repo, baseCommit, problem, hints);
  const category = resolveCategory(record.category, options);
  const difficulty = resolveDifficulty(record.difficulty, options);

  const maxTurns = options.maxTurns ?? DEFAULT_MAX_TURNS;
  const expectations = buildExpectations(maxTurns);

  return {
    id: `swe-bench-${instanceId}`,
    title: repo ? `SWE-bench ${repo}` : `SWE-bench ${instanceId}`,
    description: description ?? problem,
    category,
    difficulty,
    prompt,
    expectations,
    maxTurns,
    external: {
      source: "swe-bench",
      instanceId,
      repo: repo ?? undefined,
      baseCommit: baseCommit ?? undefined,
    },
  };
}

function buildPrompt(
  instanceId: string,
  repo: string | undefined,
  baseCommit: string | undefined,
  problem: string,
  hints: string | undefined
): string {
  const sections: string[] = [`SWE-bench instance ${instanceId}`];
  if (repo) {
    sections.push(`Repository: ${repo}`);
  }
  if (baseCommit) {
    sections.push(`Base commit: ${baseCommit}`);
  }
  sections.push("\nTask:");
  sections.push(problem);
  if (hints) {
    sections.push("\nHints:");
    sections.push(hints);
  }
  return sections.join("\n");
}

function buildExpectations(maxTurns: number): GymExpectation[] {
  return [
    { type: "tool_called", name: COMPLETION_TOOL },
    { type: "max_turns", count: maxTurns },
  ];
}

function resolveCategory(
  raw: string | undefined,
  options: ExternalBenchmarkLoadOptions
): GymCategory {
  if (raw) {
    const trimmed = raw.trim();
    if (isGymCategory(trimmed)) {
      return trimmed;
    }
  }
  if (options.defaultCategory) {
    return options.defaultCategory;
  }
  if (options.categories && options.categories.length === 1) {
    return options.categories[0];
  }
  return DEFAULT_CATEGORY;
}

function resolveDifficulty(
  raw: string | undefined,
  options: ExternalBenchmarkLoadOptions
): GymDifficulty {
  if (raw) {
    const trimmed = raw.trim().toLowerCase();
    if (isGymDifficulty(trimmed)) {
      return trimmed;
    }
  }
  if (options.defaultDifficulty) {
    return options.defaultDifficulty;
  }
  if (options.difficulties && options.difficulties.length === 1) {
    return options.difficulties[0];
  }
  return DEFAULT_DIFFICULTY;
}

function matchesFilter(scenario: GymScenario, options: ExternalBenchmarkLoadOptions): boolean {
  if (options.difficulties && options.difficulties.length > 0) {
    if (!options.difficulties.includes(scenario.difficulty)) {
      return false;
    }
  }
  if (options.categories && options.categories.length > 0) {
    if (!options.categories.includes(scenario.category)) {
      return false;
    }
  }
  return true;
}

function pickInstanceId(record: SweBenchRecord, index: number): string {
  const candidate = firstString(record.instance_id, record.id);
  if (candidate) {
    return candidate;
  }
  return `row-${index + 1}`;
}

function firstString(...values: Array<string | undefined | null>): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function isGymCategory(value: string): value is GymCategory {
  return GYM_CATEGORIES.includes(value as GymCategory);
}

function isGymDifficulty(value: string): value is GymDifficulty {
  return GYM_DIFFICULTIES.includes(value as GymDifficulty);
}
