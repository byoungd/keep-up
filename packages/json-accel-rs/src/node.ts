import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { jsonParse, jsonStringify, stableStringify as stableStringifyFallback } from "./shared";
import type { NativeJsonAccel } from "./types";

interface NativeBinding {
  stringify?: (value: unknown) => string;
  parse?: (text: string) => unknown;
  stableStringify?: (value: unknown) => string;
  stable_stringify?: (value: unknown) => string;
}

let cachedAccel: NativeJsonAccel | null | undefined;
let cachedBindingError: Error | null = null;

function loadNativeBinding(): NativeBinding | null {
  const require = createRequire(import.meta.url);
  const baseDir = dirname(fileURLToPath(import.meta.url));
  const packageRoot = join(baseDir, "..");

  const candidates = buildCandidatePaths(packageRoot);
  const envPath = process.env.JSON_ACCEL_RS_NATIVE_PATH;
  if (envPath) {
    candidates.unshift(envPath);
  }

  for (const candidate of candidates) {
    if (!existsSync(candidate)) {
      continue;
    }
    try {
      return require(candidate) as NativeBinding;
    } catch (error) {
      if (error instanceof Error) {
        cachedBindingError = error;
      }
    }
  }

  return null;
}

function buildCandidatePaths(packageRoot: string): string[] {
  const platformArch = `${process.platform}-${process.arch}`;
  return [
    join(packageRoot, `json_accel_rs.${platformArch}.node`),
    join(packageRoot, `index.${platformArch}.node`),
    join(packageRoot, "json_accel_rs.node"),
    join(packageRoot, "index.node"),
    join(packageRoot, "native", `json_accel_rs.${platformArch}.node`),
    join(packageRoot, "native", `index.${platformArch}.node`),
    join(packageRoot, "native", "json_accel_rs.node"),
    join(packageRoot, "native", "index.node"),
    join(packageRoot, "native", "target", "release", "json_accel_rs.node"),
    join(packageRoot, "native", "target", "debug", "json_accel_rs.node"),
    join(packageRoot, "npm", platformArch, `json_accel_rs.${platformArch}.node`),
    join(packageRoot, "npm", platformArch, `index.${platformArch}.node`),
    join(packageRoot, "npm", platformArch, "json_accel_rs.node"),
    join(packageRoot, "npm", platformArch, "index.node"),
  ];
}

export function getNativeJsonAccel(): NativeJsonAccel | null {
  if (cachedAccel !== undefined) {
    return cachedAccel;
  }

  const binding = loadNativeBinding();
  if (!binding) {
    cachedAccel = null;
    return cachedAccel;
  }

  const stringify = binding.stringify;
  const parse = binding.parse;
  const stableStringify = binding.stableStringify ?? binding.stable_stringify;

  if (!stringify || !parse || !stableStringify) {
    cachedBindingError = new Error("JSON accel native binding missing required exports.");
    cachedAccel = null;
    return cachedAccel;
  }

  cachedAccel = {
    stringify: (value) => stringify(value),
    parse: (text) => parse(text),
    stableStringify: (value) => stableStringify(value),
  };

  return cachedAccel;
}

export function getNativeJsonAccelError(): Error | null {
  return cachedBindingError;
}

export function stringify(value: unknown): string {
  const native = getNativeJsonAccel();
  if (native) {
    try {
      return native.stringify(value);
    } catch {
      // Fall back to JS stringify if the native binding fails.
    }
  }
  return jsonStringify(value);
}

export function parse(text: string): unknown {
  const native = getNativeJsonAccel();
  if (native) {
    try {
      return native.parse(text);
    } catch {
      // Fall back to JSON.parse if the native binding fails.
    }
  }
  return jsonParse(text);
}

export function stableStringify(value: unknown): string {
  const native = getNativeJsonAccel();
  if (native) {
    try {
      return native.stableStringify(value);
    } catch {
      // Fall back to JS stable stringify if the native binding fails.
    }
  }
  return stableStringifyFallback(value);
}
