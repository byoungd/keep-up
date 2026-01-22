/**
 * SOP Module
 *
 * Standard Operating Procedures with phase-gated tool filtering.
 * Provides role definitions, registry, and execution logic.
 */

export { type ArtifactLookup, createCodeAgentGateChecker } from "./gates";
// Presets
export {
  ARCHITECT_SOP,
  CODER_SOP,
  RESEARCHER_SOP,
  REVIEWER_SOP,
  SOP_PRESETS,
  SOP_PRESETS_MAP,
} from "./presets";
// Registry
export type { IRoleRegistry } from "./roleRegistry";
export {
  createDefaultRoleRegistry,
  createRoleRegistry,
  RoleRegistry,
} from "./roleRegistry";
// Executor
export {
  createSOPExecutor,
  defaultGateChecker,
  GateCheckFailedError,
  NoMorePhasesError,
  SOPExecutor,
} from "./sopExecutor";
// Types
export type {
  GateChecker,
  GateCheckResult,
  ISOPExecutor,
  QualityGate,
  RoleDefinition,
  SOPPhase,
} from "./types";
