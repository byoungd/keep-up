/**
 * Orchestrator Hooks
 *
 * Lifecycle hooks for extending orchestrator behavior.
 * Enables middleware-style interception of key orchestration events.
 */

import type { MCPToolCall, MCPToolResult } from "../types";
import type { AgentMessage } from "../types";

// ============================================================================
// Types
// ============================================================================

/**
 * Hook context containing shared state.
 */
export interface HookContext {
  /** Current run ID */
  runId: string;
  /** Current turn number */
  turn: number;
  /** Accumulated messages */
  messages: AgentMessage[];
  /** Custom metadata storage */
  metadata: Map<string, unknown>;
}

/**
 * Before turn hook - called before each LLM turn.
 */
export type BeforeTurnHook = (
  context: HookContext
) => void | Promise<void> | { skip?: boolean; inject?: AgentMessage[] };

/**
 * After turn hook - called after LLM response.
 */
export type AfterTurnHook = (
  context: HookContext,
  response: { content?: string; toolCalls?: MCPToolCall[] }
) => void | Promise<void>;

/**
 * Before tool execution hook.
 */
export type BeforeToolHook = (
  context: HookContext,
  call: MCPToolCall
) => void | Promise<void> | { skip?: boolean; override?: MCPToolResult };

/**
 * After tool execution hook.
 */
export type AfterToolHook = (
  context: HookContext,
  call: MCPToolCall,
  result: MCPToolResult
) => void | Promise<void> | { override?: MCPToolResult };

/**
 * Error hook - called when an error occurs.
 */
export type ErrorHook = (
  context: HookContext,
  error: Error,
  phase: "turn" | "tool" | "planning"
) => void | Promise<void> | { recover?: boolean; replacement?: unknown };

/**
 * Complete hook - called when orchestration completes.
 */
export type CompleteHook = (
  context: HookContext,
  result: { success: boolean; totalTurns: number; durationMs: number }
) => void | Promise<void>;

/**
 * All orchestrator hooks.
 */
export interface OrchestratorHooks {
  /** Called before each turn */
  beforeTurn?: BeforeTurnHook[];
  /** Called after each turn */
  afterTurn?: AfterTurnHook[];
  /** Called before tool execution */
  beforeTool?: BeforeToolHook[];
  /** Called after tool execution */
  afterTool?: AfterToolHook[];
  /** Called on errors */
  onError?: ErrorHook[];
  /** Called on completion */
  onComplete?: CompleteHook[];
}

// ============================================================================
// Hook Registry
// ============================================================================

/**
 * Registry for managing orchestrator hooks.
 */
export class HookRegistry {
  private hooks: OrchestratorHooks = {};

  /**
   * Register a before-turn hook.
   */
  beforeTurn(hook: BeforeTurnHook): this {
    this.hooks.beforeTurn = this.hooks.beforeTurn ?? [];
    this.hooks.beforeTurn.push(hook);
    return this;
  }

  /**
   * Register an after-turn hook.
   */
  afterTurn(hook: AfterTurnHook): this {
    this.hooks.afterTurn = this.hooks.afterTurn ?? [];
    this.hooks.afterTurn.push(hook);
    return this;
  }

  /**
   * Register a before-tool hook.
   */
  beforeTool(hook: BeforeToolHook): this {
    this.hooks.beforeTool = this.hooks.beforeTool ?? [];
    this.hooks.beforeTool.push(hook);
    return this;
  }

  /**
   * Register an after-tool hook.
   */
  afterTool(hook: AfterToolHook): this {
    this.hooks.afterTool = this.hooks.afterTool ?? [];
    this.hooks.afterTool.push(hook);
    return this;
  }

  /**
   * Register an error hook.
   */
  onError(hook: ErrorHook): this {
    this.hooks.onError = this.hooks.onError ?? [];
    this.hooks.onError.push(hook);
    return this;
  }

  /**
   * Register a completion hook.
   */
  onComplete(hook: CompleteHook): this {
    this.hooks.onComplete = this.hooks.onComplete ?? [];
    this.hooks.onComplete.push(hook);
    return this;
  }

  /**
   * Get all registered hooks.
   */
  getHooks(): OrchestratorHooks {
    return { ...this.hooks };
  }

  /**
   * Clear all hooks.
   */
  clear(): void {
    this.hooks = {};
  }
}

// ============================================================================
// Hook Executor
// ============================================================================

/**
 * Execute before-turn hooks in sequence.
 */
export async function executeBeforeTurnHooks(
  hooks: BeforeTurnHook[] | undefined,
  context: HookContext
): Promise<{ skip: boolean; inject: AgentMessage[] }> {
  const inject: AgentMessage[] = [];

  if (!hooks) {
    return { skip: false, inject };
  }

  for (const hook of hooks) {
    const result = await hook(context);
    if (result && typeof result === "object") {
      if (result.skip) {
        return { skip: true, inject };
      }
      if (result.inject) {
        inject.push(...result.inject);
      }
    }
  }

  return { skip: false, inject };
}

/**
 * Execute after-turn hooks in sequence.
 */
export async function executeAfterTurnHooks(
  hooks: AfterTurnHook[] | undefined,
  context: HookContext,
  response: { content?: string; toolCalls?: MCPToolCall[] }
): Promise<void> {
  if (!hooks) {
    return;
  }

  for (const hook of hooks) {
    await hook(context, response);
  }
}

/**
 * Execute before-tool hooks in sequence.
 */
export async function executeBeforeToolHooks(
  hooks: BeforeToolHook[] | undefined,
  context: HookContext,
  call: MCPToolCall
): Promise<{ skip: boolean; override?: MCPToolResult }> {
  if (!hooks) {
    return { skip: false };
  }

  for (const hook of hooks) {
    const result = await hook(context, call);
    if (result && typeof result === "object") {
      if (result.skip || result.override) {
        return { skip: true, override: result.override };
      }
    }
  }

  return { skip: false };
}

/**
 * Execute after-tool hooks in sequence.
 */
export async function executeAfterToolHooks(
  hooks: AfterToolHook[] | undefined,
  context: HookContext,
  call: MCPToolCall,
  result: MCPToolResult
): Promise<MCPToolResult> {
  if (!hooks) {
    return result;
  }

  let currentResult = result;
  for (const hook of hooks) {
    const hookResult = await hook(context, call, currentResult);
    if (hookResult && typeof hookResult === "object" && hookResult.override) {
      currentResult = hookResult.override;
    }
  }

  return currentResult;
}

/**
 * Execute error hooks and check for recovery.
 */
export async function executeErrorHooks(
  hooks: ErrorHook[] | undefined,
  context: HookContext,
  error: Error,
  phase: "turn" | "tool" | "planning"
): Promise<{ recover: boolean; replacement?: unknown }> {
  if (!hooks) {
    return { recover: false };
  }

  for (const hook of hooks) {
    const result = await hook(context, error, phase);
    if (result && typeof result === "object" && result.recover) {
      return { recover: true, replacement: result.replacement };
    }
  }

  return { recover: false };
}

/**
 * Execute completion hooks.
 */
export async function executeCompleteHooks(
  hooks: CompleteHook[] | undefined,
  context: HookContext,
  result: { success: boolean; totalTurns: number; durationMs: number }
): Promise<void> {
  if (!hooks) {
    return;
  }

  for (const hook of hooks) {
    await hook(context, result);
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a hook registry.
 */
export function createHookRegistry(): HookRegistry {
  return new HookRegistry();
}

/**
 * Create a hook context.
 */
export function createHookContext(runId: string): HookContext {
  return {
    runId,
    turn: 0,
    messages: [],
    metadata: new Map(),
  };
}
