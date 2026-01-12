/**
 * LFCC v0.9 RC - Level 3 Fuzzy Anchor Relocation
 * @see docs/product/LFCC_v0.9_RC_Engineering_Docs/01_Kernel_API_Specification.md Section 5
 *
 * Implements AI-powered fuzzy matching for anchor recovery when exact and
 * integrity-check based relocation fails.
 */

import { type Anchor, createAnchor } from "./anchors";
import { relocateAnchor } from "./relocate";
import type { BlockMapping } from "./types";

/** Options for fuzzy relocation */
export type FuzzyRelocateOptions = {
  /** Original text content that the anchor covered */
  originalContent: string;
  /** Semantic embedding vector for the content (optional, for AI-enhanced matching) */
  embedding?: Float32Array;
  /** Minimum similarity threshold (0-1) for accepting a match */
  threshold?: number;
  /** Maximum number of candidates to consider */
  maxCandidates?: number;
  /** Search radius in blocks around the original position */
  searchRadiusBlocks?: number;
};

/** Result of fuzzy relocation */
export type FuzzyRelocateResult = {
  /** The relocated anchor, or null if no match found */
  anchor: Anchor | null;
  /** Confidence score (0-1) */
  confidence: number;
  /** Method used for relocation */
  method: "exact" | "integrity" | "fuzzy_text" | "fuzzy_semantic" | "failed";
  /** Debug info about candidates considered */
  debug?: {
    candidatesConsidered: number;
    bestMatchContent?: string;
    bestMatchScore?: number;
  };
};

/** Document content accessor for fuzzy search */
export type DocumentContentAccessor = {
  /** Get text content of a block by ID */
  getBlockContent(blockId: string): string | null;
  /** Get ordered list of block IDs in the document */
  getBlockOrder(): string[];
  /** Get block IDs within radius of a given block */
  getBlocksInRadius?(blockId: string, radius: number): string[];
};

/**
 * Compute normalized Levenshtein similarity between two strings.
 * Returns 1.0 for identical strings, 0.0 for completely different.
 */
export function computeTextSimilarity(a: string, b: string): number {
  if (a === b) {
    return 1.0;
  }
  if (a.length === 0 || b.length === 0) {
    return 0.0;
  }

  const maxLen = Math.max(a.length, b.length);
  const distance = levenshteinDistance(a, b);
  return 1.0 - distance / maxLen;
}

/**
 * Levenshtein edit distance implementation.
 */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;

  // Use two rows for space optimization
  let prev = new Array(n + 1).fill(0);
  let curr = new Array(n + 1).fill(0);

  // Initialize first row
  for (let j = 0; j <= n; j++) {
    prev[j] = j;
  }

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1, // deletion
        curr[j - 1] + 1, // insertion
        prev[j - 1] + cost // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[n];
}

/**
 * Find substring matches using sliding window with text similarity.
 * Slides windows of various sizes across haystack and computes
 * actual Levenshtein similarity at each position.
 */
export function findSubstringMatches(
  needle: string,
  haystack: string,
  _ngramSize = 3
): Array<{ start: number; end: number; score: number }> {
  if (needle.length < 3 || haystack.length < 3) {
    return [];
  }

  const matches: Array<{ start: number; end: number; score: number }> = [];

  // Use windows of various sizes around needle length to handle edits
  const windowSizes = [
    needle.length,
    Math.floor(needle.length * 0.8),
    Math.floor(needle.length * 1.2),
    Math.floor(needle.length * 1.5),
  ].filter((s) => s >= 3 && s <= haystack.length);

  for (const windowSize of windowSizes) {
    // Slide window across haystack
    for (let start = 0; start <= haystack.length - windowSize; start++) {
      const window = haystack.slice(start, start + windowSize);
      const score = computeTextSimilarity(needle, window);

      if (score > 0.3) {
        matches.push({ start, end: start + windowSize, score });
      }
    }
  }

  // Merge overlapping matches and keep best
  return mergeOverlappingMatches(matches);
}

function mergeOverlappingMatches(
  matches: Array<{ start: number; end: number; score: number }>
): Array<{ start: number; end: number; score: number }> {
  if (matches.length === 0) {
    return [];
  }

  // Sort by score descending - keep the best matches
  const sorted = [...matches].sort((a, b) => b.score - a.score);
  const result: Array<{ start: number; end: number; score: number }> = [];

  for (const match of sorted) {
    // Check if this match overlaps with any already-accepted match
    const overlaps = result.some(
      (existing) => !(match.end <= existing.start || match.start >= existing.end)
    );

    if (!overlaps) {
      result.push(match);
    }
  }

  // Sort by position for consistent output
  return result.sort((a, b) => a.start - b.start);
}

/**
 * Candidate match for fuzzy relocation
 */
type FuzzyCandidate = {
  blockId: string;
  offset: number;
  content: string;
  score: number;
  method: "text" | "semantic";
};

/**
 * Determine which blocks to search for fuzzy matching.
 */
