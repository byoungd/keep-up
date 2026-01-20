/**
 * Code Editor with Lint-Driven Rollback
 *
 * Provides atomic file editing with optional syntax validation.
 * If validation fails, changes are automatically rolled back.
 */

import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { promisify } from "node:util";
import { createTwoFilesPatch } from "diff";

const execFileAsync = promisify(execFile);

// ============================================================================
// Types
// ============================================================================

export interface EditChunk {
  /** 1-indexed start line (inclusive) */
  startLine: number;
  /** 1-indexed end line (inclusive) */
  endLine: number;
  /** Replacement content (may be empty to delete lines) */
  replacement: string;
}

export interface EditOptions {
  /** If true, do not write changes to disk. Default: false */
  dryRun?: boolean;
  /** If true, run syntax validation after edit. Default: true for known languages */
  validateSyntax?: boolean;
}

export interface EditResult {
  success: boolean;
  /** Unified diff of the change */
  diff: string;
  /** General error message (e.g., range validation) */
  error?: string;
  /** If syntax validation failed, the error message */
  syntaxError?: string;
  /** If rollback occurred */
  rolledBack?: boolean;
  /** New total line count */
  newTotalLines?: number;
}

// ============================================================================
// Language Detection
// ============================================================================

type Language = "typescript" | "javascript" | "python" | "unknown";

function detectLanguage(filePath: string): Language {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".ts":
    case ".tsx":
      return "typescript";
    case ".js":
    case ".jsx":
    case ".mjs":
    case ".cjs":
      return "javascript";
    case ".py":
      return "python";
    default:
      return "unknown";
  }
}

// ============================================================================
// Syntax Validation
// ============================================================================

interface ValidationSnapshot {
  ok: boolean;
  output: string;
  signatures: string[];
}

interface ValidationCommand {
  command: string;
  args: string[];
  timeout: number;
}

function getValidationCommand(filePath: string, language: Language): ValidationCommand | null {
  switch (language) {
    case "typescript":
      return {
        command: "npx",
        args: ["tsc", "--noEmit", "--skipLibCheck", "--pretty", "false", filePath],
        timeout: 30_000,
      };
    case "javascript":
      return {
        command: "node",
        args: ["--check", filePath],
        timeout: 10_000,
      };
    case "python":
      return {
        command: "python3",
        args: ["-m", "py_compile", filePath],
        timeout: 10_000,
      };
    default:
      return null;
  }
}

async function runValidation(filePath: string, language: Language): Promise<ValidationSnapshot> {
  const command = getValidationCommand(filePath, language);
  if (!command) {
    return { ok: true, output: "", signatures: [] };
  }

  try {
    const { stdout, stderr } = await execFileAsync(command.command, command.args, {
      timeout: command.timeout,
    });
    const output = [stdout, stderr].filter(Boolean).join("\n").trim();
    return {
      ok: true,
      output,
      signatures: extractDiagnosticSignatures(output, language),
    };
  } catch (err) {
    const error = err as { stdout?: string; stderr?: string; message?: string };
    const output = [error.stdout, error.stderr, error.message].filter(Boolean).join("\n").trim();
    return {
      ok: false,
      output,
      signatures: extractDiagnosticSignatures(output, language),
    };
  }
}

function extractDiagnosticSignatures(output: string, language: Language): string[] {
  if (!output) {
    return [];
  }

  const lines = output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const signatures: string[] = [];
  for (const line of lines) {
    const signature = extractSignatureFromLine(line, language);
    if (signature) {
      signatures.push(signature);
      continue;
    }

    if (line.includes("error")) {
      signatures.push(normalizeDiagnosticLine(line));
    }
  }

  return signatures;
}

function extractSignatureFromLine(line: string, language: Language): string | null {
  switch (language) {
    case "typescript":
      return extractTypeScriptSignature(line);
    case "javascript":
      return extractJavaScriptSignature(line);
    case "python":
      return extractPythonSignature(line);
    default:
      return null;
  }
}

function extractTypeScriptSignature(line: string): string | null {
  const match = line.match(/error TS(\d+):\s*(.*)$/);
  if (!match) {
    return null;
  }
  return `TS${match[1]}:${match[2]}`;
}

