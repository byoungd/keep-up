# Concurrent Operations Handling — v0.9 RC

**Applies to:** LFCC v0.9 RC  
**Last updated:** 2025-01-01  
**Audience:** Editor engineers, bridge maintainers, CRDT engineers.  
**Source of truth:** LFCC v0.9 RC §4.1.1 (Concurrent Structural Operations)

---

## 0. Purpose

This guide specifies how to handle concurrent structural operations that target the same or overlapping blocks, ensuring deterministic ordering and conflict resolution.

---

## 1. Operation Ordering Rules

### 1.1 Deterministic Ordering

Operations MUST be ordered deterministically using the following tuple:

```
(order_key) = (block_id, operation_type_priority, logical_timestamp)
```

**Components:**
1. **block_id:** Lexicographic string ordering
2. **operation_type_priority:** Predefined numeric priority (lower = higher priority)
3. **logical_timestamp:** CRDT logical timestamp (Lamport timestamp or vector clock)

### 1.2 Operation Type Priorities

```typescript
const OPERATION_PRIORITIES: Record<string, number> = {
  OP_BLOCK_SPLIT: 1,        // Highest priority
  OP_BLOCK_JOIN: 2,
  OP_BLOCK_CONVERT: 3,
  OP_LIST_REPARENT: 4,
  OP_TABLE_STRUCT: 5,
  OP_REORDER: 6,
  OP_TEXT_EDIT: 7,          // Lowest priority (applied after structural)
  OP_MARK_EDIT: 7,
  OP_PASTE: 8,
  OP_IMMUTABLE_REWRITE: 9
};
```

**Rationale:** Structural operations that change block identity must be applied before text/mark edits to ensure BlockMapping correctness.

---

## 2. Conflict Detection

### 2.1 Conflict Types

#### Type 1: Direct Block Conflict
Two operations target the same block with incompatible changes.

**Examples:**
- Split block X AND join block X with Y
- Convert block X AND split block X
- Join block X with Y AND split block X

#### Type 2: Cascading Conflict
Operation A modifies block X, operation B targets block X (which no longer exists in original form).

**Examples:**
- Split block X → operation targeting original block X
- Join blocks X and Y → operation targeting block Y (now merged)

#### Type 3: Dependency Conflict
Operation A creates dependency for operation B, but ordering violates dependency.

**Example:**
- Operation 1: Split block X (creates X_left and X_right)
- Operation 2: Join X_left with Y (depends on Operation 1)
- If Operation 2 timestamp < Operation 1: conflict

### 2.2 Conflict Detection Algorithm

```typescript
interface Operation {
  opCode: string;
  blockId: string;
  timestamp: LogicalTimestamp;
  dependencies?: string[]; // Block IDs this operation depends on
}

function detectConflicts(
  operations: Operation[]
): Conflict[] {
  const conflicts: Conflict[] = [];
  const sortedOps = sortOperations(operations);
  
  // Track block state changes
  const blockStates = new Map<string, BlockState>();
  
  for (let i = 0; i < sortedOps.length; i++) {
    const op = sortedOps[i];
    
    // Check direct conflicts
    const state = blockStates.get(op.blockId);
    if (state && isIncompatible(state, op)) {
      conflicts.push({
        type: "direct",
        operations: [state.lastOp, op],
        blockId: op.blockId
      });
    }
    
    // Check dependency conflicts
    if (op.dependencies) {
      for (const depId of op.dependencies) {
        const depState = blockStates.get(depId);
        if (!depState || depState.lastOp.timestamp > op.timestamp) {
          conflicts.push({
            type: "dependency",
            operations: [depState?.lastOp, op],
            blockId: depId
          });
        }
      }
    }
    
    // Update block state
    updateBlockState(blockStates, op);
  }
  
  return conflicts;
}
```

---

## 3. Resolution Strategies

### 3.1 Fail-Closed (Default)

**Strategy:** Reject the later operation if it conflicts with an earlier one.

