/**
 * Thinking Engine Implementation
 *
 * Core engine for extended thinking and reasoning.
 * Manages reasoning chains, reflection, and self-correction.
 */

import { countTokens } from "../utils/tokenCounter";
import {
  analyzeChain,
  ReasoningChainBuilder as ChainBuilder,
  exportChain,
  type ReasoningChainBuilder,
  summarizeChain,
} from "./reasoningChain";
import type {
  IThinkingEngine,
  ReasoningChain,
  ReasoningStep,
  ReasoningThinkingEvent,
  ReasoningThinkingEventHandler,
  ThinkingConfig,
  ThinkingEventType,
} from "./types";
import { DEFAULT_THINKING_CONFIG, REFLECTION_PROMPTS, THINKING_BUDGETS } from "./types";

// ============================================================================
// Thinking Engine
// ============================================================================

/**
 * Main thinking engine implementation.
 * Manages reasoning chains with reflection and self-correction.
 */
export class ThinkingEngine implements IThinkingEngine {
  private readonly config: ThinkingConfig;
  private readonly chains = new Map<string, ReasoningChainBuilder>();
  private readonly eventHandlers = new Set<ReasoningThinkingEventHandler>();

  constructor(config: Partial<ThinkingConfig> = {}) {
    this.config = { ...DEFAULT_THINKING_CONFIG, ...config };
  }

  /**
   * Start a new reasoning chain for a task.
   */
  startChain(task: string, configOverride?: Partial<ThinkingConfig>): ReasoningChain {
    const config = { ...this.config, ...configOverride };

    // Determine token budget
    const budgetTokens = config.budgetTokens ?? THINKING_BUDGETS[config.budget];

    // Create chain builder
    const builder = new ChainBuilder(budgetTokens);
    this.chains.set(builder.id, builder);

    // Add initial observation about the task
    builder.observe(`Task: ${task}`, 1.0);

    this.emit("chain:start", builder.id, { task, budget: budgetTokens });

    return builder.build();
  }

  /**
   * Add a step to an existing chain.
   */
  addStep(
    chainId: string,
    step: Omit<ReasoningStep, "id" | "timestamp" | "tokens">
  ): ReasoningStep {
    const builder = this.chains.get(chainId);
    if (!builder) {
      throw new Error(`Chain ${chainId} not found`);
    }

    // Check budget
    const remainingBudget = builder.remainingBudget;
    const estimatedTokens = countTokens(step.content);

    if (estimatedTokens > remainingBudget) {
      this.emit("budget:exceeded", chainId, {
        remaining: remainingBudget,
        required: estimatedTokens,
      });
    } else if (estimatedTokens > remainingBudget * 0.8) {
      this.emit("budget:warning", chainId, {
        remaining: remainingBudget,
        used: builder.build().totalTokens,
      });
    }

    // Add the step
    const addedStep = builder.addStep(step.type, step.content, {
      confidence: step.confidence,
      parentId: step.parentId,
      tags: step.tags,
      metadata: step.metadata,
    });

    this.emit("step:added", chainId, { step: addedStep });

    return addedStep;
  }

