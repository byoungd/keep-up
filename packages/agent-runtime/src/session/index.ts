/**
 * Session State
 *
 * Consolidates agent state, context, and memory for a single session.
 * Includes planning, error recovery, and discovery integration for persistence.
 */

import {
  createMemoryManager,
  type IMemoryManager,
  type MemoryCacheConfig,
} from "@ku0/agent-runtime-memory";
import { type ContextManager, createContextManager } from "../context";
import type { AgentMessage, AgentState } from "../types";
import type { ToolResultCache } from "../utils/cache";

// ============================================================================
// Planning State Types
// ============================================================================

/**
 * Serializable planning state for session persistence.
 */
export interface PlanningSnapshot {
  /** Active plan ID (if any) */
  activePlanId?: string;
  /** Completed plan IDs */
  completedPlanIds: string[];
  /** Plan history count */
  planCount: number;
}

// ============================================================================
// Error Recovery State Types
// ============================================================================

/**
 * Serializable error recovery state for session persistence.
 */
export interface ErrorRecoverySnapshot {
  /** Recent error patterns */
  recentErrors: Array<{
    toolName: string;
    category: string;
    recovered: boolean;
    timestamp: number;
  }>;
  /** Error stats by tool */
  errorStats: Record<string, { count: number; recovered: number }>;
}

// ============================================================================
// Tool Discovery State Types
// ============================================================================

/**
 * Serializable tool discovery state for session persistence.
 */
export interface ToolDiscoverySnapshot {
  /** Tools that have been loaded this session */
  loadedTools: string[];
  /** Tool usage counts for prioritization */
  toolUsageCounts: Record<string, number>;
  /** Recommended tools based on task context */
  recommendations: string[];
}

// ============================================================================
// Consolidated Session State
// ============================================================================

export interface SessionState {
  readonly id: string;
  readonly context?: ContextManager;
  readonly memory?: IMemoryManager;
  readonly toolCache?: ToolResultCache;
  getState(): AgentState;
  setState(state: AgentState): void;
  recordMessage(message: AgentMessage): void;
  getSummary(): string;
  getContextId(): string;

  // Planning integration
  getPlanningSnapshot(): PlanningSnapshot;
  setPlanningSnapshot(snapshot: PlanningSnapshot): void;

  // Error recovery integration
  getErrorRecoverySnapshot(): ErrorRecoverySnapshot;
  setErrorRecoverySnapshot(snapshot: ErrorRecoverySnapshot): void;

  // Tool discovery integration
  getToolDiscoverySnapshot(): ToolDiscoverySnapshot;
  setToolDiscoverySnapshot(snapshot: ToolDiscoverySnapshot): void;

  // Full session snapshot for persistence
  getFullSnapshot(): SessionSnapshot;
  restoreFromSnapshot(snapshot: SessionSnapshot): void;
}

/**
 * Complete session snapshot for persistence/restoration.
 */
export interface SessionSnapshot {
  id: string;
  state: AgentState;
  planning: PlanningSnapshot;
  errorRecovery: ErrorRecoverySnapshot;
  toolDiscovery: ToolDiscoverySnapshot;
  createdAt: number;
  updatedAt: number;
}

export interface SessionStateConfig {
  id?: string;
  contextId?: string;
  contextManager?: ContextManager;
  memoryManager?: IMemoryManager;
  memoryCache?: MemoryCacheConfig;
  toolCache?: ToolResultCache;
  initialState?: AgentState;
  initialSnapshot?: SessionSnapshot;
}

const DEFAULT_SESSION_MEMORY_CACHE: MemoryCacheConfig = {
  enableQueryCache: true,
  enableEmbeddingCache: true,
};

// ============================================================================
// Default Snapshots
// ============================================================================

function createDefaultPlanningSnapshot(): PlanningSnapshot {
  return {
    activePlanId: undefined,
    completedPlanIds: [],
    planCount: 0,
  };
}

function createDefaultErrorRecoverySnapshot(): ErrorRecoverySnapshot {
  return {
    recentErrors: [],
    errorStats: {},
  };
}

function createDefaultToolDiscoverySnapshot(): ToolDiscoverySnapshot {
  return {
    loadedTools: [],
    toolUsageCounts: {},
    recommendations: [],
  };
}

// ============================================================================
// Implementation
// ============================================================================

export class InMemorySessionState implements SessionState {
  readonly id: string;
  readonly context: ContextManager;
  readonly memory: IMemoryManager;
  readonly toolCache?: ToolResultCache;
  private readonly contextId: string;
  private state: AgentState;
  private readonly createdAt: number;

