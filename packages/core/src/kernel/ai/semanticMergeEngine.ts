/**
 * LFCC v0.9.1 — Semantic Merge Engine
 *
 * Interface and implementation for AI-assisted intelligent merge resolution.
 *
 * @see docs/specs/proposals/LFCC_v0.9.1_AI_Native_Enhancement.md §3.5
 */

import type {
  ConflictAnalysis,
  IntentCompatibility,
  MergeComplexity,
  MergePreferences,
  MergeResult,
  MergeValidationResult,
  ResolutionStrategy,
  SemanticConflict,
} from "./semanticMerge.js";
import { DEFAULT_MERGE_PREFERENCES, requireHumanResolution } from "./semanticMerge.js";

// ============================================================================
// Semantic Merge Engine Interface
// ============================================================================

/**
 * Engine for analyzing and resolving semantic conflicts.
 */
export interface SemanticMergeEngine {
  /**
   * Analyze a conflict
   */
  analyzeConflict(conflict: SemanticConflict): Promise<ConflictAnalysis>;

  /**
   * Suggest resolution strategies
   */
  suggestResolution(
    conflict: SemanticConflict,
    preferences?: MergePreferences
  ): Promise<ResolutionStrategy[]>;

  /**
   * Execute a merge with a specific strategy
   */
  executeMerge(conflict: SemanticConflict, strategy: ResolutionStrategy): Promise<MergeResult>;

  /**
   * Validate a merge result
   */
  validateMerge(result: MergeResult): Promise<MergeValidationResult>;
}

// ============================================================================
// Rule Engine (Fallback)
// ============================================================================

/**
 * Rule evaluation result.
 */
export interface RuleResult {
  /** Whether a rule matched */
  matched: boolean;

  /** Suggested strategy */
  strategy?: ResolutionStrategy;

  /** Confidence in the result */
  confidence: number;
}

/**
 * Simple rule-based fallback engine.
 */
export interface RuleEngine {
  /**
   * Evaluate rules against a conflict
   */
  evaluate(conflict: SemanticConflict): RuleResult;

  /**
   * Add a rule
   */
  addRule(rule: MergeRule): void;
}

/**
 * A merge rule.
 */
export interface MergeRule {
  /** Rule name */
  name: string;

  /** Priority (higher = evaluated first) */
  priority: number;

  /** Condition to match */
  condition: (conflict: SemanticConflict) => boolean;

  /** Strategy to apply if condition matches */
  strategy: (conflict: SemanticConflict) => ResolutionStrategy;

  /** Confidence score */
  confidence: number;
}

// ============================================================================
// Rule Engine Implementation
// ============================================================================

/**
 * Simple rule engine implementation.
 */
export class SimpleRuleEngine implements RuleEngine {
  private rules: MergeRule[] = [];

  constructor() {
    // Add default rules
    this.addDefaultRules();
  }

  evaluate(conflict: SemanticConflict): RuleResult {
    // Sort by priority (descending)
    const sortedRules = [...this.rules].sort((a, b) => b.priority - a.priority);

    for (const rule of sortedRules) {
      if (rule.condition(conflict)) {
        return {
          matched: true,
          strategy: rule.strategy(conflict),
          confidence: rule.confidence,
        };
      }
    }

    return {
      matched: false,
      confidence: 0,
    };
  }

  addRule(rule: MergeRule): void {
    this.rules.push(rule);
  }

  private addDefaultRules(): void {
    // Rule: Prefer human edits
    this.addRule({
      name: "prefer_human",
      priority: 100,
      condition: (c) => {
        const humanParty = c.parties.find((p) => p.source === "human");
        const aiParty = c.parties.find((p) => p.source === "agent");
        return !!humanParty && !!aiParty;
      },
      strategy: () => ({ type: "accept_left", reason: "Human edit takes precedence" }),
      confidence: 0.9,
    });

    // Rule: Same intent category = compatible
    this.addRule({
      name: "same_intent_category",
      priority: 80,
      condition: (c) => {
        const intents = c.parties.map((p) => p.intent).filter(Boolean);
        if (intents.length < 2) {
          return false;
        }
        return intents.every((i) => i?.category === intents[0]?.category);
      },
      strategy: () => ({
        type: "accept_right",
        reason: "Compatible intents, accepting more recent",
      }),
      confidence: 0.75,
    });

    // Rule: Structural conflicts require human
    this.addRule({
      name: "structural_requires_human",
      priority: 90,
      condition: (c) => c.type === "structural_conflict",
      strategy: () => requireHumanResolution("Structural conflicts require human review"),
      confidence: 0.95,
    });

    // Rule: Low confidence = require human
    this.addRule({
      name: "low_confidence_human",
      priority: 50,
      condition: (c) => c.semantic_analysis !== undefined && c.semantic_analysis.confidence < 0.5,
      strategy: () => requireHumanResolution("Low confidence in automatic resolution"),
      confidence: 0.8,
    });
  }
}

// ============================================================================
// Semantic Merge Engine Implementation
// ============================================================================

/**
 * Default semantic merge engine implementation.
 * Uses rule engine as fallback, can be extended with LLM support.
 */
export class DefaultSemanticMergeEngine implements SemanticMergeEngine {
  private ruleEngine: RuleEngine;

  constructor(ruleEngine?: RuleEngine) {
    this.ruleEngine = ruleEngine ?? new SimpleRuleEngine();
  }

