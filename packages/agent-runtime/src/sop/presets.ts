/**
 * SOP Presets
 *
 * Predefined role SOPs as specified in agent-runtime-spec-2026.md Section 7.
 * These define the phases, allowed tools, and quality gates for each role.
 */

import type { RoleDefinition } from "./types";

// ============================================================================
// Coder SOP
// ============================================================================

/**
 * Coder role SOP.
 * Follows understand → plan → implement → verify workflow.
 */
export const CODER_SOP: RoleDefinition = {
  name: "Coder",
  profile: "Senior Software Engineer",
  goal: "Write clean, tested, maintainable code",
  phases: [
    { name: "understand", allowedTools: ["read_file", "search_code", "list_dir"] },
    { name: "plan", allowedTools: ["read_file", "search_code"] },
    { name: "implement", allowedTools: ["write_file", "read_file"] },
    { name: "verify", allowedTools: ["run_command", "read_file"] },
  ],
  qualityGates: [
    { after: "implement", check: "tests_exist" },
    { after: "verify", check: "tests_pass" },
  ],
  maxReactLoop: 15,
};

// ============================================================================
// Researcher SOP
// ============================================================================

/**
 * Researcher role SOP.
 * Follows explore → analyze → synthesize workflow.
 */
export const RESEARCHER_SOP: RoleDefinition = {
  name: "Researcher",
  profile: "Technical Researcher",
  goal: "Find accurate information and synthesize insights",
  phases: [
    { name: "explore", allowedTools: ["search_web", "read_url", "search_code"] },
    { name: "analyze", allowedTools: ["read_file", "search_code"] },
    { name: "synthesize", allowedTools: [] }, // LLM-only phase
  ],
  qualityGates: [],
  maxReactLoop: 10,
};

// ============================================================================
// Reviewer SOP
// ============================================================================

/**
 * Reviewer role SOP.
 * Follows explore → analyze → report workflow.
 */
export const REVIEWER_SOP: RoleDefinition = {
  name: "Reviewer",
  profile: "Code Review Specialist",
  goal: "Identify bugs, security issues, and improvement opportunities",
  phases: [
    { name: "explore", allowedTools: ["read_file", "search_code", "list_dir"] },
    { name: "analyze", allowedTools: ["read_file", "search_code"] },
    { name: "report", allowedTools: [] }, // LLM-only synthesis
  ],
  qualityGates: [],
  maxReactLoop: 8,
};

// ============================================================================
// Architect SOP
// ============================================================================

/**
 * Architect role SOP.
 * Follows understand → design → document workflow.
 */
export const ARCHITECT_SOP: RoleDefinition = {
  name: "Architect",
  profile: "System Design Expert",
  goal: "Design scalable, maintainable system architectures",
  phases: [
    { name: "understand", allowedTools: ["read_file", "search_code", "list_dir", "read_url"] },
    { name: "design", allowedTools: ["search_web", "read_url"] },
    { name: "document", allowedTools: ["write_file"] },
  ],
  qualityGates: [{ after: "design", check: "diagram_exists" }],
  maxReactLoop: 12,
};

// ============================================================================
// All Presets
// ============================================================================

/**
 * All preset role definitions.
 */
export const SOP_PRESETS: readonly RoleDefinition[] = [
  CODER_SOP,
  RESEARCHER_SOP,
  REVIEWER_SOP,
  ARCHITECT_SOP,
];

/**
 * Map of role name to definition for quick lookup.
 */
export const SOP_PRESETS_MAP: ReadonlyMap<string, RoleDefinition> = new Map(
  SOP_PRESETS.map((sop) => [sop.name, sop])
);
