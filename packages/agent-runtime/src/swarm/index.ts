/**
 * Swarm Module
 *
 * Multi-agent orchestration with parallel background execution.
 * Implements the "Conductor + Workers" pattern for Phase F.
 */

export {
  CONDUCTOR_TOOLS,
  createConductorContext,
} from "./conductorContext";
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
  WorkerInstance,
  WorkerPriority,
  WorkerState,
  WorkerTask,
} from "./types";