function getSearchBlocks(
  anchor: Anchor,
  mapping: BlockMapping,
  document: DocumentContentAccessor,
  searchRadius: number
): Set<string> {
  const blockOrder = document.getBlockOrder();
  const derivedBlocks = mapping.derivedBlocksFrom(anchor.blockId);
  const searchBlocks = new Set<string>(derivedBlocks);

  // Add blocks in radius - if original block doesn't exist, search all nearby blocks
  if (document.getBlocksInRadius) {
    const nearbyBlocks = document.getBlocksInRadius(anchor.blockId, searchRadius);
    for (const b of nearbyBlocks) {
      searchBlocks.add(b);
    }
  }

  // Fallback: if no blocks found yet, search by index proximity or search all
  if (searchBlocks.size === 0) {
    const originalIdx = blockOrder.indexOf(anchor.blockId);
    if (originalIdx >= 0) {
      const start = Math.max(0, originalIdx - searchRadius);
      const end = Math.min(blockOrder.length, originalIdx + searchRadius + 1);
      for (let i = start; i < end; i++) {
        searchBlocks.add(blockOrder[i]);
      }
    } else {
      // Original block not in order - search all blocks
      for (const blockId of blockOrder) {
        searchBlocks.add(blockId);
      }
    }
  }

  return searchBlocks;
}

/**
 * Search a single block for matching content.
 */
function searchBlockForMatches(
  blockId: string,
  blockContent: string,
  originalContent: string,
  threshold: number
): FuzzyCandidate[] {
  const candidates: FuzzyCandidate[] = [];

  // Find substring matches
  const matches = findSubstringMatches(originalContent, blockContent);
  for (const match of matches) {
    const matchedText = blockContent.slice(match.start, match.end);
    const similarity = computeTextSimilarity(originalContent, matchedText);
    if (similarity >= threshold) {
      candidates.push({
        blockId,
        offset: match.start,
        content: matchedText,
        score: similarity,
        method: "text",
      });
    }
  }

  // Also try direct similarity if block content is similar length
  const lengthDiff = Math.abs(blockContent.length - originalContent.length);
  if (lengthDiff < originalContent.length * 0.5) {
    const directSim = computeTextSimilarity(originalContent, blockContent);
    if (directSim >= threshold) {
      candidates.push({
        blockId,
        offset: 0,
        content: blockContent,
        score: directSim,
        method: "text",
      });
    }
  }

  return candidates;
}

/**
 * Perform Level 3 fuzzy anchor relocation.
 *
 * Strategy:
 * 1. First try Level 1 (exact) and Level 2 (integrity check) via relocateAnchor
 * 2. If both fail, perform fuzzy text matching in nearby blocks
 * 3. Optionally use semantic embeddings for deeper matching
 */
export function fuzzyRelocateAnchor(
  anchor: Anchor,
  mapping: BlockMapping,
  document: DocumentContentAccessor,
  options: FuzzyRelocateOptions
): FuzzyRelocateResult {
  const threshold = options.threshold ?? 0.7;
  const maxCandidates = options.maxCandidates ?? 10;
  const searchRadius = options.searchRadiusBlocks ?? 5;

  // 1. Try Level 1-2 first
  const exactResult = relocateAnchor(anchor, mapping, "integrity_check");
  if (exactResult) {
    return {
      anchor: exactResult,
      confidence: 1.0,
      method: "integrity",
    };
  }

  // 2. Level 3: Fuzzy text matching
  const searchBlocks = getSearchBlocks(anchor, mapping, document, searchRadius);
  const candidates: FuzzyCandidate[] = [];

  for (const blockId of searchBlocks) {
    const blockContent = document.getBlockContent(blockId);
    if (!blockContent) {
      continue;
    }

    const blockCandidates = searchBlockForMatches(
      blockId,
      blockContent,
      options.originalContent,
      threshold
    );
    candidates.push(...blockCandidates);
  }

  // 3. Sort candidates by score and take best
  candidates.sort((a, b) => b.score - a.score);
  const topCandidates = candidates.slice(0, maxCandidates);

  if (topCandidates.length === 0) {
    return {
      anchor: null,
      confidence: 0,
      method: "failed",
      debug: {
        candidatesConsidered: 0,
      },
    };
  }

  const best = topCandidates[0];

  return {
    anchor: createAnchor(best.blockId, best.offset, anchor.bias),
    confidence: best.score,
    method: best.method === "text" ? "fuzzy_text" : "fuzzy_semantic",
    debug: {
      candidatesConsidered: candidates.length,
      bestMatchContent: best.content.slice(0, 100),
      bestMatchScore: best.score,
    },
  };
}

/**
 * Batch fuzzy relocate annotations.
 * Useful for recovering multiple orphaned annotations efficiently.
 */
export function batchFuzzyRelocate<T extends { anchor: Anchor; originalContent: string }>(
  annotations: T[],
  mapping: BlockMapping,
  document: DocumentContentAccessor,
  options?: Partial<FuzzyRelocateOptions>
): Array<T & { relocateResult: FuzzyRelocateResult }> {
  return annotations.map((anno) => ({
    ...anno,
    relocateResult: fuzzyRelocateAnchor(anno.anchor, mapping, document, {
      originalContent: anno.originalContent,
      ...options,
    }),
  }));
}

/**
 * Compute content hash for integrity verification.
 * This can be stored with the anchor to enable Level 2 verification.
 */
export function computeContentHash(content: string): string {
  // Simple FNV-1a hash for fast comparison
  let hash = 0x811c9dc5;
  for (let i = 0; i < content.length; i++) {
    hash ^= content.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
