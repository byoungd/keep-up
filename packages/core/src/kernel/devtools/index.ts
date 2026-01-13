/**
 * LFCC v0.9 RC - DevTools Module
 */

export {
  PerformanceTracker,
  compareCanonTrees,
  compareDirtyVsFull,
  createSamplingState,
  generateFullScanReport,
  recordStructuralOp,
  resetAfterFullScan,
  selectSampleBlocks,
  type SamplingState,
} from "./compareHarness.js";
export {
  createBugReportTemplate,
  forceFullScan,
  formatScanReport,
  type ForceFullScanOptions,
  type ForceFullScanResult,
} from "./forceFullScan.js";
export {
  compareRenderingKeys,
  createSimpleRenderingKeysProvider,
  getRenderingKeys,
  registerRenderingKeysProvider,
  unregisterRenderingKeysProvider,
  verifyRenderingKeysDeterminism,
  type RenderingKey,
  type RenderingKeysSnapshot,
} from "./renderingKeys.js";
export * from "./types.js";
