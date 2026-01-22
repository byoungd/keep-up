import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { NativeBindingLoaderOptions, NativeBindingLoadResult } from "./types";

export function resolvePackageRoot(importMetaUrl: string, levelsUp = 1): string {
  let current = dirname(fileURLToPath(importMetaUrl));
  for (let i = 0; i < levelsUp; i++) {
    current = dirname(current);
  }
  return current;
}

export function buildNativeBindingCandidates(
  packageRoot: string,
  bindingNames: string[]
): string[] {
  const platformArch = `${process.platform}-${process.arch}`;
  const candidates: string[] = [];

  for (const name of bindingNames) {
    candidates.push(join(packageRoot, `${name}.${platformArch}.node`));
    candidates.push(join(packageRoot, `${name}.node`));
    candidates.push(join(packageRoot, "native", `${name}.${platformArch}.node`));
    candidates.push(join(packageRoot, "native", `${name}.node`));
    candidates.push(join(packageRoot, "native", "target", "release", `${name}.node`));
    candidates.push(join(packageRoot, "native", "target", "debug", `${name}.node`));
    candidates.push(join(packageRoot, "npm", platformArch, `${name}.${platformArch}.node`));
    candidates.push(join(packageRoot, "npm", platformArch, `${name}.node`));
    candidates.push(join(packageRoot, "dist", `${name}.${platformArch}.node`));
    candidates.push(join(packageRoot, "dist", `${name}.node`));
  }

  return candidates;
}

function validateExports<T extends Record<string, unknown>>(
  binding: T,
  requiredExports: Array<keyof T> | undefined
): string[] {
  if (!requiredExports || requiredExports.length === 0) {
    return [];
  }

  const missing: string[] = [];
  for (const key of requiredExports) {
    if (!(key in binding)) {
      missing.push(String(key));
    }
  }
  return missing;
}

export function loadNativeBinding<T extends Record<string, unknown>>(
  options: NativeBindingLoaderOptions<T>
): NativeBindingLoadResult<T> {
  const { packageRoot, bindingNames, envVar, requiredExports, logTag } = options;
  const require = createRequire(import.meta.url);
  const checkedPaths: string[] = [];

  const explicitPath = envVar ? process.env[envVar] : undefined;
  const candidates = explicitPath
    ? [explicitPath, ...buildNativeBindingCandidates(packageRoot, bindingNames)]
    : buildNativeBindingCandidates(packageRoot, bindingNames);

  let lastError: Error | null = null;

  for (const candidate of candidates) {
    checkedPaths.push(candidate);
    if (!existsSync(candidate)) {
      continue;
    }

    try {
      const binding = require(candidate) as T;
      const missing = validateExports(binding, requiredExports);
      if (missing.length > 0) {
        lastError = new Error(
          `${logTag ?? "Native binding"} missing exports: ${missing.join(", ")}`
        );
        continue;
      }

      return { binding, error: null, checkedPaths };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  if (!lastError) {
    lastError = new Error(
      `${logTag ?? "Native binding"} not found. Checked ${checkedPaths.length} paths.`
    );
  }

  return { binding: null, error: lastError, checkedPaths };
}

export type { NativeBindingLoaderOptions, NativeBindingLoadResult } from "./types";