function extractJavaScriptSignature(line: string): string | null {
  const match = line.match(
    /^(SyntaxError|ReferenceError|TypeError|RangeError|EvalError|URIError):\s*(.*)$/
  );
  if (!match) {
    return null;
  }
  return `${match[1]}:${match[2]}`;
}

function extractPythonSignature(line: string): string | null {
  const match = line.match(
    /^(SyntaxError|IndentationError|TabError|NameError|TypeError|ValueError):\s*(.*)$/
  );
  if (!match) {
    return null;
  }
  return `${match[1]}:${match[2]}`;
}

function normalizeDiagnosticLine(line: string): string {
  return line
    .replace(/:\d+:\d+/g, ":<line>:<col>")
    .replace(/:\d+/g, ":<line>")
    .replace(/\\/g, "/");
}

function getValidationError(
  baseline: ValidationSnapshot,
  current: ValidationSnapshot
): string | undefined {
  if (current.ok) {
    return undefined;
  }

  const baselineSet = new Set(baseline.signatures);
  const newDiagnostics = current.signatures.filter((sig) => !baselineSet.has(sig));

  if (newDiagnostics.length === 0) {
    if (baseline.ok) {
      return current.output || "Syntax validation failed.";
    }
    return undefined;
  }

  return `New diagnostics detected:\n${newDiagnostics.join("\n")}`;
}

// ============================================================================
// Edit Validation
// ============================================================================

function validateIndividualEdit(edit: EditChunk, totalLines: number): string | undefined {
  if (edit.startLine < 1) {
    return `Invalid start line: ${edit.startLine}. Lines are 1-indexed.`;
  }
  if (edit.endLine < edit.startLine) {
    return `End line (${edit.endLine}) must be >= start line (${edit.startLine}).`;
  }
  if (totalLines > 0) {
    if (edit.startLine > totalLines) {
      return `Start line ${edit.startLine} exceeds file length (${totalLines} lines).`;
    }
    if (edit.endLine > totalLines) {
      return `End line ${edit.endLine} exceeds file length (${totalLines} lines).`;
    }
  }
  return undefined;
}

/**
 * Validate edit ranges against the file length and check for overlaps.
 * Returns an error message if invalid, undefined if valid.
 */
function validateEditRanges(edits: EditChunk[], totalLines: number): string | undefined {
  if (edits.length === 0) {
    return "No edits provided.";
  }

  for (const edit of edits) {
    const error = validateIndividualEdit(edit, totalLines);
    if (error) {
      return error;
    }
  }

  const sorted = [...edits].sort((a, b) => a.startLine - b.startLine);
  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];
    if (current.endLine >= next.startLine) {
      return `Overlapping edit ranges detected: [${current.startLine}, ${current.endLine}] and [${next.startLine}, ${next.endLine}].`;
    }
  }

  return undefined;
}

// ============================================================================
// Edit Queue (for Concurrency Rigor)
// ============================================================================

const editQueues = new Map<string, Promise<void>>();

async function queueEdit(filePath: string, fn: () => Promise<EditResult>): Promise<EditResult> {
  const current = editQueues.get(filePath) ?? Promise.resolve();
  let resolve!: (value?: void | PromiseLike<void>) => void;
  const next = new Promise<void>((r) => {
    resolve = r;
  });
  editQueues.set(filePath, next);

  try {
    await current;
    return await fn();
  } finally {
    resolve?.();
    if (editQueues.get(filePath) === next) {
      editQueues.delete(filePath);
    }
  }
}

/**
 * Apply one or more edits to a file atomically.
 * If any edit fails validation, ALL edits are rolled back.
 */
export async function editFile(
  filePath: string,
  edits: EditChunk[],
  options: EditOptions = {}
): Promise<EditResult> {
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
  return queueEdit(absolutePath, () => editFileInternal(absolutePath, edits, options));
}

async function prepareEditContext(
  absolutePath: string,
  edits: EditChunk[]
): Promise<
  { success: true; content: string; lines: string[] } | { success: false; error: string }