  /**
   * Trigger reflection on a chain.
   * Returns new steps added during reflection.
   */
  async reflect(chainId: string): Promise<ReasoningStep[]> {
    const builder = this.chains.get(chainId);
    if (!builder) {
      throw new Error(`Chain ${chainId} not found`);
    }

    const chain = builder.build();

    // Check if we've exceeded reflection limit
    if (chain.reflectionCount >= this.config.maxReflections) {
      return [];
    }

    builder.startReflection();
    this.emit("reflection:start", chainId, {
      iteration: chain.reflectionCount + 1,
    });

    const newSteps: ReasoningStep[] = [];

    try {
      // Analyze the chain for issues
      const analysis = analyzeChain(chain);

      // Add reflection based on analysis
      if (analysis.lowConfidenceSteps.length > 0) {
        const step = builder.reflect(
          `Low confidence detected in ${analysis.lowConfidenceSteps.length} steps. Consider gathering more information or trying alternative approaches.`,
          0.6
        );
        newSteps.push(step);
      }

      // Check for correction opportunities
      if (analysis.correctionCount === 0 && chain.steps.length > 3) {
        // Prompt for self-verification
        const step = builder.reflect(
          "Self-verification: Review previous steps for logical consistency " +
            "and potential improvements.",
          0.7
        );
        newSteps.push(step);
      }

      // Check confidence threshold
      if (
        analysis.averageConfidence < this.config.confidenceThreshold &&
        this.config.selfCorrection
      ) {
        const step = builder.reflect(
          `Overall confidence (${(analysis.averageConfidence * 100).toFixed(0)}%) is below threshold (${(this.config.confidenceThreshold * 100).toFixed(0)}%). Consider asking for clarification or taking a different approach.`,
          0.5
        );
        newSteps.push(step);
      }
    } finally {
      builder.endReflection();
      this.emit("reflection:end", chainId, { stepsAdded: newSteps.length });
    }

    return newSteps;
  }

  /**
   * Make a correction to a previous step.
   */
  correct(chainId: string, stepId: string, correction: string): ReasoningStep {
    const builder = this.chains.get(chainId);
    if (!builder) {
      throw new Error(`Chain ${chainId} not found`);
    }

    const chain = builder.build();
    const originalStep = chain.steps.find((s) => s.id === stepId);

    if (!originalStep) {
      throw new Error(`Step ${stepId} not found in chain ${chainId}`);
    }

    const reason = `Correcting ${originalStep.type}: "${originalStep.content.substring(0, 50)}..."`;
    const step = builder.correct(stepId, correction, reason);

    this.emit("correction:made", chainId, {
      originalStep,
      correctionStep: step,
      reason,
    });

    return step;
  }

  /**
   * Complete the chain with a decision.
   */
  decide(chainId: string, decision: string, confidence: number): ReasoningChain {
    const builder = this.chains.get(chainId);
    if (!builder) {
      throw new Error(`Chain ${chainId} not found`);
    }

    const chain = builder.decide(decision, confidence);

    this.emit("chain:complete", chainId, {
      status: chain.status,
      confidence: chain.confidence,
      summary: chain.summary,
    });

    return chain;
  }

  /**
   * Get a chain by ID.
   */
  getChain(chainId: string): ReasoningChain | undefined {
    const builder = this.chains.get(chainId);
    return builder?.build();
  }

  /**
   * Get summary suitable for LLM context.
   */
  getSummary(chainId: string): string {
    const builder = this.chains.get(chainId);
    if (!builder) {
      return "";
    }

    const chain = builder.build();
    return summarizeChain(chain, {
      maxTokens: 300,
      includeSteps: true,
      includeCorrections: true,
      format: "text",
    });
  }

