/**
 * Tool Result Cache
 *
 * Caches idempotent tool execution results to reduce latency and costs.
 */

import type { MCPToolCall, MCPToolResult } from "../types";

export interface CacheEntry {
  result: MCPToolResult;
  timestamp: number;
}

export interface ToolResultCacheConfig {
  /** Time to live in milliseconds (default: 5 minutes) */
  ttlMs?: number;
  /** Maximum number of entries in the cache (default: 100) */
  maxSize?: number;
  /** Set of tool names that are safe to cache (idempotent) */
  cacheableTools?: Set<string>;
}

export class ToolResultCache {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly ttlMs: number;
  private readonly maxSize: number;
  private readonly cacheableTools: Set<string>;

  constructor(config: ToolResultCacheConfig = {}) {
    this.ttlMs = config.ttlMs ?? 5 * 60 * 1000;
    this.maxSize = config.maxSize ?? 100;
    this.cacheableTools =
      config.cacheableTools ??
      new Set([
        "readFile",
        "search",
        "list_dir",
        "view_file",
        "view_file_outline",
        "grep_search",
        "find_by_name",
      ]);
  }

  /**
   * Get a cached result if available and not expired.
   */
  get(call: MCPToolCall): MCPToolResult | undefined {
    if (!this.cacheableTools.has(call.name)) {
      return undefined;
    }

    const key = this.generateKey(call);
    const entry = this.cache.get(key);

    if (!entry) {
      return undefined;
    }

    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.result;
  }

  /**
   * Cache a tool result.
   */
  set(call: MCPToolCall, result: MCPToolResult): void {
    if (!this.cacheableTools.has(call.name) || !result.success) {
      return;
    }

    const key = this.generateKey(call);

    // Evict oldest entry if cache is full
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      result,
      timestamp: Date.now(),
    });
  }

  /**
   * Clear the cache.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Generate a unique key for a tool call.
   */
  private generateKey(call: MCPToolCall): string {
    const sortedArgs = this.sortObjectKeys(call.arguments);
    return `${call.name}:${JSON.stringify(sortedArgs)}`;
  }

  /**
   * Recursively sort object keys for stable stringification.
   */
  private sortObjectKeys(obj: unknown): unknown {
    if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
      return obj;
    }

    const keys = Object.keys(obj as Record<string, unknown>).sort();
    const sortedObj: Record<string, unknown> = {};

    for (const key of keys) {
      sortedObj[key] = this.sortObjectKeys((obj as Record<string, unknown>)[key]);
    }

    return sortedObj;
  }
}
