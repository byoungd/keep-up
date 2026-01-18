/**
 * Agent Manager
 *
 * Manages the lifecycle of specialized agents.
 * Supports spawning, parallel execution, and status tracking.
 */

import { type AgentEvents, createScopedEventBus, type RuntimeEventBus } from "../events";
import { type AgentOrchestrator, createOrchestrator } from "../orchestrator/orchestrator";
import { createSecurityPolicy } from "../security";
import { createSessionState, type SessionState } from "../session";
import type { TelemetryContext } from "../telemetry";
import type { IToolRegistry } from "../tools/mcp/registry";
import type { SecurityPolicy } from "../types";
import { AGENT_PROFILES, getAgentProfile, listAgentTypes } from "./profiles";
import type {
  AgentManagerConfig,
  AgentProfile,
  AgentResult,
  AgentStatus,
  AgentType,
  IAgentManager,
  SpawnAgentOptions,
} from "./types";

// ============================================================================
// Constants
// ============================================================================

/** Default maximum recursion depth */
const DEFAULT_MAX_DEPTH = 5;

/** Default maximum total agents per session */
const DEFAULT_MAX_TOTAL_AGENTS = 100;

// ============================================================================
// Custom Errors
// ============================================================================

/**
 * Error thrown when agent spawning limits are exceeded.
 */
export class AgentLimitError extends Error {
  constructor(
    public readonly code: "MAX_DEPTH_EXCEEDED" | "MAX_AGENTS_EXCEEDED" | "ABORTED",
    message: string
  ) {
    super(message);
    this.name = "AgentLimitError";
  }
}

// ============================================================================
// Running Agent Tracking
// ============================================================================

interface RunningAgent {
  id: string;
  type: AgentType;
  orchestrator: AgentOrchestrator;
  status: AgentStatus;
  startTime: number;
  promise?: Promise<AgentResult>;
  viewContextId?: string;
}

// ============================================================================
// Agent Manager Implementation
// ============================================================================

export class AgentManager implements IAgentManager {
  private readonly config: AgentManagerConfig;
  private readonly runningAgents = new Map<string, RunningAgent>();
  private readonly maxDepth: number;
  private readonly maxTotalAgents: number;
  private readonly eventBus?: RuntimeEventBus;
  private agentCounter = 0;
  private totalSpawnedCount = 0;
  private telemetry?: TelemetryContext;
  private readonly contextManager?: AgentManagerConfig["contextManager"];

  constructor(config: AgentManagerConfig, telemetry?: TelemetryContext) {
    this.config = config;
    this.telemetry = telemetry;
    this.maxDepth = config.maxDepth ?? DEFAULT_MAX_DEPTH;
    this.maxTotalAgents = config.maxTotalAgents ?? DEFAULT_MAX_TOTAL_AGENTS;
    this.eventBus = config.eventBus;
    this.contextManager = config.contextManager;
  }

  /**
   * Spawn a specialized agent.
   */
  async spawn(options: SpawnAgentOptions): Promise<AgentResult> {
    this.assertSpawnAllowed(options);
    const agentId = this.generateAgentId(options.type);
    const profile = getAgentProfile(options.type);
    const allowedTools = this.resolveAllowedTools(profile.allowedTools, options.allowedTools);
    const scopedEventBus = this.eventBus
      ? createScopedEventBus(this.eventBus, {
          agentId,
          parentId: options.parentTraceId,
          source: "agent-manager",
        })
      : undefined;
    const { sessionState, viewContextId } = this.buildSessionState(options);

    this.emitAgentEvent(
      "agent:spawned",
      {
        agentId,
        type: options.type,
        task: options.task,
      },
      options.parentTraceId
    );

    // Create orchestrator with profile settings
    const orchestrator = this.createAgentOrchestrator(
      profile,
      options,
      allowedTools,
      scopedEventBus,
      sessionState
    );

    // Track the running agent
    const runningAgent: RunningAgent = {
      id: agentId,
      type: options.type,
      orchestrator,
      status: "running",
      startTime: Date.now(),
      viewContextId,
    };

    this.runningAgents.set(agentId, runningAgent);
    this.emitAgentEvent("agent:started", { agentId }, options.parentTraceId);

    try {
      const state = await orchestrator.run(options.task);

      const result: AgentResult = {
        agentId,
        type: options.type,
        success: state.status === "complete",
        output: this.extractOutput(state.messages),
        turns: state.turn,
        durationMs: Date.now() - runningAgent.startTime,
      };

      if (state.status === "error") {
        result.success = false;
        result.error = state.error;
      }

      runningAgent.status = result.success ? "completed" : "failed";
      if (result.success) {
        this.emitAgentEvent("agent:completed", { agentId, result }, options.parentTraceId);
      } else {
        this.emitAgentEvent(
          "agent:failed",
          { agentId, error: result.error ?? "Unknown error" },
          options.parentTraceId
        );
      }
      return result;
    } catch (error) {
      runningAgent.status = "failed";
      const message = error instanceof Error ? error.message : String(error);
      this.emitAgentEvent("agent:failed", { agentId, error: message }, options.parentTraceId);
      return {
        agentId,
        type: options.type,
        success: false,
        output: "",
        error: message,
        turns: 0,
        durationMs: Date.now() - runningAgent.startTime,
      };
    } finally {
      scopedEventBus?.dispose();
      if (viewContextId && this.contextManager) {
        this.contextManager.disposeView(viewContextId, true);
      }
      // Cleanup after completion (keep for a short time for status queries)
      setTimeout(() => {
        this.runningAgents.delete(agentId);
      }, 60000);
    }
  }

