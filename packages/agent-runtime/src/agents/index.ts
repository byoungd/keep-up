/**
 * Agents Module
 *
 * Provides specialized agents for different task types.
 * Reference: Claude Code's agent architecture.
 */

// Lineage
export {
  type AgentLineageEntry,
  AgentLineageManager,
  type AgentUsage,
  createLineageManager,
  type DelegationRole,
  type LineageAgentStatus,
  type LineageChain,
} from "@ku0/agent-runtime-tools";
// Manager
export { AgentManager, createAgentManager } from "./manager";

// Profiles
export { AGENT_PROFILES, getAgentProfile, listAgentTypes } from "./profiles";
// Types
export type {
  AgentManagerConfig,
  AgentProfile,
  AgentResult,
  AgentStatus,
  AgentType,
  IAgentManager,
  SpawnAgentOptions,
} from "./types";

// Verifier
export {
  VerifierAgent,
  type VerifierAgentConfig,
  type VerifierRequest,
  type VerifierResult,
  type VerifierSource,
} from "./verifier";
