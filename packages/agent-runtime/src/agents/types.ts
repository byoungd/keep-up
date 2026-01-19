/**
 * Agent Types
 *
 * Defines the interface and types for specialized agents.
 * Inspired by Claude Code's agent architecture.
 */

import type { RuntimeEventBus } from "@ku0/agent-runtime-control";
import type { AgentLifecycleStatus, SecurityPolicy } from "@ku0/agent-runtime-core";
import type { IToolRegistry } from "@ku0/agent-runtime-tools";
import type { ContextManager } from "../context";
import type { IAgentLLM } from "../orchestrator/orchestrator";

export type {
  AgentLifecycleStatus,
  AgentProfile,
  AgentResult,
  AgentType,
  EditRestrictions,
  IAgentManager,
  SpawnAgentOptions,
} from "@ku0/agent-runtime-core";

export type AgentStatus = AgentLifecycleStatus;

// ============================================================================
// Agent Manager Configuration
// ============================================================================

/**
 * Configuration for creating an agent manager.
 */
export interface AgentManagerConfig {
  /** LLM provider for agents */
  llm: IAgentLLM;

  /** Tool registry with all available tools */
  registry: IToolRegistry;

  /** Maximum concurrent agents */
  maxConcurrent?: number;

  /** Default security policy */
  defaultSecurity?: SecurityPolicy;

  /** Optional event bus for lifecycle events */
  eventBus?: RuntimeEventBus;

  /** Optional context manager for live context views */
  contextManager?: ContextManager;

  /**
   * Maximum recursion depth for nested agent spawning.
   * Prevents infinite recursion when agents spawn child agents.
   * @default 5
   */
  maxDepth?: number;

  /**
   * Maximum total agents that can be spawned in a session.
   * Prevents runaway agent creation.
   * @default 100
   */
  maxTotalAgents?: number;
}
