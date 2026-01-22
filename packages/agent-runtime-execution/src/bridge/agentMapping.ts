/**
 * Agent Type Mapping
 *
 * Bridges between @reader/core AgentType (content roles)
 * and agent-runtime AgentType (tool execution roles).
 */

import type { AgentCapability, AgentType as CoreAgentType } from "@ku0/core";
import type { AgentType as RuntimeAgentType } from "../agents/types";

// ============================================================================
// Core → Runtime Mapping
// ============================================================================

/**
 * Maps core content-focused agent types to runtime tool-execution types.
 */
const CORE_TO_RUNTIME_MAP: Record<CoreAgentType, RuntimeAgentType> = {
  writer: "code",
  editor: "code",
  reviewer: "code-reviewer",
  translator: "general",
  researcher: "research",
  formatter: "code",
  orchestrator: "plan",
  custom: "general",
};

/**
 * Maps runtime tool-execution types to best-fit core content types.
 */
const RUNTIME_TO_CORE_MAP: Record<RuntimeAgentType, CoreAgentType> = {
  general: "custom",
  bash: "custom",
  explore: "researcher",
  plan: "orchestrator",
  code: "writer",
  research: "researcher",
  "test-writer": "writer",
  "code-reviewer": "reviewer",
  implementer: "writer",
  debugger: "editor",
  digest: "custom",
  verifier: "reviewer",
};

/**
 * Default capabilities for each runtime agent type.
 */
const RUNTIME_CAPABILITIES: Record<RuntimeAgentType, AgentCapability[]> = {
  general: ["generate_content", "modify_content"],
  bash: ["modify_content"],
  explore: ["add_annotations"],
  plan: ["delegate_tasks"],
  code: ["generate_content", "modify_content", "delete_content"],
  research: ["add_annotations"],
  "test-writer": ["generate_content"],
  "code-reviewer": ["add_annotations", "modify_annotations", "approve_suggestions"],
  implementer: ["generate_content", "modify_content", "restructure_document"],
  debugger: ["modify_content"],
  digest: ["generate_content", "add_annotations"],
  verifier: ["add_annotations"],
};

// ============================================================================
// Mapping Functions
// ============================================================================

/**
 * Map a core agent type to a runtime agent type.
 */
export function mapCoreAgentToRuntime(coreType: CoreAgentType): RuntimeAgentType {
  return CORE_TO_RUNTIME_MAP[coreType];
}

/**
 * Map a runtime agent type to a core agent type.
 */
export function mapRuntimeAgentToCore(runtimeType: RuntimeAgentType): CoreAgentType {
  return RUNTIME_TO_CORE_MAP[runtimeType];
}

/**
 * Get applicable core capabilities for a runtime agent type.
 */
export function getCoreCapabilitiesForRuntime(runtimeType: RuntimeAgentType): AgentCapability[] {
  return RUNTIME_CAPABILITIES[runtimeType];
}

/**
 * Check if a runtime agent type can perform a core capability.
 */
export function runtimeAgentHasCapability(
  runtimeType: RuntimeAgentType,
  capability: AgentCapability
): boolean {
  return RUNTIME_CAPABILITIES[runtimeType].includes(capability);
}

// ============================================================================
// Validation
// ============================================================================

const VALID_CORE_TYPES: CoreAgentType[] = [
  "writer",
  "editor",
  "reviewer",
  "translator",
  "researcher",
  "formatter",
  "orchestrator",
  "custom",
];

const VALID_RUNTIME_TYPES: RuntimeAgentType[] = [
  "general",
  "bash",
  "explore",
  "plan",
  "code",
  "research",
  "test-writer",
  "code-reviewer",
  "implementer",
  "debugger",
  "digest",
  "verifier",
];

/**
 * Validate a core agent type.
 */
export function isValidCoreAgentType(value: unknown): value is CoreAgentType {
  return typeof value === "string" && VALID_CORE_TYPES.includes(value as CoreAgentType);
}

/**
 * Validate a runtime agent type.
 */
export function isValidRuntimeAgentType(value: unknown): value is RuntimeAgentType {
  return typeof value === "string" && VALID_RUNTIME_TYPES.includes(value as RuntimeAgentType);
}
