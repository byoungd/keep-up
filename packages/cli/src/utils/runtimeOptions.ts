import type { OutputFormat } from "./output";

const AUTO_VALUES = new Set(["auto", "default"]);
const SANDBOX_VALUES = new Set(["auto", "docker", "none"]);

export function resolveOutput(value: string): OutputFormat {
  if (value === "json") {
    return "json";
  }
  if (value === "markdown" || value === "md") {
    return "markdown";
  }
  return "text";
}

export type SandboxMode = "auto" | "docker" | "none";

export function resolveSandboxMode(
  primary: string | undefined,
  fallback: unknown,
  envVar?: string
): SandboxMode {
  const resolved = resolveRuntimeConfigString(primary, fallback, envVar);
  if (!resolved) {
    return "auto";
  }
  const normalized = resolved.trim().toLowerCase();
  if (SANDBOX_VALUES.has(normalized)) {
    return normalized as SandboxMode;
  }
  return "auto";
}

export function resolveRuntimeConfigString(
  primary: string | undefined,
  fallback: unknown,
  envVar?: string
): string | undefined {
  const normalizedPrimary = normalizeValue(primary);
  if (normalizedPrimary) {
    return normalizedPrimary;
  }
  const envValue = envVar ? normalizeValue(process.env[envVar]) : undefined;
  if (envValue) {
    return envValue;
  }
  if (typeof fallback === "string") {
    return normalizeValue(fallback);
  }
  return undefined;
}

function normalizeValue(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  if (AUTO_VALUES.has(trimmed)) {
    return undefined;
  }
  return trimmed;
}
