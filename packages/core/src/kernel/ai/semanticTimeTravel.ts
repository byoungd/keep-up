/**
 * LFCC v0.9 RC - Semantic Time Travel Module
 * @see docs/product/reports/strategy/LFCC_AI_Killer_Features_Analysis.md
 *
 * Killer Feature #3: Query semantic history and show Shadow Views.
 * AI can retrieve historical content, show evolution of sections, and resurrect deleted content.
 *
 * Linear-quality implementation with:
 * - Branded ID types for compile-time safety
 * - Immutable data structures
 * - Result types for explicit error handling
 * - LRU caching for query performance
 * - Observability hooks
 */

import type { HistoryEntry, HistoryState } from "../shadow/history.js";
import type { ShadowBlock, ShadowDocument } from "../shadow/types.js";
import {
  type BlockId,
  blockId,
  Err,
  LIMITS,
  None,
  Ok,
  type Option,
  type Result,
  type SnapshotId,
  Some,
  snapshotId,
  TIMING,
  type TraceId,
  traceId,
  withTiming,
} from "./primitives.js";

// ============================================
// Types (Immutable)
// ============================================

/** Semantic query for history search (immutable) */
export type SemanticHistoryQuery = {
  /** Natural language query (e.g., "What did Bob write about pricing?") */
  readonly query: string;
  /** Optional: filter by author */
  readonly authorId?: string;
  /** Optional: filter by time range */
  readonly timeRange?: {
    readonly from: number;
    readonly to: number;
  };
  /** Optional: filter by block type */
  readonly blockTypes?: readonly string[];
  /** Maximum results to return */
  readonly limit?: number;
};

/** A historical content snapshot (immutable) */
export type HistoricalContent = {
  /** Unique ID for this snapshot */
  readonly snapshotId: SnapshotId;
  /** Block ID at the time */
  readonly blockId: BlockId;
  /** Block type at the time */
  readonly blockType: string;
  /** Text content at the time */
  readonly text: string;
  /** Timestamp of this snapshot */
  readonly timestamp: number;
  /** Author who made this change (if available) */
  readonly authorId?: string;
  /** Whether this content still exists */
  readonly isDeleted: boolean;
  /** Semantic relevance score (0-1) */
  readonly relevanceScore?: number;
};

/** Result of a semantic history query (immutable) */
export type SemanticHistoryResult = {
  readonly traceId: TraceId;
  readonly query: SemanticHistoryQuery;
  readonly results: readonly HistoricalContent[];
  /** Total matches (may be more than returned) */
  readonly totalMatches: number;
  /** Time range covered by search */
  readonly searchedRange: {
    readonly from: number;
    readonly to: number;
  };
  /** Query timing in milliseconds */
  readonly timingMs: number;
  /** Whether result was from cache */
  readonly fromCache: boolean;
};

/** Shadow View configuration (immutable) */
export type ShadowViewConfig = {
  /** Block ID to show evolution for */
  readonly blockId: BlockId;
  /** Time range to show */
  readonly timeRange?: {
    readonly from: number;
    readonly to: number;
  };
  /** Whether to include deleted states */
  readonly includeDeleted?: boolean;
  /** Maximum snapshots to include */
  readonly maxSnapshots?: number;
};

/** Change type for shadow snapshots */
export type ChangeType = "created" | "modified" | "deleted" | "restored";

/** A single snapshot in a Shadow View (immutable) */
export type ShadowSnapshot = {
  readonly timestamp: number;
  readonly content: string;
  readonly blockType: string;
  /** Change type from previous snapshot */
  readonly changeType: ChangeType;
  /** Diff from previous snapshot (if applicable) */
  readonly diff?: {
    readonly added: readonly string[];
    readonly removed: readonly string[];
  };
};

