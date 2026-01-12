/**
 * LFCC v0.9 RC - Text normalization utilities
 * @see docs/product/LFCC_v0.9_RC_Engineering_Docs/10_Recursive_Canonicalization_Deep_Dive.md
 */

/**
 * Normalize line endings to LF (Unix style)
 * CRLF -> LF, CR -> LF
 */
export function normalizeLF(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/**
 * Normalize whitespace according to LFCC rules:
 * - Collapse multiple spaces/tabs to single space
 * - Preserve single newlines
 * - Trim leading/trailing whitespace from lines
 */
export function normalizeWhitespace(text: string): string {
  // First normalize line endings
  let normalized = normalizeLF(text);

  // Collapse horizontal whitespace (spaces and tabs) to single space
  normalized = normalized.replace(/[ \t]+/g, " ");

  return normalized;
}

/**
 * Check if text is empty or whitespace-only
 */
export function isEmptyText(text: string): boolean {
  return text.trim().length === 0;
}

/**
 * Check if text changed during normalization (for diagnostics)
 */
export function wasWhitespaceNormalized(original: string, normalized: string): boolean {
  return original !== normalized;
}
