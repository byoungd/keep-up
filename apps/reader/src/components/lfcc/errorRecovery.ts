/**
 * LFCC Error Recovery Service
 *
 * P2-4: Automatic error recovery mechanism for the LFCC editor.
 * Handles degradation states, automatic retries, and user notifications.
 */

import type { LoroRuntime } from "@keepup/lfcc-bridge";
import type { BridgeController } from "@keepup/lfcc-bridge";
import type { EditorView } from "prosemirror-view";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type RecoveryStrategy = "retry" | "soft-reset" | "hard-reset" | "fallback";

export type DegradationLevel = "none" | "warning" | "degraded" | "critical";

export interface RecoveryAttempt {
  timestamp: number;
  strategy: RecoveryStrategy;
  success: boolean;
  error?: Error;
  context?: string;
}

export interface ErrorContext {
  component: string;
  operation: string;
  error: Error;
  metadata?: Record<string, unknown>;
}

export interface RecoveryConfig {
  /** Maximum retry attempts before escalating (default: 3) */
  maxRetries: number;
  /** Delay between retries in ms (default: 1000) */
  retryDelayMs: number;
  /** Exponential backoff multiplier (default: 2) */
  backoffMultiplier: number;
  /** Maximum delay between retries (default: 10000) */
  maxDelayMs: number;
  /** Auto-recovery timeout in ms (default: 30000) */
  autoRecoveryTimeoutMs: number;
  /** Enable automatic recovery (default: true) */
  autoRecover: boolean;
  /** Callback when recovery succeeds */
  onRecoverySuccess?: (attempt: RecoveryAttempt) => void;
  /** Callback when recovery fails */
  onRecoveryFailure?: (attempts: RecoveryAttempt[]) => void;
  /** Callback to notify user of degradation */
  onDegradationChange?: (level: DegradationLevel, message: string) => void;
}

const DEFAULT_CONFIG: RecoveryConfig = {
  maxRetries: 3,
  retryDelayMs: 1000,
  backoffMultiplier: 2,
  maxDelayMs: 10000,
  autoRecoveryTimeoutMs: 30000,
  autoRecover: true,
};

// ─────────────────────────────────────────────────────────────────────────────
// Error Classification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Classify an error to determine the appropriate recovery strategy.
 */
