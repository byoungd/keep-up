/**
 * @ku0/agent-runtime-execution
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
 *   createCodeInteractionServer,
 *   createLFCCToolServer,
 *   createOrchestrator,
 *   createMockLLM,
 *   securityPolicy,
 * } from '@ku0/agent-runtime-execution';
 *
 * // Create tool registry
 * const registry = createToolRegistry();
 *
 * // Register tools
 * await registry.register(createBashToolServer());
 * await registry.register(createFileToolServer());
 * await registry.register(createCodeInteractionServer());
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

export type { RuntimeMessageBus } from "@ku0/agent-runtime-control";
// ============================================================================
// Events
// ============================================================================
export * from "@ku0/agent-runtime-control";
// ============================================================================
// Memory (Cross-Session Knowledge)
// ============================================================================
export * from "@ku0/agent-runtime-memory";
// ============================================================================
// Artifacts
// ============================================================================
export * from "@ku0/agent-runtime-persistence/artifacts";
// ============================================================================
// Checkpoint
// ============================================================================
export * from "@ku0/agent-runtime-persistence/checkpoint";
// ============================================================================
// Logging
// ============================================================================
export {
  ConsoleTransport,
  configureLogger,
  createLogger,
  getLogger,
  Logger,
  type LoggerConfig,
  MemoryTransport,
} from "@ku0/agent-runtime-telemetry/logging";
// ============================================================================
// Telemetry
// ============================================================================
export * from "@ku0/agent-runtime-telemetry/telemetry";
export type {
  AggregatedResults,
  ScriptContext,
  ScriptExecutorConfig,
  ScriptResult,
  SubagentConfig,
  SubagentResult,
  SubagentTask,
  SubagentType,
  SubagentWorkItem,
  ToolSearchCriteria,
  ToolSearchResult,
  WorkTask,
} from "@ku0/agent-runtime-tools";
// Subagent Orchestration
// Script Executor
// Tool Discovery
export {
  CodebaseResearchSubagent,
  createScriptExecutor,
  createSubagentOrchestrator,
  createToolDiscoveryEngine,
  ParallelWorkSubagent,
  SCRIPT_TEMPLATES,
  SubagentManager,
  TerminalExecutorSubagent,
} from "@ku0/agent-runtime-tools";
// ============================================================================
// Agents
// ============================================================================
export {
  AGENT_PROFILES,
  AgentManager,
  createAgentManager,
  getAgentProfile,
  listAgentTypes,
  VerifierAgent,
} from "./agents";
// ============================================================================
// Assets
// ============================================================================
export * from "./assets";
// ============================================================================
// Bridge (AI-Native Integration)
// ============================================================================
export * from "./bridge";
// ============================================================================
// Browser
// ============================================================================
export * from "./browser";
// ============================================================================
// Context
// ============================================================================
export * from "./context";
// ============================================================================
// Cowork
// ============================================================================
export * from "./cowork";
// ============================================================================
// Execution Plane
// ============================================================================
export * from "./execution";
// ============================================================================
// Tool Execution Pipeline
// ============================================================================
export * from "./executor";
// ============================================================================
// Graph Runtime
// ============================================================================
export * from "./graph";
// ============================================================================
// Kernel Interfaces
// ============================================================================
export * from "./kernel";
// ============================================================================
// Knowledge (Scoped Conditional Injection)
// ============================================================================
export * from "./knowledge";
// ============================================================================
// Learning
// ============================================================================
export * from "./learning";
// ============================================================================
// LSP (Deep Code Perception)
// ============================================================================
export * from "./lsp";
// ============================================================================
// Modes (Plan/Build Agent Modes)
// ============================================================================
export * from "./modes";
// ============================================================================
// Orchestrator (with performance optimizations)
// ============================================================================
export * from "./orchestrator";
// Performance optimization components
export {
  createDependencyAnalyzer,
  createMessageCompressor,
  createRequestCache,
} from "./orchestrator";
// Consensus Orchestration
export {
  ConsensusOrchestrator,
  createConsensusOrchestrator,
} from "./orchestrator/consensusOrchestrator";
export type { RecoveryStrategy } from "./orchestrator/errorRecovery";
// Error Recovery
export { createErrorRecoveryEngine } from "./orchestrator/errorRecovery";
export type { ExecutionPlan, PlanningConfig, PlanStep } from "./orchestrator/planning";
// Planning System
export { createPlanningEngine } from "./orchestrator/planning";
// ============================================================================
// Pipeline
// ============================================================================
export * from "./pipeline";
// ============================================================================
// Plugins
// ============================================================================
export * from "./plugins";
export * from "./preflight";
// ============================================================================
// Preflight
// ============================================================================
export {
  type PreflightRunInput,
  runPreflightPlan,
  summarizePreflightResults,
} from "./preflight/runner";
export {
  type PreflightSelectionInput,
  type PreflightSelectionRule,
  selectPreflightChecks,
} from "./preflight/selector";
export type {
  PreflightCheckDefinition,
  PreflightCheckKind,
  PreflightCheckResult,
  PreflightCheckStatus,
  PreflightPlan,
  PreflightReport,
} from "./preflight/types";
// ============================================================================
// Prompts
// ============================================================================
export { createPromptBuilder } from "./prompts";
export type { BuiltPrompt, ExecutionPhase, PromptContext, TaskType } from "./prompts/promptBuilder";
// ============================================================================
// Quota
// ============================================================================
export * from "./quota";
// ============================================================================
// Reasoning (Extended Thinking)
// ============================================================================
export * from "./reasoning";
// ============================================================================
// Routing
// ============================================================================
export * from "./routing";
export type { CreateRuntimeOptions, RuntimeComponents, RuntimeInstance } from "./runtime";
// ============================================================================
// Runtime Composition Root
// ============================================================================
export { createRuntime } from "./runtime";
// ============================================================================
// Sandbox
// ============================================================================
export * from "./sandbox";
// ============================================================================
// Security
// ============================================================================
export * from "./security";
// ============================================================================
// Session State
// ============================================================================
export * from "./session";
// ============================================================================
// Skills (Agent Skills)
// ============================================================================
export * from "./skills";
// ============================================================================
// SOP (Standard Operating Procedures)
// ============================================================================
export * from "./sop";
// ============================================================================
// Tool Output Spooling
// ============================================================================
export * from "./spooling";
// ============================================================================
// Streaming
// ============================================================================
export * from "./streaming";
// ============================================================================
// Swarm (Multi-Agent Orchestration)
// ============================================================================
export * from "./swarm";
// ============================================================================
// Background Tasks
// ============================================================================
export * from "./tasks";
// ============================================================================
// Teams (Multi-Agent Orchestration)
// ============================================================================
export * from "./teams";
// ============================================================================
// Tools
// ============================================================================
export * from "./tools";
// ============================================================================
// Types
// ============================================================================
export * from "./types";
// ============================================================================
// Utilities
// ============================================================================
export * from "./utils";
export type { WorkflowContext, WorkflowPhase, WorkflowTemplate } from "./workflows";
// ============================================================================
// Workflows
// ============================================================================
export { BUILT_IN_WORKFLOWS, createWorkflowTemplateManager } from "./workflows";

// ============================================================================
// Convenience Re-exports
// ============================================================================

// Quick access to commonly used factories
export {
  type AIEnvelopeGateway,
  ClarificationToolServer,
  COMPLETION_TOOL_DEFINITION,
  COMPLETION_TOOL_NAME,
  COMPLETION_TOOL_SCHEMA,
  type CompleteTaskInput,
  type CompletionEvent,
  CompletionToolServer,
  type CompletionValidationResult,
  createAgentToolkitToolServer,
  createBashToolServer,
  createClarificationToolServer,
  createCodeInteractionServer,
  createCodeToolServer,
  createCompletionToolServer,
  createFileToolServer,
  createGitToolServer,
  createLFCCToolServer,
  createSubagentToolServer,
  createToolRegistry,
  createToolRegistryView,
  createWebSearchToolServer,
  type LFCCToolServerOptions,
  type MultiDocumentGatewayRequest,
  type MultiDocumentGatewayResponse,
  type MultiDocumentPolicy,
  type MultiDocumentRequestDocument,
  type MultiDocumentRole,
  ToolRegistryView,
  type ToolRegistryViewOptions,
  validateCompletionInput,
} from "@ku0/agent-runtime-tools";
// LSP Tools (Semantic Code Intelligence)
export {
  createLspToolServer,
  createTypeScriptProvider,
  LspClient,
  type LspClientOptions,
  type LspProvider,
} from "@ku0/tool-lsp";
export { createAICoreAdapter, createMockLLM } from "./orchestrator/aiCoreAdapter";
export { createCodeAgentOrchestrator } from "./orchestrator/codeAgentFactory";
export { createOrchestrator } from "./orchestrator/orchestrator";
