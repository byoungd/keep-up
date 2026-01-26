/**
 * File System Operations for Code Tools
 *
 * Provides safe, agent-friendly abstractions for file reading and listing.
 */

import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import { createRequire } from "node:module";
import * as path from "node:path";
import { promisify } from "node:util";

type GitignoreNativeModule = {
  hasNativeSupport: () => boolean;
  listFiles: (
    dirPath: string,
    options: { maxDepth?: number; includeHidden?: boolean; respectGitignore?: boolean }
  ) => FileEntry[];
};

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
let cachedGitignoreModule: GitignoreNativeModule | null | undefined;

function loadGitignoreModule(): GitignoreNativeModule | null {
  if (cachedGitignoreModule !== undefined) {
    return cachedGitignoreModule;
  }
  try {
    cachedGitignoreModule = require("@ku0/gitignore-rs") as GitignoreNativeModule;
  } catch {
    cachedGitignoreModule = null;
  }
  return cachedGitignoreModule;
}

function hasGitignoreNativeSupport(): boolean {
  const module = loadGitignoreModule();
  return module?.hasNativeSupport?.() ?? false;
}

function listFilesWithGitignoreNative(
  dirPath: string,
  options: { maxDepth?: number; includeHidden?: boolean; respectGitignore?: boolean }
): FileEntry[] {
  const module = loadGitignoreModule();
  if (!module) {
    throw new Error("Native gitignore module unavailable.");
  }
  return module.listFiles(dirPath, options);
}

// ============================================================================
// Types
// ============================================================================

export interface ReadFileOptions {
  /** 1-indexed start line (inclusive). If omitted, start from line 1. */
  startLine?: number;
  /** 1-indexed end line (inclusive). If omitted, read to EOF. */
  endLine?: number;
  /** Prepend line numbers to each line. Default: true */
  withLineNumbers?: boolean;
}

export interface ReadFileResult {
  path: string;
  totalLines: number;
  content: string;
  /** Range of lines actually returned [startLine, endLine] (1-indexed) */
  range: [number, number];
}

export interface ListFilesOptions {
  /** Max depth for recursive listing. Default: Infinity */
  maxDepth?: number;
  /** Include hidden files/directories. Default: false */
  includeHidden?: boolean;
  /** Respect .gitignore. Default: true */
  respectGitignore?: boolean;
}

export interface FileEntry {
  path: string;
  type: "file" | "directory";
  size?: number;
}

// ============================================================================
// Read File
// ============================================================================

/**
 * Read a file with optional line range.
 * Returns content with line numbers for easy LLM reference.
 */
export async function readFile(
  filePath: string,
  options: ReadFileOptions = {}
): Promise<ReadFileResult> {
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);

  // Read entire file
  const content = await fs.readFile(absolutePath, "utf-8");
  const lines = content.split("\n");
  const totalLines = lines.length;

  // Calculate range
  const startLine = Math.max(1, options.startLine ?? 1);
  const endLine = Math.min(totalLines, options.endLine ?? totalLines);

  // Validate range
  if (startLine > totalLines) {
    throw new Error(`Start line ${startLine} exceeds total lines ${totalLines}`);
  }

  // Extract lines (convert to 0-indexed for slice)
  const selectedLines = lines.slice(startLine - 1, endLine);

  // Format output
  const withLineNumbers = options.withLineNumbers ?? true;
  let formattedContent: string;

  if (withLineNumbers) {
    const maxLineNumWidth = String(endLine).length;
    formattedContent = selectedLines
      .map((line, idx) => {
        const lineNum = String(startLine + idx).padStart(maxLineNumWidth, " ");
        return `${lineNum}: ${line}`;
      })
      .join("\n");
  } else {
    formattedContent = selectedLines.join("\n");
  }

  return {
    path: absolutePath,
    totalLines,
    content: formattedContent,
    range: [startLine, endLine],
  };
}

// ============================================================================
// List Files
// ============================================================================

/**
 * List files in a directory, optionally respecting .gitignore.
 */
export async function listFiles(
  dirPath: string,
  options: ListFilesOptions = {}
): Promise<FileEntry[]> {
  const absolutePath = path.isAbsolute(dirPath) ? dirPath : path.resolve(dirPath);
  const maxDepth = options.maxDepth ?? Infinity;
  const includeHidden = options.includeHidden ?? false;
  const respectGitignore = options.respectGitignore ?? true;

  if (hasGitignoreNativeSupport()) {
    try {
      const nativeMaxDepth = Number.isFinite(maxDepth) ? maxDepth : undefined;
      return listFilesWithGitignoreNative(absolutePath, {
        maxDepth: nativeMaxDepth,
        includeHidden,
        respectGitignore,
      });
    } catch {
      // Fall back to git/JS implementations if native binding fails.
    }
  }

  // Try to use `git ls-files` for gitignore-aware listing
  if (respectGitignore) {
    try {
      return await listFilesWithGit(absolutePath, maxDepth, includeHidden);
    } catch {
      // Fall back to native listing if git is not available
    }
  }

  return await listFilesNative(absolutePath, maxDepth, includeHidden);
}

async function listFilesWithGit(
  dirPath: string,
  maxDepth: number,
  includeHidden: boolean
): Promise<FileEntry[]> {
  // Use git ls-files to get tracked files (respects .gitignore)
  const { stdout } = await execFileAsync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard"],
    {
      cwd: dirPath,
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    }
  );

  const files = stdout.trim().split("\n").filter(Boolean);
  const entries: FileEntry[] = [];

  for (const file of files) {
    // Check depth
    const depth = file.split("/").length;
    if (depth > maxDepth) {
      continue;
    }

    // Check hidden
    if (!includeHidden && file.split("/").some((part) => part.startsWith("."))) {
      continue;
    }

    const fullPath = path.join(dirPath, file);
    try {
      const stat = await fs.stat(fullPath);
      entries.push({
        path: file,
        type: stat.isDirectory() ? "directory" : "file",
        size: stat.isFile() ? stat.size : undefined,
      });
    } catch {
      // File might have been deleted, skip
    }
  }

  return entries;
}

async function listFilesNative(
  dirPath: string,
  maxDepth: number,
  includeHidden: boolean,
  currentDepth: number = 1,
  basePath: string = dirPath
): Promise<FileEntry[]> {
  if (currentDepth > maxDepth) {
    return [];
  }

  const entries: FileEntry[] = [];
  const items = await fs.readdir(dirPath, { withFileTypes: true });

  for (const item of items) {
    // Skip hidden files if not included
    if (!includeHidden && item.name.startsWith(".")) {
      continue;
    }

    const fullPath = path.join(dirPath, item.name);
    const relativePath = path.relative(basePath, fullPath);

    if (item.isDirectory()) {
      entries.push({
        path: relativePath,
        type: "directory",
      });

      // Recurse into directory
      const subEntries = await listFilesNative(
        fullPath,
        maxDepth,
        includeHidden,
        currentDepth + 1,
        basePath
      );
      entries.push(...subEntries);
    } else if (item.isFile()) {
      const stat = await fs.stat(fullPath);
      entries.push({
        path: relativePath,
        type: "file",
        size: stat.size,
      });
    }
  }

  return entries;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if a file exists.
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get file stats.
 */
export async function getFileStats(filePath: string): Promise<{
  size: number;
  lines: number;
  lastModified: Date;
}> {
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
  const stat = await fs.stat(absolutePath);
  const content = await fs.readFile(absolutePath, "utf-8");
  const lines = content.split("\n").length;

  return {
    size: stat.size,
    lines,
    lastModified: stat.mtime,
  };
}
