/**
 * LFCC v0.9 RC - DevTools Module
 */

export {
  compareCanonTrees,
  compareDirtyVsFull,
  createSamplingState,
  generateFullScanReport,
  PerformanceTracker,
  recordStructuralOp,
  resetAfterFullScan,
  type SamplingState,
  selectSampleBlocks,
} from "./compareHarness.js";
export {
  createBugReportTemplate,
  type ForceFullScanOptions,
  type ForceFullScanResult,
  forceFullScan,
  formatScanReport,
} from "./forceFullScan.js";
export {
  compareRenderingKeys,
  createSimpleRenderingKeysProvider,
  getRenderingKeys,
  type RenderingKey,
  type RenderingKeysSnapshot,
  registerRenderingKeysProvider,
  unregisterRenderingKeysProvider,
  verifyRenderingKeysDeterminism,
} from "./renderingKeys.js";
export * from "./types.js";
