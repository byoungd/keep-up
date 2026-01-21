import {
  getNativeAnchorRelocation,
  type NativeAnchorRelocationBinding,
} from "@ku0/anchor-relocation-rs";
import { type Anchor, createAnchor } from "./anchors.js";
import type { BlockMapping } from "./types.js";

export type RelocationStrategy = "exact" | "integrity_check" | "fuzzy";

// ===========================================================================
// Types
// ===========================================================================

/**
 * Context hash for fuzzy matching.
 * Captures text content around an anchor for similarity matching.
 */
export interface AnchorContext {
  /** Text before the anchor (max ~50 chars) */
  prefixText: string;
  /** Text at/after the anchor (max ~50 chars) */
  suffixText: string;
  /** Hash of the context for quick comparison */
  contextHash: string;
}

/**
 * Document content provider for fuzzy search.
 */
export interface DocumentContentProvider {
  /** Get text content of a block */
  getBlockText(blockId: string): string | null;
  /** Get all block IDs in document order */
  getBlockIds(): string[];
  /** Get block at a specific document position */
  getBlockAtPosition?(offset: number): { blockId: string; localOffset: number } | null;
}

/**
 * Fuzzy match result with confidence score.
 */
export interface FuzzyMatchResult {
  /** New anchor position */
  anchor: Anchor;
  /** Confidence score (0-1) */
  confidence: number;
  /** Match method used */
  method: "exact" | "context_hash" | "text_similarity" | "nearest_neighbor";
}

/**
 * Configuration for fuzzy relocation.
 */
export interface FuzzyRelocationConfig {
  /** Minimum confidence to accept a fuzzy match (default: 0.7) */
  minConfidence: number;
  /** Maximum blocks to search (default: 20) */
  maxSearchBlocks: number;
  /** Context window size in characters (default: 50) */
  contextWindowSize: number;
  /** Enable n-gram based similarity (default: true) */
  enableNgramSimilarity: boolean;
}

const DEFAULT_FUZZY_CONFIG: FuzzyRelocationConfig = {
  minConfidence: 0.7,
  maxSearchBlocks: 20,
  contextWindowSize: 50,
  enableNgramSimilarity: true,
};

// ===========================================================================
// Main Relocation Functions
// ===========================================================================

/**
 * Relocate an annotation's anchor based on a structural BlockMapping.
 * Implements the 3-level strategy defined in LFCC §5.
 *
 * @param anchor The original anchor
 * @param mapping The block mapping describing the document change
 * @param strategy Level of relocation strategy to apply
 */
export function relocateAnchor(
  anchor: Anchor,
  mapping: BlockMapping,
  strategy: RelocationStrategy = "integrity_check"
): Anchor | null {
  // 1. Level 1: Exact Mapping
  const mapped = mapping.mapOldToNew(anchor.blockId, anchor.offset);

  if (!mapped) {
    // Position was deleted
    return null;
  }

  const newAnchor = createAnchor(mapped.newBlockId, mapped.newAbsInBlock, anchor.bias);

  // If strategy is exact, we trust the mapping blindly
  if (strategy === "exact") {
    return newAnchor;
  }

  // 2. Level 2: Integrity Check
  // In a real implementation, we would verify the content at the new position matches
  // the content hash stored in the anchor (if it had one).
  // For v0.9 RC, we trust mapOldToNew preserves locality/monotonicity verified by axioms.
  // But we can check if the block ID changed unexpectedly for non-structural edits.

  // Future: verifyAnchorIntegrity(newAnchor, documentSnapshot)

  return newAnchor;
}

/**
 * Batch relocate annotations with Level 3 Fuzzy Search support.
 */
