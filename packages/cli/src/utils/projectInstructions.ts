import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

export interface InstructionOptions {
  cwd?: string;
  override?: string;
  additionalDirs?: string[];
}

const DEFAULT_FILES = ["AGENTS.md", "CLAUDE.md"] as const;

export async function loadProjectInstructions(
  options: InstructionOptions = {}
): Promise<string | undefined> {
  const override = normalizeOverride(options.override);
  if (override) {
    return override;
  }

  const cwd = options.cwd ?? process.cwd();
  const roots = resolveInstructionRoots(cwd, options.additionalDirs);
  const contents = await readInstructionContents(cwd, roots);

  return contents.length > 0 ? contents.join("\n\n---\n\n") : undefined;
}

function resolveInstructionRoots(cwd: string, additionalDirs?: string[]): string[] {
  const roots: string[] = [];
  const seen = new Set<string>();

  const addRoot = (input: string) => {
    const resolved = path.resolve(cwd, input);
    if (seen.has(resolved)) {
      return;
    }
    seen.add(resolved);
    roots.push(resolved);
  };

  addRoot(cwd);
  for (const dir of additionalDirs ?? []) {
    const trimmed = dir.trim();
    if (!trimmed) {
      continue;
    }
    addRoot(trimmed);
  }

  return roots;
}

function formatInstructionLabel(cwd: string, filePath: string): string {
  const relative = path.relative(cwd, filePath);
  return relative.length > 0 ? relative : filePath;
}

function normalizeOverride(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

async function readInstructionContents(cwd: string, roots: string[]): Promise<string[]> {
  const contents: string[] = [];
  const seen = new Set<string>();

  for (const root of roots) {
    const rootContents = await readInstructionRoot(cwd, root, seen);
    contents.push(...rootContents);
  }

  return contents;
}

async function readInstructionRoot(
  cwd: string,
  root: string,
  seen: Set<string>
): Promise<string[]> {
  const contents: string[] = [];

  for (const filename of DEFAULT_FILES) {
    const filePath = path.join(root, filename);
    if (seen.has(filePath)) {
      continue;
    }
    seen.add(filePath);
    const content = await readInstructionFile(filePath);
    if (!content) {
      continue;
    }
    const label = formatInstructionLabel(cwd, filePath);
    contents.push(`${label}\n\n${content}`);
  }

  return contents;
}

async function readInstructionFile(filePath: string): Promise<string | undefined> {
  if (!existsSync(filePath)) {
    return undefined;
  }
  try {
    const content = await readFile(filePath, "utf8");
    const trimmed = content.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  } catch {
    return undefined;
  }
}
