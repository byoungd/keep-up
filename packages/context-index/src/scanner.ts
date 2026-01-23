import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { hasNativeSupport, listFiles as listFilesWithGitignoreNative } from "@ku0/gitignore-rs";

export interface ScanOptions {
  includeExtensions: string[];
  excludeDirs: string[];
  maxFileBytes: number;
  respectGitignore: boolean;
}

export async function scanProjectFiles(rootPath: string, options: ScanOptions): Promise<string[]> {
  const normalizedExcludes = new Set(options.excludeDirs);

  if (options.respectGitignore && hasNativeSupport()) {
    try {
      const entries = listFilesWithGitignoreNative(rootPath, {
        includeHidden: false,
        respectGitignore: true,
      });
      const files = await filterNativeEntries(rootPath, entries, options, normalizedExcludes);
      return files.sort();
    } catch {
      // Fall back to JS traversal if native binding fails.
    }
  }

  const files: string[] = [];
  await walkDir(rootPath, rootPath, files, options, normalizedExcludes);

  return files.sort();
}

async function walkDir(
  rootPath: string,
  currentPath: string,
  files: string[],
  options: ScanOptions,
  excludeDirs: Set<string>
): Promise<void> {
  const entries = await readdir(currentPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(currentPath, entry.name);

    if (entry.isDirectory()) {
      if (excludeDirs.has(entry.name)) {
        continue;
      }
      await walkDir(rootPath, fullPath, files, options, excludeDirs);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const ext = extractExtension(entry.name);
    if (!options.includeExtensions.includes(ext)) {
      continue;
    }

    const stats = await stat(fullPath);
    if (stats.size > options.maxFileBytes) {
      continue;
    }

    const relativePath = fullPath.slice(rootPath.length + 1);
    files.push(relativePath.replace(/\\/g, "/"));
  }
}

function extractExtension(filename: string): string {
  const index = filename.lastIndexOf(".");
  if (index <= 0 || index === filename.length - 1) {
    return "";
  }
  return filename.slice(index).toLowerCase();
}

function isExcluded(relativePath: string, excludeDirs: Set<string>): boolean {
  const normalized = relativePath.replace(/\\/g, "/");
  for (const segment of normalized.split("/")) {
    if (excludeDirs.has(segment)) {
      return true;
    }
  }
  return false;
}

async function filterNativeEntries(
  rootPath: string,
  entries: { path: string; type: "file" | "directory"; size?: number }[],
  options: ScanOptions,
  excludeDirs: Set<string>
): Promise<string[]> {
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.type !== "file") {
      continue;
    }

    const normalizedPath = entry.path.replace(/\\/g, "/");
    if (isExcluded(normalizedPath, excludeDirs)) {
      continue;
    }

    const ext = extractExtension(normalizedPath);
    if (!options.includeExtensions.includes(ext)) {
      continue;
    }

    try {
      const size = entry.size ?? (await stat(join(rootPath, normalizedPath))).size;
      if (size > options.maxFileBytes) {
        continue;
      }
      files.push(normalizedPath);
    } catch {
      // Skip files that disappear or fail to stat.
    }
  }

  return files;
}
