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
} from "./checkpoint";
export {
  computeChainHash,
  computeContextHash,
  computeContextHashBatch,
  verifyChainHash,
  verifyContextHash,
} from "./hash";
export {
  IntegrityScanner,
  shouldRunFullScanNow,
  type AnnotationScanData,
  type DocumentStateProvider,
} from "./scanner";
export * from "./types";

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
} from "./performanceOptimizations";
