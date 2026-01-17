import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

export interface ScanOptions {
  includeExtensions: string[];
  excludeDirs: string[];
  maxFileBytes: number;
}

export async function scanProjectFiles(rootPath: string, options: ScanOptions): Promise<string[]> {
  const files: string[] = [];
  const normalizedExcludes = new Set(options.excludeDirs);

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
