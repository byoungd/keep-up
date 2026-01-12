/**
 * Validates that a position is not within a surrogate pair.
 * @param text - The text content (as UTF-16 code units)
 * @param pos - The position to validate (UTF-16 code unit index)
 * @returns true if position is valid, false if it would split a surrogate pair
 */
export function isValidPosition(text: string, pos: number): boolean {
  if (pos < 0 || pos > text.length) {
    return false;
  }

  // Check if position is at a high surrogate (meaning it's INSIDE a pair if we were trying to split *after* it,
  // but wait... standard logic says:
  // "A position P is valid if code unit at P is not a low surrogate."
  // Actually, let's follow the doc normative algo carefully.

  // The doc says:
  // "Check if position is at a high surrogate"
  // If text[pos] is High, it means we are pointing AT the first half.
  // Insertion AT `pos` puts content BEFORE this High surrogate. That is Safe.
  // So `isValidPosition` usually means "Can I insert/split at exactly this index?"

  // Wait, let's re-read the doc implementation provided in 12_UTF16_...md carefully.
  // The doc implementation:
  // if (codeUnit >= 0xD800 && codeUnit <= 0xDBFF) { ... if (pos+1 >= len) return false; ... }
  // This logic seems to check if the character AT `pos` is valid.
  // But usually cursor positions are "between" characters.
  // Let's stick strictly to the PROVIDED CODE in the doc.

  const codeUnit = text.charCodeAt(pos);

  // High Surrogate: Only valid if followed by Low Surrogate (Start of valid pair)
  if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
    if (pos + 1 >= text.length) {
      return false; // Orphan High at EOF
    }
    const nextCodeUnit = text.charCodeAt(pos + 1);
    // Return true ONLY if followed by Low (Complete Pair)
    return nextCodeUnit >= 0xdc00 && nextCodeUnit <= 0xdfff;
  }

  // Low Surrogate: Always invalid position.
  // - If preceded by High: It is the middle of a pair. Split is invalid.
  // - If NOT preceded by High: It is an orphaned Low. Invalid char.
  if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
    return false;
  }

  // Position is not part of a surrogate pair
  return true;
}

/**
 * Validates that a range does not split surrogate pairs.
 * @param text - The text content
 * @param start - Start position (inclusive)
 * @param end - End position (exclusive)
 * @returns Validation result with error details if invalid
 */
export function validateRange(
  text: string,
  start: number,
  end: number
): { valid: boolean; error?: string } {
  // Validate start position
  if (!isValidPosition(text, start)) {
    return {
      valid: false,
      error: "SURROGATE_PAIR_VIOLATION: start position splits surrogate pair",
    };
  }

  // Validate end position (end is exclusive, so it is the boundary AFTER the last character)
  // We must ensure that splitting at `end` is safe.
  if (!isValidPosition(text, end)) {
    return {
      valid: false,
      error: "SURROGATE_PAIR_VIOLATION: end position splits surrogate pair",
    };
  }

  // Check if range spans mid-pair
  if (start < end) {
    for (let i = start; i < end; i++) {
      const codeUnit = text.charCodeAt(i);
      if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
        // High surrogate: ensure pair is complete within range
        if (i + 1 >= end) {
          return {
            valid: false,
            error: "SURROGATE_PAIR_MID_RANGE: range splits surrogate pair",
          };
        }
      }
    }
  }

  return { valid: true };
}

/**
 * Finds the nearest safe position (not mid-surrogate-pair).
 * Moves forward if necessary to avoid splitting pairs.
 * @param text - The text content
 * @param pos - Desired position
 * @returns Safe position (may be adjusted forward)
 */
export function findSafePosition(text: string, pos: number): number {
  if (pos < 0) {
    return 0;
  }
  if (pos >= text.length) {
    return text.length;
  }

  const codeUnit = text.charCodeAt(pos);

  // If at a low surrogate, move to start of pair (backward)
  if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
    if (pos > 0) {
      const prevCodeUnit = text.charCodeAt(pos - 1);
      if (prevCodeUnit >= 0xd800 && prevCodeUnit <= 0xdbff) {
        return pos - 1; // Start of pair
      }
    }
    // Invalid: low surrogate without high surrogate
    // Move forward to next safe position
    return pos + 1;
  }

  // If at a high surrogate, ensure we're at start of pair
  if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
    return pos; // Start of pair is safe
  }

  return pos; // Not a surrogate, position is safe
}
