# UTF-16 Surrogate Pair Handling Guide — v0.9 RC

**Applies to:** LFCC v0.9 RC  
**Last updated:** 2025-01-01  
**Audience:** Editor engineers, bridge maintainers, platform architects.  
**Source of truth:** LFCC v0.9 RC §1.1 (Canonical Coordinates, INV-COORD-002, INV-COORD-003)

---

## 0. Purpose

This guide provides detailed implementation guidance for handling UTF-16 surrogate pairs in LFCC operations, ensuring fail-closed behavior and preventing data corruption.

---

## 1. UTF-16 Surrogate Pair Basics

### 1.1 What Are Surrogate Pairs?

UTF-16 uses 16-bit code units. Characters in the Basic Multilingual Plane (U+0000 to U+FFFF) are represented by a single code unit. Characters outside this range (U+10000 to U+10FFFF) require two code units called a "surrogate pair":

- **High surrogate:** U+D800 to U+DBFF (0xD800-0xDBFF)
- **Low surrogate:** U+DC00 to U+DFFF (0xDC00-0xDFFF)
- **Valid pair:** A high surrogate immediately followed by a low surrogate (exactly 2 code units)

### 1.2 Why This Matters for LFCC

LFCC uses UTF-16 code unit indices for all positions. If an operation attempts to:
- Insert text at position 5, but position 5 is the second unit of a surrogate pair
- Delete a range that starts in the middle of a surrogate pair
- Create an annotation spanning only one unit of a surrogate pair

The result would be invalid UTF-16, potentially corrupting the document or causing rendering issues.

---

## 2. Detection Algorithm (Normative)

### 2.1 Single Position Validation

```typescript
/**
 * Validates that a position is not within a surrogate pair.
 * @param text - The text content (as UTF-16 code units)
 * @param pos - The position to validate (UTF-16 code unit index)
 * @returns true if position is valid, false if it would split a surrogate pair
 */
function isValidPosition(text: string, pos: number): boolean {
  if (pos < 0 || pos > text.length) return false;
  
  // Check if position is at a high surrogate
  const codeUnit = text.charCodeAt(pos);
  if (codeUnit >= 0xD800 && codeUnit <= 0xDBFF) {
    // Must be followed by a low surrogate
    if (pos + 1 >= text.length) return false;
    const nextCodeUnit = text.charCodeAt(pos + 1);
    return nextCodeUnit >= 0xDC00 && nextCodeUnit <= 0xDFFF;
  }
  
  // Check if position is at a low surrogate
  if (codeUnit >= 0xDC00 && codeUnit <= 0xDFFF) {
    // Must be preceded by a high surrogate
    if (pos === 0) return false;
    const prevCodeUnit = text.charCodeAt(pos - 1);
    return prevCodeUnit >= 0xD800 && prevCodeUnit <= 0xDBFF;
  }
  
  // Position is not part of a surrogate pair
  return true;
}
```

### 2.2 Range Validation

```typescript
/**
 * Validates that a range does not split surrogate pairs.
 * @param text - The text content
 * @param start - Start position (inclusive)
 * @param end - End position (exclusive)
 * @returns Validation result with error details if invalid
 */
function validateRange(
  text: string,
  start: number,
  end: number
): { valid: boolean; error?: string } {
  // Validate start position
  if (!isValidPosition(text, start)) {
    return {
      valid: false,
      error: "SURROGATE_PAIR_VIOLATION: start position splits surrogate pair"
    };
  }
  
  // Validate end position (end is exclusive, so check position before end)
  if (end > 0 && !isValidPosition(text, end - 1)) {
    return {
      valid: false,
      error: "SURROGATE_PAIR_VIOLATION: end position splits surrogate pair"
    };
  }
  
  // Check if range spans mid-pair
  if (start < end) {
    for (let i = start; i < end; i++) {
      const codeUnit = text.charCodeAt(i);
      if (codeUnit >= 0xD800 && codeUnit <= 0xDBFF) {
        // High surrogate: ensure pair is complete within range
        if (i + 1 >= end) {
          return {
            valid: false,
            error: "SURROGATE_PAIR_MID_RANGE: range splits surrogate pair"
          };
        }
      }
    }
  }
  
  return { valid: true };
}
```

### 2.3 Helper: Find Safe Position

