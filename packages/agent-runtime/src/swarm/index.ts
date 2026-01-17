/**
 * Swarm Module
 *
 * Multi-agent orchestration with parallel background execution.
 * Implements the "Conductor + Workers" pattern for Phase F.
 *
 * Provides two orchestrator implementations:
 * 1. SwarmOrchestrator - Custom lightweight implementation
 * 2. OpenAIAgentsOrchestrator - Official OpenAI Agents SDK (recommended)
 */

export {
  CONDUCTOR_TOOLS,
  createConductorContext,
} from "./conductorContext";
// Ghost Agent (Proactive Monitoring)
export * from "./ghost";

// OpenAI Agents SDK adapter (recommended)
export {
  Agent,
  type AgentDefinition,
  createAgentTool,
  createOpenAIAgentsOrchestrator,
  createOpenAIConductorContext,
  type OpenAIAgentsConfig,
  OpenAIAgentsOrchestrator,
  type RunResult,
  run,
  tool,
} from "./openaiAgentsAdapter";
// Legacy orchestrator (for backward compatibility)
export {
  createSwarmOrchestrator,
  SwarmOrchestrator,
} from "./swarmOrchestrator";

export type {
  ConductorContext,
  ISwarmOrchestrator,
  SwarmConfig,
  SwarmEvent,
  SwarmEventHandler,
  SwarmEventType,
  SwarmStats,
  WorkerExecutor,
  WorkerInstance,
  WorkerPriority,
  WorkerState,
  WorkerTask,
} from "./types";
