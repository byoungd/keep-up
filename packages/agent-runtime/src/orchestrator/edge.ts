/**
 * Edge Runtime Compatible Orchestrator Exports
 *
 * This module provides Edge-safe exports that do not use Node.js-specific APIs
 * like `node:fs`, `node:path`, or `process.cwd()`.
 *
 * Use this entry point for Next.js Edge API routes and Cloudflare Workers.
 *
 * @example
 * ```typescript
 * import { ConsensusOrchestrator } from "@ku0/agent-runtime/orchestrator/edge";
 * ```
 */

// Consensus Orchestration (Edge-safe - uses fetch only)
export {
  ConsensusOrchestrator,
  createConsensusOrchestrator,
  type ConsensusConfig,
  type ConsensusResult,
  type ConsensusModelConfig,
  type ModelResponse,
  type VotingStrategy,
} from "./consensusOrchestrator";

// Performance Optimizations (Edge-safe - memory only)
export {
  MessageCompressor,
  createMessageCompressor,
  type CompressionConfig,
  type CompressionResult,
  type CompressionStrategy,
} from "./messageCompression";

export {
  RequestCache,
  createRequestCache,
  type CacheConfig,
  type RequestCacheStats,
} from "./requestCache";

export {
  DependencyAnalyzer,
  createDependencyAnalyzer,
  type DependencyAnalysis,
} from "./dependencyAnalyzer";

// AI Core Adapter (Edge-safe)
export {
  AICoreProviderAdapter,
  MockAgentLLM,
  createAICoreAdapter,
  createMockLLM,
  type AICoreProvider,
  type AICoreAdapterOptions,
} from "./aiCoreAdapter";

// Core Orchestrator types (Edge-safe - types only use memory)
export type {
  IAgentLLM,
  AgentLLMRequest,
  AgentLLMResponse,
  AgentLLMChunk,
  AgentToolDefinition,
  OrchestratorEvent,
  OrchestratorEventHandler,
  OrchestratorEventType,
  OrchestratorComponents,
  CreateOrchestratorOptions,
} from "./orchestrator";