```typescript
/**
 * Finds the nearest safe position (not mid-surrogate-pair).
 * Moves forward if necessary to avoid splitting pairs.
 * @param text - The text content
 * @param pos - Desired position
 * @returns Safe position (may be adjusted forward)
 */
function findSafePosition(text: string, pos: number): number {
  if (pos < 0) return 0;
  if (pos >= text.length) return text.length;
  
  const codeUnit = text.charCodeAt(pos);
  
  // If at a low surrogate, move to start of pair (backward)
  if (codeUnit >= 0xDC00 && codeUnit <= 0xDFFF) {
    if (pos > 0) {
      const prevCodeUnit = text.charCodeAt(pos - 1);
      if (prevCodeUnit >= 0xD800 && prevCodeUnit <= 0xDBFF) {
        return pos - 1; // Start of pair
      }
    }
    // Invalid: low surrogate without high surrogate
    // Move forward to next safe position
    return pos + 1;
  }
  
  // If at a high surrogate, ensure we're at start of pair
  if (codeUnit >= 0xD800 && codeUnit <= 0xDBFF) {
    return pos; // Start of pair is safe
  }
  
  return pos; // Not a surrogate, position is safe
}
```

---

## 3. Fail-Closed Behavior by Operation Type

### 3.1 Text Edits

**Operation:** `OP_TEXT_EDIT` (insert, delete, replace)

**Behavior:**
1. Validate start and end positions before operation
2. If validation fails:
   - Reject the operation
   - Preserve document state (no mutation)
   - Return error: `SURROGATE_PAIR_VIOLATION`
   - Log diagnostic with position and code unit values

**Example:**
```typescript
function applyTextEdit(
  block: Block,
  offset: number,
  deleteCount: number,
  insert: string
): Result<Block, Error> {
  const validation = validateRange(block.text, offset, offset + deleteCount);
  if (!validation.valid) {
    return {
      ok: false,
      error: {
        code: "SURROGATE_PAIR_VIOLATION",
        message: validation.error,
        position: offset,
        blockId: block.block_id
      }
    };
  }
  
  // Proceed with edit...
}
```

### 3.2 Annotation Operations

**Operation:** Creating or updating annotation spans

**Behavior:**
1. Validate span start and end positions
2. If validation fails:
   - Mark annotation as `orphan` (stored state)
   - Preserve document integrity
   - Log diagnostic
   - Do NOT create/update the annotation

**Example:**
```typescript
function createAnnotationSpan(
  blockId: string,
  start: number,
  end: number,
  text: string
): Result<Span, Error> {
  const validation = validateRange(text, start, end);
  if (!validation.valid) {
    return {
      ok: false,
      error: {
        code: "SURROGATE_PAIR_VIOLATION",
        message: "Cannot create annotation: span splits surrogate pair",
        span: { blockId, start, end }
      }
    };
  }
  
  // Create span...
}
```

### 3.3 Anchor Resolution

**Operation:** `absoluteFromAnchor(anchor)`

**Behavior:**
1. Resolve anchor to absolute position
2. Validate resolved position
3. If validation fails:
   - Return `null` or `unresolved`
   - Trigger verification checkpoint
   - Mark annotation as `active_unverified` (display state)

**Example:**
```typescript
function resolveAnchor(
  anchor: Anchor,
  block: Block
): number | null {
  const pos = decodeAnchor(anchor);
  if (!isValidPosition(block.text, pos)) {
    // Trigger verification checkpoint
    scheduleVerification(anchor.annotationId);
    return null;
  }
  return pos;
}
```

### 3.4 BlockMapping

**Operation:** Mapping positions during structural operations

**Behavior:**
1. When mapping positions, validate both old and new positions
2. If validation fails for any position:
   - Return `null` for affected positions
   - Preserve document integrity
   - Log diagnostic

**Example:**
```typescript
function mapPosition(
  mapping: BlockMapping,
  oldBlockId: string,
  oldPos: number,
  oldBlockText: string
): { newBlockId: string; newPos: number } | null {
  if (!isValidPosition(oldBlockText, oldPos)) {
    return null; // Cannot map invalid position
  }
  
  const mapped = mapping.mapOldToNew(oldBlockId, oldPos);
  if (!mapped) return null;
  
  // Validate new position
  const newBlockText = getBlockText(mapped.newBlockId);
  if (!isValidPosition(newBlockText, mapped.newAbsInBlock)) {
    return null; // Mapped position is invalid
  }
  
  return mapped;
}
```

---

## 4. Error Codes and Diagnostics