export function relocateAnnotations<T extends { anchor: Anchor; contextHash?: string }>(
  annotations: T[],
  mapping: BlockMapping,
  documentProvider?: DocumentContentProvider,
  config?: Partial<FuzzyRelocationConfig>
): { relocated: T[]; orphaned: T[] } {
  const fullConfig = { ...DEFAULT_FUZZY_CONFIG, ...config };
  const relocated: T[] = [];
  const orphaned: T[] = [];

  for (const anno of annotations) {
    // Try Level 1 & 2 first
    const newAnchor = relocateAnchor(anno.anchor, mapping);

    if (newAnchor) {
      relocated.push({ ...anno, anchor: newAnchor });
      continue;
    }

    // Level 3: Fuzzy Search
    if (documentProvider && anno.contextHash) {
      const fuzzyResult = relocateAnchorFuzzy(
        anno.anchor,
        anno.contextHash,
        documentProvider,
        fullConfig
      );

      if (fuzzyResult && fuzzyResult.confidence >= fullConfig.minConfidence) {
        relocated.push({ ...anno, anchor: fuzzyResult.anchor });
        continue;
      }
    }

    // Annotation is orphaned
    orphaned.push(anno);
  }

  return { relocated, orphaned };
}

// ===========================================================================
// Level 3: Fuzzy Relocation
// ===========================================================================

/**
 * Attempt to relocate an anchor using fuzzy matching.
 * Uses context hash and text similarity to find the best match.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: balances multiple fuzzy matching strategies for relocation safety
export function relocateAnchorFuzzy(
  originalAnchor: Anchor,
  contextHash: string,
  provider: DocumentContentProvider,
  config: FuzzyRelocationConfig = DEFAULT_FUZZY_CONFIG
): FuzzyMatchResult | null {
  const blockIds = provider.getBlockIds();

  // Find the original block's position
  const originalIndex = blockIds.indexOf(originalAnchor.blockId);

  // Determine search range (prioritize nearby blocks)
  const searchBlocks = getSearchOrder(blockIds, originalIndex, config.maxSearchBlocks);

  let bestMatch: FuzzyMatchResult | null = null;

  for (const blockId of searchBlocks) {
    const blockText = provider.getBlockText(blockId);
    if (!blockText) {
      continue;
    }

    // Try context hash matching first
    const hashMatch = findByContextHash(blockId, blockText, contextHash, config);
    if (hashMatch && (!bestMatch || hashMatch.confidence > bestMatch.confidence)) {
      bestMatch = hashMatch;
      if (hashMatch.confidence >= 0.95) {
        // Excellent match, stop searching
        break;
      }
    }

    // Try text similarity if enabled
    if (config.enableNgramSimilarity && originalAnchor.offset < blockText.length) {
      const simMatch = findByTextSimilarity(
        blockId,
        blockText,
        originalAnchor.offset,
        contextHash,
        config
      );
      if (simMatch && (!bestMatch || simMatch.confidence > bestMatch.confidence)) {
        bestMatch = simMatch;
      }
    }
  }

  return bestMatch;
}

/**
 * Get block search order prioritizing nearby blocks.
 */
function getSearchOrder(blockIds: string[], originalIndex: number, maxBlocks: number): string[] {
  if (originalIndex < 0) {
    // Original block not found, search from start
    return blockIds.slice(0, maxBlocks);
  }

  const result: string[] = [];
  let offset = 0;

  while (result.length < maxBlocks && offset <= blockIds.length) {
    // Alternate before/after original position
    if (originalIndex + offset < blockIds.length) {
      result.push(blockIds[originalIndex + offset]);
    }
    if (offset > 0 && originalIndex - offset >= 0) {
      result.push(blockIds[originalIndex - offset]);
    }
    offset++;
  }

  return result.slice(0, maxBlocks);
}

/**
 * Find anchor position by context hash matching.
 */
function findByContextHash(
  blockId: string,
  blockText: string,
  contextHash: string,
  config: FuzzyRelocationConfig
): FuzzyMatchResult | null {
  // Slide a window through the block text and compute hashes
  const windowSize = config.contextWindowSize;
  const native = getNativeAnchorRelocation();

  for (let offset = 0; offset <= blockText.length; offset++) {
    const prefix = blockText.slice(Math.max(0, offset - windowSize), offset);
    const suffix = blockText.slice(offset, offset + windowSize);
    const hash = computeFuzzyContextHashWithNative(prefix, suffix, native);

    if (hash === contextHash) {
      return {
        anchor: createAnchor(blockId, offset, "after"),
        confidence: 1.0,
        method: "context_hash",
      };
    }
  }

  return null;
}

