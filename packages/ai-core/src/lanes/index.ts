/**
 * Multi-Lane Model Routing
 *
 * Provides tiered model routing (Fast/Deep/Consensus) with BYOK support.
 *
 * @example
 * ```typescript
 * import { createLaneRouter, createComplexityBasedSelector } from '@keepup/ai-core';
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

// Types
export type {
  ModelLane,
  LaneConfig,
  LaneModelConfig,
  MultiLaneConfig,
  LaneRouterConfig,
  LaneCompletionRequest,
  LaneCompletionResponse,
  LaneSelector,
  LaneSelectionContext,
  ComplexityHints,
  ConsensusConfig,
  ConsensusMergeStrategy,
  ConsensusResult,
  ConsensusModelResult,
  ConsensusDiff,
  LaneLogger,
  LaneTelemetryEvent,
} from "./types";

// Lane Router
export { LaneRouter, createLaneRouter, type ProviderFactory } from "./laneRouter";

// Lane Selectors
export {
  createComplexityBasedSelector,
  createPreferenceBasedSelector,
  createConsensusSelector,
  combineSelectors,
  type ComplexitySelectorOptions,
  type PreferenceSelectorOptions,
  type ConsensusSelectorOptions,
} from "./laneSelector";
