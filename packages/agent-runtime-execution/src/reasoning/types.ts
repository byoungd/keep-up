/**
 * Extended Thinking & Reasoning Types
 *
 * Type definitions for the structured reasoning system.
 * Inspired by Claude's extended thinking and chain-of-thought approaches.
 */

// ============================================================================
// Thinking Configuration
// ============================================================================

/**
 * Thinking budget preset levels.
 */
export type ThinkingBudget = "minimal" | "standard" | "extended" | "unlimited";

/**
 * Visibility level for reasoning output.
 */
export type ThinkingVisibility = "hidden" | "streaming" | "summary";

/**
 * Configuration for the thinking engine.
 */
export interface ThinkingConfig {
  /** Enable extended thinking mode */
  enabled: boolean;

  /** Thinking budget preset */
  budget: ThinkingBudget;

  /** Override budget with specific token count */
  budgetTokens?: number;

  /** How to expose reasoning to the user */
  visibility: ThinkingVisibility;

  /** Enable self-correction through reflection */
  selfCorrection: boolean;

  /** Maximum reflection iterations */
  maxReflections: number;

  /** Minimum confidence threshold for decisions (0-1) */
  confidenceThreshold: number;
}

/**
 * Default thinking configuration.
 */
export const DEFAULT_THINKING_CONFIG: ThinkingConfig = {
  enabled: true,
  budget: "standard",
  visibility: "summary",
  selfCorrection: true,
  maxReflections: 3,
  confidenceThreshold: 0.7,
};

/**
 * Token budgets for each preset level.
 */
export const THINKING_BUDGETS: Record<ThinkingBudget, number> = {
  minimal: 256,
  standard: 1024,
  extended: 4096,
  unlimited: Number.MAX_SAFE_INTEGER,
};

// ============================================================================
// Reasoning Steps
// ============================================================================

/**
 * Type of reasoning step.
 */
export type ReasoningStepType =
  | "observation" // What we see/know
  | "hypothesis" // What we think might be true
  | "plan" // What we intend to do
  | "action" // What we're doing
  | "result" // What happened
  | "reflection" // Self-evaluation
  | "decision" // Final determination
  | "correction"; // Fixing a previous mistake

/**
 * A single step in the reasoning chain.
 */
export interface ReasoningStep {
  /** Unique step ID */
  id: string;

  /** Type of reasoning step */
  type: ReasoningStepType;

  /** Step content (the actual reasoning) */
  content: string;

  /** Confidence level for this step (0-1) */
  confidence: number;

  /** Token count for this step */
  tokens: number;

  /** Timestamp when step was created */
  timestamp: number;

  /** Reference to parent step (for branching) */
  parentId?: string;

  /** Tags for categorization */
  tags?: string[];

  /** Metadata for debugging */
  metadata?: Record<string, unknown>;
}

/**
 * Status of a reasoning chain.
 */
export type ReasoningStatus =
  | "thinking" // Currently reasoning
  | "reflecting" // Self-evaluation phase
  | "decided" // Reached a decision
  | "uncertain" // Low confidence, needs input
  | "error"; // Reasoning failed

/**
 * A complete reasoning chain.
 */
export interface ReasoningChain {
  /** Unique chain ID */
  id: string;

  /** All steps in the chain */
  steps: ReasoningStep[];

  /** Current status */
  status: ReasoningStatus;

  /** Total tokens used */
  totalTokens: number;

  /** Budget limit for this chain */
  budgetTokens: number;

  /** Overall confidence (average of decision steps) */
  confidence: number;

  /** Final summary of reasoning */
  summary: string;

  /** Timestamp when chain started */
  startedAt: number;

  /** Timestamp when chain completed */
  completedAt?: number;

  /** Number of reflection iterations */
  reflectionCount: number;

  /** Any corrections made */
  corrections: Array<{
    fromStepId: string;
    toStepId: string;
    reason: string;
  }>;
}

// ============================================================================
// Thinking Events
// ============================================================================

/**
 * Events emitted by the thinking engine.
 */