  private emitAgentEvent<K extends keyof AgentEvents>(
    type: K,
    payload: AgentEvents[K],
    correlationId?: string
  ): void {
    // biome-ignore lint/suspicious/noExplicitAny: complex union type mismatch
    this.eventBus?.emit(type as any, payload as any, {
      source: "agent-manager",
      correlationId,
      priority: "normal",
    });
  }

  /**
   * Spawn multiple agents in parallel.
   */
  async spawnParallel(optionsList: SpawnAgentOptions[]): Promise<AgentResult[]> {
    const maxConcurrent = this.config.maxConcurrent ?? 5;

    // Process in batches if needed
    const results: AgentResult[] = [];

    for (let i = 0; i < optionsList.length; i += maxConcurrent) {
      const batch = optionsList.slice(i, i + maxConcurrent);
      const batchResults = await Promise.all(batch.map((opts) => this.spawn(opts)));
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Get available agent types.
   */
  getAvailableTypes(): AgentType[] {
    return listAgentTypes();
  }

  /**
   * Get profile for an agent type.
   */
  getProfile(type: AgentType): AgentProfile {
    return AGENT_PROFILES[type];
  }

  /**
   * Stop a running agent.
   */
  async stop(agentId: string): Promise<void> {
    const agent = this.runningAgents.get(agentId);
    if (agent) {
      agent.orchestrator.stop();
      agent.status = "stopped";
    }
  }

  /**
   * Get status of a running agent.
   */
  getStatus(agentId: string): AgentStatus | undefined {
    return this.runningAgents.get(agentId)?.status;
  }

  /**
   * Create spawn options for a child agent.
   * Automatically increments depth for recursion tracking.
   */
  createChildSpawnOptions(
    parentOptions: SpawnAgentOptions,
    childConfig: Omit<SpawnAgentOptions, "_depth" | "signal">
  ): SpawnAgentOptions {
    return {
      ...childConfig,
      _depth: (parentOptions._depth ?? 0) + 1,
      signal: parentOptions.signal,
    };
  }

  /**
   * Get current spawn statistics.
   */
  getStats(): { totalSpawned: number; running: number; maxDepth: number; maxTotal: number } {
    return {
      totalSpawned: this.totalSpawnedCount,
      running: this.runningAgents.size,
      maxDepth: this.maxDepth,
      maxTotal: this.maxTotalAgents,
    };
  }

  /**
   * Reset spawn counters (useful for testing or session reset).
   */
  resetCounters(): void {
    this.totalSpawnedCount = 0;
    this.agentCounter = 0;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private generateAgentId(type: AgentType): string {
    this.agentCounter++;
    return `${type}-${this.agentCounter}-${Date.now().toString(36)}`;
  }

  private assertSpawnAllowed(options: SpawnAgentOptions): void {
    if (options.signal?.aborted) {
      throw new AgentLimitError("ABORTED", "Agent spawn aborted");
    }

    const currentDepth = options._depth ?? 0;
    if (currentDepth >= this.maxDepth) {
      throw new AgentLimitError(
        "MAX_DEPTH_EXCEEDED",
        `Maximum agent recursion depth (${this.maxDepth}) exceeded. This prevents infinite agent spawning loops.`
      );
    }

    if (this.totalSpawnedCount >= this.maxTotalAgents) {
      throw new AgentLimitError(
        "MAX_AGENTS_EXCEEDED",
        `Maximum total agents (${this.maxTotalAgents}) exceeded. This prevents runaway agent creation.`
      );
    }

    this.totalSpawnedCount++;
  }

  private createAgentOrchestrator(
    profile: AgentProfile,
    options: SpawnAgentOptions,
    allowedTools: string[],
    eventBus?: RuntimeEventBus,
    sessionState?: SessionState
  ): AgentOrchestrator {
    // Determine security policy
    const security: SecurityPolicy =
      options.security ??
      this.config.defaultSecurity ??
      createSecurityPolicy(profile.securityPreset);

    // Create filtered registry based on allowed tools
    const filteredRegistry = this.createFilteredRegistry(allowedTools);

    return createOrchestrator(this.config.llm, filteredRegistry, {
      name: `${profile.name} Agent`,
      systemPrompt: profile.systemPrompt,
      security,
      maxTurns: options.maxTurns ?? profile.maxTurns,
      requireConfirmation: profile.requireConfirmation,
      toolExecutionContext: { allowedTools },
      telemetry: this.telemetry,
      eventBus,
      components: sessionState ? { sessionState } : undefined,
    });
  }

  private buildSessionState(options: SpawnAgentOptions): {
    sessionState?: SessionState;
    viewContextId?: string;
  } {
    if (!this.contextManager) {
      return {};
    }

    if (options.contextId) {
      return {
        sessionState: createSessionState({
          contextManager: this.contextManager,
          contextId: options.contextId,
        }),
      };
    }

    if (options.parentContextId) {
      const view = this.contextManager.createView(options.parentContextId);
      return {
        sessionState: createSessionState({
          contextManager: this.contextManager,
          contextId: view.id,
        }),
        viewContextId: view.id,
      };
    }

    const context = this.contextManager.create({ parentId: undefined });
    return {
      sessionState: createSessionState({
        contextManager: this.contextManager,
        contextId: context.id,
      }),
    };
  }

  private createFilteredRegistry(allowedTools: string[]): IToolRegistry {
    // If all tools allowed, return original registry
    if (allowedTools.includes("*")) {
      return this.config.registry;
    }

    // Create a wrapper that filters tools
    const originalRegistry = this.config.registry;

    return {
      listTools: () => {
        const tools = originalRegistry.listTools();
        return tools.filter((tool) => this.isToolAllowed(tool.name, allowedTools));
      },
      hasTool: (name: string) => {
        return originalRegistry.hasTool(name) && this.isToolAllowed(name, allowedTools);
      },
      resolveToolServer: (name: string) => originalRegistry.resolveToolServer?.(name),
      getServer: (name: string) => originalRegistry.getServer(name),
      callTool: async (call, context) => {
        if (!this.isToolAllowed(call.name, allowedTools)) {
          return {
            success: false,
            content: [{ type: "text" as const, text: "Tool not allowed for this agent" }],
            error: { code: "PERMISSION_DENIED", message: "Tool not allowed for this agent type" },
          };
        }
        return originalRegistry.callTool(call, context);
      },
      register: (server) => originalRegistry.register(server),
      unregister: (name) => originalRegistry.unregister(name),
      on: (event, handler) => originalRegistry.on(event, handler),
    };
  }

  private resolveAllowedTools(profileAllowed: string[], scopedAllowed?: string[]): string[] {
    if (!scopedAllowed || scopedAllowed.length === 0) {
      return profileAllowed;
    }

    if (profileAllowed.includes("*")) {
      return scopedAllowed;
    }

    const scopedSet = new Set(scopedAllowed);
    return profileAllowed.filter((tool) => scopedSet.has(tool) || scopedSet.has("*"));
  }

  private isToolAllowed(toolName: string, allowedTools: string[]): boolean {
    for (const pattern of allowedTools) {
      if (pattern === "*") {
        return true;
      }
      if (pattern === toolName) {
        return true;
      }
      // Handle wildcard patterns like "bash:*"
      if (pattern.endsWith(":*")) {
        const prefix = pattern.slice(0, -2);
        if (toolName.startsWith(prefix)) {
          return true;
        }
      }
    }
    return false;
  }

  private extractOutput(messages: { role: string; content?: string }[]): string {
    // Get the last assistant message as output
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === "assistant" && msg.content) {
        return msg.content;
      }
    }
    return "";
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create an agent manager.
 *
 * @example
 * ```typescript
 * const manager = createAgentManager({
 *   llm: myLLMAdapter,
 *   registry: toolRegistry,
 * });
 *
 * // Spawn a specialized agent
 * const result = await manager.spawn({
 *   type: "explore",
 *   task: "Find all React components in src/",
 * });
 *
 * // Spawn multiple agents in parallel
 * const results = await manager.spawnParallel([
 *   { type: "explore", task: "Find API routes" },
 *   { type: "research", task: "Research React 19 features" },
 * ]);
 * ```
 */
export function createAgentManager(
  config: AgentManagerConfig,
  telemetry?: TelemetryContext
): AgentManager {
  return new AgentManager(config, telemetry);
}
