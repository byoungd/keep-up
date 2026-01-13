/**
 * Multi-Lane Model Routing Types
 *
 * Provides tiered model routing (Fast/Deep/Consensus) with BYOK support.
 * Each lane can have its own set of models with custom API keys.
 *
 * Track B: Intelligence & Grounding
 */

import type { Message, TokenUsage } from "../providers/types";

// ============================================================================
// Lane Types
// ============================================================================

/** Available model lanes */
export type ModelLane = "fast" | "deep" | "consensus";

/** Configuration for a single model within a lane */
export interface LaneModelConfig {
  /** Provider identifier (e.g., "openai", "anthropic") */
  providerId: string;
  /** Model identifier (e.g., "gpt-4o-mini", "claude-3-haiku") */
  modelId: string;
  /** Optional custom API key (BYOK support) */
  apiKey?: string;
  /** Optional custom base URL */
  baseUrl?: string;
  /** Weight for consensus voting (default: 1.0) */
  weight?: number;
  /** Maximum tokens for this model */
  maxTokens?: number;
}

/** Configuration for a lane */
export interface LaneConfig {
  /** Lane identifier */
  lane: ModelLane;
  /** Models available in this lane (ordered by preference) */
  models: LaneModelConfig[];
  /** Fallback lane if all models in this lane fail */
  fallbackLane?: ModelLane;
  /** Whether to enable automatic fallback within the lane */
  enableFallback?: boolean;
}

/** Full multi-lane configuration */
export interface MultiLaneConfig {
  /** Lane configurations */
  lanes: Partial<Record<ModelLane, LaneConfig>>;
  /** Default lane to use when not specified */
  defaultLane: ModelLane;
  /** Optional auto-selection function */
  autoSelect?: LaneSelector;
  /** Consensus configuration */
  consensus?: ConsensusConfig;
}

// ============================================================================
// Lane Selection
// ============================================================================

/** Context available during lane selection */
export interface LaneSelectionContext {
  /** User's lane preference (if any) */
  userPreference?: ModelLane;
  /** Estimated input tokens */
  estimatedInputTokens?: number;
  /** Request complexity hints */
  complexityHints?: ComplexityHints;
  /** User-provided metadata */
  metadata?: Record<string, unknown>;
}

/** Hints about request complexity */
export interface ComplexityHints {
  /** Whether the request requires deep reasoning */
  requiresReasoning?: boolean;
  /** Whether the request requires code generation */
  requiresCodeGeneration?: boolean;
  /** Whether the request requires multi-step planning */
  requiresPlanning?: boolean;
  /** Whether the request is simple Q&A */
  isSimpleQA?: boolean;
  /** Estimated response length (short/medium/long) */
  expectedResponseLength?: "short" | "medium" | "long";
}

/** Function to automatically select a lane based on request */
export type LaneSelector = (
  request: LaneCompletionRequest,
  context: LaneSelectionContext
) => ModelLane;

// ============================================================================
// Consensus Types
// ============================================================================

/** Configuration for consensus lane */
export interface ConsensusConfig {
  /** Minimum number of models that must agree */
  minAgreement?: number;
  /** Strategy for merging results */
  mergeStrategy: ConsensusMergeStrategy;
  /** Timeout for individual model calls (ms) */
  modelTimeoutMs?: number;
  /** Whether to include diff in response */
  includeDiff?: boolean;
  /** Maximum parallel calls */
  maxParallelCalls?: number;
}

/** Strategy for merging consensus results */
export type ConsensusMergeStrategy =
  | "weighted_vote" // Weighted by model weight
  | "majority" // Simple majority wins
  | "best_confidence" // Highest confidence wins
  | "union" // Merge all unique information
  | "intersection"; // Only include agreed-upon information

/** Individual model result in consensus */
export interface ConsensusModelResult {
  /** Provider and model used */
  providerId: string;
  modelId: string;
  /** Response content */
  content: string;
  /** Weight for voting */
  weight: number;
  /** Response latency (ms) */
  latencyMs: number;
  /** Token usage */
  usage: TokenUsage;
  /** Whether this model succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

/** Result of consensus execution */
export interface ConsensusResult {
  /** Merged content */
  content: string;
  /** Individual model results */
  modelResults: ConsensusModelResult[];
  /** Agreement score (0-1) */
  agreementScore: number;
  /** Differences between models (if includeDiff enabled) */
  differences?: ConsensusDiff[];
  /** Combined token usage */
  totalUsage: TokenUsage;
  /** Total latency (ms) */
  totalLatencyMs: number;
}

/** Difference between model responses */
export interface ConsensusDiff {
  /** Type of difference */
  type: "addition" | "removal" | "change";
  /** Content that differs */
  content: string;
  /** Which models had this content */
  presentIn: string[];
  /** Which models lacked this content */
  absentIn: string[];
}

// ============================================================================
// Request/Response Types
// ============================================================================

/** Request for lane-based completion */
export interface LaneCompletionRequest {
  /** Messages to send */
  messages: Message[];
  /** Explicit lane selection (overrides auto-select) */
  lane?: ModelLane;
  /** Model override (for specific model within lane) */
  model?: string;
  /** Temperature */
  temperature?: number;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Request timeout (ms) */
  timeoutMs?: number;
  /** Complexity hints for auto-selection */
  complexityHints?: ComplexityHints;
  /** User ID for tracking */
  userId?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/** Response from lane-based completion */
export interface LaneCompletionResponse {
  /** Generated content */
  content: string;
  /** Lane used */
  lane: ModelLane;
  /** Model used */
  model: string;
  /** Provider used */
  provider: string;
  /** Token usage */
  usage: TokenUsage;
  /** Latency (ms) */
  latencyMs: number;
  /** Finish reason */
  finishReason: string;
  /** Consensus details (if consensus lane) */
  consensus?: ConsensusResult;
}

// ============================================================================
// Lane Router Types
// ============================================================================

/** Lane router configuration (extends MultiLaneConfig) */
export interface LaneRouterConfig extends MultiLaneConfig {
  /** Logger for debugging */
  logger?: LaneLogger;
  /** Telemetry callback */
  onTelemetry?: (event: LaneTelemetryEvent) => void;
}

/** Simple logger interface */
export interface LaneLogger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

/** Telemetry event for lane routing */
export interface LaneTelemetryEvent {
  /** Event type */
  kind: "lane_selected" | "model_called" | "fallback" | "consensus_executed" | "error";
  /** Timestamp */
  timestamp: number;
  /** Lane used */
  lane: ModelLane;
  /** Model used (if applicable) */
  model?: string;
  /** Provider used (if applicable) */
  provider?: string;
  /** Duration (ms) */
  durationMs?: number;
  /** Token usage */
  usage?: TokenUsage;
  /** Error details */
  error?: string;
  /** Additional context */
  metadata?: Record<string, unknown>;
}
