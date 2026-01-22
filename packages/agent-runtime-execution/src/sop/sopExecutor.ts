/**
 * SOP Executor
 *
 * Executes Standard Operating Procedures with phase-gated tool filtering.
 * Enforces tool access based on the current phase and validates quality
 * gates before allowing phase transitions.
 */

import type {
  GateChecker,
  GateCheckResult,
  ISOPExecutor,
  QualityGate,
  RoleDefinition,
} from "./types";

// ============================================================================
// Errors
// ============================================================================

/**
 * Error thrown when attempting to advance phase with failing gates.
 */
export class GateCheckFailedError extends Error {
  readonly gate: QualityGate;
  readonly reason: string;

  constructor(gate: QualityGate, reason: string) {
    super(`Quality gate "${gate.check}" failed after phase "${gate.after}": ${reason}`);
    this.name = "GateCheckFailedError";
    this.gate = gate;
    this.reason = reason;
  }
}

/**
 * Error thrown when attempting to advance beyond the final phase.
 */
export class NoMorePhasesError extends Error {
  constructor(role: string) {
    super(`Cannot advance: role "${role}" is already in the final phase`);
    this.name = "NoMorePhasesError";
  }
}

// ============================================================================
// Default Gate Checker
// ============================================================================

/**
 * Default gate checker that always passes.
 * Used when no custom checker is provided.
 */
export const defaultGateChecker: GateChecker = async (): Promise<GateCheckResult> => ({
  passed: true,
});

// ============================================================================
// SOP Executor Implementation
// ============================================================================

/**
 * Executes an SOP with phase-gated tool filtering.
 *
 * @example
 * ```typescript
 * const executor = new SOPExecutor(CODER_SOP, async (gate) => {
 *   if (gate.check === "tests_exist") {
 *     return { passed: await hasTestFiles() };
 *   }
 *   return { passed: true };
 * });
 *
 * console.log(executor.getCurrentPhase()); // "understand"
 * console.log(executor.getAllowedTools()); // ["read_file", "search_code", "list_dir"]
 *
 * await executor.advancePhase(); // moves to "plan"
 * ```
 */
export class SOPExecutor implements ISOPExecutor {
  private readonly role: RoleDefinition;
  private readonly gateChecker: GateChecker;
  private phaseIndex = 0;

  constructor(role: RoleDefinition, gateChecker: GateChecker = defaultGateChecker) {
    this.role = role;
    this.gateChecker = gateChecker;
  }

  /**
   * Get the role definition.
   */
  getRole(): RoleDefinition {
    return this.role;
  }

  /**
   * Get the current phase name.
   */
  getCurrentPhase(): string {
    const phase = this.role.phases[this.phaseIndex];
    return phase?.name ?? "complete";
  }

  /**
   * Get the current phase index.
   */
  getPhaseIndex(): number {
    return this.phaseIndex;
  }

  /**
   * Get allowed tools for the current phase.
   */
  getAllowedTools(): readonly string[] {
    const phase = this.role.phases[this.phaseIndex];
    return phase?.allowedTools ?? [];
  }

  /**
   * Check if a specific tool is allowed in the current phase.
   * Supports wildcard matching (e.g., "file:*" matches "file:read").
   */
  isToolAllowed(toolName: string): boolean {
    const allowedTools = this.getAllowedTools();

    for (const pattern of allowedTools) {
      if (pattern === "*") {
        return true;
      }
      if (pattern === toolName) {
        return true;
      }

      // Wildcard matching for patterns like "file:*"
      if (pattern.endsWith(":*")) {
        const prefix = pattern.slice(0, -1); // "file:"
        if (toolName.startsWith(prefix)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Check if the executor can advance to the next phase.
   * Returns the result of all quality gate checks for the current phase.
   */
  async canAdvance(): Promise<GateCheckResult> {
    if (this.isComplete()) {
      return { passed: false, reason: "Already in final phase" };
    }

    const currentPhase = this.getCurrentPhase();
    const gates = this.role.qualityGates.filter((g) => g.after === currentPhase);

    for (const gate of gates) {
      const result = await this.gateChecker(gate);
      if (!result.passed) {
        return { passed: false, reason: result.reason ?? `Gate "${gate.check}" failed` };
      }
    }

    return { passed: true };
  }

  /**
   * Advance to the next phase.
   * @throws GateCheckFailedError if any quality gate fails
   * @throws NoMorePhasesError if already in the final phase
   */
  async advancePhase(): Promise<void> {
    if (this.phaseIndex >= this.role.phases.length) {
      throw new NoMorePhasesError(this.role.name);
    }

    const currentPhase = this.getCurrentPhase();
    const gates = this.role.qualityGates.filter((g) => g.after === currentPhase);

    for (const gate of gates) {
      const result = await this.gateChecker(gate);
      if (!result.passed) {
        throw new GateCheckFailedError(gate, result.reason ?? "Gate check failed");
      }
    }

    this.phaseIndex++;
  }

  /**
   * Check if all phases are complete.
   */
  isComplete(): boolean {
    return this.phaseIndex >= this.role.phases.length;
  }

  /**
   * Reset to the first phase.
   */
  reset(): void {
    this.phaseIndex = 0;
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a new SOP executor for a role.
 */
export function createSOPExecutor(role: RoleDefinition, gateChecker?: GateChecker): ISOPExecutor {
  return new SOPExecutor(role, gateChecker);
}
