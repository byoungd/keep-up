/**
 * Context Module
 *
 * Provides context management for agents.
 */

export {
  ContextManager,
  createContextManager,
  type AgentContext,
  type ContextFact,
  type CachedResult,
  type ContextManagerOptions,
  type CreateContextOptions,
} from "./contextManager";

export {
  TieredContextBuilder,
  type ContextItem,
  type ContextTier,
  type ContextBudget,
  type ContextBuildResult,
  type TieredContextConfig,
} from "./contextBuilder";

export {
  ContextCompactor,
  createContextCompactor,
  type Message,
  type ToolCall,
  type ToolResult,
  type CompactionOptions,
  type CompactionResult,
} from "./ContextCompactor";
