# BlockMapping Verification Guide — v0.9 RC

**Applies to:** LFCC v0.9 RC  
**Last updated:** 2025-01-01  
**Audience:** Editor engineers, bridge maintainers, QA engineers.  
**Source of truth:** LFCC v0.9 RC §7.2 (BlockMapping Axioms)

---

## 0. Purpose

This guide provides detailed procedures for verifying BlockMapping correctness, including axiom verification, property-based testing, and performance optimization.

---

## 1. BlockMapping Axioms (Recap)

### 1.1 The Four Axioms

1. **Determinism:** Same operation + same document state → same mapping result
2. **Locality:** Mappings are local (no heuristic jumps to distant positions)
3. **Monotonicity:** If posA < posB in old block, then mapped(posA) ≤ mapped(posB)
4. **Coverage:** All positions in affected blocks have valid mappings (for KEEP-ID edits)

**Deletion semantics (RISK-002):** Negative deltas represent deletion intervals in old coordinates.
Positions inside a deleted interval map to `null`. Monotonicity and coverage checks apply to
surviving positions only (ignore `null` results).

---

## 2. Axiom Verification Procedures

### 2.1 Determinism Verification

**Test Strategy:** Run same operation multiple times, verify identical results.

```typescript
function verifyDeterminism(
  operation: Operation,
  document: Document,
  iterations: number = 100
): boolean {
  const results: BlockMapping[] = [];
  
  for (let i = 0; i < iterations; i++) {
    const mapping = generateBlockMapping(operation, document);
    results.push(mapping);
  }
  
  // All results must be identical
  const first = results[0];
  return results.every(m => mappingsEqual(m, first));
}

function mappingsEqual(a: BlockMapping, b: BlockMapping): boolean {
  // Compare all position mappings
  for (const [oldBlockId, oldPos] of getAllPositions(a)) {
    const mappedA = a.mapOldToNew(oldBlockId, oldPos);
    const mappedB = b.mapOldToNew(oldBlockId, oldPos);
    if (!equal(mappedA, mappedB)) return false;
  }
  return true;
}
```

### 2.2 Locality Verification

**Test Strategy:** Verify that mapped positions are near original positions.

```typescript
function verifyLocality(
  mapping: BlockMapping,
  oldBlock: Block,
  newBlock: Block
): boolean {
  const MAX_DISTANCE = oldBlock.text.length + newBlock.text.length;
  
  for (let pos = 0; pos < oldBlock.text.length; pos++) {
    const mapped = mapping.mapOldToNew(oldBlock.block_id, pos);
    if (!mapped) continue;
    
    // Calculate expected distance
    const expectedDistance = Math.abs(mapped.newAbsInBlock - pos);
    
    // For text edits, distance should be small
    // For structural ops, distance may be larger but bounded
    if (expectedDistance > MAX_DISTANCE) {
      return false; // Violates locality
    }
  }
  
  return true;
}
```

### 2.3 Monotonicity Verification

**Test Strategy:** Test all position pairs in old block.

```typescript
function verifyMonotonicity(
  mapping: BlockMapping,
  oldBlockId: string
): boolean {
  const oldBlock = getBlock(oldBlockId);
  
  for (let posA = 0; posA < oldBlock.text.length; posA++) {
    for (let posB = posA + 1; posB < oldBlock.text.length; posB++) {
      const mappedA = mapping.mapOldToNew(oldBlockId, posA);
      const mappedB = mapping.mapOldToNew(oldBlockId, posB);
      
      if (!mappedA || !mappedB) continue;
      
      // Monotonicity: mappedA ≤ mappedB
      if (mappedA.newAbsInBlock > mappedB.newAbsInBlock) {
        return false; // Violates monotonicity
      }
    }
  }
  
  return true;
}
```

### 2.4 Coverage Verification

**Test Strategy:** Verify all positions have mappings for KEEP-ID edits.

```typescript
function verifyCoverage(
  mapping: BlockMapping,
  operation: Operation,
  oldBlock: Block
): boolean {
  // Coverage required for KEEP-ID edits
  if (!isKeepIdEdit(operation)) {
    return true; // Coverage not required
  }
  
  // All surviving positions must have mappings
  for (let pos = 0; pos < oldBlock.text.length; pos++) {
    const mapped = mapping.mapOldToNew(oldBlock.block_id, pos);
    if (!mapped) {
      return false; // Missing mapping
    }
  }
  
  return true;
}
```

