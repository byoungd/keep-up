/**
 * Code Search Utilities
 *
 * Uses ripgrep when available for fast searching, with a Node.js fallback.
 */

import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { promisify } from "node:util";

import { listFiles } from "./fileSystem";

const execFileAsync = promisify(execFile);

// ============================================================================
// Types
// ============================================================================

export interface SearchOptions {
  /** Search in a specific file or directory. If omitted, search from cwd. */
  path?: string;
  /** Case-sensitive search. Default: false (smart case) */
  caseSensitive?: boolean;
  /** Treat query as regex. Default: false (literal) */
  isRegex?: boolean;
  /** Max results to return. Default: 50 */
  maxResults?: number;
  /** File extensions to include (e.g., [".ts", ".tsx"]) */
  includeExtensions?: string[];
  /** Glob patterns to exclude, e.g. `["**\/node_modules\/**"]` */
  excludePatterns?: string[];
}

export interface SearchMatch {
  path: string;
  lineNumber: number;
  content: string;
}

export interface SearchResult {
  query: string;
  matchCount: number;
  matches: SearchMatch[];
  truncated: boolean;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Search for text in files using ripgrep (rg).
 * Falls back to native Node.js search if rg is not available.
 */
export async function searchCode(
  query: string,
  options: SearchOptions = {}
): Promise<SearchResult> {
  const maxResults = Math.max(1, options.maxResults ?? 50);
  const rootPath = options.path ? path.resolve(options.path) : process.cwd();

  const stat = await fs.stat(rootPath);
  const rootDir = stat.isFile() ? path.dirname(rootPath) : rootPath;

  if (await isRipgrepAvailable()) {
    return searchWithRipgrep(query, rootPath, rootDir, {
      ...options,
      maxResults,
    });
  }

  return searchWithNode(query, rootPath, rootDir, {
    ...options,
    maxResults,
  });
}

// ============================================================================
// Ripgrep Search
// ============================================================================

let rgAvailable: boolean | null = null;

async function isRipgrepAvailable(): Promise<boolean> {
  if (rgAvailable !== null) {
    return rgAvailable;
  }
  const command = process.platform === "win32" ? "where" : "which";
  try {
    await execFileAsync(command, ["rg"], { timeout: 2000 });
    rgAvailable = true;
  } catch {
    rgAvailable = false;
  }
  return rgAvailable;
}

async function searchWithRipgrep(
  query: string,
  rootPath: string,
  rootDir: string,
  options: SearchOptions & { maxResults: number }
): Promise<SearchResult> {
  const args = buildRipgrepArgs(query, rootPath, options);
  const stdout = await runRipgrep(args, process.cwd());
  const parsed = parseRipgrepOutput(stdout, rootDir, options.maxResults);

  return {
    query,
    matchCount: Math.min(parsed.totalMatches, options.maxResults),
    matches: parsed.matches,
    truncated: parsed.totalMatches > options.maxResults,
  };
}

function buildRipgrepArgs(
  query: string,
  rootPath: string,
  options: SearchOptions & { maxResults: number }
): string[] {
  const args = ["--json"];
  if (!options.isRegex) {
    args.push("-F");
  }
  if (shouldIgnoreCase(query, options.caseSensitive)) {
    args.push("-i");
  }

  appendIncludeExtensions(args, options.includeExtensions);
  appendExcludePatterns(args, options.excludePatterns);
  args.push(query);
  args.push(rootPath);
  return args;
}

function appendIncludeExtensions(args: string[], includeExtensions?: string[]): void {
  for (const ext of includeExtensions ?? []) {
    const normalized = ext.startsWith(".") ? ext : `.${ext}`;
    args.push("-g", `*${normalized}`);
  }
}

function appendExcludePatterns(args: string[], excludePatterns?: string[]): void {
  for (const pattern of excludePatterns ?? []) {
    args.push("-g", `!${pattern}`);
  }
}

async function runRipgrep(args: string[], cwd: string): Promise<string> {
  try {
    const result = await execFileAsync("rg", args, {
      cwd,
      maxBuffer: 20 * 1024 * 1024,
    });
    return result.stdout ?? "";
  } catch (err) {
    const error = err as { code?: number; stdout?: string };
    if (error.code !== 1) {
      throw err;
    }
    return error.stdout ?? "";
  }
}

function parseRipgrepOutput(
  stdout: string,
  rootDir: string,
  maxResults: number
): { matches: SearchMatch[]; totalMatches: number } {
  const matches: SearchMatch[] = [];
  let totalMatches = 0;

  const lines = stdout.split("\n");
  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }
    const record = parseRipgrepLine(line);
    if (!record) {
      continue;
    }

    if (matches.length < maxResults) {
      matches.push({
        path: path.isAbsolute(record.path) ? record.path : path.resolve(rootDir, record.path),
        lineNumber: record.lineNumber,
        content: record.content,
      });
    }
    totalMatches += 1;
  }

  return { matches, totalMatches };
}

