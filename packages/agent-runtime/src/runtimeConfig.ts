/**
 * Runtime configuration helpers.
 */

import type { ExecutionConfig, RuntimeCacheConfig, RuntimeConfig } from "./types";
import { DEFAULT_EXECUTION_CONFIG } from "./types";

export function resolveRuntimeCacheConfig(config?: RuntimeConfig): RuntimeCacheConfig {
  const cache = config?.cache;
  const envTtlMs = readEnvNumber(["RUNTIME_CACHE_TTL", "RUNTIME_CACHE_TTL_MS"]);
  const envMaxEntries = readEnvNumber(["RUNTIME_CACHE_MAX_SIZE", "RUNTIME_CACHE_MAX_ENTRIES"]);

  const baseTtlMs = envTtlMs ?? cache?.ttlMs;
  const baseMaxEntries = envMaxEntries ?? cache?.maxEntries;

  const request = cache?.request;
  const toolResult = cache?.toolResult;

  return {
    ttlMs: baseTtlMs,
    maxEntries: baseMaxEntries,
    request: {
      enabled: request?.enabled,
      ttlMs: request?.ttlMs ?? baseTtlMs,
      maxEntries: request?.maxEntries ?? baseMaxEntries,
    },
    toolResult: {
      ttlMs: toolResult?.ttlMs ?? baseTtlMs,
      maxEntries: toolResult?.maxEntries ?? baseMaxEntries,
      maxSizeBytes: toolResult?.maxSizeBytes,
    },
  };
}

export function resolveExecutionConfig(
  config?: RuntimeConfig | { execution?: Partial<ExecutionConfig> }
): ExecutionConfig {
  const execution = config?.execution;
  return {
    ...DEFAULT_EXECUTION_CONFIG,
    ...execution,
    quotaConfig: execution?.quotaConfig,
  };
}

function readEnvNumber(keys: string[]): number | undefined {
  if (typeof process === "undefined" || !process.env) {
    return undefined;
  }

  for (const key of keys) {
    const raw = process.env[key];
    if (!raw) {
      continue;
    }
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}