---

## 3. Property-Based Testing

### 3.1 Using Property-Based Testing Framework

**Framework:** Use a property-based testing library (e.g., fast-check, jsverify).

```typescript
import * as fc from 'fast-check';

describe("BlockMapping Properties", () => {
  test("determinism property", () => {
    fc.assert(
      fc.property(
        arbitraryOperation(),
        arbitraryDocument(),
        (op, doc) => {
          const mapping1 = generateBlockMapping(op, doc);
          const mapping2 = generateBlockMapping(op, doc);
          return mappingsEqual(mapping1, mapping2);
        }
      )
    );
  });
  
  test("monotonicity property", () => {
    fc.assert(
      fc.property(
        arbitraryOperation(),
        arbitraryDocument(),
        (op, doc) => {
          const mapping = generateBlockMapping(op, doc);
          return verifyMonotonicity(mapping, op.blockId);
        }
      )
    );
  });
  
  test("coverage property for KEEP-ID edits", () => {
    fc.assert(
      fc.property(
        arbitraryKeepIdOperation(),
        arbitraryDocument(),
        (op, doc) => {
          const mapping = generateBlockMapping(op, doc);
          return verifyCoverage(mapping, op, getBlock(op.blockId));
        }
      )
    );
  });
});
```

### 3.2 Arbitrary Generators

```typescript
function arbitraryOperation(): fc.Arbitrary<Operation> {
  return fc.oneof(
    arbitraryTextEdit(),
    arbitraryBlockSplit(),
    arbitraryBlockJoin(),
    arbitraryBlockConvert()
  );
}

function arbitraryTextEdit(): fc.Arbitrary<Operation> {
  return fc.record({
    opCode: fc.constant("OP_TEXT_EDIT"),
    blockId: fc.string({ minLength: 1, maxLength: 36 }),
    offset: fc.nat(),
    deleteCount: fc.nat(),
    insert: fc.string()
  });
}

function arbitraryBlockSplit(): fc.Arbitrary<Operation> {
  return fc.record({
    opCode: fc.constant("OP_BLOCK_SPLIT"),
    blockId: fc.string({ minLength: 1, maxLength: 36 }),
    splitOffset: fc.nat()
  });
}
```

---

## 4. Operation-Specific Verification

### 4.1 Split Operation

**Expected Behavior:**
- Left block: positions [0, splitOffset) map to [0, splitOffset)
- Right block: positions [splitOffset, length) map to [0, length-splitOffset)

```typescript
function verifySplitMapping(
  mapping: BlockMapping,
  oldBlock: Block,
  splitOffset: number
): boolean {
  const leftBlockId = oldBlock.block_id; // KEEP-ID
  const rightBlockId = mapping.derivedBlocksFrom(oldBlock.block_id)[0];
  
  // Verify left block mapping
  for (let pos = 0; pos < splitOffset; pos++) {
    const mapped = mapping.mapOldToNew(oldBlock.block_id, pos);
    if (!mapped || mapped.newBlockId !== leftBlockId || mapped.newAbsInBlock !== pos) {
      return false;
    }
  }
  
  // Verify right block mapping
  for (let pos = splitOffset; pos < oldBlock.text.length; pos++) {
    const mapped = mapping.mapOldToNew(oldBlock.block_id, pos);
    if (!mapped || mapped.newBlockId !== rightBlockId || 
        mapped.newAbsInBlock !== pos - splitOffset) {
      return false;
    }
  }
  
  return true;
}
```

### 4.2 Join Operation

**Expected Behavior:**
- Result block: left block positions preserved, right block positions offset

```typescript
function verifyJoinMapping(
  mapping: BlockMapping,
  leftBlock: Block,
  rightBlock: Block
): boolean {
  const resultBlockId = leftBlock.block_id; // KEEP-ID (left)
  
  // Verify left block positions
  for (let pos = 0; pos < leftBlock.text.length; pos++) {
    const mapped = mapping.mapOldToNew(leftBlock.block_id, pos);
    if (!mapped || mapped.newBlockId !== resultBlockId || mapped.newAbsInBlock !== pos) {
      return false;
    }
  }
  
  // Verify right block positions (offset by left length)
  for (let pos = 0; pos < rightBlock.text.length; pos++) {
    const mapped = mapping.mapOldToNew(rightBlock.block_id, pos);
    if (!mapped || mapped.newBlockId !== resultBlockId || 
        mapped.newAbsInBlock !== leftBlock.text.length + pos) {
      return false;
    }
  }
  
  return true;
}
```

