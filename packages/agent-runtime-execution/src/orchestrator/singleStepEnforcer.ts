/**
 * Single-Step Execution Enforcer
 *
 * Implements the Manus spec's fundamental rule:
 * "The Agent MUST respond with exactly one tool call per response.
 * Parallel function calling is strictly forbidden."
 *
 * This constraint enforces:
 * - Sequential reasoning
 * - State consistency
 * - Simplified error handling
 * - Atomic operations
 */

import type { MCPToolCall } from "../types";

// ============================================================================
// Single-Step Enforcer Types
// ============================================================================

/**
 * Validation result for single-step constraint.
 */
export interface SingleStepValidationResult {
  /** Whether the constraint is satisfied */
  valid: boolean;
  /** Error message if invalid */
  error?: string;
  /** Number of tool calls detected */
  toolCallCount: number;
}

/**
 * Single-step enforcement policy.
 */
export interface SingleStepPolicy {
  /** Whether to enforce single-step constraint */
  enabled: boolean;
  /** Whether to allow zero tool calls (text-only responses) */
  allowZeroToolCalls: boolean;
  /** Custom error message */
  errorMessage?: string;
}

// ============================================================================
// Single-Step Enforcer
// ============================================================================

/**
 * Enforces single-step execution constraint.
 * Validates that agent responses contain exactly one tool call.
 */
export class SingleStepEnforcer {
  private policy: SingleStepPolicy;
  private violationCount = 0;
  private readonly maxViolations = 5;

  constructor(policy: Partial<SingleStepPolicy> = {}) {
    this.policy = {
      enabled: policy.enabled ?? true,
      allowZeroToolCalls: policy.allowZeroToolCalls ?? true,
      errorMessage: policy.errorMessage,
    };
  }

  /**
   * Validate that the response contains exactly one tool call.
   */
  validate(toolCalls: MCPToolCall[]): SingleStepValidationResult {
    if (!this.policy.enabled) {
      return {
        valid: true,
        toolCallCount: toolCalls.length,
      };
    }

    const count = toolCalls.length;

    // Allow zero tool calls if policy permits (text-only response)
    if (count === 0 && this.policy.allowZeroToolCalls) {
      return {
        valid: true,
        toolCallCount: 0,
      };
    }

    // Exactly one tool call is required
    if (count === 1) {
      this.violationCount = 0; // Reset on success
      return {
        valid: true,
        toolCallCount: 1,
      };
    }

    // Violation detected
    this.violationCount++;

    const error =
      this.policy.errorMessage ??
      this.getDefaultErrorMessage(count, this.policy.allowZeroToolCalls);

    return {
      valid: false,
      error,
      toolCallCount: count,
    };
  }

  /**
   * Check if enforcer should halt execution due to repeated violations.
   */
  shouldHalt(): boolean {
    return this.violationCount >= this.maxViolations;
  }

  /**
   * Get violation count.
   */
  getViolationCount(): number {
    return this.violationCount;
  }

  /**
   * Reset violation count.
   */
  resetViolations(): void {
    this.violationCount = 0;
  }

  /**
   * Update policy.
   */
  updatePolicy(policy: Partial<SingleStepPolicy>): void {
    this.policy = { ...this.policy, ...policy };
  }

  /**
   * Get current policy.
   */
  getPolicy(): Readonly<SingleStepPolicy> {
    return this.policy;
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private getDefaultErrorMessage(count: number, allowZero: boolean): string {
    if (count === 0 && !allowZero) {
      return "Single-Step Constraint Violation: Response must contain exactly one tool call, but zero were provided.";
    }

    if (count > 1) {
      return `Single-Step Constraint Violation: Response must contain exactly one tool call, but ${count} were provided. Parallel function calling is strictly forbidden. Please respond with only ONE tool call.`;
    }

    return "Single-Step Constraint Violation: Invalid tool call count.";
  }
}

// ============================================================================
// Middleware
// ============================================================================

/**
 * Middleware for validating single-step constraint.
 */
export interface SingleStepMiddleware {
  /** Validate before execution */
  beforeExecution: (toolCalls: MCPToolCall[]) => SingleStepValidationResult;
  /** Handle violation */
  onViolation?: (result: SingleStepValidationResult) => void;
}

/**
 * Create single-step validation middleware.
 */
export function createSingleStepMiddleware(
  policy?: Partial<SingleStepPolicy>,
  onViolation?: (result: SingleStepValidationResult) => void
): SingleStepMiddleware {
  const enforcer = new SingleStepEnforcer(policy);

  return {
    beforeExecution: (toolCalls: MCPToolCall[]) => {
      const result = enforcer.validate(toolCalls);

      if (!result.valid && onViolation) {
        onViolation(result);
      }

      // Halt if too many violations
      if (!result.valid && enforcer.shouldHalt()) {
        throw new Error(
          `Single-step enforcement failed: ${enforcer.getViolationCount()} consecutive violations detected. The agent is repeatedly violating the single-step execution constraint.`
        );
      }

      return result;
    },
    onViolation,
  };
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a single-step enforcer.
 */
export function createSingleStepEnforcer(policy?: Partial<SingleStepPolicy>): SingleStepEnforcer {
  return new SingleStepEnforcer(policy);
}