### 4.1 Error Codes

| Code | Meaning | Recovery |
|------|---------|----------|
| `SURROGATE_PAIR_VIOLATION` | Operation attempted at invalid surrogate pair boundary | Reject operation, preserve state |
| `SURROGATE_PAIR_INVALID` | Detected invalid surrogate pair sequence (orphaned surrogate) | Mark as orphan, trigger verification |
| `SURROGATE_PAIR_MID_RANGE` | Range operation spans mid-pair boundary | Reject operation, suggest safe range |

### 4.2 Diagnostic Information

When a surrogate pair violation occurs, implementations MUST log:

```typescript
interface SurrogatePairDiagnostic {
  code: string;
  position: number;
  codeUnit: number; // The problematic code unit value
  blockId: string;
  operation: string; // Operation type
  context: {
    surroundingText?: string; // Text around position (for debugging)
    pairStatus?: "high" | "low" | "complete" | "orphaned";
  };
}
```

---

## 5. Test Cases

### 5.1 Basic Validation Tests

```typescript
describe("Surrogate Pair Validation", () => {
  test("validates position at start of surrogate pair", () => {
    const text = "Hello \uD83D\uDE00 World"; // "Hello 😀 World"
    // Position 6 is start of high surrogate
    expect(isValidPosition(text, 6)).toBe(true);
  });
  
  test("rejects position at middle of surrogate pair", () => {
    const text = "Hello \uD83D\uDE00 World";
    // Position 7 is low surrogate (second unit of pair)
    expect(isValidPosition(text, 7)).toBe(false);
  });
  
  test("validates range that includes complete surrogate pair", () => {
    const text = "Hello \uD83D\uDE00 World";
    // Range [6, 8) includes complete pair
    expect(validateRange(text, 6, 8).valid).toBe(true);
  });
  
  test("rejects range that splits surrogate pair", () => {
    const text = "Hello \uD83D\uDE00 World";
    // Range [6, 7) splits the pair
    expect(validateRange(text, 6, 7).valid).toBe(false);
  });
});
```

### 5.2 Edge Cases

```typescript
describe("Surrogate Pair Edge Cases", () => {
  test("handles orphaned high surrogate", () => {
    const text = "Hello \uD83D"; // High surrogate without low
    expect(isValidPosition(text, 6)).toBe(false);
  });
  
  test("handles orphaned low surrogate", () => {
    const text = "Hello \uDE00"; // Low surrogate without high
    expect(isValidPosition(text, 6)).toBe(false);
  });
  
  test("handles empty text", () => {
    expect(isValidPosition("", 0)).toBe(true);
  });
  
  test("handles text with only surrogate pairs", () => {
    const text = "\uD83D\uDE00\uD83D\uDE01"; // Two emoji
    expect(validateRange(text, 0, 4).valid).toBe(true);
  });
});
```

### 5.3 Integration Tests

```typescript
describe("Surrogate Pair in Operations", () => {
  test("text edit rejects operation at mid-pair", () => {
    const block = createBlock("Hello \uD83D\uDE00 World");
    const result = applyTextEdit(block, 7, 0, "X");
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe("SURROGATE_PAIR_VIOLATION");
  });
  
  test("annotation creation rejects span splitting pair", () => {
    const block = createBlock("Hello \uD83D\uDE00 World");
    const result = createAnnotationSpan(block.block_id, 6, 7, block.text);
    expect(result.ok).toBe(false);
  });
});
```

---

## 6. Implementation Checklist

- [ ] Implement `isValidPosition()` function
- [ ] Implement `validateRange()` function
- [ ] Add validation to all text edit operations
- [ ] Add validation to annotation creation/update
- [ ] Add validation to anchor resolution
- [ ] Add validation to BlockMapping operations
- [ ] Implement error codes and diagnostics
- [ ] Add unit tests for validation functions
- [ ] Add integration tests for each operation type
- [ ] Add edge case tests (orphaned surrogates, empty text, etc.)
- [ ] Document error handling in user-facing messages (if applicable)

---

## 7. References

- **Unicode Standard:** Chapter 3, Conformance (Surrogate Pairs)
- **LFCC Protocol:** §1.1 Canonical Coordinates (INV-COORD-002, INV-COORD-003)
- **LFCC Protocol:** §12 Compatibility Degradation (error handling)

---

**Document Version:** 1.0  
**Last Updated:** 2025-01-01

