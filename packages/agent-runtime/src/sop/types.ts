/**
 * SOP Types
 *
 * Defines types for Standard Operating Procedures (SOPs) and role-based
 * phase-gated workflows as specified in agent-runtime-spec-2026.md Section 7.
 */

// ============================================================================
// Phase and Gate Types
// ============================================================================

/**
 * A single phase in an SOP workflow.
 * Each phase defines which tools are available during that phase.
 */
export interface SOPPhase {
  /** Phase name (e.g., "understand", "plan", "implement", "verify") */
  readonly name: string;
  /** Tools allowed during this phase */
  readonly allowedTools: readonly string[];
}

/**
 * Quality gate that must pass before advancing to the next phase.
 */
export interface QualityGate {
  /** The phase after which this gate is checked */
  readonly after: string;
  /** Gate check identifier (e.g., "tests_exist", "tests_pass") */
  readonly check: string;
}

// ============================================================================
// Role Definition
// ============================================================================

/**
 * Complete role definition for an SOP.
 * Defines the phases, tools, and quality gates for a specialized role.
 *
 * @example
 * ```typescript
 * const CODER_SOP: RoleDefinition = {
 *   name: "Coder",
 *   profile: "Senior Software Engineer",
 *   goal: "Write clean, tested, maintainable code",
 *   phases: [
 *     { name: "understand", allowedTools: ["read_file", "search_code"] },
 *     { name: "implement", allowedTools: ["write_file", "read_file"] },
 *   ],
 *   qualityGates: [
 *     { after: "implement", check: "tests_exist" },
 *   ],
 *   maxReactLoop: 15,
 * };
 * ```
 */
export interface RoleDefinition {
  /** Role name (e.g., "Coder", "Researcher") */
  readonly name: string;
  /** Human-readable profile description */
  readonly profile: string;
  /** Goal statement for the role */
  readonly goal: string;
  /** Ordered list of phases with tool allowlists */
  readonly phases: readonly SOPPhase[];
  /** Quality gates between phases */
  readonly qualityGates: readonly QualityGate[];
  /** Maximum number of turns before requiring completion */
  readonly maxReactLoop: number;
}

// ============================================================================
// Executor Types
// ============================================================================

/**
 * Result of a quality gate check.
 */
export interface GateCheckResult {
  /** Whether the gate passed */
  readonly passed: boolean;
  /** Reason for failure (if applicable) */
  readonly reason?: string;
}

/**
 * Function to check if a quality gate passes.
 */
export type GateChecker = (gate: QualityGate) => Promise<GateCheckResult>;

/**
 * Interface for SOP execution and phase management.
 */
export interface ISOPExecutor {
  /** Get the role definition */
  getRole(): RoleDefinition;
  /** Get the current phase name */
  getCurrentPhase(): string;
  /** Get the current phase index */
  getPhaseIndex(): number;
  /** Get allowed tools for the current phase */
  getAllowedTools(): readonly string[];
  /** Check if a specific tool is allowed in the current phase */
  isToolAllowed(toolName: string): boolean;
  /** Check if the executor can advance to the next phase */
  canAdvance(): Promise<GateCheckResult>;
  /** Advance to the next phase (throws if gates not passed) */
  advancePhase(): Promise<void>;
  /** Check if all phases are complete */
  isComplete(): boolean;
  /** Reset to the first phase */
  reset(): void;
}
