import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { DiffHunk } from "./types.js";

export interface NativeDiffBinding {
  diffLines(oldText: string, newText: string): DiffHunk[];
  diffUnified(oldText: string, newText: string, context: number): string;
  createTwoFilesPatch(
    oldFileName: string,
    newFileName: string,
    oldText: string,
    newText: string,
    oldHeader?: string,
    newHeader?: string,
    context?: number
  ): string;
  applyPatch(original: string, patch: string): string;
  reversePatch(patch: string): string;
}

const require = createRequire(import.meta.url);
let cachedModule: NativeDiffBinding | null | undefined;

function resolvePackageRoot(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(currentDir, "..");
}

function resolveNativeBindingPath(): string | null {
  const override = process.env.KU0_DIFF_RS_NATIVE_PATH?.trim();
  if (override) {
    const resolved = path.isAbsolute(override) ? override : path.resolve(process.cwd(), override);
    return existsSync(resolved) ? resolved : null;
  }

  const root = resolvePackageRoot();
  const candidates = [
    path.join(root, "dist", "diff_rs.node"),
    path.join(root, "dist", "index.node"),
    path.join(root, "diff_rs.node"),
    path.join(root, "index.node"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function isNativeDisabled(): boolean {
  const raw = process.env.KU0_DIFF_RS_DISABLE_NATIVE;
  if (!raw) {
    return false;
  }
  const normalized = raw.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

export function loadNativeBinding(): NativeDiffBinding | null {
  if (isNativeDisabled()) {
    return null;
  }

  if (cachedModule !== undefined) {
    return cachedModule;
  }

  const bindingPath = resolveNativeBindingPath();
  if (!bindingPath) {
    cachedModule = null;
    return null;
  }

  try {
    cachedModule = require(bindingPath) as NativeDiffBinding;
  } catch {
    cachedModule = null;
  }

  return cachedModule;
}
