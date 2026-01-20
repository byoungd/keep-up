/**
 * Unified Diff Patch Application
 *
 * Applies patches with whitespace-tolerant context matching.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { parsePatch } from "diff";

export interface ApplyPatchResult {
  success: boolean;
  /** Fuzz level used (0 = exact, 1 = trimEnd, 2 = trim) */
  fuzzLevel: number;
  /** Files modified */
  filesModified: string[];
  /** Error message if failed */
  error?: string;
}

type ParsedDiff = ReturnType<typeof parsePatch>[number];
type ParsedHunk = ParsedDiff["hunks"][number];
type FuzzLevel = 0 | 1 | 2;

interface PatchPlan {
  filePath: string;
  content: string;
  remove: boolean;
}

interface PatchTarget {
  filePath: string;
  isNewFile: boolean;
  isDeleted: boolean;
}

/**
 * Apply a unified diff patch to one or more files.
 * Supports fuzzy context matching to tolerate minor whitespace mismatches.
 */
export async function applyPatch(
  patchContent: string,
  basePath?: string
): Promise<ApplyPatchResult> {
  const parsed = parsePatchContent(patchContent);
  if (!parsed.success) {
    return {
      success: false,
      fuzzLevel: 0,
      filesModified: [],
      error: (parsed as { error: string }).error,
    };
  }

  const planResult = await buildPatchPlans(parsed.patches, basePath);
  if (!planResult.success) {
    return {
      success: false,
      fuzzLevel: planResult.fuzzLevel,
      filesModified: planResult.filesModified,
      error: (planResult as { error: string }).error,
    };
  }

  const writeResult = await applyPatchPlans(planResult.plans);
  if (!writeResult.success) {
    return {
      success: false,
      fuzzLevel: planResult.fuzzLevel,
      filesModified: planResult.filesModified,
      error: (writeResult as { error: string }).error,
    };
  }

  return {
    success: true,
    fuzzLevel: planResult.fuzzLevel,
    filesModified: planResult.filesModified,
  };
}

export function getPatchFilePaths(
  patchContent: string,
  basePath?: string
): { success: true; filePaths: string[] } | { success: false; error: string } {
  const parsed = parsePatchContent(patchContent);
  if (!parsed.success) {
    return { success: false, error: (parsed as { error: string }).error };
  }

  const filePaths: string[] = [];
  for (const patch of parsed.patches) {
    const target = resolvePatchTarget(patch, basePath);
    if (!target) {
      return { success: false, error: "Patch entry is missing a valid file path." };
    }
    filePaths.push(target.filePath);
  }

  return { success: true, filePaths };
}

