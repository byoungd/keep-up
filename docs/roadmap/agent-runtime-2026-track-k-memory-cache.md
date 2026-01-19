# Track K: Memory Store Cache Layer

**Owner**: Runtime Dev
**Status**: Proposed
**Date**: 2026-01-19
**Timeline**: Week 3

## Objective
Accelerate memory retrieval operations (RAG) by implementing a multi-level caching layer for semantic and text queries.

## Problem Analysis
- **Latency**: `semanticSearch` involves embedding generation (HTTP call) and vector similarity calculation (CPU).
- **Repetition**: Agents frequently ask similar questions (e.g., "who am I?", "what is the goal?") across turns.

## Tasks

### Phase 1: Layered Caching Design
- [ ] Design `CachedMemoryStore` wrapper implementing `IMemoryStore`.
- [ ] Define L1 Cache: Exact Query (Text/Filter -> Result IDs).
- [ ] Define L2 Cache: Embedding Cache (Text Content -> Vector).

### Phase 2: Implementation
- [ ] Implement `CachedMemoryStore`.
- [ ] Integrate shared `LRUCache` (from Track I).
- [ ] Implement "Cache-Aside" logic for embedding requests.

### Phase 3: Invalidation
- [ ] Implement invalidation hook: On `add/update/delete` in underlying store, clear relevant L1 keys.
- [ ] Option: Use short TTL (e.g., 5s) for L1 if perfect invalidation is too complex.

## Deliverables
- [ ] `CachedMemoryStore` wrapper.
- [ ] Unit tests for caching behavior (hits/misses/invalidation).

## Technical Context

### Architecture: Decorator Pattern
We should not modify `InMemoryStore` directly to add caching. Instead, wrap it.

```typescript
// memory/cachedMemoryStore.ts
export class CachedMemoryStore implements IMemoryStore {
  constructor(
    private inner: IMemoryStore,
    private cache: ICacheStrategy<string, Memory[]> // L1 Cache
  ) {}

  async search(query: string, options?: ...): Promise<Memory[]> {
    const key = hash(query, options);
    if (this.cache.has(key)) return this.cache.get(key);
    
    const result = await this.inner.search(query, options);
    this.cache.set(key, result);
    return result;
  }
  
  async add(memory: Memory): Promise<string> {
    // Invalidation strategy:
    // Simple: this.cache.clear() (Correctness > Performance initially)
    // Advanced: Invalidate only relevant keys (Hard to know which queries match this new memory)
    this.cache.clear(); 
    return this.inner.add(memory);
  }
}
```

### L2 Embedding Cache
- **Location**: `memory/embeddingCache.ts`
- **Key**: Hash of text content.
- **Value**: `number[]` (Vector).
- **Persistence**: This cache should ideally be persistent (unlike L1) because embeddings are expensive to compute.

## Verification
- **Test**: `packages/agent-runtime/src/memory/__tests__/cachedStore.test.ts`
- **Scenario**:
    1. Run `search("test")` -> Measure time (Expect >100ms for fake embedding).
    2. Run `search("test")` again -> Measure time (Expect <1ms).
    3. `add(newMemory)`.
    4. Run `search("test")` -> Measure time (Expect >100ms, cache invalidated).

