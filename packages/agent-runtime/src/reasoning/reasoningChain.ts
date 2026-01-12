/**
 * Reasoning Chain Implementation
 *
 * Manages the creation and manipulation of reasoning chains.
 * Provides structured access to reasoning steps with validation.
 */

import type {
  ChainAnalysis,
  ReasoningChain,
  ReasoningStatus,
  ReasoningStep,
  ReasoningStepType,
  SummarizeOptions,
} from "./types";

// ============================================================================
// Reasoning Chain Builder
// ============================================================================

/**
 * Builder for creating reasoning chains.
 */
export class ReasoningChainBuilder {
  private chain: ReasoningChain;
  private stepCounter = 0;

  constructor(budgetTokens: number) {
    this.chain = {
      id: generateChainId(),
      steps: [],
      status: "thinking",
      totalTokens: 0,
      budgetTokens,
      confidence: 0,
      summary: "",
      startedAt: Date.now(),
      reflectionCount: 0,
      corrections: [],
    };
  }

  /**
   * Get the chain ID.
   */
  get id(): string {
    return this.chain.id;
  }

  /**
   * Get current status.
   */
  get status(): ReasoningStatus {
    return this.chain.status;
  }

  /**
   * Get remaining token budget.
   */
  get remainingBudget(): number {
    return Math.max(0, this.chain.budgetTokens - this.chain.totalTokens);
  }

  /**
   * Add a step to the chain.
   */
  addStep(
    type: ReasoningStepType,
    content: string,
    options: {
      confidence?: number;
      parentId?: string;
      tags?: string[];
      metadata?: Record<string, unknown>;
    } = {}
  ): ReasoningStep {
    const tokens = estimateTokens(content);

    const step: ReasoningStep = {
      id: `step-${++this.stepCounter}`,
      type,
      content,
      confidence: options.confidence ?? 0.5,
      tokens,
      timestamp: Date.now(),
      parentId: options.parentId,
      tags: options.tags,
      metadata: options.metadata,
    };

    this.chain.steps.push(step);
    this.chain.totalTokens += tokens;

    return step;
  }

  /**
   * Add an observation step.
   */
  observe(content: string, confidence = 0.9): ReasoningStep {
    return this.addStep("observation", content, { confidence });
  }

  /**
   * Add a hypothesis step.
   */
  hypothesize(content: string, confidence = 0.5): ReasoningStep {
    return this.addStep("hypothesis", content, { confidence });
  }

  /**
   * Add a plan step.
   */
  plan(content: string, confidence = 0.7): ReasoningStep {
    return this.addStep("plan", content, { confidence });
  }

  /**
   * Add an action step.
   */
  act(content: string, confidence = 0.8): ReasoningStep {
    return this.addStep("action", content, { confidence });
  }

  /**
   * Add a result step.
   */
  result(content: string, confidence = 0.9): ReasoningStep {
    return this.addStep("result", content, { confidence });
  }

  /**
   * Add a reflection step.
   */
  reflect(content: string, confidence = 0.6): ReasoningStep {
    this.chain.reflectionCount++;
    return this.addStep("reflection", content, { confidence });
  }

  /**
   * Add a correction step.
   */
  correct(fromStepId: string, content: string, reason: string): ReasoningStep {
    const step = this.addStep("correction", content, {
      confidence: 0.7,
      metadata: { corrects: fromStepId, reason },
    });

    this.chain.corrections.push({
      fromStepId,
      toStepId: step.id,
      reason,
    });

    return step;
  }

  /**
   * Make a decision and complete the chain.
   */
  decide(decision: string, confidence: number): ReasoningChain {
    this.addStep("decision", decision, { confidence });

    this.chain.status = confidence >= 0.7 ? "decided" : "uncertain";
    this.chain.confidence = confidence;
    this.chain.summary = this.generateSummary();
    this.chain.completedAt = Date.now();

    return this.chain;
  }

  /**
   * Mark the chain as having an error.
   */
  error(message: string): ReasoningChain {
    this.addStep("reflection", `Error: ${message}`, { confidence: 0 });
    this.chain.status = "error";
    this.chain.completedAt = Date.now();
    return this.chain;
  }

  /**
   * Set status to reflecting.
   */
  startReflection(): void {
    this.chain.status = "reflecting";
  }

  /**
   * End reflection and return to thinking.
   */
  endReflection(): void {
    this.chain.status = "thinking";
  }

  /**
   * Get the built chain.
   */
  build(): ReasoningChain {
    return { ...this.chain };
  }

  /**
   * Get steps of a specific type.
   */
  getStepsByType(type: ReasoningStepType): ReasoningStep[] {
    return this.chain.steps.filter((s) => s.type === type);
  }

  /**
   * Get the last step.
   */
  getLastStep(): ReasoningStep | undefined {
    return this.chain.steps[this.chain.steps.length - 1];
  }

  /**
   * Get steps below confidence threshold.
   */
  getLowConfidenceSteps(threshold: number): ReasoningStep[] {
    return this.chain.steps.filter((s) => s.confidence < threshold);
  }

