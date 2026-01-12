/**
 * Agents Module
 *
 * Provides specialized agents for different task types.
 * Reference: Claude Code's agent architecture.
 */

// Types
export type {
  AgentType,
  AgentProfile,
  SpawnAgentOptions,
  AgentResult,
  AgentStatus,
  IAgentManager,
  AgentManagerConfig,
} from "./types";

// Profiles
export { AGENT_PROFILES, getAgentProfile, listAgentTypes } from "./profiles";

// Manager
export { AgentManager, createAgentManager } from "./manager";