```typescript
function resolveConflictFailClosed(
  conflict: Conflict
): Resolution {
  // Operation with earlier timestamp wins
  const winner = conflict.operations[0].timestamp < conflict.operations[1].timestamp
    ? conflict.operations[0]
    : conflict.operations[1];
  
  const loser = conflict.operations.find(op => op !== winner)!;
  
  return {
    applied: [winner],
    rejected: [loser],
    reason: `Operation ${loser.opCode} conflicts with ${winner.opCode} on block ${conflict.blockId}`
  };
}
```

### 3.2 User Confirmation (Policy-Controlled)

**Strategy:** Present conflict to user for resolution.

```typescript
interface ConflictResolutionUI {
  conflict: Conflict;
  options: {
    applyFirst: () => void;
    applySecond: () => void;
    applyBoth: () => void; // If possible
    cancel: () => void;
  };
}

function resolveConflictUserConfirmation(
  conflict: Conflict
): Promise<Resolution> {
  return new Promise((resolve) => {
    showConflictDialog({
      conflict,
      onResolve: (choice) => {
        resolve(applyUserChoice(conflict, choice));
      }
    });
  });
}
```

### 3.3 Automatic Merge (Advanced)

**Strategy:** Attempt to merge operations if semantically compatible.

```typescript
function resolveConflictMerge(
  conflict: Conflict
): Resolution | null {
  // Only merge if operations are compatible
  if (canMerge(conflict.operations[0], conflict.operations[1])) {
    const merged = mergeOperations(conflict.operations);
    return {
      applied: [merged],
      rejected: [],
      reason: "Operations merged automatically"
    };
  }
  
  return null; // Cannot merge, fall back to fail-closed
}

function canMerge(op1: Operation, op2: Operation): boolean {
  // Example: Split and text edit can be merged
  if (op1.opCode === "OP_BLOCK_SPLIT" && op2.opCode === "OP_TEXT_EDIT") {
    // Text edit can be applied after split
    return true;
  }
  
  // Most structural operations cannot be merged
  return false;
}
```

---

## 4. BlockMapping with Concurrent Operations

### 4.1 Mapping Generation

When multiple structural operations affect the same block, BlockMapping MUST account for all operations in order.

```typescript
function generateBlockMapping(
  operations: Operation[],
  originalBlocks: Map<string, Block>
): BlockMapping {
  const sortedOps = sortOperations(operations);
  const mapping = new BlockMappingBuilder();
  
  // Apply operations in order, building mapping incrementally
  let currentBlocks = new Map(originalBlocks);
  
  for (const op of sortedOps) {
    const result = applyOperation(op, currentBlocks, mapping);
    currentBlocks = result.updatedBlocks;
    mapping.merge(result.mapping);
  }
  
  return mapping.build();
}
```

### 4.2 Cascading Updates

When a block is split or joined, operations targeting that block must be updated:

```typescript
function handleCascadingUpdates(
  structuralOp: Operation,
  pendingOps: Operation[]
): Operation[] {
  if (structuralOp.opCode === "OP_BLOCK_SPLIT") {
    // Update operations targeting the split block
    return pendingOps.map(op => {
      if (op.blockId === structuralOp.blockId) {
        // Determine which resulting block to target
        const targetBlock = determineTargetBlock(op, structuralOp);
        return {
          ...op,
          blockId: targetBlock,
          offset: adjustOffset(op.offset, structuralOp)
        };
      }
      return op;
    });
  }
  
  // Similar logic for joins, converts, etc.
  return pendingOps;
}
```

---

## 5. Implementation Examples

### 5.1 Split and Join Conflict

**Scenario:**
- Operation 1 (timestamp=10): Split block X at offset 50
- Operation 2 (timestamp=5): Join block X with block Y

**Resolution (fail-closed):**
1. Sort by timestamp: Operation 2 (5) < Operation 1 (10)
2. Apply Operation 2 first: Block X and Y are joined → new block Z
3. Operation 1 targets block X, which no longer exists
4. Reject Operation 1 with error: "Block X no longer exists (joined with Y)"