  // Consolidated state snapshots
  private planningSnapshot: PlanningSnapshot;
  private errorRecoverySnapshot: ErrorRecoverySnapshot;
  private toolDiscoverySnapshot: ToolDiscoverySnapshot;

  constructor(config: SessionStateConfig = {}) {
    this.createdAt = Date.now();
    this.id = config.id ?? this.generateSessionId();
    this.context = config.contextManager ?? createContextManager();
    this.memory =
      config.memoryManager ??
      createMemoryManager(undefined, undefined, config.memoryCache ?? DEFAULT_SESSION_MEMORY_CACHE);
    this.toolCache = config.toolCache;

    if (config.contextId) {
      if (!this.context.has(config.contextId)) {
        throw new Error(`Unknown context ID: ${config.contextId}`);
      }
      this.contextId = config.contextId;
    } else {
      const context = this.context.create({ parentId: undefined });
      this.contextId = context.id;
    }

    // Initialize from snapshot if provided
    if (config.initialSnapshot) {
      this.state = config.initialSnapshot.state;
      this.planningSnapshot = config.initialSnapshot.planning;
      this.errorRecoverySnapshot = config.initialSnapshot.errorRecovery;
      this.toolDiscoverySnapshot = config.initialSnapshot.toolDiscovery;
    } else {
      this.state = config.initialState ?? {
        turn: 0,
        messages: [],
        pendingToolCalls: [],
        status: "idle",
      };
      this.planningSnapshot = createDefaultPlanningSnapshot();
      this.errorRecoverySnapshot = createDefaultErrorRecoverySnapshot();
      this.toolDiscoverySnapshot = createDefaultToolDiscoverySnapshot();
    }
  }

  // ============================================================================
  // Core State Methods
  // ============================================================================

  getState(): AgentState {
    return this.state;
  }

  setState(state: AgentState): void {
    this.state = state;
  }

  recordMessage(message: AgentMessage): void {
    if (message.role === "tool") {
      return;
    }
    if ("content" in message && message.content) {
      void this.memory.addToContext(message.content, message.role);
    }
  }

  getSummary(): string {
    return this.context.getSummary(this.contextId);
  }

  getContextId(): string {
    return this.contextId;
  }

  // ============================================================================
  // Planning Integration
  // ============================================================================

  getPlanningSnapshot(): PlanningSnapshot {
    return { ...this.planningSnapshot };
  }

  setPlanningSnapshot(snapshot: PlanningSnapshot): void {
    this.planningSnapshot = { ...snapshot };
  }

  // ============================================================================
  // Error Recovery Integration
  // ============================================================================

  getErrorRecoverySnapshot(): ErrorRecoverySnapshot {
    return {
      recentErrors: [...this.errorRecoverySnapshot.recentErrors],
      errorStats: { ...this.errorRecoverySnapshot.errorStats },
    };
  }

  setErrorRecoverySnapshot(snapshot: ErrorRecoverySnapshot): void {
    this.errorRecoverySnapshot = {
      recentErrors: [...snapshot.recentErrors],
      errorStats: { ...snapshot.errorStats },
    };
  }

  // ============================================================================
  // Tool Discovery Integration
  // ============================================================================

  getToolDiscoverySnapshot(): ToolDiscoverySnapshot {
    return {
      loadedTools: [...this.toolDiscoverySnapshot.loadedTools],
      toolUsageCounts: { ...this.toolDiscoverySnapshot.toolUsageCounts },
      recommendations: [...this.toolDiscoverySnapshot.recommendations],
    };
  }

  setToolDiscoverySnapshot(snapshot: ToolDiscoverySnapshot): void {
    this.toolDiscoverySnapshot = {
      loadedTools: [...snapshot.loadedTools],
      toolUsageCounts: { ...snapshot.toolUsageCounts },
      recommendations: [...snapshot.recommendations],
    };
  }

  // ============================================================================
  // Full Session Snapshot
  // ============================================================================

  getFullSnapshot(): SessionSnapshot {
    return {
      id: this.id,
      state: this.state,
      planning: this.getPlanningSnapshot(),
      errorRecovery: this.getErrorRecoverySnapshot(),
      toolDiscovery: this.getToolDiscoverySnapshot(),
      createdAt: this.createdAt,
      updatedAt: Date.now(),
    };
  }

  restoreFromSnapshot(snapshot: SessionSnapshot): void {
    this.state = snapshot.state;
    this.planningSnapshot = snapshot.planning;
    this.errorRecoverySnapshot = snapshot.errorRecovery;
    this.toolDiscoverySnapshot = snapshot.toolDiscovery;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private generateSessionId(): string {
    return `session_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

export function createSessionState(config?: SessionStateConfig): InMemorySessionState {
  return new InMemorySessionState(config);
}
