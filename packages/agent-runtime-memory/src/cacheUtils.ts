/**
 * Shared cache key helpers for memory caching.
 */

import type { MemoryType } from "./types";
import { hashStableValue } from "./utils/cache";

export function normalizeCacheText(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

export function normalizeStringList(values?: string[]): string[] | undefined {
  if (!values || values.length === 0) {
    return undefined;
  }
  return Array.from(new Set(values)).sort();
}

export function normalizeTypeList(values?: MemoryType[]): MemoryType[] | undefined {
  if (!values || values.length === 0) {
    return undefined;
  }
  return Array.from(new Set(values)).sort();
}

export function buildCacheKey(prefix: string, value: unknown): string {
  return `${prefix}:${hashStableValue(value)}`;
}
