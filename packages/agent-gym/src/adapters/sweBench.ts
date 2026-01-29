import { parsePatch } from "diff";
import type { GymCategory, GymDifficulty, GymScenario } from "../types";

export type SweBenchRecord = {
  instance_id: string;
  problem_statement: string;
  patch: string;
  repo?: string;
  base_commit?: string;
  hints_text?: string;
};

export type SweBenchParseError = {
  line: number;
  reason: string;
  raw: string;
};

export type SweBenchParseResult = {
  records: SweBenchRecord[];
  errors: SweBenchParseError[];
};

export type SweBenchScenarioOptions = {
  difficulty?: GymDifficulty;
  category?: GymCategory;
  maxTurns?: number;
};

export function parseSweBenchJsonl(content: string): SweBenchParseResult {
  const records: SweBenchRecord[] = [];
  const errors: SweBenchParseError[] = [];
  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i].trim();
    if (!raw) {
      continue;
    }

    const parsed = parseSweBenchLine(raw, i + 1);
    if (parsed.error) {
      errors.push(parsed.error);
      continue;
    }
    records.push(parsed.record);
  }

  return { records, errors };
}

function parseSweBenchLine(
  raw: string,
  line: number
): { record: SweBenchRecord } | { error: SweBenchParseError } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      error: {
        line,
        reason: `invalid_json: ${error instanceof Error ? error.message : String(error)}`,
        raw: raw.slice(0, 200),
      },
    };
  }

  if (!parsed || typeof parsed !== "object") {
    return { error: { line, reason: "invalid_record", raw: raw.slice(0, 200) } };
  }

  const record = parsed as SweBenchRecord;
  const validation = validateSweBenchRecord(record);
  if (validation) {
    return { error: { line, reason: validation, raw: raw.slice(0, 200) } };
  }

  return { record };
}

function validateSweBenchRecord(record: SweBenchRecord): string | null {
  if (!record.instance_id || typeof record.instance_id !== "string") {
    return "missing_instance_id";
  }
  if (!record.problem_statement || typeof record.problem_statement !== "string") {
    return "missing_problem_statement";
  }
  if (!record.patch || typeof record.patch !== "string") {
    return "missing_patch";
  }
  return null;
}

export function sweBenchToScenario(
  record: SweBenchRecord,
  options: SweBenchScenarioOptions = {}
): GymScenario {
  const category = options.category ?? inferCategory(record.patch);
  const difficulty = options.difficulty ?? "hard";
  const title = `SWE-bench ${record.instance_id}`;

  const promptParts = [
    "You are given a SWE-bench task.",
    `Repository: ${record.repo ?? "unknown"}`,
    `Base commit: ${record.base_commit ?? "unknown"}`,
  ];

  if (record.hints_text) {
    promptParts.push("", `Hints: ${record.hints_text.trim()}`);
  }

  promptParts.push(
    "",
    record.problem_statement.trim(),
    "",
    "Provide a unified diff patch as the solution."
  );

  const scenarioId = `swe-bench-${normalizeScenarioId(record.instance_id)}`;

  return {
    id: scenarioId,
    title,
    description: `SWE-bench instance ${record.instance_id}.`,
    category,
    difficulty,
    prompt: promptParts.join("\n"),
    expectations: [{ type: "patch_parses", patch: record.patch }],
    maxTurns: options.maxTurns ?? 12,
  };
}

function inferCategory(patch: string): GymCategory {
  try {
    const parsed = parsePatch(patch);
    if (parsed.length > 1) {
      return "cross-file";
    }
  } catch {
    // fall back to default category
  }
  return "feature-add";
}

function normalizeScenarioId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 80);
}
