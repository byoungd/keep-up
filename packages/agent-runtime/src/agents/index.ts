/**
 * Agents Module
 *
 * Provides specialized agents for different task types.
 * Reference: Claude Code's agent architecture.
 */

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