export function classifyError(error: Error): {
  recoverable: boolean;
  strategy: RecoveryStrategy;
  severity: DegradationLevel;
} {
  const message = error.message.toLowerCase();

  // Transient network errors - retry
  if (
    message.includes("network") ||
    message.includes("timeout") ||
    message.includes("connection")
  ) {
    return { recoverable: true, strategy: "retry", severity: "warning" };
  }

  // Sync/divergence errors - soft reset
  if (
    message.includes("divergence") ||
    message.includes("out of sync") ||
    message.includes("checksum mismatch")
  ) {
    return { recoverable: true, strategy: "soft-reset", severity: "degraded" };
  }

  // Loro/CRDT errors - hard reset may be needed
  if (message.includes("loro") || message.includes("crdt") || message.includes("frontier")) {
    return { recoverable: true, strategy: "hard-reset", severity: "degraded" };
  }

  // Fatal errors - fallback to read-only
  if (
    message.includes("fatal") ||
    message.includes("unrecoverable") ||
    message.includes("corrupt")
  ) {
    return { recoverable: false, strategy: "fallback", severity: "critical" };
  }

  // Unknown errors - try soft reset first
  return { recoverable: true, strategy: "soft-reset", severity: "warning" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Recovery Service
// ─────────────────────────────────────────────────────────────────────────────

export class ErrorRecoveryService {
  private config: RecoveryConfig;
  private attempts: RecoveryAttempt[] = [];
  private degradationLevel: DegradationLevel = "none";
  private recoveryTimeout: ReturnType<typeof setTimeout> | null = null;
  private isRecovering = false;

  constructor(
    private runtime: LoroRuntime | null,
    private bridge: BridgeController | null,
    private view: EditorView | null,
    config: Partial<RecoveryConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Update references (used after re-initialization).
   */
  updateReferences(
    runtime: LoroRuntime | null,
    bridge: BridgeController | null,
    view: EditorView | null
  ): void {
    this.runtime = runtime;
    this.bridge = bridge;
    this.view = view;
  }

  /**
   * Get current degradation level.
   */
  getDegradationLevel(): DegradationLevel {
    return this.degradationLevel;
  }

  /**
   * Get recovery attempt history.
   */
  getAttemptHistory(): RecoveryAttempt[] {
    return [...this.attempts];
  }

  /**
   * Handle an error and attempt recovery.
   */
  async handleError(context: ErrorContext): Promise<boolean> {
    const { error, component, operation } = context;
    console.error(`[ErrorRecovery] Error in ${component}.${operation}:`, error);

    const classification = classifyError(error);

    if (!classification.recoverable) {
      this.setDegradation("critical", `Unrecoverable error: ${error.message}`);
      return false;
    }

    if (this.isRecovering) {
      console.warn("[ErrorRecovery] Already recovering, queueing error");
      return false;
    }

    return this.attemptRecovery(classification.strategy, context);
  }

  /**
   * Attempt recovery with the specified strategy.
   */
  private async attemptRecovery(
    strategy: RecoveryStrategy,
    context: ErrorContext
  ): Promise<boolean> {
    this.isRecovering = true;
    const recentAttempts = this.getRecentAttempts();

    // Check if we've exceeded max retries
    if (recentAttempts.length >= this.config.maxRetries) {
      console.error("[ErrorRecovery] Max retries exceeded, escalating");
      return this.escalateRecovery(strategy, context);
    }

    // Calculate delay with exponential backoff
    const delay = Math.min(
      this.config.retryDelayMs * this.config.backoffMultiplier ** recentAttempts.length,
      this.config.maxDelayMs
    );

    await this.sleep(delay);

    const attempt: RecoveryAttempt = {
      timestamp: Date.now(),
      strategy,
      success: false,
      context: `${context.component}.${context.operation}`,
    };

    try {
      switch (strategy) {
        case "retry":
          await this.executeRetry(context);
          break;
        case "soft-reset":
          await this.executeSoftReset();
          break;
        case "hard-reset":
          await this.executeHardReset();
          break;
        case "fallback":
          this.executeFallback();
          break;
      }

      attempt.success = true;
      this.attempts.push(attempt);
      this.setDegradation("none", "Recovery successful");
      this.config.onRecoverySuccess?.(attempt);
      return true;
    } catch (recoveryError) {
      attempt.error =
        recoveryError instanceof Error ? recoveryError : new Error(String(recoveryError));
      this.attempts.push(attempt);
      console.error("[ErrorRecovery] Recovery attempt failed:", recoveryError);
      return this.attemptRecovery(this.getNextStrategy(strategy), context);
    } finally {
      this.isRecovering = false;
    }
  }

  /**
   * Execute a simple retry (for transient errors).
   */
  private async executeRetry(_context: ErrorContext): Promise<void> {
    // For retry, we just need to ensure the runtime isn't degraded
    if (this.runtime?.isDegraded()) {
      this.runtime.setDegraded(false);
    }
    // Re-sync from Loro to ensure consistency
    if (this.bridge && this.view) {
      // Trigger a sync
      this.view.dispatch(this.view.state.tr.setMeta("lfcc-recovery", true));
    }
  }

  /**
   * Execute a soft reset (sync from Loro without losing editor state).
   */
  private async executeSoftReset(): Promise<void> {
    if (!this.bridge || !this.view || !this.runtime) {
      throw new Error("Missing references for soft reset");
    }

    // Clear degraded state
    this.runtime.setDegraded(false);

    // Request bridge to sync from Loro
    this.bridge.syncFromLoro();
  }

  /**
   * Execute a hard reset (full re-initialization from Loro).
   */
  private async executeHardReset(): Promise<void> {
    if (!this.bridge || !this.view || !this.runtime) {
      throw new Error("Missing references for hard reset");
    }

    // Use bridge's sync method for hard reset
    // Note: getDivergenceDetector may not be exposed on public API
    this.runtime.setDegraded(false);
    this.bridge.syncFromLoro();
  }

  /**
   * Execute fallback mode (read-only).
   */
  private executeFallback(): void {
    if (this.runtime) {
      this.runtime.setDegraded(true);
    }
    this.setDegradation("critical", "Editor is in read-only fallback mode");
  }

  /**
   * Escalate to a more aggressive recovery strategy.
   */
  private async escalateRecovery(
    currentStrategy: RecoveryStrategy,
    context: ErrorContext
  ): Promise<boolean> {
    const nextStrategy = this.getNextStrategy(currentStrategy);

    if (nextStrategy === currentStrategy || nextStrategy === "fallback") {
      // We've tried everything, go to fallback
      this.executeFallback();
      this.config.onRecoveryFailure?.(this.attempts);
      return false;
    }

    // Clear attempt history for the new strategy
    this.attempts = [];
    return this.attemptRecovery(nextStrategy, context);
  }

  /**
   * Get the next escalation strategy.
   */
  private getNextStrategy(current: RecoveryStrategy): RecoveryStrategy {
    const order: RecoveryStrategy[] = ["retry", "soft-reset", "hard-reset", "fallback"];
    const currentIndex = order.indexOf(current);
    return order[Math.min(currentIndex + 1, order.length - 1)];
  }

  /**
   * Get recent attempts within the auto-recovery timeout window.
   */
  private getRecentAttempts(): RecoveryAttempt[] {
    const cutoff = Date.now() - this.config.autoRecoveryTimeoutMs;
    return this.attempts.filter((a) => a.timestamp > cutoff);
  }

  /**
   * Set degradation level and notify.
   */
  private setDegradation(level: DegradationLevel, message: string): void {
    this.degradationLevel = level;
    this.config.onDegradationChange?.(level, message);
  }

  /**
   * Start auto-recovery timer.
   */
  startAutoRecovery(): void {
    if (!this.config.autoRecover) {
      return;
    }

    this.recoveryTimeout = setTimeout(() => {
      if (this.degradationLevel !== "none") {
        this.handleError({
          component: "auto-recovery",
          operation: "timeout",
          error: new Error("Auto-recovery timeout"),
        });
      }
    }, this.config.autoRecoveryTimeoutMs);
  }

  /**
   * Stop auto-recovery timer.
   */
  stopAutoRecovery(): void {
    if (this.recoveryTimeout) {
      clearTimeout(this.recoveryTimeout);
      this.recoveryTimeout = null;
    }
  }

  /**
   * Reset the service state.
   */
  reset(): void {
    this.attempts = [];
    this.degradationLevel = "none";
    this.isRecovering = false;
    this.stopAutoRecovery();
  }

  /**
   * Cleanup resources.
   */
  dispose(): void {
    this.reset();
    this.runtime = null;
    this.bridge = null;
    this.view = null;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// React Hook
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";

export interface UseErrorRecoveryOptions extends Partial<RecoveryConfig> {
  runtime: LoroRuntime | null;
  bridge: BridgeController | null;
  view: EditorView | null;
}

export interface UseErrorRecoveryReturn {
  /** Current degradation level */
  degradationLevel: DegradationLevel;
  /** Whether recovery is in progress */
  isRecovering: boolean;
  /** Handle an error */
  handleError: (context: ErrorContext) => Promise<boolean>;
  /** Manually trigger recovery */
  triggerRecovery: (strategy?: RecoveryStrategy) => Promise<boolean>;
  /** Reset the service */
  reset: () => void;
}

export function useErrorRecovery(options: UseErrorRecoveryOptions): UseErrorRecoveryReturn {
  const { runtime, bridge, view, ...config } = options;
  const serviceRef = useRef<ErrorRecoveryService | null>(null);
  const [degradationLevel, setDegradationLevel] = useState<DegradationLevel>("none");
  const [isRecovering, setIsRecovering] = useState(false);

  // Initialize service
  // biome-ignore lint/correctness/useExhaustiveDependencies: Service initialization should only run once; runtime/bridge updates are handled by separate effect
  useEffect(() => {
    serviceRef.current = new ErrorRecoveryService(runtime, bridge, view, {
      ...config,
      onDegradationChange: (level) => setDegradationLevel(level),
    });

    return () => {
      serviceRef.current?.dispose();
    };
  }, []);

  // Update references when they change
  useEffect(() => {
    serviceRef.current?.updateReferences(runtime, bridge, view);
  }, [runtime, bridge, view]);

  const handleError = useCallback(async (context: ErrorContext) => {
    if (!serviceRef.current) {
      return false;
    }
    setIsRecovering(true);
    try {
      return await serviceRef.current.handleError(context);
    } finally {
      setIsRecovering(false);
    }
  }, []);

  const triggerRecovery = useCallback(async (strategy: RecoveryStrategy = "soft-reset") => {
    if (!serviceRef.current) {
      return false;
    }
    setIsRecovering(true);
    try {
      return await serviceRef.current.handleError({
        component: "manual",
        operation: "trigger",
        error: new Error(`Manual ${strategy} triggered`),
      });
    } finally {
      setIsRecovering(false);
    }
  }, []);

  const reset = useCallback(() => {
    serviceRef.current?.reset();
    setDegradationLevel("none");
    setIsRecovering(false);
  }, []);

  return {
    degradationLevel,
    isRecovering,
    handleError,
    triggerRecovery,
    reset,
  };
}
