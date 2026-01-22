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

// AI Core Adapter (Edge-safe)
export {
  type AICoreAdapterOptions,
  type AICoreProvider,
  AICoreProviderAdapter,
  createAICoreAdapter,
  createMockLLM,
  MockAgentLLM,
} from "./aiCoreAdapter";
// Consensus Orchestration (Edge-safe - uses fetch only)
export {
  type ConsensusConfig,
  type ConsensusModelConfig,
  ConsensusOrchestrator,
  type ConsensusResult,
  createConsensusOrchestrator,
  type ModelResponse,
  type VotingStrategy,
} from "./consensusOrchestrator";
export {
  createDependencyAnalyzer,
  type DependencyAnalysis,
  DependencyAnalyzer,
} from "./dependencyAnalyzer";
// Performance Optimizations (Edge-safe - memory only)
export {
  type CompressionConfig,
  type CompressionResult,
  type CompressionStrategy,
  createMessageCompressor,
  MessageCompressor,
} from "./messageCompression";
// Core Orchestrator types (Edge-safe - types only use memory)
export type {
  AgentLLMChunk,
  AgentLLMRequest,
  AgentLLMResponse,
  AgentToolDefinition,
  CreateOrchestratorOptions,
  IAgentLLM,
  OrchestratorComponents,
  OrchestratorEvent,
  OrchestratorEventHandler,
  OrchestratorEventType,
} from "./orchestrator";
export {
  type CacheConfig,
  createRequestCache,
  RequestCache,
  type RequestCacheStats,
} from "./requestCache";
export { SmartToolScheduler } from "./smartToolScheduler";
