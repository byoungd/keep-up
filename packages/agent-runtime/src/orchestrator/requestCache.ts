/**
 * Request Cache and Deduplication
 *
 * Prevents duplicate LLM requests and caches results for performance.
 * Implements content-based hashing and TTL-based expiration.
 *
 * Features:
 * - Content-based request deduplication
 * - Result caching with TTL
 * - Cache invalidation strategies
 * - Memory-efficient storage
 */

import type { AgentMessage } from "../types";
import type { AgentLLMRequest, AgentLLMResponse } from "./orchestrator";

// ============================================================================
// Types
// ============================================================================

/** Cache configuration */
export interface CacheConfig {
  /** Enable caching (default: true) */
  enabled: boolean;
  /** Cache TTL in ms (default: 300000 = 5 minutes) */
  ttlMs: number;
  /** Maximum cache size (default: 1000) */
  maxSize: number;
  /** Cache key generator */
  keyGenerator?: (request: AgentLLMRequest) => string;
}

/** Cache entry */
interface CacheEntry {
  /** Cached response */
  response: AgentLLMResponse;
  /** Cached timestamp */
  timestamp: number;
  /** Hit count */
  hitCount: number;
  /** Last accessed timestamp */
  lastAccessed: number;
}

/** Cache statistics */
export interface RequestCacheStats {
  /** Total requests */
  totalRequests: number;
  /** Cache hits */
  hits: number;
  /** Cache misses */
  misses: number;
  /** Hit rate (0-1) */
  hitRate: number;
  /** Current cache size */
  size: number;
  /** Evicted entries */
  evictions: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: CacheConfig = {
  enabled: true,
  ttlMs: 300000, // 5 minutes
  maxSize: 1000,
};

// ============================================================================
// Request Cache Implementation
// ============================================================================

/**
 * Request Cache
 *
 * Caches LLM requests and responses for deduplication and performance.
 */
export class RequestCache {
  private readonly config: CacheConfig;
  private readonly cache = new Map<string, CacheEntry>();
  private stats: RequestCacheStats = {
    totalRequests: 0,
    hits: 0,
    misses: 0,
    hitRate: 0,
    size: 0,
    evictions: 0,
  };

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get cached response or null if not found/expired.
   */
  get(request: AgentLLMRequest): AgentLLMResponse | null {
    if (!this.config.enabled) {
      return null;
    }

    this.stats.totalRequests++;

    const key = this.generateKey(request);
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      this.updateHitRate();
      return null;
    }

    // Check expiration
    const age = Date.now() - entry.timestamp;
    if (age > this.config.ttlMs) {
      this.cache.delete(key);
      this.stats.misses++;
      this.stats.evictions++;
      this.updateHitRate();
      return null;
    }

    // Cache hit - promote to end of Map for O(1) LRU
    entry.hitCount++;
    entry.lastAccessed = Date.now();
    this.promoteEntry(key, entry);
    this.stats.hits++;
    this.updateHitRate();

    return entry.response;
  }

  /**
   * Store response in cache.
   */
  set(request: AgentLLMRequest, response: AgentLLMResponse): void {
    if (!this.config.enabled) {
      return;
    }

    const key = this.generateKey(request);
    const now = Date.now();

    // Evict if at capacity
    if (this.cache.size >= this.config.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    this.cache.set(key, {
      response,
      timestamp: now,
      hitCount: 0,
      lastAccessed: now,
    });

    this.stats.size = this.cache.size;
  }

  /**
   * Check if request is cached (without accessing).
   */
  has(request: AgentLLMRequest): boolean {
    if (!this.config.enabled) {
      return false;
    }

    const key = this.generateKey(request);
    const entry = this.cache.get(key);

    if (!entry) {
      return false;
    }

    // Check expiration
    const age = Date.now() - entry.timestamp;
    return age <= this.config.ttlMs;
  }

  /**
   * Invalidate cache entry.
   */
  invalidate(request: AgentLLMRequest): boolean {
    const key = this.generateKey(request);
    return this.cache.delete(key);
  }

  /**
   * Clear all cache entries.
   */
  clear(): void {
    this.cache.clear();
    this.stats.size = 0;
  }

  /**
   * Get cache statistics.
   */
  getStats(): RequestCacheStats {
    return { ...this.stats };
  }

  /**
   * Clean expired entries.
   */
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache) {
      const age = now - entry.timestamp;
      if (age > this.config.ttlMs) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    this.stats.evictions += cleaned;
    this.stats.size = this.cache.size;

    return cleaned;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private generateKey(request: AgentLLMRequest): string {
    if (this.config.keyGenerator) {
      return this.config.keyGenerator(request);
    }

    // Default: hash messages and tools
    const messagesKey = this.hashMessages(request.messages);
    const toolsKey = this.hashTools(request.tools);
    const systemKey = request.systemPrompt ? this.hashString(request.systemPrompt) : "";
    const tempKey = request.temperature?.toString() ?? "";

    return `${messagesKey}:${toolsKey}:${systemKey}:${tempKey}`;
  }

  private hashMessages(messages: AgentMessage[]): string {
    // Create a stable hash from message content
    const parts: string[] = [];

    for (const msg of messages) {
      parts.push(msg.role);
      if (msg.role === "user" || msg.role === "assistant" || msg.role === "system") {
        parts.push(msg.content); // Full content for accurate dedup
      }
      if (msg.role === "tool") {
        parts.push(msg.toolName);
        parts.push(this.serializeToolResult(msg.result));
      }
      // Only assistant has toolCalls
      if (msg.role === "assistant" && msg.toolCalls) {
        parts.push(`tools:${msg.toolCalls.length}`);
      }
    }

    return this.hashString(parts.join("|"));
  }

  private hashTools(
    tools: Array<{ name: string; description?: string; inputSchema?: unknown }>
  ): string {
    if (!tools || tools.length === 0) {
      return "no-tools";
    }

    // Include tool input schemas for stronger dedup
    const toolSpecs = tools
      .map((t) => `${t.name}:${JSON.stringify(t.inputSchema ?? {})}`)
      .sort()
      .join(",");
    return this.hashString(toolSpecs);
  }

  private hashString(str: string): string {
    // Simple hash function (FNV-1a)
    let hash = 2166136261;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = (hash * 16777619) >>> 0;
    }
    return hash.toString(36);
  }

  private serializeToolResult(result: unknown): string {
    try {
      return JSON.stringify(result);
    } catch {
      return "[unserializable]";
    }
  }

  /**
   * Promote entry to end of Map (for LRU ordering).
   * O(1) operation using Map's insertion-order iteration.
   */
  private promoteEntry(key: string, entry: CacheEntry): void {
    this.cache.delete(key);
    this.cache.set(key, entry);
  }

  /**
   * Evict the least recently used entry.
   * O(1) because Map iterates in insertion order, and we promote on access.
   */
  private evictLRU(): void {
    if (this.cache.size === 0) {
      return;
    }

    // Map.keys().next() returns the oldest (least recently used) key
    const lruKey = this.cache.keys().next().value;
    if (lruKey !== undefined) {
      this.cache.delete(lruKey);
      this.stats.evictions++;
    }
  }

  private updateHitRate(): void {
    if (this.stats.totalRequests > 0) {
      this.stats.hitRate = this.stats.hits / this.stats.totalRequests;
    }
  }
}

/**
 * Create a request cache.
 */
export function createRequestCache(config?: Partial<CacheConfig>): RequestCache {
  return new RequestCache(config);
}
