# Edge Cases and Boundary Conditions — v0.9 RC

**Applies to:** LFCC v0.9 RC  
**Last updated:** 2025-01-01  
**Audience:** Editor engineers, bridge maintainers, QA engineers.  
**Source of truth:** LFCC v0.9 RC (various sections)

---

## 0. Purpose

This document specifies handling of edge cases and boundary conditions that may not be explicitly covered in the main protocol specification.

---

## 1. Empty Documents

### 1.1 Empty Document Definition

An empty document has:
- No blocks, OR
- A single empty block (text length = 0)

### 1.2 Canonical Form

**REQUIRED:** Empty documents MUST canonicalize to a single empty paragraph block.

```typescript
function canonicalizeEmptyDocument(): CanonBlock {
  return {
    id: "root",
    type: "paragraph",
    attrs: {},
    children: [
      {
        is_leaf: true,
        text: "",
        marks: []
      }
    ]
  };
}
```

### 1.3 Operations on Empty Documents

- **Text insert:** Creates content in the empty block
- **Block operations:** May create additional blocks
- **Annotations:** Cannot be created (no content to annotate)

---

## 2. Single-Character Documents

### 2.1 Handling

Single-character documents are valid and should be handled normally.

**Special Considerations:**
- Block split at position 0: Creates empty left block + single-char right block
- Block split at position 1: Creates single-char left block + empty right block
- Annotation spans: Must span exactly the character (start=0, end=1)

---

## 3. Zero-Length Spans

### 3.1 Definition

A zero-length span has `start == end` (no content selected).

### 3.2 Policy-Controlled Behavior

**Option 1: Reject (Default)**
- Zero-length spans are rejected during annotation creation
- Error: `ZERO_LENGTH_SPAN`

**Option 2: Point Annotations (Policy-Controlled)**
- If `relocation_policy.allow_point_annotations = true`:
  - Zero-length spans are allowed
  - Treated as "point annotations" (cursor position)
  - Displayed as a marker/indicator, not a highlight

### 3.3 Implementation

```typescript
function validateSpan(start: number, end: number): Result<void, Error> {
  if (start === end) {
    if (policy.allow_point_annotations) {
      return { ok: true };
    } else {
      return {
        ok: false,
        error: {
          code: "ZERO_LENGTH_SPAN",
          message: "Zero-length spans are not allowed"
        }
      };
    }
  }
  return { ok: true };
}
```

---

## 4. Whitespace-Only Blocks

### 4.1 Normalization Rules

Whitespace-only blocks are normalized according to `canonicalizer_policy.normalize_whitespace`:

- **If `normalize_whitespace = true`:**
  - Collapse multiple spaces to single space
  - Normalize line breaks to `\n`
  - Trim leading/trailing whitespace (policy-controlled)

- **If `normalize_whitespace = false`:**
  - Preserve whitespace exactly as stored

### 4.2 Empty After Normalization

If normalization results in empty text:
- Block becomes empty block
- Handled according to empty block rules
- Annotations on whitespace may become orphaned

---

## 5. Maximum Document Size Limits

### 5.1 Recommended Limits

**Block Count:**
- Maximum: 1,000,000 blocks per document
- Warning threshold: 100,000 blocks

**Block Size:**
- Maximum: 10,000,000 UTF-16 code units per block (~10MB)
- Warning threshold: 1,000,000 code units

**Total Document Size:**
- Maximum: 100,000,000 UTF-16 code units (~100MB)
- Warning threshold: 10,000,000 code units

### 5.2 Handling Exceeded Limits

**When limit exceeded:**
- Reject operation with error: `DOCUMENT_SIZE_EXCEEDED`
- Preserve document state
- Log warning
- Notify user

---

## 6. Deep Nesting Limits

### 6.1 Nesting Depth

**Maximum nesting depth:** 100 levels

**Examples:**
- Lists: 100 levels of nested lists
- Tables: 100 levels of nested tables (table in cell in table...)
- Quotes: 100 levels of nested quotes

### 6.2 Handling Exceeded Depth

**When depth exceeded:**
- Reject operation with error: `NESTING_DEPTH_EXCEEDED`
- Preserve document state
- Log warning

---

## 7. Very Long Text Operations

### 7.1 Large Inserts

**Handling:**
- No explicit limit on insert size
- Performance may degrade for very large inserts (>1MB)
- Consider chunking for very large pastes

### 7.2 Large Deletes

**Handling:**
- No explicit limit on delete size
- Performance considerations apply
- BlockMapping must handle large ranges efficiently

---

## 8. Concurrent Edge Cases

### 8.1 Rapid Sequential Operations

**Scenario:** Many operations applied in quick succession.

**Handling:**
- Operations must be applied in deterministic order
- BlockMapping must account for all pending operations
- Performance: Batch operations when possible

### 8.2 Operations on Deleted Blocks

**Scenario:** Operation targets a block that was just deleted.

**Handling:**
- Operation is rejected
- Error: `BLOCK_NOT_FOUND`
- Preserve document state

---

## 9. Annotation Edge Cases

### 9.1 Annotation on Empty Block

**Behavior:**
- Annotation cannot be created (no content)
- If block becomes empty after annotation creation, annotation becomes `orphan`

### 9.2 Annotation Spanning Entire Document

**Behavior:**
- Valid if document has content
- Chain policy must be satisfied
- Performance: May be expensive to verify

### 9.3 Annotation on Single Character

**Behavior:**
- Valid span: start=0, end=1
- Must satisfy chain policy
- Normal annotation handling applies

---

## 10. Implementation Checklist

- [ ] Handle empty documents
- [ ] Handle single-character documents
- [ ] Implement zero-length span policy
- [ ] Implement whitespace normalization
- [ ] Add document size limits
- [ ] Add nesting depth limits
- [ ] Handle large text operations
- [ ] Handle concurrent edge cases
- [ ] Handle annotation edge cases
- [ ] Add tests for all edge cases

---

## 11. Test Cases

```typescript
describe("Edge Cases", () => {
  test("empty document canonicalization", () => {
    const empty = createEmptyDocument();
    const canon = canonicalize(empty);
    expect(canon.type).toBe("paragraph");
    expect(canon.children[0].text).toBe("");
  });
  
  test("zero-length span rejection", () => {
    const result = createAnnotation(blockId, 5, 5);
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe("ZERO_LENGTH_SPAN");
  });
  
  test("maximum block size", () => {
    const largeBlock = createBlock("A".repeat(10000000));
    // Should be accepted
    expect(largeBlock.text.length).toBe(10000000);
  });
  
  test("exceeded block size limit", () => {
    const tooLarge = createBlock("A".repeat(10000001));
    const result = validateBlock(tooLarge);
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe("DOCUMENT_SIZE_EXCEEDED");
  });
});
```

---

## 12. References

- **LFCC Protocol:** §8 Canonicalizer Spec v2
- **LFCC Protocol:** §3 Core Data Model
- **LFCC Protocol:** §7 BlockMapping

---

**Document Version:** 1.0  
**Last Updated:** 2025-01-01

