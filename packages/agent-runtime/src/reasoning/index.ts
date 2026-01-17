/**
 * Reasoning Module
 *
 * Extended thinking and reasoning chain system.
 * Provides structured reasoning with self-correction.
 */

// Reasoning Chain
export {
  analyzeChain,
  exportChain,
  ReasoningChainBuilder,
  summarizeChain,
  validateChain,
} from "./reasoningChain";
// Thinking Engine
export {
  createDeepThinkingEngine,
  createQuickThinkingEngine,
  createThinkingEngine,
  reasoningWrapper,
  ThinkingEngine,
  withReasoning,
} from "./thinkingEngine";
// Types
export type {
  ChainAnalysis,
  IThinkingEngine,
  ReasoningChain,
  ReasoningStatus,
  ReasoningStep,
  ReasoningStepType,
  ReasoningThinkingEvent,
  ReasoningThinkingEventHandler,
  ReflectionPrompt,
  SummarizeOptions,
  ThinkingBudget,
  ThinkingConfig,
  ThinkingEventType,
  ThinkingVisibility,
} from "./types";
export {
  DEFAULT_THINKING_CONFIG,
  REFLECTION_PROMPTS,
  THINKING_BUDGETS,
} from "./types";
