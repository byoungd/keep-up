/**
 * LFCC v0.9 RC - Integrity Module
 */

export {
  CheckpointScheduler,
  createCheckpointSchedulerState,
  recordOperation,
  resetAfterCheckpoint,
  runCheckpoint,
  shouldTriggerCheckpoint,
  type AnnotationForVerify,
} from "./checkpoint.js";
export {
  computeChainHash,
  computeContextHash,
  computeContextHashBatch,
  verifyChainHash,
  verifyContextHash,
} from "./hash.js";
export {
  IntegrityScanner,
  shouldRunFullScanNow,
  type AnnotationScanData,
  type DocumentStateProvider,
} from "./scanner.js";
export * from "./types.js";

// P1.2: Large Document Performance Optimizations
export {
  DecodeCache,
  DirtyRegionTracker,
  BlockIndex,
  createPerformanceMonitor,
  type DecodeCacheConfig,
  type DecodeCacheEntry,
  type CacheStats,
  type DirtyRegion,
  type IncrementalVerificationOptions,
  type BlockIndexEntry,
  type LargeDocPerformanceMetrics,
} from "./performanceOptimizations.js";
