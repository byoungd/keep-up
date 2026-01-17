/**
 * Multi-Lane Model Routing
 *
 * Provides tiered model routing (Fast/Deep/Consensus) with BYOK support.
 *
 * @example
 * ```typescript
 * import { createLaneRouter, createComplexityBasedSelector } from '@ku0/ai-core';
 *
 * const router = createLaneRouter({
 *   lanes: {
 *     fast: {
 *       lane: 'fast',
 *       models: [
 *         { providerId: 'anthropic', modelId: 'claude-3-haiku' },
 *         { providerId: 'openai', modelId: 'gpt-4o-mini' },
 *       ],
 *     },
 *     deep: {
 *       lane: 'deep',
 *       models: [
 *         { providerId: 'anthropic', modelId: 'claude-3-opus', apiKey: process.env.OPUS_KEY },
 *       ],
 *     },
 *   },
 *   defaultLane: 'fast',
 *   autoSelect: createComplexityBasedSelector(),
 * }, providerFactory);
 * ```
 *
 * Track B: Intelligence & Grounding
 */

// Lane Router
export { createLaneRouter, LaneRouter, type ProviderFactory } from "./laneRouter";
// Lane Selectors
export {
  type ComplexitySelectorOptions,
  type ConsensusSelectorOptions,
  combineSelectors,
  createComplexityBasedSelector,
  createConsensusSelector,
  createPreferenceBasedSelector,
  type PreferenceSelectorOptions,
} from "./laneSelector";
// Types
export type {
  ComplexityHints,
  ConsensusConfig,
  ConsensusDiff,
  ConsensusMergeStrategy,
  ConsensusModelResult,
  ConsensusResult,
  LaneCompletionRequest,
  LaneCompletionResponse,
  LaneConfig,
  LaneLogger,
  LaneModelConfig,
  LaneRouterConfig,
  LaneSelectionContext,
  LaneSelector,
  LaneTelemetryEvent,
  ModelLane,
  MultiLaneConfig,
} from "./types";
