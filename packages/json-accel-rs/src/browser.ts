import { jsonParse, jsonStringify, stableStringify as stableStringifyFallback } from "./shared";
import type { NativeJsonAccel } from "./types";

export type { NativeJsonAccel };

export function getNativeJsonAccel(): NativeJsonAccel | null {
  return null;
}

export function getNativeJsonAccelError(): Error | null {
  return null;
}

export function stringify(value: unknown): string {
  return jsonStringify(value);
}

export function parse(text: string): unknown {
  return jsonParse(text);
}

export function stableStringify(value: unknown): string {
  return stableStringifyFallback(value);
}