---

## 5. Performance Benchmarks

### 5.1 Benchmark Requirements

**Target Performance:**
- Mapping generation: O(N) where N = number of affected blocks
- Single position lookup: O(1) average case
- Full mapping generation for 10k-block document: <10ms

**Measurement Guidance:**
- Warm up before timing to avoid JIT noise.
- Use multiple iterations and assert on median + p95 for CI stability.
- If CI hardware cannot meet <10ms median, move the perf gate to nightly/manual
  with explicit justification in the change log.

### 5.2 Benchmark Implementation

```typescript
describe("BlockMapping Performance", () => {
  test("mapping generation is O(N)", () => {
    const sizes = [10, 100, 1000, 10000];
    const times: number[] = [];
    
    for (const size of sizes) {
      const doc = createDocument(size);
      const op = createOperation(doc);
      
      const start = performance.now();
      generateBlockMapping(op, doc);
      const end = performance.now();
      
      times.push(end - start);
    }
    
    // Verify linear scaling (within tolerance)
    const ratios = times.slice(1).map((t, i) => t / times[i]);
    const avgRatio = ratios.reduce((a, b) => a + b) / ratios.length;
    expect(avgRatio).toBeCloseTo(sizes[1] / sizes[0], 1);
  });
  
  test("meets performance target for large documents", () => {
    const doc = createDocument(10000);
    const op = createOperation(doc);
    
    const start = performance.now();
    generateBlockMapping(op, doc);
    const end = performance.now();
    
    expect(end - start).toBeLessThan(10); // <10ms
  });
});
```

---

## 6. Edge Case Handling

### 6.1 Empty Blocks

```typescript
test("handles empty blocks", () => {
  const emptyBlock = createBlock("");
  const op = createSplitOperation(emptyBlock, 0);
  const mapping = generateBlockMapping(op, createDocument([emptyBlock]));
  
  // Empty block split should create two empty blocks
  expect(mapping.derivedBlocksFrom(emptyBlock.block_id).length).toBe(2);
});
```

### 6.2 Single-Character Blocks

```typescript
test("handles single-character blocks", () => {
  const singleCharBlock = createBlock("A");
  const op = createSplitOperation(singleCharBlock, 1);
  const mapping = generateBlockMapping(op, createDocument([singleCharBlock]));
  
  // Split at end: left block has char, right block is empty
  const mapped = mapping.mapOldToNew(singleCharBlock.block_id, 0);
  expect(mapped?.newAbsInBlock).toBe(0);
});
```

### 6.3 Maximum Block Size

```typescript
test("handles maximum block size", () => {
  const MAX_BLOCK_SIZE = 1000000; // 1MB
  const largeBlock = createBlock("A".repeat(MAX_BLOCK_SIZE));
  const op = createTextEdit(largeBlock, MAX_BLOCK_SIZE / 2, 0, "X");
  
  const start = performance.now();
  const mapping = generateBlockMapping(op, createDocument([largeBlock]));
  const end = performance.now();
  
  // Should complete in reasonable time
  expect(end - start).toBeLessThan(100); // <100ms
  expect(mapping).toBeDefined();
});
```

---

## 7. Implementation Checklist

- [ ] Implement determinism verification
- [ ] Implement locality verification
- [ ] Implement monotonicity verification
- [ ] Implement coverage verification
- [ ] Set up property-based testing framework
- [ ] Create arbitrary generators for operations
- [ ] Add operation-specific verification
- [ ] Implement performance benchmarks
- [ ] Add edge case tests
- [ ] Document verification procedures

---

## 8. References

- **LFCC Protocol:** §7.2 BlockMapping Axioms
- **LFCC Protocol:** §7.1 BlockMapping Interface
- **Property-Based Testing:** fast-check, jsverify documentation

---

**Document Version:** 1.0  
**Last Updated:** 2025-01-01
