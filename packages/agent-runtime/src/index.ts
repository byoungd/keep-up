/**
 * @keepup/agent-runtime
 *
 * Agent Runtime with MCP tools, orchestration, and security.
 *
 * This package provides the infrastructure for building AI agents with:
 * - MCP-compatible tool registry
 * - Core tools (bash, file, code)
 * - LFCC document operations
 * - Agent orchestrator with planning
 * - Security policies and audit logging
 * - External framework adapters (LangChain, Dify stubs)
 *
 * @example
 * ```typescript
 * import {
 *   createToolRegistry,
 *   createBashToolServer,
 *   createFileToolServer,
 *   createLFCCToolServer,
 *   createOrchestrator,
 *   createMockLLM,
 *   securityPolicy,
 * } from '@keepup/agent-runtime';
 *
 * // Create tool registry
 * const registry = createToolRegistry();
 *
 * // Register tools
 * await registry.register(createBashToolServer());
 * await registry.register(createFileToolServer());
 * await registry.register(createLFCCToolServer());
 *
 * // Create LLM adapter (use createAICoreAdapter for production)
 * const llm = createMockLLM();
 *
 * // Create orchestrator
 * const agent = createOrchestrator(llm, registry, {
 *   systemPrompt: 'You are a helpful assistant.',
 *   security: securityPolicy().fromPreset('balanced').build(),
 * });
 *
 * // Run the agent
 * const result = await agent.run('Help me organize my notes');
 * ```
 */

// ============================================================================
// Types
// ============================================================================
export * from "./types";

// ============================================================================
// Cowork
// ============================================================================
export * from "./cowork";

// ============================================================================
// Tools
// ============================================================================
export * from "./tools";

// Tool Discovery
export { createToolDiscoveryEngine } from "./tools/discovery/toolDiscovery";
export type { ToolSearchCriteria, ToolSearchResult } from "./tools/discovery/toolDiscovery";

// Script Executor
export { createScriptExecutor, SCRIPT_TEMPLATES } from "./tools/core/scriptExecutor";
export type {
  ScriptContext,
  ScriptResult,
  ScriptExecutorConfig,
} from "./tools/core/scriptExecutor";

// ============================================================================
// Orchestrator (with performance optimizations)
// ============================================================================
export * from "./orchestrator";
// Performance optimization components
export {
  createMessageCompressor,
  createRequestCache,
  createDependencyAnalyzer,
} from "./orchestrator";

// ============================================================================
// Kernel Interfaces
// ============================================================================
export * from "./kernel";

// ============================================================================
// Tool Execution Pipeline
// ============================================================================
export * from "./executor";

// Planning System
export { createPlanningEngine } from "./orchestrator/planning";
export type { ExecutionPlan, PlanStep, PlanningConfig } from "./orchestrator/planning";

// Error Recovery
export { createErrorRecoveryEngine } from "./orchestrator/errorRecovery";
export type { RecoveryStrategy } from "./orchestrator/errorRecovery";

// Subagent Orchestration
export { createSubagentOrchestrator } from "./orchestrator/subagentOrchestrator";
export type { SubagentTask, AggregatedResults } from "./orchestrator/subagentOrchestrator";

// Consensus Orchestration
export {
  ConsensusOrchestrator,
  createConsensusOrchestrator,
} from "./orchestrator/consensusOrchestrator";
export type {
  ConsensusConfig,
  ConsensusResult,
  ConsensusModelConfig,
  ModelResponse,
  VotingStrategy,
} from "./orchestrator/consensusOrchestrator";

// ============================================================================
// Security
// ============================================================================
export * from "./security";

// ============================================================================
// Telemetry
// ============================================================================
export * from "./telemetry";

// ============================================================================
// Agents
// ============================================================================
export * from "./agents";

// ============================================================================
// Context
// ============================================================================
export * from "./context";

// ============================================================================
// Session State
// ============================================================================
export * from "./session";

// ============================================================================
// Utilities
// ============================================================================
export * from "./utils";

// ============================================================================
// Plugins
// ============================================================================
export * from "./plugins";

// ============================================================================
// Workflows
// ============================================================================
export { createWorkflowTemplateManager, BUILT_IN_WORKFLOWS } from "./workflows";
export type { WorkflowTemplate, WorkflowPhase, WorkflowContext } from "./workflows";