  /**
   * Subscribe to thinking events.
   */
  on(handler: ReasoningThinkingEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  /**
   * Check remaining budget for a chain.
   */
  getRemainingBudget(chainId: string): number {
    const builder = this.chains.get(chainId);
    return builder?.remainingBudget ?? 0;
  }

  /**
   * Export chain for debugging.
   */
  export(chainId: string): string {
    const builder = this.chains.get(chainId);
    if (!builder) {
      return "{}";
    }
    return exportChain(builder.build());
  }

  /**
   * Get all active chain IDs.
   */
  getActiveChains(): string[] {
    return Array.from(this.chains.keys()).filter((id) => {
      const builder = this.chains.get(id);
      const status = builder?.status;
      return status === "thinking" || status === "reflecting";
    });
  }

  /**
   * Clean up completed chains.
   */
  cleanup(olderThanMs = 3600000): number {
    const cutoff = Date.now() - olderThanMs;
    let cleaned = 0;

    for (const [id, builder] of this.chains) {
      const chain = builder.build();
      if (
        chain.completedAt &&
        chain.completedAt < cutoff &&
        (chain.status === "decided" || chain.status === "error")
      ) {
        this.chains.delete(id);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Get reflection prompt for a trigger.
   */
  getReflectionPrompt(
    trigger: "always" | "low_confidence" | "error" | "complex_task",
    variables: Record<string, string>
  ): string {
    const prompt = REFLECTION_PROMPTS.find((p) => p.trigger === trigger);
    if (!prompt) {
      return "";
    }

    let template = prompt.template;
    for (const [key, value] of Object.entries(variables)) {
      template = template.replace(new RegExp(`{{${key}}}`, "g"), value);
    }

    return template;
  }

  /**
   * Emit an event to all handlers.
   */
  private emit(type: ThinkingEventType, chainId: string, data: unknown): void {
    const event: ReasoningThinkingEvent = {
      type,
      chainId,
      timestamp: Date.now(),
      data,
    };

    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch {
        // Don't let handler errors break the engine
      }
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a thinking engine with default configuration.
 */
export function createThinkingEngine(config?: Partial<ThinkingConfig>): ThinkingEngine {
  return new ThinkingEngine(config);
}

/**
 * Create a thinking engine optimized for quick tasks.
 */
export function createQuickThinkingEngine(): ThinkingEngine {
  return new ThinkingEngine({
    budget: "minimal",
    visibility: "hidden",
    selfCorrection: false,
    maxReflections: 1,
  });
}

/**
 * Create a thinking engine optimized for complex tasks.
 */
export function createDeepThinkingEngine(): ThinkingEngine {
  return new ThinkingEngine({
    budget: "extended",
    visibility: "streaming",
    selfCorrection: true,
    maxReflections: 5,
    confidenceThreshold: 0.8,
  });
}

// ============================================================================
// Integration Helpers
// ============================================================================

/**
 * Wrap an async function with reasoning.
 * Automatically tracks observations, actions, and results.
 */
export async function withReasoning<T>(
  engine: ThinkingEngine,
  task: string,
  fn: (chain: ReasoningChainBuilder) => Promise<T>
): Promise<{ result: T; chain: ReasoningChain }> {
  const chain = engine.startChain(task);
  const builder = (engine as unknown as { chains: Map<string, ReasoningChainBuilder> }).chains.get(
    chain.id
  );

  if (!builder) {
    throw new Error("Failed to create chain");
  }

  try {
    const result = await fn(builder);

    // Auto-decide based on result
    const confidence = result !== undefined && result !== null ? 0.8 : 0.5;
    const decision =
      result !== undefined ? "Task completed successfully" : "Task completed with uncertain result";

    return {
      result,
      chain: engine.decide(chain.id, decision, confidence),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    builder.error(errorMessage);
    throw error;
  }
}

/**
 * Create a reasoning-aware wrapper for a function.
 */
export function reasoningWrapper<TArgs extends unknown[], TResult>(
  engine: ThinkingEngine,
  name: string,
  fn: (...args: TArgs) => Promise<TResult>
): (...args: TArgs) => Promise<{ result: TResult; reasoning: string }> {
  return async (...args: TArgs) => {
    const chain = engine.startChain(`Execute: ${name}`);
    const chainId = chain.id;

    // Add observation about the call
    engine.addStep(chainId, {
      type: "observation",
      content: `Calling ${name} with ${args.length} arguments`,
      confidence: 1.0,
    });

    try {
      const result = await fn(...args);

      engine.addStep(chainId, {
        type: "result",
        content: `${name} completed successfully`,
        confidence: 0.9,
      });

      const _finalChain = engine.decide(chainId, "Function executed", 0.9);

      return {
        result,
        reasoning: engine.getSummary(chainId),
      };
    } catch (error) {
      engine.addStep(chainId, {
        type: "result",
        content: `${name} failed: ${error instanceof Error ? error.message : String(error)}`,
        confidence: 0.1,
      });

      throw error;
    }
  };
}