  async analyzeConflict(conflict: SemanticConflict): Promise<ConflictAnalysis> {
    const intentCompatibility = this.checkIntentCompatibility(conflict);
    const mergeComplexity = this.assessComplexity(conflict);

    const canAutoMerge = intentCompatibility !== "conflicting" && mergeComplexity !== "impossible";

    return {
      compatibility: {
        can_auto_merge: canAutoMerge,
        merge_complexity: mergeComplexity,
      },
      intent_analysis: {
        intents_aligned: intentCompatibility === "compatible",
      },
      risk_assessment: {
        data_loss_risk: this.assessDataLossRisk(conflict),
        semantic_drift_risk: this.assessSemanticDriftRisk(conflict),
      },
    };
  }

  async suggestResolution(
    conflict: SemanticConflict,
    preferences: MergePreferences = DEFAULT_MERGE_PREFERENCES
  ): Promise<ResolutionStrategy[]> {
    const strategies: ResolutionStrategy[] = [];

    // Try rule engine first
    const ruleResult = this.ruleEngine.evaluate(conflict);
    if (ruleResult.matched && ruleResult.strategy) {
      if (ruleResult.confidence >= preferences.confidence_threshold) {
        strategies.push(ruleResult.strategy);
      }
    }

    // Add priority-based strategies
    if (preferences.priority === "prefer_human") {
      const humanParty = conflict.parties.find((p) => p.source === "human");
      if (humanParty) {
        strategies.push({
          type: "accept_left",
          reason: "User preference: prefer human edits",
        });
      }
    } else if (preferences.priority === "prefer_recent") {
      strategies.push({
        type: "accept_right",
        reason: "User preference: prefer recent edits",
      });
    }

    // If no strategies or AI autonomy is suggest_only, add require_human
    if (strategies.length === 0 || preferences.ai_autonomy === "suggest_only") {
      strategies.push(requireHumanResolution("No confident automatic resolution available"));
    }

    return strategies;
  }

  async executeMerge(
    conflict: SemanticConflict,
    strategy: ResolutionStrategy
  ): Promise<MergeResult> {
    const baseResult = {
      strategy,
      affected_blocks: conflict.affected_blocks,
      merged_at: Date.now(),
    };

    switch (strategy.type) {
      case "accept_left":
      case "accept_right":
        return {
          ...baseResult,
          success: true,
        };

      case "merge_both":
        return {
          ...baseResult,
          success: true,
          result_content: strategy.merged_content,
        };

      case "require_human":
        return {
          ...baseResult,
          success: false,
          error: strategy.reason,
        };

      case "defer":
        return {
          ...baseResult,
          success: false,
          error: `Deferred until: ${strategy.until}`,
        };

      default:
        return {
          ...baseResult,
          success: false,
          error: "Unknown strategy type",
        };
    }
  }

  async validateMerge(result: MergeResult): Promise<MergeValidationResult> {
    const issues: Array<{ severity: "error" | "warning"; message: string }> = [];

    if (!result.success) {
      issues.push({
        severity: "error",
        message: result.error ?? "Merge was not successful",
      });
    }

    if (result.result_content !== undefined && result.result_content.length === 0) {
      issues.push({
        severity: "warning",
        message: "Merge resulted in empty content",
      });
    }

    return {
      valid: issues.every((i) => i.severity !== "error"),
      issues,
    };
  }

  // ============================================================================
  // Private helpers
  // ============================================================================

  private checkIntentCompatibility(conflict: SemanticConflict): IntentCompatibility {
    const intents = conflict.parties.map((p) => p.intent).filter(Boolean);

    if (intents.length < 2) {
      return "neutral";
    }

    // Same category = compatible
    if (intents.every((i) => i?.category === intents[0]?.category)) {
      return "compatible";
    }

    // Different categories with structural implications = conflicting
    if (conflict.type === "structural_conflict") {
      return "conflicting";
    }

    return "neutral";
  }

  private assessComplexity(conflict: SemanticConflict): MergeComplexity {
    // Structural conflicts are complex
    if (conflict.type === "structural_conflict") {
      return "complex";
    }

    // Multiple parties = more complex
    if (conflict.parties.length > 2) {
      return "complex";
    }

    // Many affected blocks = complex
    if (conflict.affected_blocks.length > 3) {
      return "complex";
    }

    // Single block, two parties = simple
    if (conflict.affected_blocks.length === 1 && conflict.parties.length === 2) {
      return "simple";
    }

    return "simple";
  }

  private assessDataLossRisk(conflict: SemanticConflict): "none" | "low" | "medium" | "high" {
    // Structural conflicts have higher data loss risk
    if (conflict.type === "structural_conflict") {
      return "medium";
    }

    // Many affected blocks = higher risk
    if (conflict.affected_blocks.length > 3) {
      return "medium";
    }

    return "low";
  }

  private assessSemanticDriftRisk(conflict: SemanticConflict): "none" | "low" | "medium" | "high" {
    // Semantic conflicts have higher drift risk
    if (conflict.type === "semantic_conflict") {
      return "medium";
    }

    // Conflicting intents = higher risk
    if (conflict.semantic_analysis?.intent_compatibility === "conflicting") {
      return "high";
    }

    return "low";
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a semantic merge engine
 */
export function createSemanticMergeEngine(ruleEngine?: RuleEngine): SemanticMergeEngine {
  return new DefaultSemanticMergeEngine(ruleEngine);
}

/**
 * Create a rule engine
 */
export function createRuleEngine(): RuleEngine {
  return new SimpleRuleEngine();
}