**Alternative (if merge possible):**
1. Apply Operation 2: Create block Z
2. Apply Operation 1 on block Z: Split Z at adjusted offset
3. Result: Two blocks (Z_left, Z_right)

### 5.2 Concurrent Splits

**Scenario:**
- Operation 1 (timestamp=10): Split block X at offset 30
- Operation 2 (timestamp=15): Split block X at offset 60

**Resolution:**
1. Sort: Operation 1 (10) < Operation 2 (15)
2. Apply Operation 1: X → X_left (0-30), X_right (30-end)
3. Operation 2 targets X, which no longer exists
4. Map Operation 2 to appropriate resulting block:
   - Offset 60 > 30, so target X_right
   - Adjust offset: 60 - 30 = 30
   - Apply: Split X_right at offset 30
5. Result: X_left, X_right_left, X_right_right

---

## 6. Test Cases

### 6.1 Unit Tests

```typescript
describe("Concurrent Operations", () => {
  test("sorts operations deterministically", () => {
    const ops = [
      { opCode: "OP_BLOCK_JOIN", blockId: "B", timestamp: 10 },
      { opCode: "OP_BLOCK_SPLIT", blockId: "A", timestamp: 15 },
      { opCode: "OP_BLOCK_SPLIT", blockId: "A", timestamp: 5 }
    ];
    
    const sorted = sortOperations(ops);
    expect(sorted[0].timestamp).toBe(5);
    expect(sorted[0].blockId).toBe("A");
  });
  
  test("detects direct conflicts", () => {
    const ops = [
      { opCode: "OP_BLOCK_SPLIT", blockId: "X", timestamp: 10 },
      { opCode: "OP_BLOCK_JOIN", blockId: "X", timestamp: 5 }
    ];
    
    const conflicts = detectConflicts(ops);
    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts[0].type).toBe("direct");
  });
  
  test("resolves conflicts fail-closed", () => {
    const conflict = createConflict();
    const resolution = resolveConflictFailClosed(conflict);
    expect(resolution.rejected.length).toBe(1);
  });
});
```

### 6.2 Integration Tests

```typescript
describe("Concurrent Operations Integration", () => {
  test("handles split and join conflict", async () => {
    // Setup: Create block X
    // Action: Apply split and join concurrently
    // Verify: One operation applied, one rejected
  });
  
  test("handles cascading updates", async () => {
    // Setup: Operation targeting block X
    // Action: Split block X first
    // Verify: Operation updated to target resulting block
  });
});
```

---

## 7. Performance Considerations

### 7.1 Operation Sorting

- Use efficient sorting algorithm (O(N log N))
- Cache sorted order if operations don't change
- Consider incremental sorting for streaming operations

### 7.2 Conflict Detection

- Early exit if no conflicts possible
- Use efficient data structures (hash maps for block lookups)
- Batch conflict detection for multiple operations

### 7.3 BlockMapping Generation

- Build mapping incrementally as operations are applied
- Cache intermediate mappings
- Reuse mappings for similar operation sequences

---

## 8. Implementation Checklist

- [ ] Implement operation sorting algorithm
- [ ] Implement conflict detection
- [ ] Implement fail-closed resolution
- [ ] Implement user confirmation flow (if required)
- [ ] Implement cascading update handling
- [ ] Add BlockMapping generation for concurrent ops
- [ ] Add logging and diagnostics
- [ ] Add unit tests
- [ ] Add integration tests
- [ ] Document error codes

---

## 9. References

- **LFCC Protocol:** §4.1.1 Concurrent Structural Operations
- **LFCC Protocol:** §7.2 BlockMapping Axioms
- **CRDT Theory:** Operational Transformation, Conflict-Free Replicated Data Types

---

**Document Version:** 1.0  
**Last Updated:** 2025-01-01