export type ThinkingEventType =
  | "chain:start"
  | "step:added"
  | "step:updated"
  | "reflection:start"
  | "reflection:end"
  | "correction:made"
  | "chain:complete"
  | "chain:error"
  | "budget:warning"
  | "budget:exceeded";

/**
 * Thinking event payload.
 */
export interface ReasoningThinkingEvent {
  type: ThinkingEventType;
  chainId: string;
  timestamp: number;
  data: unknown;
}

/**
 * Handler for thinking events.
 */
export type ReasoningThinkingEventHandler = (event: ReasoningThinkingEvent) => void;

// ============================================================================
// Thinking Engine Interface
// ============================================================================

/**
 * Interface for the thinking engine.
 * Manages reasoning chains and self-correction.
 */
export interface IThinkingEngine {
  /** Start a new reasoning chain */
  startChain(task: string, config?: Partial<ThinkingConfig>): ReasoningChain;

  /** Add a step to the current chain */
  addStep(chainId: string, step: Omit<ReasoningStep, "id" | "timestamp" | "tokens">): ReasoningStep;

  /** Trigger reflection on the chain */
  reflect(chainId: string): Promise<ReasoningStep[]>;

  /** Make a correction to a previous step */
  correct(chainId: string, stepId: string, correction: string): ReasoningStep;

  /** Complete the chain with a decision */
  decide(chainId: string, decision: string, confidence: number): ReasoningChain;

  /** Get a chain by ID */
  getChain(chainId: string): ReasoningChain | undefined;

  /** Get summary suitable for LLM context */
  getSummary(chainId: string): string;

  /** Subscribe to thinking events */
  on(handler: ReasoningThinkingEventHandler): () => void;

  /** Check remaining budget */
  getRemainingBudget(chainId: string): number;

  /** Export chain for debugging/logging */
  export(chainId: string): string;
}

// ============================================================================
// Reflection Types
// ============================================================================

/**
 * Reflection prompt template.
 */
export interface ReflectionPrompt {
  /** Template ID */
  id: string;

  /** When to use this template */
  trigger: "always" | "low_confidence" | "error" | "complex_task";

  /** The prompt template (supports {{variables}}) */
  template: string;

  /** Expected response format */
  responseFormat: "free" | "structured";
}

/**
 * Built-in reflection prompts.
 */
export const REFLECTION_PROMPTS: ReflectionPrompt[] = [
  {
    id: "verify_reasoning",
    trigger: "always",
    template: `Review your reasoning chain:
{{steps}}

Questions to consider:
1. Are there any logical gaps or unsupported assumptions?
2. Did you consider alternative approaches?
3. Is your confidence level appropriate given the evidence?
4. What could go wrong with your current plan?`,
    responseFormat: "structured",
  },
  {
    id: "low_confidence",
    trigger: "low_confidence",
    template: `Your confidence is low ({{confidence}}). Consider:
1. What specific information would increase your confidence?
2. Are there simpler approaches you haven't considered?
3. Should you ask for clarification instead of proceeding?`,
    responseFormat: "structured",
  },
  {
    id: "error_recovery",
    trigger: "error",
    template: `An error occurred: {{error}}

Analyze:
1. What caused this error?
2. How can you recover?
3. Should you try a different approach?`,
    responseFormat: "structured",
  },
];

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Options for chain summarization.
 */
export interface SummarizeOptions {
  /** Maximum summary length in tokens */
  maxTokens?: number;

  /** Include step details */
  includeSteps?: boolean;

  /** Include corrections */
  includeCorrections?: boolean;

  /** Format for output */
  format?: "text" | "markdown" | "json";
}

/**
 * Result of chain analysis.
 */
export interface ChainAnalysis {
  /** Total steps */
  stepCount: number;

  /** Steps by type */
  stepsByType: Record<ReasoningStepType, number>;

  /** Average confidence */
  averageConfidence: number;

  /** Low confidence steps */
  lowConfidenceSteps: ReasoningStep[];

  /** Correction count */
  correctionCount: number;

  /** Time spent reasoning (ms) */
  reasoningTimeMs: number;

  /** Token efficiency (outcome quality / tokens used) */
  efficiency: number;
}