/** Shadow View result - shows evolution of a block/section (immutable) */
export type ShadowView = {
  readonly traceId: TraceId;
  readonly blockId: BlockId;
  readonly currentContent: string | null;
  readonly isCurrentlyDeleted: boolean;
  readonly snapshots: readonly ShadowSnapshot[];
  /** First and last timestamps */
  readonly timespan: {
    readonly first: number;
    readonly last: number;
  };
};

/** Insert position for resurrection */
export type InsertPosition = "before" | "after" | "replace";

/** Resurrection request (immutable) */
export type ResurrectionRequest = {
  /** Snapshot to resurrect */
  readonly snapshotId: SnapshotId;
  /** Where to insert (block ID) */
  readonly targetBlockId: BlockId;
  /** Insert position relative to target */
  readonly position: InsertPosition;
};

/** Resurrection result (immutable) */
export type ResurrectionResult = {
  readonly traceId: TraceId;
  readonly success: boolean;
  /** New block ID if created */
  readonly newBlockId?: BlockId;
  /** Content that was resurrected */
  readonly content: string;
  /** Source snapshot timestamp */
  readonly sourceTimestamp: number;
};

/** Error types for time travel operations */
export type TimeTravelError =
  | {
      readonly code: "SNAPSHOT_NOT_FOUND";
      readonly message: string;
      readonly snapshotId: SnapshotId;
    }
  | { readonly code: "BLOCK_NOT_FOUND"; readonly message: string; readonly blockId: BlockId }
  | { readonly code: "INDEX_NOT_READY"; readonly message: string };

// ============================================
// LRU Cache Implementation
// ============================================

/** Simple LRU cache for query results */
class LRUCache<K, V> {
  private readonly cache = new Map<K, { value: V; timestamp: number }>();
  private readonly maxSize: number;
  private readonly ttlMs: number;

  constructor(maxSize: number, ttlMs: number) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  get(key: K): Option<V> {
    const entry = this.cache.get(key);
    if (!entry) {
      return None;
    }
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return None;
    }
    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return Some(entry.value);
  }

  set(key: K, value: V): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, { value, timestamp: Date.now() });
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

// ============================================
// Semantic Time Travel Controller
// ============================================

/**
 * Semantic Time Travel Controller
 *
 * Provides AI-powered history query and content resurrection.
 */
export class SemanticTimeTravel {
  private historyIndex: Map<BlockId, HistoricalContent[]> = new Map();
  private blockEvolution: Map<BlockId, ShadowSnapshot[]> = new Map();
  private isIndexed = false;
  private readonly queryCache: LRUCache<string, SemanticHistoryResult>;
  private readonly trace: TraceId;

  constructor(
    private readonly getHistoryState: () => HistoryState,
    private readonly getCurrentDoc: () => ShadowDocument
  ) {
    this.queryCache = new LRUCache(50, TIMING.QUERY_CACHE_TTL_MS);
    this.trace = traceId();
  }

  /** Get current trace ID for debugging */
  getTraceId(): TraceId {
    return this.trace;
  }

  /** Check if history is indexed */
  isReady(): boolean {
    return this.isIndexed;
  }

  /** Get cache statistics */
  getCacheStats(): { size: number; maxSize: number } {
    return { size: this.queryCache.size, maxSize: 50 };
  }

  /**
   * Index history entries for semantic search.
   */
  indexHistory(): void {
    withTiming("SemanticTimeTravel.indexHistory", () => {
      const historyState = this.getHistoryState();
      this.historyIndex.clear();
      this.blockEvolution.clear();
      this.queryCache.clear();

      const entries = this.collectEntries(historyState);
      let previousBlocks = new Map<string, ShadowBlock>();
      let previousBlockIds = new Set<string>();

      for (const entry of entries) {
        this.indexEntry(entry);
        const currentBlockIds = new Set(entry.blocks.keys());
        this.recordDeletions(previousBlockIds, previousBlocks, currentBlockIds, entry.timestamp);
        previousBlocks = new Map(entry.blocks);
        previousBlockIds = currentBlockIds;
      }

      this.isIndexed = true;
    });
  }

