/**
 * Agent Loop Architecture
 *
 * Implements the core Agent Loop from the Manus specification:
 * 1. Perception - Analyze context, user input, and previous observation
 * 2. Thinking - Determine next logical step
 * 3. Decision - Select single most appropriate tool
 * 4. Action - Execute the selected tool
 * 5. Observation - Capture output/feedback
 * 6. Iteration - Feed observation back to perception
 *
 * Key Constraint: STRICT SINGLE-STEP EXECUTION
 * The agent MUST respond with exactly one tool call per response.
 * Parallel function calling is strictly forbidden.
 */

import { getLogger } from "@ku0/agent-runtime-telemetry/logging";
import type { AgentMessage, MCPToolCall, MCPToolResult } from "../types";

const logger = getLogger("agent-loop");

// ============================================================================
// Agent Loop Types
// ============================================================================

/**
 * Agent loop phase representing current step in the cycle.
 */
export type AgentLoopPhase =
  | "perception" // Sensing/analyzing context
  | "thinking" // Reasoning about next step
  | "decision" // Tool selection
  | "action" // Tool execution
  | "observation" // Capturing feedback
  | "iteration"; // Preparing for next cycle

/**
 * Context for the perception phase.
 */
export interface PerceptionContext {
  /** Current conversation messages */
  messages: AgentMessage[];
  /** Result from previous action (if any) */
  previousObservation?: Observation;
  /** Current execution plan context */
  planContext?: {
    goal: string;
    currentPhase: string;
    completedSteps: number;
    totalSteps: number;
  };
  /** User input or query */
  userInput?: string;
}

/**
 * Result of the thinking phase.
 */
export interface ThinkingResult {
  /** Next logical step description */
  nextStep: string;
  /** Reasoning for the decision */
  reasoning: string;
  /** Whether to update the plan */
  shouldUpdatePlan: boolean;
  /** Whether to advance to next phase */
  shouldAdvancePhase: boolean;
}

/**
 * Tool selection decision.
 */
export interface ToolDecision {
  /** Selected tool name */
  toolName: string;
  /** Tool parameters */
  parameters: Record<string, unknown>;
  /** Rationale for selection */
  rationale: string;
  /** Expected outcome */
  expectedOutcome: string;
}

/**
 * Observation from executed action.
 */
export interface Observation {
  /** Tool that was executed */
  toolCall: MCPToolCall;
  /** Result from tool execution */
  result: MCPToolResult;
  /** Success or failure */
  success: boolean;
  /** Error if failed */
  error?: {
    code: string;
    message: string;
  };
  /** Timestamp of observation */
  timestamp: number;
  /** Metadata about execution */
  metadata: {
    duration: number;
    attemptNumber: number;
  };
}

/**
 * Complete agent loop cycle.
 */
export interface AgentLoopCycle {
  /** Cycle number (starts at 1) */
  cycleNumber: number;
  /** Current phase */
  phase: AgentLoopPhase;
  /** Perception context */
  perception: PerceptionContext;
  /** Thinking result (after thinking phase) */
  thinking?: ThinkingResult;
  /** Tool decision (after decision phase) */
  decision?: ToolDecision;
  /** Observation (after action phase) */
  observation?: Observation;
  /** Timestamp when cycle started */
  startTime: number;
  /** Timestamp when cycle completed */
  endTime?: number;
}

/**
 * Agent loop state.
 */
export interface AgentLoopState {
  /** Current cycle */
  currentCycle: AgentLoopCycle;
  /** History of completed cycles */
  cycleHistory: AgentLoopCycle[];
  /** Whether loop is running */
  isRunning: boolean;
  /** Whether loop is paused (waiting for user input) */
  isPaused: boolean;
  /** Total cycles executed */
  totalCycles: number;
}

/**
 * Agent loop configuration.
 */
export interface AgentLoopConfig {
  /** Maximum cycles before forcing termination */
  maxCycles: number;
  /** Maximum consecutive failures before stopping */
  maxConsecutiveFailures: number;
  /** Whether to enable detailed cycle logging */
  enableCycleLogging: boolean;
  /** Callback for phase transitions */
  onPhaseChange?: (cycle: AgentLoopCycle, newPhase: AgentLoopPhase) => void;
  /** Callback for cycle completion */
  onCycleComplete?: (cycle: AgentLoopCycle) => void;
}

export type AgentLoopControlSignal = "PAUSE" | "RESUME" | "STEP" | "INJECT_THOUGHT";

// ============================================================================
// Agent Loop State Machine
// ============================================================================

/**
 * Agent Loop State Machine.
 * Manages the deterministic progression through loop phases.
 */
export class AgentLoopStateMachine {
  private state: AgentLoopState;
  private config: AgentLoopConfig;
  private consecutiveFailures = 0;

  constructor(config: Partial<AgentLoopConfig> = {}) {
    this.config = {
      maxCycles: config.maxCycles ?? 100,
      maxConsecutiveFailures: config.maxConsecutiveFailures ?? 3,
      enableCycleLogging: config.enableCycleLogging ?? true,
      onPhaseChange: config.onPhaseChange,
      onCycleComplete: config.onCycleComplete,
    };

    this.state = this.createInitialState();
  }

  // ============================================================================
  // State Transitions
  // ============================================================================

