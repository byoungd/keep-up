# Track I: LRU Cache Optimization

Owner: Runtime Dev
Status: Completed
Date: 2026-01-19
Timeline: Week 1

## Objective
Maximize hitting ratio and minimize overhead by unifying and tuning cache strategies across the Agent Runtime. Current implementation suffers from fragmentation between `RequestCache` and `ToolResultCache`, and uses a custom LRU implementation that lacks advanced features.

## Problem Analysis
- **Fragmentation**: `RequestCache` (in `orchestrator`) and `ToolResultCache` (in `utils`) implement separate caching logic.
- **Efficiency**: Custom `LRUCache` implementation in `utils/cache.ts` is functional but lacks advanced features (e.g., adaptive sizing, distinct heap management) found in specialized libraries like `lru-cache`.
- **Scope**: Current caching is ad-hoc. `ToolResultCache` and `RequestCache` should share a common, highly optimized core.

## Tasks

### Phase 1: Benchmarking & Selection
- [x] Create benchmark suite `packages/agent-runtime/bench/cache.bench.ts`.
- [x] Compare `utils/cache.ts` (Current), `lru-cache` (npm), and `naive Map` implementation.
- [x] Profile memory usage and GC pressure for high-throughput scenarios.

### Phase 2: Unification & Refactoring
- [x] Refactor `RequestCache` (`orchestrator/requestCache.ts`) to use `utils/cache.ts` primitives (or the selected library).
- [x] Deprecate standalone cache logic in `RequestCache`.
- [x] Ensure `ToolResultCache` aligns with the unified strategy.

### Phase 3: Advanced Optimization
- [x] Implement "entry promotion" to reduce object allocation on cache hits.
- [x] Add adaptive sizing based on memory pressure if feasible.
- [x] Optimize hash generation for cache keys (`hashArgs` / `generateKey`).

### Phase 4: Configuration
- [x] Expose global cache configuration (TTL, MaxSize) via `RuntimeConfig`.
- [x] Allow environment variable overrides (e.g., `RUNTIME_CACHE_TTL`).

## Deliverables
- [x] Benchmark report.
- [x] Unified Cache implementation.
- [x] Refactored `RequestCache` and `ToolResultCache`.
- [x] Performance regression tests.

## Technical Context

### Existing Components
- **`utils/cache.ts`**: Contains `LRUCache<T>` (Custom implementation).
- **`orchestrator/requestCache.ts`**: Contains `RequestCache` (Business logic + Map-based storage).
- **`utils/toolResultCache.ts`**: Contains `ToolResultCache` (Specialized caching).

### Target Architecture
We want to strip the storage logic out of `RequestCache` and make it a thin wrapper around a shared, optimized LRU implementation.

#### Proposed Interface (`utils/cache.ts`)
```typescript
export interface ICacheStrategy<K, V> {
  get(key: K): V | undefined;
  set(key: K, value: V, ttl?: number): void;
  has(key: K): boolean;
  delete(key: K): boolean;
  clear(): void;
  getStats(): CacheStats;
}
```

## Implementation Guide

1.  **Benchmarking**:
    - Use `tinybench` or simple `console.time`.
    - Test: 10k inserts, 10k reads (50% hit), 1k eviction cycles.
2.  **Refactoring**:
    - `RequestCache` should accept `ICacheStrategy` in constructor.
    - Default to `LRUCache` (optimized) if not provided.

## Verification
- Run benchmarks: `pnpm bench:cache` (new script).
- Run existing tests: `pnpm test packages/agent-runtime/src/orchestrator/__tests__/requestCache.test.ts`.
