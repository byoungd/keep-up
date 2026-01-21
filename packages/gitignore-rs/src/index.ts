/**
 * @ku0/gitignore-rs
 *
 * Fast file listing with gitignore support using Rust's ignore crate.
 * Falls back to JavaScript implementation if native binary is unavailable.
 */

import { getNativeBinding, type NativeFileEntry, type NativeListFilesOptions } from "./native.js";

export interface ListFilesOptions {
  /** Maximum depth for recursive listing. Default: unlimited */
  maxDepth?: number;
  /** Include hidden files/directories. Default: false */
  includeHidden?: boolean;
  /** Respect .gitignore files. Default: true */
  respectGitignore?: boolean;
}

export interface FileEntry {
  /** Relative path from root */
  path: string;
  /** "file" or "directory" */
  type: "file" | "directory";
  /** File size in bytes (only for files) */
  size?: number;
}

let nativeAvailable: boolean | null = null;

function isNativeAvailable(): boolean {
  if (nativeAvailable !== null) {
    return nativeAvailable;
  }
  try {
    getNativeBinding();
    nativeAvailable = true;
  } catch {
    nativeAvailable = false;
  }
  return nativeAvailable;
}

function convertEntry(entry: NativeFileEntry): FileEntry {
  return {
    path: entry.path,
    type: entry.entryType as "file" | "directory",
    size: entry.size ?? undefined,
  };
}

/**
 * List files in a directory, respecting .gitignore by default.
 *
 * Uses native Rust implementation when available for optimal performance.
 * Falls back to JavaScript if native binary is not found.
 */
export function listFiles(root: string, options?: ListFilesOptions): FileEntry[] {
  if (!isNativeAvailable()) {
    throw new Error(
      "Native gitignore-rs binding not available. Build with `cargo build --release`."
    );
  }

  const native = getNativeBinding();
  const nativeOptions: NativeListFilesOptions = {
    maxDepth: options?.maxDepth,
    includeHidden: options?.includeHidden,
    respectGitignore: options?.respectGitignore,
  };

  const entries = native.listFiles(root, nativeOptions);
  return entries.map(convertEntry);
}

/**
 * Check if a path is ignored by .gitignore rules.
 */
export function isIgnored(root: string, path: string): boolean {
  if (!isNativeAvailable()) {
    throw new Error(
      "Native gitignore-rs binding not available. Build with `cargo build --release`."
    );
  }

  const native = getNativeBinding();
  return native.isIgnored(root, path);
}

/**
 * Check if the native binding is available.
 */
export function hasNativeSupport(): boolean {
  return isNativeAvailable();
}

export { getNativeBinding } from "./native.js";