  /**
   * Start a new cycle with perception phase.
   */
  startCycle(context: PerceptionContext): void {
    if (this.state.totalCycles >= this.config.maxCycles) {
      throw new Error(`Maximum cycles (${this.config.maxCycles}) reached`);
    }

    if (this.consecutiveFailures >= this.config.maxConsecutiveFailures) {
      throw new Error(
        `Maximum consecutive failures (${this.config.maxConsecutiveFailures}) reached`
      );
    }

    const cycle: AgentLoopCycle = {
      cycleNumber: this.state.totalCycles + 1,
      phase: "perception",
      perception: context,
      startTime: Date.now(),
    };

    this.state.currentCycle = cycle;
    this.state.isRunning = true;
    this.state.totalCycles++;

    this.logPhaseTransition("perception");
  }

  /**
   * Transition from perception to thinking.
   */
  transitionToThinking(): void {
    this.assertPhase("perception");
    this.updatePhase("thinking");
  }

  /**
   * Record thinking result and transition to decision.
   */
  transitionToDecision(thinking: ThinkingResult): void {
    this.assertPhase("thinking");
    this.state.currentCycle.thinking = thinking;
    this.updatePhase("decision");
  }

  /**
   * Record tool decision and transition to action.
   */
  transitionToAction(decision: ToolDecision): void {
    this.assertPhase("decision");
    this.state.currentCycle.decision = decision;
    this.updatePhase("action");
  }

  /**
   * Record observation and transition to observation phase.
   */
  transitionToObservation(observation: Observation): void {
    this.assertPhase("action");
    this.state.currentCycle.observation = observation;

    // Update consecutive failure counter
    if (!observation.success) {
      this.consecutiveFailures++;
    } else {
      this.consecutiveFailures = 0;
    }

    this.updatePhase("observation");
  }

  /**
   * Complete current cycle and prepare for iteration.
   */
  completeCycle(): void {
    this.assertPhase("observation");
    this.state.currentCycle.endTime = Date.now();
    this.state.cycleHistory.push({ ...this.state.currentCycle });

    // Invoke callback
    if (this.config.onCycleComplete) {
      this.config.onCycleComplete(this.state.currentCycle);
    }

    this.updatePhase("iteration");
    this.state.isRunning = false;
  }

  /**
   * Pause the loop (e.g., waiting for user input).
   */
  pause(): void {
    this.state.isPaused = true;
    this.state.isRunning = false;
  }

  /**
   * Resume the loop after pause.
   */
  resume(): void {
    this.state.isPaused = false;
    this.state.isRunning = true;
  }

  /**
   * Stop the loop completely.
   */
  stop(): void {
    this.state.isRunning = false;
    this.state.isPaused = false;
  }

  /**
   * Apply a control signal to the loop state.
   */
  applyControlSignal(signal: AgentLoopControlSignal): void {
    if (signal === "PAUSE") {
      this.pause();
      return;
    }
    if (signal === "RESUME" || signal === "STEP") {
      this.resume();
    }
  }

  // ============================================================================
  // State Queries
  // ============================================================================

  /**
   * Get current state.
   */
  getState(): Readonly<AgentLoopState> {
    return this.state;
  }

  /**
   * Get current cycle.
   */
  getCurrentCycle(): Readonly<AgentLoopCycle> {
    return this.state.currentCycle;
  }

  /**
   * Get current phase.
   */
  getCurrentPhase(): AgentLoopPhase {
    return this.state.currentCycle.phase;
  }

  /**
   * Get cycle history.
   */
  getCycleHistory(): ReadonlyArray<AgentLoopCycle> {
    return this.state.cycleHistory;
  }

  /**
   * Get last observation.
   */
  getLastObservation(): Observation | undefined {
    return this.state.currentCycle.observation;
  }

  /**
   * Check if loop is running.
   */
  isRunning(): boolean {
    return this.state.isRunning;
  }

  /**
   * Check if loop is paused.
   */
  isPaused(): boolean {
    return this.state.isPaused;
  }

  /**
   * Get consecutive failure count.
   */
  getConsecutiveFailures(): number {
    return this.consecutiveFailures;
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private createInitialState(): AgentLoopState {
    return {
      currentCycle: {
        cycleNumber: 0,
        phase: "iteration",
        perception: { messages: [] },
        startTime: Date.now(),
      },
      cycleHistory: [],
      isRunning: false,
      isPaused: false,
      totalCycles: 0,
    };
  }

  private updatePhase(newPhase: AgentLoopPhase): void {
    this.state.currentCycle.phase = newPhase;
    this.logPhaseTransition(newPhase);

    if (this.config.onPhaseChange) {
      this.config.onPhaseChange(this.state.currentCycle, newPhase);
    }
  }

  private assertPhase(expectedPhase: AgentLoopPhase): void {
    if (this.state.currentCycle.phase !== expectedPhase) {
      throw new Error(
        `Invalid phase transition: expected ${expectedPhase}, current ${this.state.currentCycle.phase}`
      );
    }
  }

  private logPhaseTransition(phase: AgentLoopPhase): void {
    if (this.config.enableCycleLogging) {
      logger.info(`Cycle ${this.state.currentCycle.cycleNumber} -> ${phase.toUpperCase()}`, {
        cycle: this.state.currentCycle.cycleNumber,
        phase,
      });
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create an agent loop state machine.
 */
export function createAgentLoopStateMachine(
  config?: Partial<AgentLoopConfig>
): AgentLoopStateMachine {
  return new AgentLoopStateMachine(config);
}
