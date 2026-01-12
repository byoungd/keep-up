/**
 * Performance Module
 *
 * Client-side performance utilities for decode caching and metrics.
 */

export {
  DecodeCache,
  createDecodeCache,
  type DecodeCacheConfig,
  type DecodeCacheMetrics,
} from "./decodeCache";

export {
  PerfMetrics,
  getPerfMetrics,
  resetPerfMetrics,
  type PerfMetricsConfig,
  type PerfMetricsData,
  type PercentileStats,
} from "./perfMetrics";
