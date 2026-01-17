/**
 * LFCC v0.9 RC - Integrity Module
 */

export {
  type AnnotationForVerify,
  CheckpointScheduler,
  createCheckpointSchedulerState,
  recordOperation,
  resetAfterCheckpoint,
  runCheckpoint,
  shouldTriggerCheckpoint,
} from "./checkpoint.js";
export {
  computeChainHash,
  computeContextHash,
  computeContextHashBatch,
  verifyChainHash,
  verifyContextHash,
} from "./hash.js";
// P1.2: Large Document Performance Optimizations
export {
  BlockIndex,
  type BlockIndexEntry,
  type CacheStats,
  createPerformanceMonitor,
  DecodeCache,
  type DecodeCacheConfig,
  type DecodeCacheEntry,
  type DirtyRegion,
  DirtyRegionTracker,
  type IncrementalVerificationOptions,
  type LargeDocPerformanceMetrics,
} from "./performanceOptimizations.js";
export {
  type AnnotationScanData,
  type DocumentStateProvider,
  IntegrityScanner,
  shouldRunFullScanNow,
} from "./scanner.js";
export * from "./types.js";
