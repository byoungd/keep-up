/**
 * LFCC v0.9.1 — Agent Identity Types
 *
 * Types for AI agent identification, capabilities, and permissions
 * in multi-agent collaboration scenarios.
 *
 * @see docs/specs/proposals/LFCC_v0.9.1_AI_Native_Enhancement.md §3.4
 */

import type { AIOpCode } from "./opcodes.js";

// ============================================================================
// Agent Types
// ============================================================================

/**
 * Classification of agent roles.
 */
export type AgentType =
  | "writer" // Content creation
  | "editor" // Editing and polishing
  | "reviewer" // Review and proofreading
  | "translator" // Translation
  | "researcher" // Research/lookup
  | "formatter" // Formatting
  | "orchestrator" // Coordinator (manages other agents)
  | "custom"; // Custom agent type

/**
 * All available agent types.
 */
export const ALL_AGENT_TYPES: readonly AgentType[] = [
  "writer",
  "editor",
  "reviewer",
  "translator",
  "researcher",
  "formatter",
  "orchestrator",
  "custom",
] as const;

// ============================================================================
// Agent Capabilities
// ============================================================================

/**
 * Capabilities an agent can have.
 */
export type AgentCapability =
  | "generate_content"
  | "modify_content"
  | "delete_content"
  | "add_annotations"
  | "modify_annotations"
  | "restructure_document"
  | "approve_suggestions"
  | "delegate_tasks"
  | "resolve_conflicts";

/**
 * All available agent capabilities.
 */
export const ALL_AGENT_CAPABILITIES: readonly AgentCapability[] = [
  "generate_content",
  "modify_content",
  "delete_content",
  "add_annotations",
  "modify_annotations",
  "restructure_document",
  "approve_suggestions",
  "delegate_tasks",
  "resolve_conflicts",
] as const;

// ============================================================================
// Agent Permissions
// ============================================================================

/**
 * Scope of agent permissions.
 */
export type PermissionScope = "full_document" | "assigned_blocks" | "annotations_only";

/**
 * Agent permission configuration.
 */
export interface AgentPermissions {
  /** Document scope for this agent */
  scope: PermissionScope;

  /** If scope is "assigned_blocks", which blocks are assigned */
  assigned_blocks?: string[];

  /** Which AI OpCodes this agent is allowed to use */
  allowed_ops: AIOpCode[];

  /** Whether operations require human approval */
  requires_human_approval: boolean;

  /** Maximum concurrent edits this agent can perform */
  max_concurrent_edits: number;
}

// ============================================================================
// Agent Identity
// ============================================================================

/**
 * Agent metadata.
 */
export interface AgentMetadata {
  /** Display name for UI */
  display_name: string;

  /** Model identifier (if AI-based) */
  model_id?: string;

  /** When this agent was created */
  created_at: number;

  /** Session this agent belongs to */
  session_id: string;
}

/**
 * Complete agent identity.
 *
 * @requirement AGENT-001: Multi-agent scenarios MUST use Agent Coordination Protocol
 */
export interface AgentIdentity {
  /** Unique agent identifier */
  agent_id: string;

  /** Agent type/role */
  agent_type: AgentType;

  /** Declared capabilities */
  capabilities: AgentCapability[];

  /** Permission configuration */
  permissions: AgentPermissions;

  /** Agent metadata */
  metadata: AgentMetadata;
}

// ============================================================================
// Factory Functions
// ============================================================================

let agentCounter = 0;

/**
 * Generate a unique agent ID
 */
export function generateAgentId(): string {
  const timestamp = Date.now().toString(36);
  const counter = (agentCounter++).toString(36).padStart(4, "0");
  const random = Math.random().toString(36).substring(2, 6);
  return `agent_${timestamp}_${counter}_${random}`;
}

/**
 * Create a default permission set for an agent type
 */
export function createDefaultPermissions(agentType: AgentType): AgentPermissions {
  switch (agentType) {
    case "writer":
      return {
        scope: "full_document",
        allowed_ops: ["OP_AI_GENERATE", "OP_AI_EXPAND", "OP_AI_REWRITE"],
        requires_human_approval: false,
        max_concurrent_edits: 5,
      };

    case "editor":
      return {
        scope: "full_document",
        allowed_ops: ["OP_AI_REWRITE", "OP_AI_REFINE", "OP_AI_CORRECT", "OP_AI_FORMAT"],
        requires_human_approval: false,
        max_concurrent_edits: 10,
      };

    case "reviewer":
      return {
        scope: "full_document",
        allowed_ops: ["OP_AI_REVIEW", "OP_AI_SUGGEST", "OP_AI_VALIDATE"],
        requires_human_approval: false,
        max_concurrent_edits: 3,
      };

    case "translator":
      return {
        scope: "full_document",
        allowed_ops: ["OP_AI_TRANSLATE"],
        requires_human_approval: true,
        max_concurrent_edits: 1,
      };

    case "orchestrator":
      return {
        scope: "full_document",
        allowed_ops: ["OP_AI_DELEGATE", "OP_AI_HANDOFF", "OP_AI_MERGE_RESOLVE"],
        requires_human_approval: false,
        max_concurrent_edits: 1,
      };

    default:
      return {
        scope: "annotations_only",
        allowed_ops: [],
        requires_human_approval: true,
        max_concurrent_edits: 1,
      };
  }
}

/**
 * Create a new agent identity
 */
export function createAgentIdentity(
  agentType: AgentType,
  displayName: string,
  sessionId: string,
  options?: {
    agent_id?: string;
    model_id?: string;
    capabilities?: AgentCapability[];
    permissions?: Partial<AgentPermissions>;
  }
): AgentIdentity {
  const defaultPermissions = createDefaultPermissions(agentType);

  return {
    agent_id: options?.agent_id ?? generateAgentId(),
    agent_type: agentType,
    capabilities: options?.capabilities ?? getDefaultCapabilities(agentType),
    permissions: {
      ...defaultPermissions,
      ...options?.permissions,
    },
    metadata: {
      display_name: displayName,
      model_id: options?.model_id,
      created_at: Date.now(),
      session_id: sessionId,
    },
  };
}

/**
 * Get default capabilities for an agent type
 */
export function getDefaultCapabilities(agentType: AgentType): AgentCapability[] {
  switch (agentType) {
    case "writer":
      return ["generate_content", "modify_content"];
    case "editor":
      return ["modify_content"];
    case "reviewer":
      return ["add_annotations", "modify_annotations", "approve_suggestions"];
    case "translator":
      return ["modify_content"];
    case "orchestrator":
      return ["delegate_tasks", "resolve_conflicts"];
    case "formatter":
      return ["modify_content"];
    case "researcher":
      return ["add_annotations"];
    default:
      return [];
  }
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Check if an agent has a specific capability
 */
export function hasCapability(agent: AgentIdentity, capability: AgentCapability): boolean {
  return agent.capabilities.includes(capability);
}

/**
 * Check if an agent can use a specific OpCode
 */
export function canUseOpCode(agent: AgentIdentity, opCode: AIOpCode): boolean {
  return agent.permissions.allowed_ops.includes(opCode);
}

/**
 * Check if an agent can edit a specific block
 */
export function canEditBlock(agent: AgentIdentity, blockId: string): boolean {
  if (agent.permissions.scope === "full_document") {
    return true;
  }
  if (agent.permissions.scope === "annotations_only") {
    return false;
  }
  return agent.permissions.assigned_blocks?.includes(blockId) ?? false;
}
