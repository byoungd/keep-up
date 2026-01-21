import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const currentDir = dirname(fileURLToPath(import.meta.url));

export interface NativeListFilesOptions {
  maxDepth?: number;
  includeHidden?: boolean;
  respectGitignore?: boolean;
}

export interface NativeFileEntry {
  path: string;
  entryType: string;
  size?: number;
}

export interface NativeGitignoreBinding {
  listFiles(root: string, options?: NativeListFilesOptions): NativeFileEntry[];
  isIgnored(root: string, path: string): boolean;
}

let cached: NativeGitignoreBinding | null = null;

export function getNativeBinding(): NativeGitignoreBinding {
  if (cached) {
    return cached;
  }

  const explicit = process.env.GITIGNORE_RS_BINDING_PATH;
  if (explicit) {
    cached = require(explicit) as NativeGitignoreBinding;
    return cached;
  }

  const candidates = [
    join(currentDir, "gitignore-rs.node"),
    join(currentDir, "gitignore_rs.node"),
    join(currentDir, "..", "gitignore-rs.node"),
    join(currentDir, "..", "gitignore_rs.node"),
    join(currentDir, "..", "index.node"),
    join(currentDir, "..", "index.darwin-x64.node"),
    join(currentDir, "..", "index.darwin-arm64.node"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      cached = require(candidate) as NativeGitignoreBinding;
      return cached;
    }
  }

  throw new Error(
    "Gitignore native binding not found. Build with `cargo build` or set GITIGNORE_RS_BINDING_PATH."
  );
}
