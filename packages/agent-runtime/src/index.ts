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
// Memory (Cross-Session Knowledge)
// ============================================================================
export * from "@ku0/agent-runtime-memory";
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
// Artifacts
// ============================================================================
export * from "./artifacts";
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
// Checkpoint
// ============================================================================
export * from "./checkpoint";
// ============================================================================
// Context
// ============================================================================
export * from "./context";
// ============================================================================
// Cowork
// ============================================================================
export * from "./cowork";
// ============================================================================
// Events
// ============================================================================
export * from "./events";
// ============================================================================
// Tool Execution Pipeline
// ============================================================================
export * from "./executor";
// ============================================================================
// Kernel Interfaces
// ============================================================================
export * from "./kernel";
// ============================================================================
// Knowledge (Scoped Conditional Injection)
// ============================================================================
export * from "./knowledge";
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
export type { AggregatedResults, SubagentTask } from "./orchestrator/subagentOrchestrator";
// Subagent Orchestration
export { createSubagentOrchestrator } from "./orchestrator/subagentOrchestrator";
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
// Tools
// ============================================================================
export * from "./tools";
export type {
  ScriptContext,
  ScriptExecutorConfig,
  ScriptResult,
} from "./tools/core/scriptExecutor";
// Script Executor
export { createScriptExecutor, SCRIPT_TEMPLATES } from "./tools/core/scriptExecutor";
export type { ToolSearchCriteria, ToolSearchResult } from "./tools/discovery/toolDiscovery";
// Tool Discovery
export { createToolDiscoveryEngine } from "./tools/discovery/toolDiscovery";
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
export { createBashToolServer } from "./tools/core/bash";
export { createCodeToolServer } from "./tools/core/code";
export {
  COMPLETION_TOOL_DEFINITION,
  COMPLETION_TOOL_NAME,
  COMPLETION_TOOL_SCHEMA,
  type CompleteTaskInput,
  type CompletionEvent,
  CompletionToolServer,
  type CompletionValidationResult,
  createCompletionToolServer,
  validateCompletionInput,
} from "./tools/core/completion";
export { createFileToolServer } from "./tools/core/file";
export { createSubagentToolServer } from "./tools/core/subagent";
export { createGitToolServer } from "./tools/git/gitServer";
export {
  type AIEnvelopeGateway,
  createLFCCToolServer,
  type LFCCToolServerOptions,
  type MultiDocumentGatewayRequest,
  type MultiDocumentGatewayResponse,
  type MultiDocumentPolicy,
  type MultiDocumentRequestDocument,
  type MultiDocumentRole,
} from "./tools/lfcc/lfccServer";
// Quick access to commonly used factories
export { createToolRegistry } from "./tools/mcp/registry";
export { createWebSearchToolServer } from "./tools/web/webSearchServer";