  /**
   * Search history with semantic query.
   */
  query(queryInput: SemanticHistoryQuery): Result<SemanticHistoryResult, TimeTravelError> {
    if (!this.isIndexed) {
      return Err({
        code: "INDEX_NOT_READY",
        message: "History index not ready. Call indexHistory() first.",
      });
    }

    // Check cache
    const cacheKey = this.buildCacheKey(queryInput);
    const cached = this.queryCache.get(cacheKey);
    if (cached.some) {
      return Ok({ ...cached.value, fromCache: true });
    }

    return withTiming(
      "SemanticTimeTravel.query",
      () => {
        const result = this.executeQuery(queryInput);
        this.queryCache.set(cacheKey, result);
        return Ok(result);
      },
      { queryLength: queryInput.query.length }
    );
  }

  /**
   * Generate a Shadow View showing evolution of a block.
   */
  getShadowView(config: ShadowViewConfig): Result<ShadowView, TimeTravelError> {
    if (!this.isIndexed) {
      return Err({
        code: "INDEX_NOT_READY",
        message: "History index not ready. Call indexHistory() first.",
      });
    }

    return withTiming("SemanticTimeTravel.getShadowView", () => {
      const evolution = this.blockEvolution.get(config.blockId) ?? [];
      const currentDoc = this.getCurrentDoc();
      const currentBlock = currentDoc.blocks.get(config.blockId as string);

      let snapshots = this.filterSnapshots(evolution, config);
      snapshots = this.sampleSnapshots(snapshots, config.maxSnapshots);

      const shadowView: ShadowView = Object.freeze({
        traceId: traceId(),
        blockId: config.blockId,
        currentContent: currentBlock?.text ?? null,
        isCurrentlyDeleted: !currentBlock,
        snapshots: Object.freeze(snapshots),
        timespan: Object.freeze({
          first: snapshots[0]?.timestamp ?? Date.now(),
          last: snapshots[snapshots.length - 1]?.timestamp ?? Date.now(),
        }),
      });

      return Ok(shadowView);
    });
  }

  /**
   * Get a specific historical snapshot by ID.
   */
  getSnapshot(targetSnapshotId: SnapshotId): Option<HistoricalContent> {
    for (const contents of this.historyIndex.values()) {
      const found = contents.find((c) => c.snapshotId === targetSnapshotId);
      if (found) {
        return Some(Object.freeze({ ...found }));
      }
    }
    return None;
  }

  /**
   * Plan resurrection of deleted content.
   */
  planResurrection(request: ResurrectionRequest): Result<ResurrectionResult, TimeTravelError> {
    const snapshot = this.getSnapshot(request.snapshotId);
    if (!snapshot.some) {
      return Err({
        code: "SNAPSHOT_NOT_FOUND",
        message: `Snapshot not found: ${request.snapshotId}`,
        snapshotId: request.snapshotId,
      });
    }

    return Ok(
      Object.freeze({
        traceId: traceId(),
        success: true,
        content: snapshot.value.text,
        sourceTimestamp: snapshot.value.timestamp,
      })
    );
  }

  /**
   * Get deleted blocks that can be resurrected.
   */
  getDeletedBlocks(): readonly HistoricalContent[] {
    const deleted: HistoricalContent[] = [];
    const currentDoc = this.getCurrentDoc();

    for (const [targetBlockId, contents] of this.historyIndex) {
      if (!currentDoc.blocks.has(targetBlockId as string)) {
        const sorted = [...contents].sort((a, b) => b.timestamp - a.timestamp);
        if (sorted.length > 0) {
          deleted.push(
            Object.freeze({
              ...sorted[0],
              isDeleted: true,
            })
          );
        }
      }
    }

    return Object.freeze(deleted);
  }