/**
 * Find anchor position by text similarity (n-gram based).
 */
function findByTextSimilarity(
  blockId: string,
  blockText: string,
  _originalOffset: number,
  contextHash: string,
  config: FuzzyRelocationConfig
): FuzzyMatchResult | null {
  // Extract context from hash (if possible) or use original offset
  const windowSize = config.contextWindowSize;
  let bestOffset = -1;
  let bestSimilarity = 0;
  const native = getNativeAnchorRelocation();

  // Slide window and compute similarity
  for (let offset = 0; offset <= blockText.length; offset++) {
    const prefix = blockText.slice(Math.max(0, offset - windowSize), offset);
    const suffix = blockText.slice(offset, offset + windowSize);
    const currentHash = computeFuzzyContextHashWithNative(prefix, suffix, native);

    // Compute n-gram similarity between hashes
    const similarity = computeNgramSimilarityWithNative(contextHash, currentHash, 3, native);

    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
      bestOffset = offset;
    }
  }

  if (bestOffset >= 0 && bestSimilarity >= 0.5) {
    return {
      anchor: createAnchor(blockId, bestOffset, "after"),
      confidence: bestSimilarity,
      method: "text_similarity",
    };
  }

  return null;
}

// ===========================================================================
// Context Hash Utilities
// ===========================================================================

/**
 * Compute a context hash from prefix and suffix text.
 * Uses a simple but effective hash for context matching.
 */
export function computeFuzzyContextHash(prefix: string, suffix: string): string {
  return computeFuzzyContextHashWithNative(prefix, suffix, getNativeAnchorRelocation());
}

function computeFuzzyContextHashWithNative(
  prefix: string,
  suffix: string,
  native: NativeAnchorRelocationBinding | null
): string {
  if (native) {
    try {
      return native.computeFuzzyContextHash(prefix, suffix);
    } catch {
      // Fall back to JS hash if native binding fails.
    }
  }
  const normalized = `${normalizeText(prefix)}|${normalizeText(suffix)}`;
  return fnv1aHash(normalized);
}

/**
 * Extract context around a position in a block.
 */
export function extractAnchorContext(
  blockText: string,
  offset: number,
  windowSize = 50
): AnchorContext {
  const prefix = blockText.slice(Math.max(0, offset - windowSize), offset);
  const suffix = blockText.slice(offset, offset + windowSize);

  return {
    prefixText: prefix,
    suffixText: suffix,
    contextHash: computeFuzzyContextHash(prefix, suffix),
  };
}

/**
 * Normalize text for hashing (lowercase, collapse whitespace).
 */
function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim().slice(-100); // Limit length
}

/**
 * FNV-1a hash for strings.
 */
function fnv1aHash(str: string): string {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * Compute n-gram similarity between two strings (Jaccard index).
 */
function computeNgramSimilarityWithNative(
  a: string,
  b: string,
  n: number,
  native: NativeAnchorRelocationBinding | null
): number {
  if (native) {
    try {
      return native.computeNgramSimilarity(a, b, n);
    } catch {
      // Fall back to JS similarity if native binding fails.
    }
  }
  return computeNgramSimilarityFallback(a, b, n);
}

function computeNgramSimilarityFallback(a: string, b: string, n: number): number {
  if (a === b) {
    return 1.0;
  }
  if (a.length < n || b.length < n) {
    return 0;
  }

  const ngramsA = new Set<string>();
  const ngramsB = new Set<string>();

  for (let i = 0; i <= a.length - n; i++) {
    ngramsA.add(a.slice(i, i + n));
  }
  for (let i = 0; i <= b.length - n; i++) {
    ngramsB.add(b.slice(i, i + n));
  }

  let intersection = 0;
  for (const ngram of ngramsA) {
    if (ngramsB.has(ngram)) {
      intersection++;
    }
  }

  const union = ngramsA.size + ngramsB.size - intersection;
  return union > 0 ? intersection / union : 0;
}
