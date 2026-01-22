/**
 * Conductor Context
 *
 * Provides the main agent (Conductor) with the ability to spawn
 * and manage background workers for parallel task execution.
 */

import type { SwarmOrchestrator } from "./swarmOrchestrator";
import type { ConductorContext, WorkerInstance, WorkerTask } from "./types";

/**
 * Create a Conductor context for the main agent
 */
export function createConductorContext(swarm: SwarmOrchestrator): ConductorContext {
  return {
    /**
     * Spawn a background worker to handle a subtask
     */
    spawnWorker: async (task: Omit<WorkerTask, "id" | "background">) => {
      return swarm.spawnWorker({
        ...task,
        background: true,
      });
    },

    /**
     * Get the current status of all workers
     */
    getWorkerStatus: (): WorkerInstance[] => {
      return swarm.getActiveWorkers();
    },

    /**
     * Check if the swarm has active workers
     */
    isBusy: (): boolean => {
      return swarm.getStats().activeCount > 0;
    },
  };
}

/**
 * Conductor tools for the main agent
 *
 * These can be registered as MCP tools for the agent to use.
 */
export const CONDUCTOR_TOOLS = {
  spawn_background_task: {
    name: "spawn_background_task",
    description:
      "Spawn a background worker to handle a subtask in parallel. The worker runs independently and reports results when complete. Use this for long-running operations like running tests, linting files, or generating documentation.",
    inputSchema: {
      type: "object" as const,
      properties: {
        type: {
          type: "string",
          description: "Task type (e.g., 'test', 'lint', 'document')",
        },
        prompt: {
          type: "string",
          description: "Instructions for the background worker",
        },
        priority: {
          type: "string",
          enum: ["high", "normal", "low", "background"],
          description: "Task priority (default: background)",
        },
        context: {
          type: "object",
          description: "Additional context to pass to the worker",
        },
      },
      required: ["type", "prompt"],
    },
  },

  get_worker_status: {
    name: "get_worker_status",
    description: "Get the status of all active background workers.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },

  cancel_worker: {
    name: "cancel_worker",
    description: "Cancel a running background worker by ID.",
    inputSchema: {
      type: "object" as const,
      properties: {
        workerId: {
          type: "string",
          description: "ID of the worker to cancel",
        },
      },
      required: ["workerId"],
    },
  },
};