  /**
   * Find content by semantic similarity to a query.
   */
  findSimilarContent(text: string, limit = 5): readonly HistoricalContent[] {
    return withTiming(
      "SemanticTimeTravel.findSimilarContent",
      () => {
        const results: Array<{ content: HistoricalContent; score: number }> = [];
        const queryTerms = extractTerms(text);

        for (const contents of this.historyIndex.values()) {
          for (const content of contents) {
            const contentTerms = extractTerms(content.text);
            const score = jaccardSimilarity(queryTerms, contentTerms);

            if (score > 0.1) {
              results.push({ content, score });
            }
          }
        }

        results.sort((a, b) => b.score - a.score);
        return Object.freeze(
          results.slice(0, limit).map((r) =>
            Object.freeze({
              ...r.content,
              relevanceScore: r.score,
            })
          )
        );
      },
      { textLength: text.length, limit }
    );
  }

  // ============================================
  // Private Methods
  // ============================================

  private indexEntry(entry: HistoryEntry): void {
    for (const [blockIdStr, block] of entry.blocks) {
      const bid = blockId(blockIdStr);
      this.indexBlock(bid, block, entry.timestamp);
    }
  }

  private indexBlock(bid: BlockId, block: ShadowBlock, timestamp: number): void {
    const blockText = block.text ?? "";
    const content: HistoricalContent = Object.freeze({
      snapshotId: snapshotId(`${bid}-${timestamp}`),
      blockId: bid,
      blockType: block.type,
      text: blockText,
      timestamp,
      isDeleted: false,
    });

    const existing = this.historyIndex.get(bid) ?? [];
    existing.push(content);
    this.historyIndex.set(bid, existing);

    this.updateBlockEvolution(bid, block, timestamp, blockText);
  }

  private updateBlockEvolution(
    bid: BlockId,
    block: ShadowBlock,
    timestamp: number,
    blockText: string
  ): void {
    const evolution = this.blockEvolution.get(bid) ?? [];
    const previousSnapshot = evolution[evolution.length - 1];
    const changeType = determineChangeType(previousSnapshot);

    evolution.push(
      Object.freeze({
        timestamp,
        content: blockText,
        blockType: block.type,
        changeType,
        diff: previousSnapshot ? computeDiff(previousSnapshot.content, blockText) : undefined,
      })
    );

    this.blockEvolution.set(bid, evolution);
  }

  private markBlockAsDeleted(bid: BlockId, entryTimestamp: number): void {
    const evolution = this.blockEvolution.get(bid);
    if (!evolution || evolution.length === 0) {
      return;
    }

    const lastSnapshot = evolution[evolution.length - 1];
    if (lastSnapshot.changeType === "deleted" || lastSnapshot.timestamp >= entryTimestamp) {
      return;
    }

    const contents = this.historyIndex.get(bid);
    if (!contents) {
      return;
    }

    for (let i = 0; i < contents.length; i++) {
      if (contents[i].timestamp <= entryTimestamp) {
        contents[i] = Object.freeze({ ...contents[i], isDeleted: true });
      }
    }
  }

  private collectEntries(historyState: HistoryState): HistoryEntry[] {
    const entries = [...historyState.undoStack, ...historyState.redoStack];
    entries.sort((a, b) => a.timestamp - b.timestamp);
    if (entries.length > LIMITS.MAX_HISTORY_ENTRIES) {
      return entries.slice(entries.length - LIMITS.MAX_HISTORY_ENTRIES);
    }
    return entries;
  }

  private recordDeletions(
    previousBlockIds: ReadonlySet<string>,
    previousBlocks: ReadonlyMap<string, ShadowBlock>,
    currentBlockIds: ReadonlySet<string>,
    timestamp: number
  ): void {
    for (const blockIdStr of previousBlockIds) {
      if (currentBlockIds.has(blockIdStr)) {
        continue;
      }
      const previousBlock = previousBlocks.get(blockIdStr);
      if (!previousBlock) {
        continue;
      }
      const bid = blockId(blockIdStr);
      this.appendDeletionSnapshot(bid, previousBlock, timestamp);
      this.markBlockAsDeleted(bid, timestamp);
    }
  }