function parseRipgrepLine(
  line: string
): { path: string; lineNumber: number; content: string } | null {
  try {
    const record = JSON.parse(line) as {
      type?: string;
      data?: {
        path?: { text?: string } | string;
        line_number?: number;
        lines?: { text?: string };
      };
    };

    if (record.type !== "match" || !record.data) {
      return null;
    }

    const rawPath =
      typeof record.data.path === "string" ? record.data.path : record.data.path?.text;
    if (!rawPath || record.data.line_number === undefined) {
      return null;
    }

    return {
      path: rawPath,
      lineNumber: record.data.line_number,
      content: (record.data.lines?.text ?? "").replace(/\n$/, ""),
    };
  } catch {
    return null;
  }
}

// ============================================================================
// Node Fallback Search
// ============================================================================

type LineMatcher = (line: string) => boolean;

async function searchWithNode(
  query: string,
  rootPath: string,
  rootDir: string,
  options: SearchOptions & { maxResults: number }
): Promise<SearchResult> {
  const matches: SearchMatch[] = [];
  let truncated = false;

  const matcher = createLineMatcher(query, options);
  const files = await resolveSearchFiles(rootPath, options);

  for (const filePath of files) {
    const remaining = options.maxResults - matches.length;
    if (remaining <= 0) {
      truncated = true;
      break;
    }

    const result = await scanFileForMatches(filePath, matcher, remaining, rootDir);
    matches.push(...result.matches);
    if (result.truncated) {
      truncated = true;
      break;
    }
  }

  return {
    query,
    matchCount: matches.length,
    matches,
    truncated,
  };
}

function createLineMatcher(query: string, options: SearchOptions): LineMatcher {
  const ignoreCase = shouldIgnoreCase(query, options.caseSensitive);
  if (options.isRegex) {
    return createRegexMatcher(query, ignoreCase);
  }

  const normalizedQuery = ignoreCase ? query.toLowerCase() : query;
  return (line: string) => {
    const haystack = ignoreCase ? line.toLowerCase() : line;
    return haystack.includes(normalizedQuery);
  };
}

async function scanFileForMatches(
  filePath: string,
  matcher: LineMatcher,
  maxResults: number,
  rootDir: string
): Promise<{ matches: SearchMatch[]; truncated: boolean }> {
  const content = await fs.readFile(filePath, "utf-8");
  const lines = content.split("\n");
  const matches: SearchMatch[] = [];
  const normalizedPath = path.isAbsolute(filePath) ? filePath : path.resolve(rootDir, filePath);

  for (let i = 0; i < lines.length; i += 1) {
    if (!matcher(lines[i])) {
      continue;
    }

    matches.push({
      path: normalizedPath,
      lineNumber: i + 1,
      content: lines[i],
    });

    if (matches.length >= maxResults) {
      return { matches, truncated: true };
    }
  }

  return { matches, truncated: false };
}

function createRegexMatcher(pattern: string, ignoreCase: boolean): (line: string) => boolean {
  const flags = ignoreCase ? "i" : undefined;
  let regex: RegExp;
  try {
    regex = new RegExp(pattern, flags);
  } catch (error) {
    throw new Error(
      `Invalid regex pattern: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  return (line: string) => regex.test(line);
}

function shouldIgnoreCase(query: string, caseSensitive?: boolean): boolean {
  if (caseSensitive === false) {
    return true;
  }
  if (caseSensitive === true) {
    return false;
  }
  // Smart case: ignore case if query is all lowercase
  return !/[A-Z]/.test(query);
}

async function resolveSearchFiles(rootPath: string, options: SearchOptions): Promise<string[]> {
  const stat = await fs.stat(rootPath);
  if (stat.isFile()) {
    return [rootPath];
  }

  const entries = await listFiles(rootPath, { includeHidden: false, respectGitignore: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.type !== "file") {
      continue;
    }

    const resolved = path.resolve(rootPath, entry.path);
    const relativePath = path.relative(rootPath, resolved).replace(/\\/g, "/");

    if (options.includeExtensions && options.includeExtensions.length > 0) {
      const extension = path.extname(resolved).toLowerCase();
      const allowed = options.includeExtensions.some((ext) => {
        const normalized = ext.startsWith(".") ? ext : `.${ext}`;
        return normalized.toLowerCase() === extension;
      });
      if (!allowed) {
        continue;
      }
    }

    if (isExcluded(relativePath, options.excludePatterns ?? [])) {
      continue;
    }

    files.push(resolved);
  }

  return files;
}

function isExcluded(relativePath: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    if (matchesPattern(relativePath, pattern)) {
      return true;
    }
  }
  return false;
}

function matchesPattern(target: string, pattern: string): boolean {
  const normalizedTarget = target.replace(/\\/g, "/");
  if (!pattern.includes("*") && !pattern.includes("?")) {
    return normalizedTarget.includes(pattern);
  }
  const regex = globToRegExp(pattern);
  return regex.test(normalizedTarget);
}

function globToRegExp(pattern: string): RegExp {
  let regex = "^";
  let i = 0;

  while (i < pattern.length) {
    const char = pattern[i];
    if (char === "*") {
      if (pattern[i + 1] === "*") {
        regex += ".*";
        i += 2;
      } else {
        regex += "[^/]*";
        i += 1;
      }
      continue;
    }
    if (char === "?") {
      regex += ".";
      i += 1;
      continue;
    }
    regex += escapeRegex(char);
    i += 1;
  }

  regex += "$";
  return new RegExp(regex);
}

function escapeRegex(char: string): string {
  return char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