function parsePatchContent(
  patchContent: string
): { success: true; patches: ParsedDiff[] } | { success: false; error: string } {
  let patches: ParsedDiff[];
  try {
    patches = parsePatch(patchContent);
  } catch (error) {
    return {
      success: false,
      error: `Failed to parse patch: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  if (patches.length === 0) {
    return { success: false, error: "No patch entries found." };
  }

  return { success: true, patches };
}

async function buildPatchPlans(
  patches: ParsedDiff[],
  basePath?: string
): Promise<
  | {
      success: true;
      plans: PatchPlan[];
      filesModified: string[];
      fuzzLevel: FuzzLevel;
    }
  | { success: false; filesModified: string[]; fuzzLevel: FuzzLevel; error: string }
> {
  const plans: PatchPlan[] = [];
  const filesModified: string[] = [];
  let maxFuzz: FuzzLevel = 0;

  for (const patch of patches) {
    const result = await buildPlanForPatch(patch, basePath);
    if (!result.success) {
      return {
        success: false,
        filesModified,
        fuzzLevel: maxFuzz,
        error: (result as { error: string }).error,
      };
    }

    plans.push(result.plan);
    filesModified.push(result.plan.filePath);
    maxFuzz = Math.max(maxFuzz, result.fuzzLevel) as FuzzLevel;
  }

  return { success: true, plans, filesModified, fuzzLevel: maxFuzz };
}

async function buildPlanForPatch(
  patch: ParsedDiff,
  basePath?: string
): Promise<
  { success: true; plan: PatchPlan; fuzzLevel: FuzzLevel } | { success: false; error: string }
> {
  const target = resolvePatchTarget(patch, basePath);
  if (!target) {
    return { success: false, error: "Patch entry is missing a valid file path." };
  }

  const contentResult = await loadOriginalContent(target);
  if (!contentResult.success) {
    return { success: false, error: (contentResult as { error: string }).error };
  }

  const { lines, endsWithNewline } = splitLines(contentResult.content);
  const hunkResult = applyHunks(lines, patch.hunks, target.filePath);

  if (!hunkResult.success) {
    return { success: false, error: (hunkResult as { error: string }).error };
  }

  return {
    success: true,
    plan: {
      filePath: target.filePath,
      content: joinLines(hunkResult.lines, endsWithNewline),
      remove: target.isDeleted,
    },
    fuzzLevel: hunkResult.fuzzLevel,
  };
}

async function loadOriginalContent(
  target: PatchTarget
): Promise<{ success: true; content: string } | { success: false; error: string }> {
  if (target.isNewFile) {
    return { success: true, content: "" };
  }

  try {
    const content = await fs.readFile(target.filePath, "utf-8");
    return { success: true, content };
  } catch (error) {
    return {
      success: false,
      error: `Failed to read ${target.filePath}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function applyHunks(
  lines: string[],
  hunks: ParsedHunk[],
  filePath: string
): { success: true; lines: string[]; fuzzLevel: FuzzLevel } | { success: false; error: string } {
  let workingLines = [...lines];
  let maxFuzz: FuzzLevel = 0;

  for (let i = 0; i < hunks.length; i++) {
    const hunk = hunks[i];
    const expectedIndex = Math.max(0, Math.min(workingLines.length, hunk.oldStart - 1));
    const result = applyHunkWithFuzz(workingLines, hunk, expectedIndex);
    if (!result) {
      return { success: false, error: `Failed to apply hunk ${i + 1} for ${filePath}` };
    }

    workingLines = result.lines;
    if (result.fuzzLevel > maxFuzz) {
      maxFuzz = result.fuzzLevel;
    }
  }

  return { success: true, lines: workingLines, fuzzLevel: maxFuzz };
}

async function applyPatchPlans(
  plans: PatchPlan[]
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    for (const plan of plans) {
      if (plan.remove) {
        await fs.rm(plan.filePath, { force: true });
        continue;
      }

      await fs.mkdir(path.dirname(plan.filePath), { recursive: true });
      await fs.writeFile(plan.filePath, plan.content, "utf-8");
    }
  } catch (error) {
    return {
      success: false,
      error: `Failed to write patch results: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  return { success: true };
}

function resolvePatchTarget(patch: ParsedDiff, basePath?: string): PatchTarget | null {
  const oldName = normalizePatchPath(patch.oldFileName);
  const newName = normalizePatchPath(patch.newFileName);

  if (!oldName && !newName) {
    return null;
  }

  const isDeleted = newName === "/dev/null";
  const isNewFile = oldName === "/dev/null";
  const fileName = isDeleted ? oldName : (newName ?? oldName);

  if (!fileName || fileName === "/dev/null") {
    return null;
  }

  const resolved = path.isAbsolute(fileName)
    ? fileName
    : path.resolve(basePath ?? process.cwd(), fileName);

  return {
    filePath: resolved,
    isNewFile,
    isDeleted,
  };
}

function normalizePatchPath(fileName?: string | null): string | null {
  if (!fileName) {
    return null;
  }

  const trimmed = fileName.replace(/^a\//, "").replace(/^b\//, "");
  return trimmed;
}

function splitLines(content: string): { lines: string[]; endsWithNewline: boolean } {
  const endsWithNewline = content.endsWith("\n");
  if (content.length === 0) {
    return { lines: [], endsWithNewline: false };
  }
  const rawLines = content.split("\n");
  const lines = endsWithNewline ? rawLines.slice(0, -1) : rawLines;
  return { lines, endsWithNewline };
}

function joinLines(lines: string[], endsWithNewline: boolean): string {
  const joined = lines.join("\n");
  if (!endsWithNewline) {
    return joined;
  }
  return `${joined}\n`;
}

function applyHunkWithFuzz(
  lines: string[],
  hunk: ParsedHunk,
  expectedIndex: number
): { lines: string[]; fuzzLevel: FuzzLevel } | null {
  for (const fuzzLevel of [0, 1, 2] as const) {
    const result = applyHunk(lines, hunk, expectedIndex, fuzzLevel);
    if (result) {
      return { lines: result, fuzzLevel };
    }
  }
  return null;
}

function applyHunk(
  lines: string[],
  hunk: ParsedHunk,
  expectedIndex: number,
  fuzzLevel: FuzzLevel
): string[] | null {
  const { beforeLines, afterLines } = extractHunkLines(hunk);
  const matchIndex = findBestMatch(lines, beforeLines, expectedIndex, fuzzLevel);

  if (matchIndex === null) {
    return null;
  }

  const nextLines = [...lines];
  nextLines.splice(matchIndex, beforeLines.length, ...afterLines);
  return nextLines;
}

function extractHunkLines(hunk: ParsedHunk): { beforeLines: string[]; afterLines: string[] } {
  const filtered = hunk.lines.filter((line) => !line.startsWith("\\"));
  const beforeLines = filtered
    .filter((line) => line.startsWith(" ") || line.startsWith("-"))
    .map(stripPrefix);
  const afterLines = filtered
    .filter((line) => line.startsWith(" ") || line.startsWith("+"))
    .map(stripPrefix);
  return { beforeLines, afterLines };
}

function stripPrefix(line: string): string {
  return line.slice(1);
}

function findBestMatch(
  lines: string[],
  pattern: string[],
  expectedIndex: number,
  fuzzLevel: FuzzLevel
): number | null {
  if (pattern.length === 0) {
    return Math.min(expectedIndex, lines.length);
  }

  if (
    expectedIndex >= 0 &&
    expectedIndex + pattern.length <= lines.length &&
    matchesAt(lines, pattern, expectedIndex, fuzzLevel)
  ) {
    return expectedIndex;
  }

  let bestIndex: number | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let i = 0; i <= lines.length - pattern.length; i += 1) {
    if (!matchesAt(lines, pattern, i, fuzzLevel)) {
      continue;
    }
    const distance = Math.abs(i - expectedIndex);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  }

  return bestIndex;
}

function matchesAt(
  lines: string[],
  pattern: string[],
  startIndex: number,
  fuzzLevel: FuzzLevel
): boolean {
  for (let i = 0; i < pattern.length; i += 1) {
    const source = normalizeLine(lines[startIndex + i], fuzzLevel);
    const target = normalizeLine(pattern[i], fuzzLevel);
    if (source !== target) {
      return false;
    }
  }
  return true;
}

function normalizeLine(line: string, fuzzLevel: FuzzLevel): string {
  if (fuzzLevel === 1) {
    return line.trimEnd();
  }
  if (fuzzLevel === 2) {
    return line.trim();
  }
  return line;
}
