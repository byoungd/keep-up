/**
 * Context Module
 *
 * Provides context management for agents.
 */

// Active Context (Workflow State & Auto-Resume)
export * from "./active";
export {
  type CompactionOptions,
  type CompactionResult,
  ContextCompactor,
  type ContextManagementConfig,
  createContextCompactor,
  type Message,
  type ThresholdCheckResult,
  type ToolCall,
  type ToolResult,
} from "./ContextCompactor";
export {
  type ContextBudget,
  type ContextBuildResult,
  type ContextItem,
  type ContextSourceType,
  type ContextTier,
  TieredContextBuilder,
  type TieredContextConfig,
} from "./contextBuilder";
export {
  ContextFrameBuilder,
  type ContextFrameBuilderConfig,
  type ContextFrameOutput,
} from "./contextFrame";
export {
  type AgentContext,
  type CachedResult,
  type ContextFact,
  ContextManager,
  type ContextManagerOptions,
  type ContextView,
  type CreateContextOptions,
  type CreateContextViewOptions,
  createContextManager,
} from "./contextManager";