> {
  try {
    const content = await fs.readFile(absolutePath, "utf-8");
    const lines = content === "" ? [] : content.split("\n");
    const error = validateEditRanges(edits, lines.length);
    if (error) {
      return { success: false, error };
    }
    return { success: true, content, lines };
  } catch (err) {
    return {
      success: false,
      error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

function applyEditChunks(lines: string[], edits: EditChunk[]): string[] {
  const sorted = [...edits].sort((a, b) => b.startLine - a.startLine);
  const newLines = [...lines];
  for (const edit of sorted) {
    const replacement = edit.replacement === "" ? [] : edit.replacement.split("\n");
    const startIdx = edit.startLine - 1;
    newLines.splice(startIdx, edit.endLine - startIdx, ...replacement);
  }
  return newLines;
}

async function editFileInternal(
  absolutePath: string,
  edits: EditChunk[],
  options: EditOptions = {}
): Promise<EditResult> {
  const shouldValidate = options.validateSyntax ?? true;
  const ctx = await prepareEditContext(absolutePath, edits);
  if (!ctx.success) {
    return { success: false, diff: "", error: ctx.error };
  }

  const newLines = applyEditChunks(ctx.lines, edits);
  let newContent = newLines.join("\n");
  if (newContent !== "" && !newContent.endsWith("\n")) {
    newContent += "\n";
  }

  const diff = createTwoFilesPatch(
    absolutePath,
    absolutePath,
    ctx.content,
    newContent,
    "original",
    "modified"
  );
  if (options.dryRun) {
    return { success: true, diff, newTotalLines: newLines.length };
  }

  const language = detectLanguage(absolutePath);
  const baseline =
    shouldValidate && language !== "unknown" ? await runValidation(absolutePath, language) : null;

  await fs.writeFile(absolutePath, newContent, "utf-8");

  if (shouldValidate && language !== "unknown" && baseline) {
    const validation = await runValidation(absolutePath, language);
    const error = getValidationError(baseline, validation);
    if (error) {
      await fs.writeFile(absolutePath, ctx.content, "utf-8");
      return { success: false, diff, syntaxError: error, rolledBack: true };
    }
  }

  return { success: true, diff, newTotalLines: newLines.length };
}

// ============================================================================
// Simple Replace Function (for single replacements)
// ============================================================================

/**
 * Replace text at a specific line range.
 * Convenience wrapper around editFile for single edits.
 */
export async function replaceLines(
  filePath: string,
  startLine: number,
  endLine: number,
  replacement: string,
  options: EditOptions = {}
): Promise<EditResult> {
  return editFile(filePath, [{ startLine, endLine, replacement }], options);
}

// ============================================================================
// Insert and Delete Helpers
// ============================================================================

/**
 * Insert content after a specific line.
 */
export async function insertAfterLine(
  filePath: string,
  afterLine: number,
  content: string,
  options: EditOptions = {}
): Promise<EditResult> {
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
  const fileContent = await fs.readFile(absolutePath, "utf-8");
  const lines = fileContent.split("\n");

  if (afterLine < 0 || afterLine > lines.length) {
    return {
      success: false,
      diff: "",
      syntaxError: `Line ${afterLine} is out of bounds (0-${lines.length}).`,
    };
  }

  // Insert at the line AFTER the specified line
  // If afterLine is 0, insert at the beginning
  // We achieve this by "replacing" line afterLine+1 with: content + original line afterLine+1
  if (afterLine === lines.length) {
    // Appending at end
    const newContent = `${fileContent}\n${content}`;
    const diff = createTwoFilesPatch(
      absolutePath,
      absolutePath,
      fileContent,
      newContent,
      "original",
      "modified"
    );

    if (!options.dryRun) {
      await fs.writeFile(absolutePath, newContent, "utf-8");
    }

    return { success: true, diff, newTotalLines: lines.length + content.split("\n").length };
  }

  // Insert before line afterLine+1
  const insertLine = afterLine + 1;
  const existingLine = lines[insertLine - 1];
  const replacement = `${content}\n${existingLine}`;

  return editFile(filePath, [{ startLine: insertLine, endLine: insertLine, replacement }], options);
}

/**
 * Delete specific lines from a file.
 */
export async function deleteLines(
  filePath: string,
  startLine: number,
  endLine: number,
  options: EditOptions = {}
): Promise<EditResult> {
  return editFile(filePath, [{ startLine, endLine, replacement: "" }], options);
}
