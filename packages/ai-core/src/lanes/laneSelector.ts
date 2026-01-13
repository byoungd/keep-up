/**
 * Lane Selectors
 *
 * Automatic lane selection based on request complexity and user preferences.
 * Provides pre-built selectors and utilities for custom selection logic.
 *
 * Track B: Intelligence & Grounding
 */

import type {
  ComplexityHints,
  LaneCompletionRequest,
  LaneSelectionContext,
  LaneSelector,
  ModelLane,
} from "./types";

// ============================================================================
// Pre-built Selectors
// ============================================================================

/**
 * Create a complexity-based lane selector.
 *
 * Selection logic:
 * 1. User preference takes precedence (if valid)
 * 2. Explicit complexity hints guide selection
 * 3. Heuristics based on message content
 */
export function createComplexityBasedSelector(
  options: ComplexitySelectorOptions = {}
): LaneSelector {
  const {
    tokenThreshold = 4000,
    reasoningKeywords = DEFAULT_REASONING_KEYWORDS,
    simpleQAPatterns = DEFAULT_SIMPLE_QA_PATTERNS,
    defaultLane = "fast",
  } = options;

  return (request: LaneCompletionRequest, context: LaneSelectionContext): ModelLane => {
    // 1. User preference takes precedence
    if (context.userPreference) {
      return context.userPreference;
    }

    // 2. Explicit complexity hints
    const hints = context.complexityHints ?? request.complexityHints;
    const laneFromHints = hints ? selectFromHints(hints) : null;
    if (laneFromHints) {
      return laneFromHints;
    }

    // 3. Heuristics based on message content
    const estimatedTokens = context.estimatedInputTokens ?? estimateTokenCount(request.messages);

    // Long context → deep
    if (estimatedTokens > tokenThreshold) {
      return "deep";
    }

    // Check message content for complexity indicators
    return selectFromMessageContent(
      request.messages,
      reasoningKeywords,
      simpleQAPatterns,
      defaultLane
    );
  };
}

/**
 * Create a preference-based selector that respects user settings.
 */
export function createPreferenceBasedSelector(
  options: PreferenceSelectorOptions = {}
): LaneSelector {
  const { preferredLane = "fast", allowOverride = true } = options;

  return (_request: LaneCompletionRequest, context: LaneSelectionContext): ModelLane => {
    // Allow explicit override from context
    if (allowOverride && context.userPreference) {
      return context.userPreference;
    }

    return preferredLane;
  };
}

/**
 * Create a consensus selector that always uses consensus for certain scenarios.
 */
export function createConsensusSelector(options: ConsensusSelectorOptions = {}): LaneSelector {
  const {
    requireConsensusFor = [],
    consensusKeywords = ["important", "critical", "verify", "double-check"],
    fallbackSelector,
  } = options;

  return (request: LaneCompletionRequest, context: LaneSelectionContext): ModelLane => {
    // Check if topic requires consensus
    const topics = request.metadata?.topics as string[] | undefined;
    if (topics && requireConsensusFor.some((t) => topics.includes(t))) {
      return "consensus";
    }

    // Check for consensus-triggering keywords
    const lastUserMessage = getLastUserMessage(request.messages);
    if (
      lastUserMessage &&
      consensusKeywords.some((kw) => lastUserMessage.toLowerCase().includes(kw))
    ) {
      return "consensus";
    }

    // Use fallback selector if provided
    if (fallbackSelector) {
      return fallbackSelector(request, context);
    }

    return context.userPreference ?? "deep";
  };
}

/**
 * Combine multiple selectors with priority.
 */
export function combineSelectors(...selectors: LaneSelector[]): LaneSelector {
  return (request: LaneCompletionRequest, context: LaneSelectionContext): ModelLane => {
    for (const selector of selectors) {
      const result = selector(request, context);
      // Return first non-fast result, or last result
      if (result !== "fast") {
        return result;
      }
    }
    // All selectors returned "fast"
    return "fast";
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Select lane based on complexity hints.
 */
function selectFromHints(hints: ComplexityHints): ModelLane | null {
  // Simple Q&A → fast
  if (hints.isSimpleQA) {
    return "fast";
  }

  // Reasoning or planning → deep
  if (hints.requiresReasoning || hints.requiresPlanning) {
    return "deep";
  }

  // Code generation with long response → deep
  if (hints.requiresCodeGeneration && hints.expectedResponseLength === "long") {
    return "deep";
  }

  // Short expected response → fast
  if (hints.expectedResponseLength === "short") {
    return "fast";
  }

  return null;
}

/**
 * Get the last user message from the message array.
 */
function getLastUserMessage(messages: Array<{ role: string; content: string }>): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      return messages[i].content;
    }
  }
  return null;
}

