/**
 * Error Recovery System
 *
 * Implements intelligent error recovery with retry strategies and fallbacks.
 * Based on Claude Code Agent best practices for handling transient failures.
 *
 * Three-Attempt Principle (Manus Spec):
 * 1. Diagnosis - Analyze the error message and context
 * 2. Fix/Alternative - Attempt to fix the issue or use a different tool
 * 3. Escalation - After three consecutive failures, escalate to user via message(type="ask")
 *
 * CRITICAL: The agent is strictly forbidden from repeating the exact same failed action.
 */

import type { MCPToolCall, MCPToolResult, ToolError } from "../types";

// ============================================================================
// Error Recovery Types
// ============================================================================

/**
 * Error category for determining recovery strategy.
 */
export type ErrorCategory =
  | "transient" // Temporary errors (network, rate limit)
  | "permanent" // Unrecoverable errors (invalid arguments, not found)
  | "tool_specific" // Tool-specific failures
  | "unknown"; // Unknown error type

/**
 * Recovery action to take.
 */
export type RecoveryAction =
  | "retry" // Retry the same operation
  | "fallback" // Use fallback strategy
  | "skip" // Skip and continue
  | "abort"; // Abort execution

/**
 * Recovery strategy for handling errors.
 */
export interface RecoveryStrategy {
  /** Error pattern to match */
  errorPattern: RegExp | string;
  /** Error category */
  category: ErrorCategory;
  /** Maximum retry attempts */
  maxRetries: number;
  /** Initial backoff in ms */
  baseBackoffMs: number;
  /** Backoff multiplier for exponential backoff */
  backoffMultiplier: number;
  /** Maximum backoff in ms */
  maxBackoffMs: number;
  /** Recovery action */
  action: RecoveryAction;
  /** Fallback function (if action is 'fallback') */
  fallback?: (call: MCPToolCall, error: ToolError) => Promise<MCPToolResult>;
  /** Message to provide to LLM about the error */
  contextMessage: (error: ToolError, attempt: number) => string;
}

/**
 * Error recovery result.
 */
export interface RecoveryResult {
  /** Whether recovery was successful */
  recovered: boolean;
  /** Final result (if recovered) */
  result?: MCPToolResult;
  /** Number of attempts made */
  attempts: number;
  /** Recovery strategy used */
  strategy?: RecoveryStrategy;
  /** Final error (if not recovered) */
  error?: ToolError;
}

/**
 * Error history entry.
 */
export interface ErrorHistoryEntry {
  timestamp: number;
  toolName: string;
  error: ToolError;
  category: ErrorCategory;
  recovered: boolean;
  attempts: number;
}

// ============================================================================
// Default Recovery Strategies
// ============================================================================

const DEFAULT_STRATEGIES: RecoveryStrategy[] = [
  // Network/timeout errors - retry with backoff
  {
    errorPattern: /(network|timeout|ECONNRESET|ETIMEDOUT)/i,
    category: "transient",
    maxRetries: 2,
    baseBackoffMs: 1000,
    backoffMultiplier: 2,
    maxBackoffMs: 10000,
    action: "retry",
    contextMessage: (error, attempt) =>
      `Network error encountered (attempt ${attempt}): ${error.message}. Retrying with backoff...`,
  },

  // Rate limit errors - retry with longer backoff
  {
    errorPattern: /(rate.*limit|too.*many.*requests|429)/i,
    category: "transient",
    maxRetries: 2,
    baseBackoffMs: 1000,
    backoffMultiplier: 2,
    maxBackoffMs: 10000,
    action: "retry",
    contextMessage: (error, attempt) =>
      `Rate limit hit (attempt ${attempt}): ${error.message}. Backing off before retry...`,
  },

  // Invalid arguments - permanent failure
  {
    errorPattern: /INVALID_ARGUMENTS/,
    category: "permanent",
    maxRetries: 0,
    baseBackoffMs: 0,
    backoffMultiplier: 1,
    maxBackoffMs: 0,
    action: "abort",
    contextMessage: (error) =>
      `Invalid arguments provided: ${error.message}. Please review and correct the tool parameters.`,
  },

  // Resource not found - permanent failure
  {
    errorPattern: /(RESOURCE_NOT_FOUND|ENOENT|not.*found)/i,
    category: "permanent",
    maxRetries: 0,
    baseBackoffMs: 0,
    backoffMultiplier: 1,
    maxBackoffMs: 0,
    action: "abort",
    contextMessage: (error) =>
      `Resource not found: ${error.message}. Please verify the resource exists and try again.`,
  },
];

