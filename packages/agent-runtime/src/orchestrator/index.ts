/**
 * Orchestrator Module
 *
 * Core agent orchestration with performance optimizations:
 * - Message history compression
 * - Request caching and deduplication
 * - Optimized dependency analysis
 */

export {
  AgentOrchestrator,
  createOrchestrator,
  type IAgentLLM,
  type AgentLLMRequest,
  type AgentLLMResponse,
  type AgentLLMChunk,
  type AgentToolDefinition,
  type OrchestratorEvent,
  type OrchestratorEventHandler,
  type OrchestratorEventType,
  type OrchestratorComponents,
  type CreateOrchestratorOptions,
} from "./orchestrator";

export {
  AICoreProviderAdapter,
  MockAgentLLM,
  createAICoreAdapter,
  createMockLLM,
  type AICoreProvider,
  type AICoreAdapterOptions,
} from "./aiCoreAdapter";

// Performance Optimizations
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

// Consensus Orchestration
export {
  ConsensusOrchestrator,
  createConsensusOrchestrator,
  type ConsensusConfig,
  type ConsensusResult,
  type ConsensusModelConfig,
  type ModelResponse,
  type VotingStrategy,
} from "./consensusOrchestrator";
