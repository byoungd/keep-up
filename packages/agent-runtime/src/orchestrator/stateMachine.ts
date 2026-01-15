/**
 * Agent State Machine
 *
 * Enforces valid state transitions for the agent lifecycle.
 * Provides a formal, deterministic state management layer.
 */

// ============================================================================
// Types
// ============================================================================

export type AgentStatus =
  | "idle"
  | "thinking"
  | "executing"
  | "waiting_confirmation"
  | "complete"
  | "error";

export interface AgentStateTransition {
  from: AgentStatus;
  to: AgentStatus;
  event: AgentStateEvent;
}

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

export interface IAgentStateMachine {
  getStatus(): AgentStatus;
  canTransition(event: AgentStateEvent): boolean;
  transition(event: AgentStateEvent): AgentStatus;
  reset(): void;
}

// ============================================================================
// State Machine Implementation
// ============================================================================

const VALID_TRANSITIONS: Record<AgentStatus, Partial<Record<AgentStateEvent, AgentStatus>>> = {
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
};

export class AgentStateMachine implements IAgentStateMachine {
  private status: AgentStatus = "idle";
  private readonly history: AgentStateTransition[] = [];
  private readonly maxHistorySize: number;

  constructor(options: { maxHistorySize?: number } = {}) {
    this.maxHistorySize = options.maxHistorySize ?? 100;
  }

  getStatus(): AgentStatus {
    return this.status;
  }

  getHistory(): readonly AgentStateTransition[] {
    return this.history;
  }

  canTransition(event: AgentStateEvent): boolean {
    const transitions = VALID_TRANSITIONS[this.status];
    return event in transitions;
  }

  transition(event: AgentStateEvent): AgentStatus {
    const transitions = VALID_TRANSITIONS[this.status];
    const nextStatus = transitions[event];

    if (!nextStatus) {
      throw new Error(
        `Invalid state transition: cannot apply event "${event}" from status "${this.status}"`
      );
    }

    const transition: AgentStateTransition = {
      from: this.status,
      to: nextStatus,
      event,
    };

    this.status = nextStatus;
    this.recordTransition(transition);

    return this.status;
  }

  reset(): void {
    if (this.status !== "idle") {
      this.transition("reset");
    }
  }

  private recordTransition(transition: AgentStateTransition): void {
    this.history.push(transition);
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createAgentStateMachine(options?: {
  maxHistorySize?: number;
}): IAgentStateMachine {
  return new AgentStateMachine(options);
}
