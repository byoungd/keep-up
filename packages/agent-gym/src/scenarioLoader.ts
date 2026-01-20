import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { GymCategory, GymDifficulty, GymScenario } from "./types";

export interface ScenarioLoadOptions {
  difficulties?: GymDifficulty[];
  categories?: GymCategory[];
}

export async function loadScenarios(
  rootDir: string,
  options: ScenarioLoadOptions = {}
): Promise<GymScenario[]> {
  const files = await listScenarioFiles(rootDir);
  const scenarios: GymScenario[] = [];

  for (const file of files) {
    const scenario = await loadScenarioFile(file);
    if (!matchesFilter(scenario, options)) {
      continue;
    }
    scenarios.push(scenario);
  }

  return scenarios;
}

async function listScenarioFiles(rootDir: string): Promise<string[]> {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listScenarioFiles(fullPath)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".yaml")) {
      files.push(fullPath);
    }
  }

  return files.sort();
}

async function loadScenarioFile(filePath: string): Promise<GymScenario> {
  const content = await readFile(filePath, "utf-8");
  const parsed = parseJsonYaml(content);
  return validateScenario(parsed, filePath);
}

function parseJsonYaml(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Scenario file is empty.");
  }
  try {
    return JSON.parse(trimmed);
  } catch (error) {
    throw new Error(`Scenario file must be JSON-compatible YAML. ${String(error)}`);
  }
}

function validateScenario(parsed: unknown, filePath: string): GymScenario {
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`Scenario ${filePath} is not an object.`);
  }
  const scenario = parsed as GymScenario;
  if (!scenario.id || !scenario.title || !scenario.category || !scenario.difficulty) {
    throw new Error(`Scenario ${filePath} is missing required fields.`);
  }
  if (!scenario.prompt || !scenario.expectations || scenario.expectations.length === 0) {
    throw new Error(`Scenario ${filePath} must include prompt and expectations.`);
  }
  return scenario;
}

function matchesFilter(scenario: GymScenario, options: ScenarioLoadOptions): boolean {
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
