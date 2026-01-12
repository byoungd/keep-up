/**
 * LFCC v0.9 RC - AI Context Hashing
 * @see docs/product/LFCC_v0.9_RC_Engineering_Docs/11_Dirty_Region_and_Neighbor_Expansion.md
 */

/**
 * Compute a stable context hash for optimistic locking.
 * Uses SHA-256 via Web Crypto API (available in modern browsers and Node 18+).
 *
 * @param text The text content to hash
 * @returns Hex string of the hash
 */
export async function computeOptimisticHash(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(normalizeText(text));

  // Use SubtleCrypto
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    return bufferToHex(hashBuffer);
  }

  // Fallback for non-secure contexts or old Node (using simple hash for demo)
  // In production, ensure crypto is available or use a polyfill
  return simpleHash(text);
}

/**
 * Verify if a text matches a context hash.
 */
export async function verifyOptimisticHash(text: string, hash: string): Promise<boolean> {
  const computed = await computeOptimisticHash(text);
  return computed === hash;
}

/**
 * Normalize text for hashing:
 * - Collapse whitespace
 * - Trim ends
 * - Lowercase? (No, we want case sensitivity for editing context)
 */
function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Simple fallback djb2-like hash for when crypto is unavailable
function simpleHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) + hash + str.charCodeAt(i); /* hash * 33 + c */
  }
  return (hash >>> 0).toString(16);
}
