/**
 * Canonical text normalization and hashing for content ingestion.
 * Used to stabilize content IDs across different import sources.
 */

import {
  getNativeTextNormalization,
  type NativeTextNormalizationBinding,
} from "@ku0/text-normalization-rs";

export interface CanonicalResult {
  blocks: string[];
  canonicalText: string;
}

export interface CanonicalHashResult {
  docHash: string;
  blockHashes: string[];
}

function resolveNativeTextNormalization(): NativeTextNormalizationBinding | null {
  return getNativeTextNormalization();
}

/**
 * Normalizes text into canonical blocks.
 * - Split by newlines
 * - Trim whitespace
 * - Filter empty blocks
 */
export function canonicalizeText(text: string): CanonicalResult {
  const native = resolveNativeTextNormalization();
  if (native) {
    try {
      return native.canonicalizeText(text);
    } catch {
      // Fall back to JS normalization if native bindings fail.
    }
  }

  return canonicalizeTextFallback(text);
}

function canonicalizeTextFallback(text: string): CanonicalResult {
  if (!text) {
    return { blocks: [], canonicalText: "" };
  }

  // Simple paragraph splitting for now
  // Updates to this logic must be versioned to avoid ID churn
  const blocks = text
    .split(/\n\s*\n/) // Split by empty lines
    .map((b) => b.trim())
    .filter((b) => b.length > 0);

  const canonicalText = blocks.join("\n\n");

  return { blocks, canonicalText };
}

/**
 * Computes a deterministic hash for a list of content blocks.
 * Returns both a document-level hash and individual block hashes.
 * Synchronous implementation to match ingest usage.
 */
export function computeCanonicalHash(blocks: { text: string }[]): CanonicalHashResult {
  const native = resolveNativeTextNormalization();
  if (native) {
    try {
      return native.computeCanonicalHash(blocks);
    } catch {
      // Fall back to JS hashing if native bindings fail.
    }
  }

  return computeCanonicalHashFallback(blocks);
}

function computeCanonicalHashFallback(blocks: { text: string }[]): CanonicalHashResult {
  const blockHashes = blocks.map((b) => simpleHash(b.text));
  const docHash = simpleHash(blockHashes.join("|"));

  return { docHash, blockHashes };
}

/**
 * Simple deterministic hash function (Fowler-Noll-Vo 1a variant)
 * for synchronous execution.
 */
function simpleHash(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
