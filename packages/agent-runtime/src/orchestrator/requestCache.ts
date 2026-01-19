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
import {
  type CacheAdaptiveOptions,
  type CacheEntry,
  createCacheKeyHasher,
  hashStableValue,
  hashString,
  type ICacheStrategy,
  LRUCache,
} from "../utils/cache";
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
  /** Maximum cache size in bytes (default: unlimited) */
  maxSizeBytes?: number;
  /** Adaptive sizing configuration */
  adaptive?: CacheAdaptiveOptions;
  /** Cache key generator */
  keyGenerator?: (request: AgentLLMRequest) => string;
  /** Custom cache strategy override */
  strategy?: ICacheStrategy<string, AgentLLMResponse>;
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
  maxSizeBytes: Number.POSITIVE_INFINITY,
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
  private readonly cache: ICacheStrategy<string, AgentLLMResponse>;
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
    this.cache =
      this.config.strategy ??
      new LRUCache<AgentLLMResponse>({
        maxEntries: this.config.maxSize,
        defaultTtlMs: this.config.ttlMs,
        maxSizeBytes: this.config.maxSizeBytes ?? Number.POSITIVE_INFINITY,
        adaptive: this.config.adaptive,
      });
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
    const entry = this.peekEntry(key);

    if (entry && this.isExpired(entry)) {
      this.cache.delete(key);
      this.stats.misses++;
      this.stats.evictions++;
      this.stats.size = this.cache.getStats().entries;
      this.updateHitRate();
      return null;
    }

    const cached = this.cache.get(key);
    if (cached === undefined) {
      this.stats.misses++;
      this.updateHitRate();
      return null;
    }

    this.stats.hits++;
    this.updateHitRate();
    return cached;
  }

  /**
   * Store response in cache.
   */
  set(request: AgentLLMRequest, response: AgentLLMResponse): void {
    if (!this.config.enabled) {
      return;
    }

    const key = this.generateKey(request);
    const hadKey = this.cache.has(key);
    const sizeBefore = this.cache.getStats().entries;

    this.cache.set(key, response, this.config.ttlMs);

    const sizeAfter = this.cache.getStats().entries;
    if (!hadKey && sizeBefore >= this.config.maxSize && sizeAfter <= sizeBefore) {
      this.stats.evictions++;
    }
    this.stats.size = sizeAfter;
  }

  /**
   * Check if request is cached (without accessing).
   */
  has(request: AgentLLMRequest): boolean {
    if (!this.config.enabled) {
      return false;
    }

    const key = this.generateKey(request);
    return this.cache.has(key);
  }

  /**
   * Invalidate cache entry.
   */
  invalidate(request: AgentLLMRequest): boolean {
    const key = this.generateKey(request);
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.stats.size = this.cache.getStats().entries;
    }
    return deleted;
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
    if (!(this.cache instanceof LRUCache)) {
      return 0;
    }

    const cleaned = this.cache.prune();
    if (cleaned > 0) {
      this.stats.evictions += cleaned;
      this.stats.size = this.cache.getStats().entries;
    }

    return cleaned;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private peekEntry(key: string): CacheEntry<AgentLLMResponse> | undefined {
    if (this.cache instanceof LRUCache) {
      return this.cache.peekEntry(key);
    }
    return undefined;
  }

  private isExpired(entry: CacheEntry<AgentLLMResponse>): boolean {
    return entry.expiresAt > 0 && Date.now() > entry.expiresAt;
  }

  private generateKey(request: AgentLLMRequest): string {
    if (this.config.keyGenerator) {
      return this.config.keyGenerator(request);
    }

    // Default: hash messages and tools
    const messagesKey = this.hashMessages(request.messages);
    const toolsKey = this.hashTools(request.tools);
    const systemKey = request.systemPrompt ? hashString(request.systemPrompt) : "";
    const tempKey = request.temperature?.toString() ?? "";

    return hashString(`${messagesKey}:${toolsKey}:${systemKey}:${tempKey}`);
  }

  private hashMessages(messages: AgentMessage[]): string {
    const hasher = createCacheKeyHasher();
    for (const msg of messages) {
      hasher.update("role:");
      hasher.update(msg.role);
      hasher.update("|");
      if (msg.role === "user" || msg.role === "assistant" || msg.role === "system") {
        hasher.update("content:");
        hasher.update(msg.content);
        hasher.update("|");
      }
      if (msg.role === "tool") {
        hasher.update("tool:");
        hasher.update(msg.toolName);
        hasher.update("|result:");
        hasher.update(hashStableValue(msg.result));
        hasher.update("|");
      }
      // Only assistant has toolCalls
      if (msg.role === "assistant" && msg.toolCalls) {
        hasher.update("toolCalls:");
        hasher.update(msg.toolCalls.length.toString());
        hasher.update("|");
      }
    }

    return hasher.digest();
  }

  private hashTools(
    tools: Array<{ name: string; description?: string; inputSchema?: unknown }>
  ): string {
    if (!tools || tools.length === 0) {
      return "no-tools";
    }

    const toolHashes = tools
      .map((tool) => {
        const toolHasher = createCacheKeyHasher();
        toolHasher.update(tool.name);
        toolHasher.update("|");
        toolHasher.update(hashStableValue(tool.inputSchema ?? {}));
        return toolHasher.digest();
      })
      .sort();

    const hasher = createCacheKeyHasher();
    for (const toolHash of toolHashes) {
      hasher.update(toolHash);
      hasher.update("|");
    }
    return hasher.digest();
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
