/**
 * Agent Types
 *
 * Defines the interface and types for specialized agents.
 * Inspired by Claude Code's agent architecture.
 */

import type { ContextManager } from "../context";
import type { RuntimeEventBus } from "../events/eventBus";
import type { IAgentLLM } from "../orchestrator/orchestrator";
import type { IToolRegistry } from "../tools/mcp/registry";
import type { SecurityPolicy } from "../types";

// ============================================================================
// Agent Type Definitions
// ============================================================================

/**
 * Available agent types.
 * Each type has specialized tools and behaviors.
 */
export type AgentType =
  | "general" // General-purpose agent with all tools
  | "bash" // Command execution specialist
  | "explore" // Codebase exploration and search
  | "plan" // Planning and architecture
  | "code" // Code generation and editing
  | "research" // Web research and information gathering
  | "test-writer" // Test writing specialist
  | "code-reviewer" // Code review specialist
  | "implementer" // Implementation specialist
  | "debugger" // Debugging specialist
  | "digest" // Digest generation with semantic clustering
  | "verifier"; // Claim verification with evidence extraction

/**
 * Agent profile containing configuration for a specific agent type.
 */
export interface AgentProfile {
  /** Agent type identifier */
  type: AgentType;

  /** Human-readable name */
  name: string;

  /** Description of agent capabilities */
  description: string;

  /** Tools this agent has access to */
  allowedTools: string[];

  /** System prompt for the agent */
  systemPrompt: string;

  /** Security preset to use */
  securityPreset: "safe" | "balanced" | "power" | "developer";

  /** Maximum turns before auto-stop */
  maxTurns: number;

  /** Whether confirmation is required for dangerous operations */
  requireConfirmation: boolean;

  /**
   * Edit restrictions for file operations.
   * Used to constrain agents like "plan" to only write to specific paths.
   * Pattern matching uses glob syntax.
   */
  editRestrictions?: EditRestrictions;
}

/**
 * Edit restrictions for constraining file write operations.
 * Inspired by OpenCode's plan agent pattern.
 */
export interface EditRestrictions {
  /**
   * Glob patterns for allowed write paths.
   * If specified, ONLY these paths can be written to.
   * Example: [".agent/plans/\*.md", ".agent/TODO.md"]
   */
  allow?: string[];

  /**
   * Glob patterns for denied write paths.
   * These paths are blocked even if they match allow patterns.
   * Example: ["\*\*\/\*.env", "\*\*\/secrets/\*\*"]
   */
  deny?: string[];
}

/**
 * Options for spawning a specialized agent.
 */
export interface SpawnAgentOptions {
  /** Agent type to spawn */
  type: AgentType;

  /**
   * Optional agent ID override (internal use).
   * @internal
   */
  agentId?: string;

  /** Task description for the agent */
  task: string;

  /** Override default max turns */
  maxTurns?: number;

  /** Run in background (non-blocking) */
  runInBackground?: boolean;

  /** Parent context for tracing */
  parentTraceId?: string;

  /** Explicit context ID for this agent */
  contextId?: string;

  /** Parent context ID for live context views */
  parentContextId?: string;

  /** Custom security policy override */
  security?: SecurityPolicy;

  /** Optional tool allowlist override for scoped execution */
  allowedTools?: string[];

  /**
   * Current recursion depth (internal use).
   * Automatically incremented when spawning child agents.
   * @internal
   */
  _depth?: number;

  /**
   * Abort signal for cancellation support.
   */
  signal?: AbortSignal;
}

/**
 * Result from a spawned agent.
 */
export interface AgentResult {
  /** Agent ID for reference */
  agentId: string;

  /** Agent type that was spawned */
  type: AgentType;

  /** Whether the agent completed successfully */
  success: boolean;

  /** Final output/response from the agent */
  output: string;

  /** Error message if failed */
  error?: string;

  /** Number of turns executed */
  turns: number;

  /** Execution time in milliseconds */
  durationMs: number;
}

/**
 * Interface for agent spawning and management.
 */
export interface IAgentManager {
  /** Spawn a specialized agent */
  spawn(options: SpawnAgentOptions): Promise<AgentResult>;

  /** Spawn multiple agents in parallel */
  spawnParallel(options: SpawnAgentOptions[]): Promise<AgentResult[]>;

  /** Get available agent types */
  getAvailableTypes(): AgentType[];

  /** Get profile for an agent type */
  getProfile(type: AgentType): AgentProfile;

  /** Stop a running agent by ID */
  stop(agentId: string): Promise<void>;

  /** Get status of a running agent */
  getStatus(agentId: string): AgentStatus | undefined;
}

export type AgentStatus = "idle" | "running" | "completed" | "failed" | "stopped";

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