  private appendDeletionSnapshot(bid: BlockId, block: ShadowBlock, timestamp: number): void {
    const evolution = this.blockEvolution.get(bid) ?? [];
    const lastSnapshot = evolution[evolution.length - 1];
    if (lastSnapshot?.changeType === "deleted") {
      return;
    }

    evolution.push(
      Object.freeze({
        timestamp,
        content: block.text ?? "",
        blockType: block.type,
        changeType: "deleted" as const,
      })
    );

    this.blockEvolution.set(bid, evolution);
  }

  private buildCacheKey(queryInput: SemanticHistoryQuery): string {
    return JSON.stringify({
      q: queryInput.query,
      a: queryInput.authorId,
      t: queryInput.timeRange,
      b: queryInput.blockTypes,
      l: queryInput.limit,
    });
  }

  private executeQuery(queryInput: SemanticHistoryQuery): SemanticHistoryResult {
    const startTime = performance.now();
    const results: HistoricalContent[] = [];
    const queryTerms = extractTerms(queryInput.query);

    let earliestTimestamp = Number.POSITIVE_INFINITY;
    let latestTimestamp = 0;

    for (const contents of this.historyIndex.values()) {
      for (const content of contents) {
        if (!this.matchesFilters(content, queryInput)) {
          continue;
        }

        const score = computeRelevanceScore(content.text, queryTerms);
        if (score > 0) {
          results.push(Object.freeze({ ...content, relevanceScore: score }));
          earliestTimestamp = Math.min(earliestTimestamp, content.timestamp);
          latestTimestamp = Math.max(latestTimestamp, content.timestamp);
        }
      }
    }

    results.sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0));
    const limited = queryInput.limit
      ? results.slice(0, Math.min(queryInput.limit, LIMITS.MAX_QUERY_RESULTS))
      : results.slice(0, LIMITS.MAX_QUERY_RESULTS);

    return Object.freeze({
      traceId: traceId(),
      query: queryInput,
      results: Object.freeze(limited),
      totalMatches: results.length,
      searchedRange: Object.freeze({
        from: earliestTimestamp === Number.POSITIVE_INFINITY ? Date.now() : earliestTimestamp,
        to: latestTimestamp || Date.now(),
      }),
      timingMs: performance.now() - startTime,
      fromCache: false,
    });
  }

  private matchesFilters(content: HistoricalContent, queryInput: SemanticHistoryQuery): boolean {
    if (queryInput.authorId && content.authorId !== queryInput.authorId) {
      return false;
    }
    if (queryInput.timeRange) {
      if (
        content.timestamp < queryInput.timeRange.from ||
        content.timestamp > queryInput.timeRange.to
      ) {
        return false;
      }
    }
    if (queryInput.blockTypes && !queryInput.blockTypes.includes(content.blockType)) {
      return false;
    }
    return true;
  }

  private filterSnapshots(
    snapshots: readonly ShadowSnapshot[],
    config: ShadowViewConfig
  ): ShadowSnapshot[] {
    let filtered = [...snapshots];

    if (config.timeRange) {
      const { from, to } = config.timeRange;
      filtered = filtered.filter((s) => s.timestamp >= from && s.timestamp <= to);
    }

    if (!config.includeDeleted) {
      filtered = filtered.filter((s) => s.changeType !== "deleted");
    }

    return filtered;
  }

  private sampleSnapshots(snapshots: ShadowSnapshot[], maxSnapshots?: number): ShadowSnapshot[] {
    const limit = maxSnapshots ?? LIMITS.MAX_SHADOW_SNAPSHOTS;
    if (snapshots.length <= limit) {
      return snapshots;
    }

    // Keep first, last, and evenly distributed middle snapshots
    const step = Math.floor(snapshots.length / (limit - 2));
    const sampled = [snapshots[0]];
    for (let i = step; i < snapshots.length - 1; i += step) {
      if (sampled.length < limit - 1) {
        sampled.push(snapshots[i]);
      }
    }
    sampled.push(snapshots[snapshots.length - 1]);
    return sampled;
  }
}

