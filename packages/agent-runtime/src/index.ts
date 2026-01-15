/**
 * @ku0/agent-runtime
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
 * } from '@ku0/agent-runtime';
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
// Sandbox
// ============================================================================
export * from "./sandbox";

// ============================================================================
// Telemetry
// ============================================================================
export * from "./telemetry";

// ============================================================================
// Agents
// ============================================================================
export {
  createAgentManager,
  AGENT_PROFILES,
  getAgentProfile,
  listAgentTypes,
  AgentManager,
  VerifierAgent,
} from "./agents";

// ============================================================================
// Context
// ============================================================================
export * from "./context";

// ============================================================================
// Routing
// ============================================================================
export * from "./routing";

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
// Artifacts
// ============================================================================
export * from "./artifacts";

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
export {
  Logger,
  ConsoleTransport,
  MemoryTransport,
  getLogger,
  configureLogger,
  createLogger,
  type LoggerConfig,
} from "./logging";

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
