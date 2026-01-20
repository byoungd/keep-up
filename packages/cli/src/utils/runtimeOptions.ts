import type { OutputFormat } from "./output";

export function resolveOutput(value: string): OutputFormat {
  return value === "json" ? "json" : "text";
}

export function resolveRuntimeConfigString(
  primary: string | undefined,
  fallback: unknown
): string | undefined {
  if (primary) {
    return primary;
  }
  return typeof fallback === "string" ? fallback : undefined;
}
