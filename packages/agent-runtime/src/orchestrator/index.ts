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
  type ISummarizer,
  type CompressionMetrics,
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

export { SmartToolScheduler } from "./smartToolScheduler";

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

// Planning with File Persistence
export {
  PlanningEngine,
  createPlanningEngine,
  type ExecutionPlan,
  type PlanStep,
  type PlanRefinement,
  type PlanApproval,
  type PlanningConfig,
  type PlanApprovalHandler,
} from "./planning";

export {
  PlanPersistence,
  createPlanPersistence,
  type PlanPersistenceConfig,
  type PersistedPlanMetadata,
} from "./planPersistence";

export {
  IntegratedPlanningService,
  createIntegratedPlanningService,
  type IntegratedPlanningConfig,
  type PlanTodoLink,
} from "./integratedPlanning";

// Lifecycle Hooks
export {
  HookRegistry,
  createHookRegistry,
  createHookContext,
  executeBeforeTurnHooks,
  executeAfterTurnHooks,
  executeBeforeToolHooks,
  executeAfterToolHooks,
  executeErrorHooks,
  executeCompleteHooks,
  type HookContext,
  type OrchestratorHooks,
  type BeforeTurnHook,
  type AfterTurnHook,
  type BeforeToolHook,
  type AfterToolHook,
  type ErrorHook,
  type CompleteHook,
} from "./hooks";

// Turn Executor (extracted from orchestrator)
export {
  TurnExecutor,
  createTurnExecutor,
  type ITurnExecutor,
  type TurnOutcome,
  type TurnOutcomeType,
  type TurnMetrics,
  type TurnExecutorDependencies,
  type TurnExecutorConfig,
} from "./turnExecutor";

// State Machine
export {
  AgentStateMachine,
  InvalidTransitionError,
  createAgentStateMachine,
  type IAgentStateMachine,
  type AgentStatus,
  type AgentStateEvent,
  type AgentStateTransition,
  type AgentStateMachineConfig,
  type TransitionHandler,
} from "./stateMachine";

// Agent Loop (Manus Spec)
export {
  AgentLoopStateMachine,
  createAgentLoopStateMachine,
  type AgentLoopPhase,
  type PerceptionContext,
  type ThinkingResult,
  type ToolDecision,
  type Observation,
  type AgentLoopCycle,
  type AgentLoopState,
  type AgentLoopConfig,
} from "./agentLoop";

// Single-Step Execution Enforcer (Manus Spec)
export {
  SingleStepEnforcer,
  createSingleStepEnforcer,
  createSingleStepMiddleware,
  type SingleStepValidationResult,
  type SingleStepPolicy,
  type SingleStepMiddleware,
} from "./singleStepEnforcer";