  /**
   * Generate a summary of the reasoning chain.
   */
  private generateSummary(): string {
    const observations = this.getStepsByType("observation");
    const decisions = this.getStepsByType("decision");
    const corrections = this.chain.corrections.length;

    const parts: string[] = [];

    if (observations.length > 0) {
      parts.push(`Observations: ${observations.length}`);
    }

    if (decisions.length > 0) {
      const lastDecision = decisions[decisions.length - 1];
      parts.push(`Decision: ${truncate(lastDecision.content, 100)}`);
    }

    if (corrections > 0) {
      parts.push(`Corrections made: ${corrections}`);
    }

    parts.push(`Confidence: ${(this.chain.confidence * 100).toFixed(0)}%`);

    return parts.join(" | ");
  }
}

// ============================================================================
// Chain Analysis
// ============================================================================

/**
 * Analyze a reasoning chain for insights.
 */
export function analyzeChain(chain: ReasoningChain): ChainAnalysis {
  const stepsByType: Record<ReasoningStepType, number> = {
    observation: 0,
    hypothesis: 0,
    plan: 0,
    action: 0,
    result: 0,
    reflection: 0,
    decision: 0,
    correction: 0,
  };

  let totalConfidence = 0;
  const lowConfidenceSteps: ReasoningStep[] = [];

  for (const step of chain.steps) {
    stepsByType[step.type]++;
    totalConfidence += step.confidence;

    if (step.confidence < 0.5) {
      lowConfidenceSteps.push(step);
    }
  }

  const reasoningTimeMs = (chain.completedAt ?? Date.now()) - chain.startedAt;

  // Efficiency: higher is better (more confidence per token)
  const efficiency = chain.totalTokens > 0 ? (chain.confidence * 100) / chain.totalTokens : 0;

  return {
    stepCount: chain.steps.length,
    stepsByType,
    averageConfidence: chain.steps.length > 0 ? totalConfidence / chain.steps.length : 0,
    lowConfidenceSteps,
    correctionCount: chain.corrections.length,
    reasoningTimeMs,
    efficiency,
  };
}

/**
 * Summarize a chain for LLM context.
 */
export function summarizeChain(chain: ReasoningChain, options: SummarizeOptions = {}): string {
  const {
    maxTokens = 500,
    includeSteps = true,
    includeCorrections = true,
    format = "text",
  } = options;

  const lines: string[] = [];

  if (format === "markdown") {
    lines.push("## Reasoning Summary");
    lines.push("");
  }

  // Status and confidence
  lines.push(`Status: ${chain.status} (${(chain.confidence * 100).toFixed(0)}% confident)`);

  if (includeSteps && chain.steps.length > 0) {
    appendStepSummary(lines, chain.steps, format);
  }

  if (includeCorrections && chain.corrections.length > 0) {
    appendCorrectionSummary(lines, chain.corrections, format);
  }

  // Final summary
  if (chain.summary) {
    if (format === "markdown") {
      lines.push("");
      lines.push("### Summary");
    }
    lines.push(chain.summary);
  }

  let result = lines.join("\n");

  // Truncate to max tokens (rough estimate)
  const estimatedTokens = estimateTokens(result);
  if (estimatedTokens > maxTokens) {
    const ratio = maxTokens / estimatedTokens;
    const maxChars = Math.floor(result.length * ratio);
    result = `${result.substring(0, maxChars)}...`;
  }

  return result;
}

function appendStepSummary(
  lines: string[],
  steps: ReasoningStep[],
  format: "text" | "markdown" | "json"
): void {
  if (format === "json") {
    return; // JSON handled disjointly or not supported in text builder
  }

  if (format === "markdown") {
    lines.push("");
    lines.push("### Key Steps");
  }

  // Include key steps (observations, decisions, corrections)
  const keySteps = steps.filter(
    (s) => s.type === "observation" || s.type === "decision" || s.type === "correction"
  );

  for (const step of keySteps.slice(-5)) {
    const prefix = format === "markdown" ? "- " : "• ";
    lines.push(`${prefix}[${step.type}] ${truncate(step.content, 80)}`);
  }
}

function appendCorrectionSummary(
  lines: string[],
  corrections: { reason: string }[],
  format: "text" | "markdown" | "json"
): void {
  if (format === "json") {
    return;
  }

  if (format === "markdown") {
    lines.push("");
    lines.push("### Corrections Made");
  }

  for (const correction of corrections) {
    const prefix = format === "markdown" ? "- " : "• ";
    lines.push(`${prefix}${correction.reason}`);
  }
}

/**
 * Export chain to JSON for debugging.
 */
export function exportChain(chain: ReasoningChain): string {
  return JSON.stringify(chain, null, 2);
}

/**
 * Validate a chain for common issues.
 */
export function validateChain(chain: ReasoningChain): string[] {
  const issues: string[] = [];

  if (chain.steps.length === 0) {
    issues.push("Chain has no steps");
  }

  const hasDecision = chain.steps.some((s) => s.type === "decision");
  if (chain.status === "decided" && !hasDecision) {
    issues.push("Chain marked as decided but has no decision step");
  }

  if (chain.totalTokens > chain.budgetTokens) {
    issues.push(`Chain exceeded token budget (${chain.totalTokens} > ${chain.budgetTokens})`);
  }

  const lowConfidenceDecisions = chain.steps.filter(
    (s) => s.type === "decision" && s.confidence < 0.5
  );
  if (lowConfidenceDecisions.length > 0) {
    issues.push("Chain has low-confidence decisions");
  }

  return issues;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a unique chain ID.
 */
function generateChainId(): string {
  return `chain-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Estimate token count for a string.
 * Uses a simple heuristic: ~4 characters per token.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Truncate a string with ellipsis.
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.substring(0, maxLength - 3)}...`;
}