// ============================================================================
// Prompts
// ============================================================================
export { createPromptBuilder } from "./prompts";
export type { PromptContext, BuiltPrompt, TaskType, ExecutionPhase } from "./prompts/promptBuilder";

// ============================================================================
// Events
// ============================================================================
export * from "./events";

// ============================================================================
// Checkpoint
// ============================================================================
export * from "./checkpoint";

// ============================================================================
// Quota
// ============================================================================
export * from "./quota";

// ============================================================================
// Streaming
// ============================================================================
export * from "./streaming";

// ============================================================================
// Pipeline
// ============================================================================
export * from "./pipeline";

// ============================================================================
// Logging
// ============================================================================
export * from "./logging";

// ============================================================================
// Reasoning (Extended Thinking)
// ============================================================================
export * from "./reasoning";

// ============================================================================
// Memory (Cross-Session Knowledge)
// ============================================================================
export * from "./memory";

// ============================================================================
// Knowledge (Scoped Conditional Injection)
// ============================================================================
export * from "./knowledge";

// ============================================================================
// Background Tasks
// ============================================================================
export * from "./tasks";

// ============================================================================
// Bridge (AI-Native Integration)
// ============================================================================
export * from "./bridge";

// ============================================================================
// Convenience Re-exports
// ============================================================================

// Quick access to commonly used factories
export { createToolRegistry } from "./tools/mcp/registry";
export { createBashToolServer } from "./tools/core/bash";
export { createFileToolServer } from "./tools/core/file";
export { createCodeToolServer } from "./tools/core/code";
export { createSubagentToolServer } from "./tools/core/subagent";
export { createLFCCToolServer } from "./tools/lfcc/lfccServer";
export { createWebSearchToolServer } from "./tools/web/webSearchServer";
export { createGitToolServer } from "./tools/git/gitServer";
export { createOrchestrator } from "./orchestrator/orchestrator";
export { createAICoreAdapter, createMockLLM } from "./orchestrator/aiCoreAdapter";
export {
  createPermissionChecker,
  createAuditLogger,
  createSecurityPolicy,
  securityPolicy,
  SecurityPolicyBuilder,
} from "./security";

// Security presets
export { SECURITY_PRESETS } from "./types";

// Telemetry factories
export {
  createTelemetryContext,
  InMemoryMetricsCollector,
  InMemoryTracer,
  measureAsync,
  traced,
  attachTelemetryToEventBus,
  AGENT_METRICS,
} from "./telemetry";

// Agent factories
export { createAgentManager, AGENT_PROFILES, getAgentProfile, listAgentTypes } from "./agents";

// Context factories
export { createContextManager } from "./context";

// Utility factories
export {
  retry,
  withRetry,
  createCircuitBreaker,
  createCache,
  createToolResultCache,
  executeParallel,
  executeWithDependencies,
  createRateLimiter,
  createToolRateLimiter,
  createResourcePool,
} from "./utils";

// Event bus factories
export {
  createEventBus,
  getGlobalEventBus,
  resetGlobalEventBus,
} from "./events";

// Checkpoint factories
export {
  createCheckpointManager,
  createInMemoryCheckpointStorage,
} from "./checkpoint";

// Quota factories
export {
  createQuotaManager,
  createTieredQuotaManager,
  QUOTA_PRESETS,
} from "./quota";

// Streaming factories
export {
  createStreamWriter,
  collectStream,
  collectText,
  createTokenStreamWriter,
  createTokenStreamReader,
  createStreamPair,
} from "./streaming";

// Reasoning factories
export {
  createThinkingEngine,
  createQuickThinkingEngine,
  createDeepThinkingEngine,
  withReasoning,
  reasoningWrapper,
} from "./reasoning";

// Memory factories
export {
  createMemoryManager,
  createInMemoryStore,
  createVectorIndex,
  createMockEmbeddingProvider,
} from "./memory";

// Task queue factories
export { createTaskQueue, createPriorityHeap } from "./tasks";

// Pipeline factories
export {
  createPipeline,
  createPipelineExecutor,
  createSequentialPipeline,
} from "./pipeline";

// Logging factories
export {
  createLogger,
  getLogger,
  configureLogger,
  createMemoryTransport,
} from "./logging";
