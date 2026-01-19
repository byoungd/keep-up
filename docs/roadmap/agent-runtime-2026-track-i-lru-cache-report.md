# Track I: LRU Cache Optimization Report

**Owner**: Runtime Dev  
**Status**: Complete  
**Date**: 2026-01-19  

## Summary
Track I unified cache hashing and LRU behavior across the runtime, added adaptive sizing hooks, exposed runtime cache defaults via `RuntimeConfig`, and delivered a cache benchmark suite. Tool-result cache persistence is versioned to prevent stale restore after hashing changes.

## Changes Delivered
- Shared cache hashing helpers and adaptive sizing in `utils/cache.ts`.
- `RequestCache` refactored to use shared LRU strategy + unified key hashing.
- `ToolResultCache` hashing aligned with shared stable hash; persistence snapshot bumped to v2.
- Runtime cache defaults resolved via `RuntimeConfig` + env overrides (`RUNTIME_CACHE_TTL`, `RUNTIME_CACHE_MAX_SIZE`).
- Benchmark harness: `pnpm bench:cache`.

## Benchmark Methodology
`pnpm bench:cache` runs three scenarios per cache implementation:
- **insert**: 10k inserts
- **read (50% hit)**: 10k reads with 50% hit rate
- **evict**: 1k eviction cycles after seeding

### Results (avg ms)
```
utils/LRUCache  insert 7.093  | read 1.042 | evict 1.037
naive Map       insert 5.916  | read 0.496 | evict 0.620
lru-cache       insert 2.227  | read 0.689 | evict 2.595
```

### Environment
- Node.js 22.21.1
- pnpm 10.28.0
- `lru-cache` installed as dev dependency for benchmarking only

## Notes
- The external `lru-cache` implementation is faster on inserts, slower on eviction in this run.
- Runtime continues to use the in-house LRU/LRU-K implementations for now.
- Tool-result cache persistence now ignores v1 snapshots after the hashing change.

## Follow-ups
- Decide whether to adopt `lru-cache` based on broader workload profiling.
- Evaluate whether NodeResultCache should also use the shared hashing helpers.