/**
 * Select lane based on message content analysis.
 */
function selectFromMessageContent(
  messages: Array<{ role: string; content: string }>,
  reasoningKeywords: string[],
  simpleQAPatterns: RegExp[],
  defaultLane: ModelLane
): ModelLane {
  const lastUserMessage = getLastUserMessage(messages);
  if (!lastUserMessage) {
    return defaultLane;
  }

  // Reasoning keywords → deep
  if (containsReasoningKeywords(lastUserMessage, reasoningKeywords)) {
    return "deep";
  }

  // Simple Q&A patterns → fast
  if (matchesSimpleQAPatterns(lastUserMessage, simpleQAPatterns)) {
    return "fast";
  }

  return defaultLane;
}

/**
 * Check if message contains reasoning keywords.
 */
function containsReasoningKeywords(message: string, keywords: string[]): boolean {
  const lowerMessage = message.toLowerCase();
  return keywords.some((keyword) => lowerMessage.includes(keyword));
}

/**
 * Check if message matches simple Q&A patterns.
 */
function matchesSimpleQAPatterns(message: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(message));
}

/**
 * Estimate token count from messages (rough approximation).
 */
function estimateTokenCount(messages: Array<{ role: string; content: string }>): number {
  let totalChars = 0;
  for (const msg of messages) {
    totalChars += msg.content.length;
  }
  // Rough approximation: ~4 chars per token
  return Math.ceil(totalChars / 4);
}

// ============================================================================
// Types
// ============================================================================

/** Options for complexity-based selector */
export interface ComplexitySelectorOptions {
  /** Token threshold for switching to deep (default: 4000) */
  tokenThreshold?: number;
  /** Keywords that indicate need for reasoning */
  reasoningKeywords?: string[];
  /** Patterns that indicate simple Q&A */
  simpleQAPatterns?: RegExp[];
  /** Default lane when no signals (default: "fast") */
  defaultLane?: ModelLane;
}

/** Options for preference-based selector */
export interface PreferenceSelectorOptions {
  /** User's preferred lane (default: "fast") */
  preferredLane?: ModelLane;
  /** Allow context to override preference (default: true) */
  allowOverride?: boolean;
}

/** Options for consensus selector */
export interface ConsensusSelectorOptions {
  /** Topics that require consensus */
  requireConsensusFor?: string[];
  /** Keywords that trigger consensus */
  consensusKeywords?: string[];
  /** Fallback selector for non-consensus cases */
  fallbackSelector?: LaneSelector;
}

// ============================================================================
// Constants
// ============================================================================

/** Default keywords that indicate need for deep reasoning */
const DEFAULT_REASONING_KEYWORDS = [
  "analyze",
  "explain why",
  "compare and contrast",
  "evaluate",
  "synthesize",
  "critique",
  "assess",
  "reason through",
  "step by step",
  "think carefully",
  "consider all",
  "weigh the",
  "pros and cons",
  "implications",
  "consequences",
  "trade-offs",
  "architectural",
  "design decision",
];

/** Default patterns for simple Q&A */
const DEFAULT_SIMPLE_QA_PATTERNS = [
  /^what is (?:a |an |the )?[\w\s]+\?$/i,
  /^who (?:is|was) [\w\s]+\?$/i,
  /^when (?:did|was|is) [\w\s]+\?$/i,
  /^where (?:is|was|are) [\w\s]+\?$/i,
  /^how (?:do|does|did) (?:you|I|we) [\w\s]+\?$/i,
  /^(?:yes|no|true|false)\??$/i,
  /^(?:define|describe) [\w\s]+$/i,
];
