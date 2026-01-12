/**
 * LFCC v0.9 RC - UTF-16 Surrogate Pair Validation (Core)
 * @see docs/product/LFCC_v0.9_RC_Engineering_Docs/12_UTF16_Surrogate_Pair_Handling.md
 *
 * Core implementation to avoid circular dependencies.
 * Bridge package has a more complete implementation.
 */

/**
 * Validates that a position is not within a surrogate pair.
 */
export function isValidPosition(text: string, pos: number): boolean {
  if (pos < 0 || pos > text.length) {
    return false;
  }

  const codeUnit = text.charCodeAt(pos);

  // High Surrogate: Only valid if followed by Low Surrogate (Start of valid pair)
  if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
    if (pos + 1 >= text.length) {
      return false; // Orphan High at EOF
    }
    const nextCodeUnit = text.charCodeAt(pos + 1);
    return nextCodeUnit >= 0xdc00 && nextCodeUnit <= 0xdfff;
  }

  // Low Surrogate: Always invalid position
  if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
    return false;
  }

  return true;
}

/**
 * Validates that a range does not split surrogate pairs.
 */
export function validateRange(
  text: string,
  start: number,
  end: number
): { valid: boolean; error?: string } {
  if (!isValidPosition(text, start)) {
    return {
      valid: false,
      error: "SURROGATE_PAIR_VIOLATION: start position splits surrogate pair",
    };
  }

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
