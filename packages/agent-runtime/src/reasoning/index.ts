/**
 * Reasoning Module
 *
 * Extended thinking and reasoning chain system.
 * Provides structured reasoning with self-correction.
 */

// Types
export type {
  ChainAnalysis,
  IThinkingEngine,
  ReasoningChain,
  ReasoningStatus,
  ReasoningStep,
  ReasoningStepType,
  ReflectionPrompt,
  SummarizeOptions,
  ThinkingBudget,
  ThinkingConfig,
  ReasoningThinkingEvent,
  ReasoningThinkingEventHandler,
  ThinkingEventType,
  ThinkingVisibility,
} from "./types";

export {
  DEFAULT_THINKING_CONFIG,
  REFLECTION_PROMPTS,
  THINKING_BUDGETS,
} from "./types";

// Reasoning Chain
export {
  ReasoningChainBuilder,
  analyzeChain,
  exportChain,
  summarizeChain,
  validateChain,
} from "./reasoningChain";

// Thinking Engine
export {
  ThinkingEngine,
  createDeepThinkingEngine,
  createQuickThinkingEngine,
  createThinkingEngine,
  reasoningWrapper,
  withReasoning,
} from "./thinkingEngine";