// ============================================================================
// Error Recovery Engine
// ============================================================================

/**
 * Error recovery engine with intelligent retry and fallback strategies.
 */
export class ErrorRecoveryEngine {
  private strategies: RecoveryStrategy[];
  private errorHistory: ErrorHistoryEntry[] = [];
  private readonly maxHistorySize = 100;
  private failedActionSignatures = new Set<string>();

  constructor(strategies: RecoveryStrategy[] = DEFAULT_STRATEGIES) {
    this.strategies = [...strategies];
  }

  /**
   * Check if an action has already failed (to prevent repeating exact same action).
   * Implements the Manus spec requirement: "strictly forbidden from repeating the exact same failed action."
   */
  private hasActionFailed(toolCall: MCPToolCall): boolean {
    const signature = this.getActionSignature(toolCall);
    return this.failedActionSignatures.has(signature);
  }

  /**
   * Record a failed action signature.
   */
  private recordFailedAction(toolCall: MCPToolCall): void {
    const signature = this.getActionSignature(toolCall);
    this.failedActionSignatures.add(signature);
  }

  /**
   * Create a signature for a tool call (for deduplication).
   */
  private getActionSignature(toolCall: MCPToolCall): string {
    return `${toolCall.name}::${JSON.stringify(toolCall.arguments)}`;
  }

  /**
   * Clear failed action history (e.g., when starting a new task).
   */
  clearFailedActions(): void {
    this.failedActionSignatures.clear();
  }

  /**
   * Add a custom recovery strategy.
   */
  addStrategy(strategy: RecoveryStrategy): void {
    this.strategies.push(strategy);
  }

  /**
   * Attempt to recover from an error.
   * Implements the Three-Attempt Principle from Manus spec.
   */
  async recover(
    toolCall: MCPToolCall,
    initialError: ToolError,
    executor: (call: MCPToolCall) => Promise<MCPToolResult>
  ): Promise<RecoveryResult> {
    const strategy = this.matchStrategy(initialError);
    const category = this.categorizeError(initialError);

    // Check if this exact action has already failed (prevent repeating same action)
    const duplicateResult = this.checkDuplicateAction(toolCall, initialError);
    if (duplicateResult) {
      return duplicateResult;
    }

    this.recordInitialFailure(toolCall, initialError, category);

    if (!strategy || strategy.maxRetries === 0) {
      return {
        recovered: false,
        error: initialError,
        attempts: 0,
      };
    }

    return this.attemptRecovery(toolCall, initialError, strategy, executor);
  }

  private checkDuplicateAction(
    toolCall: MCPToolCall,
    initialError: ToolError
  ): RecoveryResult | null {
    if (this.hasActionFailed(toolCall)) {
      return {
        recovered: false,
        error: {
          code: "DUPLICATE_FAILED_ACTION",
          message: `This exact action has already failed. Please try a different approach. Original error: ${initialError.message}`,
        },
        attempts: 0,
      };
    }

    this.recordFailedAction(toolCall);
    return null;
  }

