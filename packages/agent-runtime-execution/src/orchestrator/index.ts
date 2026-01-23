/**
 * Orchestrator Module
 *
 * Core agent orchestration with performance optimizations:
 * - Message history compression
 * - Request caching and deduplication
 * - Optimized dependency analysis
 */

export {
  createPlanPersistence,
  type PersistedPlanMetadata,
  PlanPersistence,
  type PlanPersistenceConfig,
} from "@ku0/agent-runtime-tools";
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
// Clarification Manager
export {
  type ClarificationEvent,
  type ClarificationEventHandler,
  ClarificationManager,
  type ClarificationRecord,
} from "./clarificationManager";
// Clarifying Questions Engine
export {
  type ClarifyingQuestion,
  type ClarifyingQuestionsConfig,
  type ClarifyingQuestionsEngine,
  ClarifyingQuestionsEngineImpl,
  createClarifyingQuestionsEngine,
  DEFAULT_CLARIFYING_CONFIG,
  type QuestionCategory,
  type QuestionPriority,
  type QuestionTemplate,
} from "./clarifyingQuestionsEngine";
export type { CreateCodeAgentOrchestratorOptions } from "./codeAgentFactory";
export { createCodeAgentOrchestrator } from "./codeAgentFactory";
// Codebase Research Engine
export {
  type CodebaseResearchConfig,
  type CodebaseResearchEngine,
  CodebaseResearchEngineImpl,
  createCodebaseResearchEngine,
  DEFAULT_RESEARCH_CONFIG,
  type FindingType,
  type RelevanceLevel,
  type ResearchFinding,
  type ResearchStrategy,
} from "./codebaseResearchEngine";
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
// Execution Feedback (Track B)
export {
  createExecutionFeedbackTracker,
  type ExecutionFeedbackConfig,
  ExecutionFeedbackTracker,
  type ExecutionOutcome,
  type ToolStats,
} from "./executionFeedback";
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
export {
  MessageRewindManager,
  type MessageRewindOptions,
  type MessageRewindResult,
} from "./messageRewind";
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
  type SubagentAutomationConfig,
} from "./orchestrator";
// Parallel Plan Reviewer (Multi-Agent Review)
export {
  type AgentReviewExecutor,
  type ConsolidatedReview,
  createParallelPlanReviewer,
  DEFAULT_PARALLEL_REVIEWER_CONFIG,
  DEFAULT_REVIEWER_PROFILES,
  ParallelPlanReviewer,
  type ParallelPlanReviewerConfig,
  type PlanChange,
  type PlanReview,
  type PlanReviewRequest,
  type ReviewerProfile,
  type ReviewFocus,
} from "./parallelPlanReviewer";
// Plan Markdown Renderer
export {
  createPlanMarkdownRenderer,
  DEFAULT_RENDER_CONFIG,
  PlanMarkdownRenderer,
  type PlanRenderConfig,
  type RenderablePlan,
} from "./planMarkdownRenderer";
// Plan Mode (Cursor-style planning workflow)
export {
  type AlternativeApproach,
  createPlanModeController,
  DEFAULT_PLAN_MODE_CONFIG,
  type PlanModeConfig,
  PlanModeController,
  type PlanModeEvent,
  type PlanModeEventHandler,
  type PlanModeEventType,
  type PlanModePhase,
  type PlanModeState,
} from "./planModeController";
// Plan Mode Orchestrator Integration
export {
  createPlanModeIntegration,
  DEFAULT_INTEGRATION_CONFIG,
  PlanModeIntegration,
  type PlanModeIntegrationConfig,
  type PlanModeIntegrationEvent,
  type PlanModeIntegrationEventHandler,
  type PlanModeIntegrationEventType,
} from "./planModeIntegration";
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
// Plan Prioritization (Track A)
export {
  createPlanPrioritizer,
  PlanPrioritizer,
  type PlanPrioritizerConfig,
  type PlanStepPriority,
  type PrioritizationResult,
} from "./planPrioritizer";
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
// Tool Scoring (Track B)
export {
  createToolScorer,
  type ToolScore,
  ToolScorer,
  type ToolScorerConfig,
  type ToolScorerWeights,
} from "./toolScorer";
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
