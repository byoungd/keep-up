/**
 * Agent Runtime Tools
 *
 * Tool registry, tool servers, browser automation, plugins, and skills.
 */

export * from "./agents/lineage";
// Export approval module (AutoApprovalConfig comes from here)
export * from "./approval";
export * from "./browser";
export type {
  PartialToolUse,
  ToolAutoApprovalSettings,
  ToolCallbacks,
  ToolContext,
  ToolServices,
  ValidationResult,
} from "./coordinator";
// Coordinator exports - but not ToolMiddleware, ToolHandler, ToolDefinition as they conflict with existing
export { ToolCoordinator, ValidationError } from "./coordinator";
export type { HookConfig, HookInput, HookResult } from "./hooks";
// Hooks exports - but not HookType as it conflicts with plugins
export { HookExecutor } from "./hooks";
export * from "./orchestrator/planPersistence";
export { SubagentManager } from "./orchestrator/subagentManager";
export * from "./orchestrator/subagentOrchestrator";
export { CodebaseResearchSubagent } from "./orchestrator/subagents/codebaseResearch";
export { ParallelWorkSubagent, type WorkTask } from "./orchestrator/subagents/parallelWork";
export { TerminalExecutorSubagent } from "./orchestrator/subagents/terminalExecutor";
export type {
  SubagentConfig,
  SubagentResult,
  SubagentType,
  SubagentWorkItem,
} from "./orchestrator/subagents/types";
export * from "./plugins";
export * from "./skills";
export * from "./tools";
export {
  createScriptExecutor,
  SCRIPT_TEMPLATES,
  type ScriptContext,
  type ScriptExecutorConfig,
  type ScriptResult,
} from "./tools/core/scriptExecutor";
export {
  createToolDiscoveryEngine,
  ToolDiscoveryEngine,
  type ToolSearchCriteria,
  type ToolSearchResult,
} from "./tools/discovery/toolDiscovery";