// ============================================
// Helper Functions
// ============================================

/** Extract searchable terms from text */
function extractTerms(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2)
  );
}

/** Compute Jaccard similarity between two term sets */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  let intersection = 0;
  for (const term of a) {
    if (b.has(term)) {
      intersection++;
    }
  }
  const union = a.size + b.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/** Compute relevance score for a text against query terms */
function computeRelevanceScore(text: string, queryTerms: Set<string>): number {
  const textLower = text.toLowerCase();
  let matchedTerms = 0;
  for (const term of queryTerms) {
    if (textLower.includes(term)) {
      matchedTerms++;
    }
  }
  return queryTerms.size > 0 ? matchedTerms / queryTerms.size : 0;
}

/** Determine the type of change between snapshots */
function determineChangeType(previous: ShadowSnapshot | undefined): ChangeType {
  if (!previous) {
    return "created";
  }
  if (previous.changeType === "deleted") {
    return "restored";
  }
  return "modified";
}

/** Compute simple word-based diff */
function computeDiff(
  oldText: string,
  newText: string
): { added: readonly string[]; removed: readonly string[] } {
  const oldWords = new Set(oldText.split(/\s+/));
  const newWords = new Set(newText.split(/\s+/));

  const added: string[] = [];
  const removed: string[] = [];

  for (const word of newWords) {
    if (!oldWords.has(word)) {
      added.push(word);
    }
  }

  for (const word of oldWords) {
    if (!newWords.has(word)) {
      removed.push(word);
    }
  }

  return Object.freeze({ added: Object.freeze(added), removed: Object.freeze(removed) });
}

// ============================================
// Factory Function
// ============================================

/**
 * Create a time travel instance for a document.
 */
export function createSemanticTimeTravel(
  getHistoryState: () => HistoryState,
  getCurrentDoc: () => ShadowDocument
): SemanticTimeTravel {
  const timeTravel = new SemanticTimeTravel(getHistoryState, getCurrentDoc);
  timeTravel.indexHistory();
  return timeTravel;
}

// ============================================
// Convenience Functions
// ============================================

/**
 * Create a SemanticHistoryQuery from raw data.
 */
export function createHistoryQuery(raw: {
  query: string;
  authorId?: string;
  timeRange?: { from: number; to: number };
  blockTypes?: readonly string[];
  limit?: number;
}): SemanticHistoryQuery {
  return Object.freeze({
    query: raw.query,
    authorId: raw.authorId,
    timeRange: raw.timeRange ? Object.freeze(raw.timeRange) : undefined,
    blockTypes: raw.blockTypes ? Object.freeze([...raw.blockTypes]) : undefined,
    limit: raw.limit,
  });
}

/**
 * Create a ShadowViewConfig from raw data.
 */
export function createShadowViewConfig(raw: {
  blockId: string;
  timeRange?: { from: number; to: number };
  includeDeleted?: boolean;
  maxSnapshots?: number;
}): ShadowViewConfig {
  return Object.freeze({
    blockId: blockId(raw.blockId),
    timeRange: raw.timeRange ? Object.freeze(raw.timeRange) : undefined,
    includeDeleted: raw.includeDeleted,
    maxSnapshots: raw.maxSnapshots,
  });
}

/**
 * Create a ResurrectionRequest from raw data.
 */
export function createResurrectionRequest(raw: {
  snapshotId: string;
  targetBlockId: string;
  position: InsertPosition;
}): ResurrectionRequest {
  return Object.freeze({
    snapshotId: snapshotId(raw.snapshotId),
    targetBlockId: blockId(raw.targetBlockId),
    position: raw.position,
  });
}
