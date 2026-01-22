/**
 * Agent State Machine
 *
 * A deterministic state machine that enforces valid state transitions
 * for the agent lifecycle. Provides observability through transition
 * history and event handlers.
 *
 * @example
 * ```typescript
 * const sm = createAgentStateMachine();
 *
 * sm.onTransition((transition) => {
 *   console.log(`${transition.from} -> ${transition.to} via ${transition.event}`);
 * });
 *
 * sm.transition('start');   // idle -> thinking
 * sm.transition('execute'); // thinking -> executing
 * sm.transition('complete'); // executing -> complete
 * ```
 *
 * @module orchestrator/stateMachine
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Possible agent statuses.
 * - `idle`: Agent is not running
 * - `thinking`: Agent is waiting for LLM response
 * - `executing`: Agent is executing tool calls
 * - `waiting_confirmation`: Agent is waiting for user confirmation
 * - `complete`: Agent has finished successfully
 * - `error`: Agent encountered an error
 */
export type AgentStatus =
  | "idle"
  | "thinking"
  | "executing"
  | "waiting_confirmation"
  | "complete"
  | "error";

/**
 * Events that can trigger state transitions.
 */
export type AgentStateEvent =
  | "start"
  | "think"
  | "execute"
  | "request_confirmation"
  | "confirm"
  | "deny"
  | "complete"
  | "fail"
  | "reset";

/**
 * Record of a single state transition.
 */
export interface AgentStateTransition {
  /** Status before the transition */
  readonly from: AgentStatus;
  /** Status after the transition */
  readonly to: AgentStatus;
  /** Event that triggered the transition */
  readonly event: AgentStateEvent;
  /** Timestamp of the transition */
  readonly timestamp: number;
}

/**
 * Handler called when a state transition occurs.
 */
export type TransitionHandler = (transition: AgentStateTransition) => void;

/**
 * Configuration options for the state machine.
 */
export interface AgentStateMachineConfig {
  /** Maximum number of transitions to keep in history (default: 100) */
  readonly maxHistorySize?: number;
  /** Initial status (default: 'idle') */
  readonly initialStatus?: AgentStatus;
}

/**
 * Interface for agent state machine operations.
 */
export interface IAgentStateMachine {
  /** Get the current status */
  getStatus(): AgentStatus;
  /** Check if an event can be applied from the current status */
  canTransition(event: AgentStateEvent): boolean;
  /** Apply an event and transition to the next status */
  transition(event: AgentStateEvent): AgentStatus;
  /** Reset to idle status */
  reset(): void;
  /** Get the transition history */
  getHistory(): readonly AgentStateTransition[];
  /** Register a transition handler */
  onTransition(handler: TransitionHandler): () => void;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_MAX_HISTORY_SIZE = 100;

/**
 * Valid state transitions map.
 * Each status maps to the events it accepts and the resulting status.
 */
const VALID_TRANSITIONS: Readonly<
  Record<AgentStatus, Readonly<Partial<Record<AgentStateEvent, AgentStatus>>>>
> = {
  idle: {
    start: "thinking",
    reset: "idle",
  },
  thinking: {
    execute: "executing",
    complete: "complete",
    fail: "error",
    reset: "idle",
  },
  executing: {
    think: "thinking",
    request_confirmation: "waiting_confirmation",
    complete: "complete",
    fail: "error",
    reset: "idle",
  },
  waiting_confirmation: {
    confirm: "executing",
    deny: "complete",
    fail: "error",
    reset: "idle",
  },
  complete: {
    reset: "idle",
  },
  error: {
    reset: "idle",
  },
} as const;

// ============================================================================
// State Machine Implementation
// ============================================================================

/**
 * Deterministic state machine for agent lifecycle management.
 *
 * Key features:
 * - Enforces valid state transitions
 * - Maintains bounded transition history
 * - Supports transition event handlers
 * - Thread-safe operations
 */
export class AgentStateMachine implements IAgentStateMachine {
  private status: AgentStatus;
  private readonly history: AgentStateTransition[] = [];
  private readonly maxHistorySize: number;
  private readonly handlers = new Set<TransitionHandler>();

  constructor(config: AgentStateMachineConfig = {}) {
    this.status = config.initialStatus ?? "idle";
    this.maxHistorySize = config.maxHistorySize ?? DEFAULT_MAX_HISTORY_SIZE;
  }

  /**
   * Get the current agent status.
   */
  getStatus(): AgentStatus {
    return this.status;
  }

  /**
   * Get the transition history (most recent last).
   */
  getHistory(): readonly AgentStateTransition[] {
    return this.history;
  }

  /**
   * Check if an event can be applied from the current status.
   *
   * @param event - The event to check
   * @returns true if the transition is valid
   */
  canTransition(event: AgentStateEvent): boolean {
    return event in VALID_TRANSITIONS[this.status];
  }

  /**
   * Apply an event and transition to the next status.
   *
   * @param event - The event to apply
   * @returns The new status after the transition
   * @throws Error if the transition is invalid
   */
  transition(event: AgentStateEvent): AgentStatus {
    const nextStatus = VALID_TRANSITIONS[this.status][event];

    if (!nextStatus) {
      throw new InvalidTransitionError(this.status, event);
    }

    const transition: AgentStateTransition = {
      from: this.status,
      to: nextStatus,
      event,
      timestamp: Date.now(),
    };

    this.status = nextStatus;
    this.recordTransition(transition);
    this.notifyHandlers(transition);

    return this.status;
  }

  /**
   * Reset the state machine to idle.
   * No-op if already idle.
   */
  reset(): void {
    if (this.status !== "idle") {
      this.transition("reset");
    }
  }

  /**
   * Register a handler to be called on every transition.
   *
   * @param handler - The handler function
   * @returns Unsubscribe function
   */
  onTransition(handler: TransitionHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private recordTransition(transition: AgentStateTransition): void {
    this.history.push(transition);
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }
  }

  private notifyHandlers(transition: AgentStateTransition): void {
    for (const handler of this.handlers) {
      try {
        handler(transition);
      } catch {
        // Ignore handler errors to prevent breaking the state machine
      }
    }
  }
}

// ============================================================================
// Errors
// ============================================================================

/**
 * Error thrown when an invalid state transition is attempted.
 */
export class InvalidTransitionError extends Error {
  readonly status: AgentStatus;
  readonly event: AgentStateEvent;

  constructor(status: AgentStatus, event: AgentStateEvent) {
    super(`Invalid state transition: cannot apply event "${event}" from status "${status}"`);
    this.name = "InvalidTransitionError";
    this.status = status;
    this.event = event;
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a new AgentStateMachine instance.
 *
 * @param config - Optional configuration
 * @returns IAgentStateMachine instance
 */
export function createAgentStateMachine(config?: AgentStateMachineConfig): IAgentStateMachine {
  return new AgentStateMachine(config);
}
