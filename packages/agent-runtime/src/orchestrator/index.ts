/**
 * Orchestrator Module
 *
 * Core agent orchestration with performance optimizations:
 * - Message history compression
 * - Request caching and deduplication
 * - Optimized dependency analysis
 */

// Agent Loop (Manus Spec)
export {
  type AgentLoopConfig,
  type AgentLoopControlSignal,
  type AgentLoopCycle,
  type AgentLoopPhase,
  type AgentLoopState,
  AgentLoopStateMachine,
  createAgentLoopStateMachine,
  type Observation,
  type PerceptionContext,
  type ThinkingResult,
  type ToolDecision,
} from "./agentLoop";

export {
  type AICoreAdapterOptions,
  type AICoreProvider,
  AICoreProviderAdapter,
  createAICoreAdapter,
  createMockLLM,
  MockAgentLLM,
} from "./aiCoreAdapter";
export type { CreateCodeAgentOrchestratorOptions } from "./codeAgentFactory";
export { createCodeAgentOrchestrator } from "./codeAgentFactory";
// Consensus Orchestration
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
// Lifecycle Hooks
export {
  type AfterToolHook,
  type AfterTurnHook,
  type BeforeToolHook,
  type BeforeTurnHook,
  type CompleteHook,
  createHookContext,
  createHookRegistry,
  type ErrorHook,
  executeAfterToolHooks,
  executeAfterTurnHooks,
  executeBeforeToolHooks,
  executeBeforeTurnHooks,
  executeCompleteHooks,
  executeErrorHooks,
  type HookContext,
  HookRegistry,
  type OrchestratorHooks,
} from "./hooks";
export {
  createIntegratedPlanningService,
  type IntegratedPlanningConfig,
  IntegratedPlanningService,
  type PlanTodoLink,
} from "./integratedPlanning";
// Performance Optimizations
export {
  type CompressionConfig,
  type CompressionMetrics,
  type CompressionResult,
  type CompressionStrategy,
  createMessageCompressor,
  type ISummarizer,
  MessageCompressor,
} from "./messageCompression";
export { NodeResultCache, type NodeResultCacheConfig } from "./nodeResultCache";
export {
  type AgentControlSignal,
  type AgentLLMChunk,
  type AgentLLMRequest,
  type AgentLLMResponse,
  AgentOrchestrator,
  type AgentToolDefinition,
  type ControlStateSnapshot,
  type CreateOrchestratorOptions,
  createOrchestrator,
  type IAgentLLM,
  type OrchestratorComponents,
  type OrchestratorEvent,
  type OrchestratorEventHandler,
  type OrchestratorEventType,
} from "./orchestrator";
// Planning with File Persistence
export {
  createPlanningEngine,
  type ExecutionPlan,
  type PlanApproval,
  type PlanApprovalHandler,
  type PlanningConfig,
  PlanningEngine,
  type PlanRefinement,
  type PlanStep,
} from "./planning";
export {
  createPlanPersistence,
  type PersistedPlanMetadata,
  PlanPersistence,
  type PlanPersistenceConfig,
} from "./planPersistence";
export {
  type CacheConfig,
  createRequestCache,
  RequestCache,
  type RequestCacheStats,
} from "./requestCache";
// Single-Step Execution Enforcer (Manus Spec)
export {
  createSingleStepEnforcer,
  createSingleStepMiddleware,
  SingleStepEnforcer,
  type SingleStepMiddleware,
  type SingleStepPolicy,
  type SingleStepValidationResult,
} from "./singleStepEnforcer";
export { SmartToolScheduler } from "./smartToolScheduler";
// State Machine
export {
  type AgentStateEvent,
  AgentStateMachine,
  type AgentStateMachineConfig,
  type AgentStateTransition,
  type AgentStatus,
  createAgentStateMachine,
  type IAgentStateMachine,
  InvalidTransitionError,
  type TransitionHandler,
} from "./stateMachine";
// Turn Executor (extracted from orchestrator)
export {
  createTurnExecutor,
  type ITurnExecutor,
  TurnExecutor,
  type TurnExecutorConfig,
  type TurnExecutorDependencies,
  type TurnMetrics,
  type TurnOutcome,
  type TurnOutcomeType,
} from "./turnExecutor";