  private recordInitialFailure(
    toolCall: MCPToolCall,
    initialError: ToolError,
    category: ErrorCategory
  ): void {
    this.recordError({
      timestamp: Date.now(),
      toolName: toolCall.name,
      error: initialError,
      category,
      recovered: false,
      attempts: 0,
    });
  }
  private async attemptRecovery(
    toolCall: MCPToolCall,
    initialError: ToolError,
    strategy: RecoveryStrategy,
    executor: (call: MCPToolCall) => Promise<MCPToolResult>
  ): Promise<RecoveryResult> {
    let lastError = initialError;
    let attempts = 0;
    for (let attempt = 1; attempt <= strategy.maxRetries; attempt++) {
      attempts = attempt;
      const backoff = Math.min(
        strategy.baseBackoffMs * strategy.backoffMultiplier ** (attempt - 1),
        strategy.maxBackoffMs
      );

      if (backoff > 0) {
        await this.sleep(backoff);
      }

      try {
        const result = await this.executeRecoveryAction(toolCall, strategy, lastError, executor);
        if (!result) {
          break;
        }

        this.updateLastError(true, attempt);
        return {
          recovered: true,
          result,
          attempts: attempt,
          strategy,
        };
      } catch (error) {
        lastError = this.toToolError(error);
      }
    }

    this.updateLastError(false, attempts);
    return {
      recovered: false,
      error: lastError,
      attempts,
      strategy,
    };
  }

  private async executeRecoveryAction(
    toolCall: MCPToolCall,
    strategy: RecoveryStrategy,
    lastError: ToolError,
    executor: (call: MCPToolCall) => Promise<MCPToolResult>
  ): Promise<MCPToolResult | null> {
    if (strategy.action === "retry") {
      return executor(toolCall);
    }

    if (strategy.action === "fallback" && strategy.fallback) {
      return strategy.fallback(toolCall, lastError);
    }

    return null;
  }

  /**
   * Get error history.
   */
  getHistory(): ErrorHistoryEntry[] {
    return [...this.errorHistory];
  }

  /**
   * Clear error history.
   */
  clearHistory(): void {
    this.errorHistory = [];
  }

  /**
   * Get error pattern statistics.
   */
  getErrorStats(): Map<string, { count: number; recovered: number }> {
    const stats = new Map<string, { count: number; recovered: number }>();

    for (const entry of this.errorHistory) {
      const key = entry.toolName;
      const current = stats.get(key) ?? { count: 0, recovered: 0 };
      current.count++;
      if (entry.recovered) {
        current.recovered++;
      }
      stats.set(key, current);
    }

    return stats;
  }

  /**
   * Match error to recovery strategy.
   */
  private matchStrategy(error: ToolError): RecoveryStrategy | undefined {
    for (const strategy of this.strategies) {
      const pattern =
        typeof strategy.errorPattern === "string"
          ? new RegExp(strategy.errorPattern, "i")
          : strategy.errorPattern;

      if (pattern.test(error.message) || pattern.test(error.code)) {
        return strategy;
      }
    }
    return undefined;
  }

  /**
   * Categorize error type.
   */
  private categorizeError(error: ToolError): ErrorCategory {
    const strategy = this.matchStrategy(error);
    return strategy?.category ?? "unknown";
  }

  /**
   * Record error in history.
   */
  private recordError(entry: ErrorHistoryEntry): void {
    this.errorHistory.push(entry);
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory.shift();
    }
  }

  /**
   * Update last error entry with recovery result.
   */
  private updateLastError(recovered: boolean, attempts: number): void {
    const last = this.errorHistory[this.errorHistory.length - 1];
    if (last) {
      last.recovered = recovered;
      last.attempts = attempts;
    }
  }

  /**
   * Convert unknown error to ToolError.
   */
  private toToolError(error: unknown): ToolError {
    if (this.isToolError(error)) {
      return error;
    }

    return {
      code: "EXECUTION_FAILED",
      message: error instanceof Error ? error.message : String(error),
    };
  }

  /**
   * Type guard for ToolError.
   */
  private isToolError(error: unknown): error is ToolError {
    return typeof error === "object" && error !== null && "code" in error && "message" in error;
  }

  /**
   * Sleep helper.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create an error recovery engine.
 */
export function createErrorRecoveryEngine(strategies?: RecoveryStrategy[]): ErrorRecoveryEngine {
  return new ErrorRecoveryEngine(strategies);
}
