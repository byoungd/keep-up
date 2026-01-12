/**
 * LFCC v0.9.1 — Agent Coordination Protocol
 *
 * Protocol for multi-agent collaboration, including block claims,
 * dependencies, and handoffs.
 *
 * @see docs/specs/proposals/LFCC_v0.9.1_AI_Native_Enhancement.md §3.4
 */

import type { AgentIdentity } from "./agentIdentity";
import type { EditIntent } from "./intent";

// ============================================================================
// Agent Session
// ============================================================================

/**
 * Agent session status.
 */
export type SessionStatus = "active" | "idle" | "busy" | "disconnected";

/**
 * Active agent session.
 */
export interface AgentSession {
  /** Agent identity */
  identity: AgentIdentity;

  /** Session status */
  status: SessionStatus;

  /** Blocks currently claimed by this agent */
  claimed_blocks: string[];

  /** When session started */
  started_at: number;

  /** Last activity timestamp */
  last_activity: number;
}

// ============================================================================
// Block Claims
// ============================================================================

/**
 * Result of attempting to claim blocks.
 */
export interface ClaimResult {
  /** Blocks successfully claimed */
  granted: string[];

  /** Blocks that could not be claimed */
  denied: Array<{
    blockId: string;
    reason: string;
    holder?: string;
  }>;
}

// ============================================================================
// Task Dependencies
// ============================================================================

/**
 * Dependency type between tasks.
 */
export type DependencyType =
  | "sequential" // Must complete in order
  | "barrier" // All must complete before proceeding
  | "soft"; // Preferred but not required

/**
 * Task dependency declaration.
 */
export interface TaskDependency {
  /** Unique dependency identifier */
  dependency_id: string;

  /** Type of dependency */
  type: DependencyType;

  /** What this depends on (agent IDs or task IDs) */
  depends_on: string[];

  /** Timeout for waiting (optional) */
  timeout_ms?: number;
}

/**
 * Result of waiting for a dependency.
 */
export interface DependencyResult {
  /** Whether dependency was satisfied */
  satisfied: boolean;

  /** If not satisfied, the reason */
  reason?: string;

  /** Completed dependencies */
  completed: string[];

  /** Pending dependencies */
  pending: string[];
}

// ============================================================================
// Handoff
// ============================================================================

/**
 * Context for agent handoff.
 */
export interface HandoffContext {
  /** The intent being handed off */
  intent: EditIntent;

  /** Summary of completed work */
  completed_work: string;

  /** Pending tasks to complete */
  pending_tasks: string[];

  /** Additional context data */
  context_data?: Record<string, unknown>;
}

// ============================================================================
// Conflict Check
// ============================================================================

/**
 * Conflict check result.
 */
export interface ConflictCheck {
  /** Whether there are conflicts */
  has_conflicts: boolean;

  /** Conflict details */
  conflicts: Array<{
    block_id: string;
    conflict_type: string;
    other_agent?: string;
    description: string;
  }>;
}

// ============================================================================
// Coordination Protocol Interface
// ============================================================================

/**
 * Agent Coordination Protocol.
 *
 * @requirement AGENT-002: Block editing rights MUST be acquired via claimBlocks
 * @requirement AGENT-003: Agent handoffs MUST use handoff with complete context
 */
export interface AgentCoordinationProtocol {
  /**
   * Register an agent for a session
   */
  registerAgent(identity: AgentIdentity): Promise<AgentSession>;

  /**
   * Deregister an agent
   */
  deregisterAgent(agentId: string): Promise<void>;

  /**
   * Claim blocks for editing
   */
  claimBlocks(agentId: string, blockIds: string[]): Promise<ClaimResult>;

  /**
   * Release claimed blocks
   */
  releaseBlocks(agentId: string, blockIds: string[]): Promise<void>;

  /**
   * Declare a task dependency
   */
  declareDependency(agentId: string, dependency: TaskDependency): Promise<void>;

  /**
   * Wait for a dependency to be satisfied
   */
  waitForDependency(dependencyId: string): Promise<DependencyResult>;

  /**
   * Hand off work to another agent
   */
  handoff(fromAgentId: string, toAgentId: string, context: HandoffContext): Promise<void>;

  /**
   * Check for conflicts before applying operations
   */
  checkConflicts(agentId: string, blockIds: string[]): ConflictCheck;

  /**
   * Get all active sessions
   */
  getActiveSessions(): AgentSession[];

  /**
   * Get session for a specific agent
   */
  getSession(agentId: string): AgentSession | undefined;
}

// ============================================================================
// In-Memory Implementation
// ============================================================================

/**
 * In-memory AgentCoordinationProtocol implementation.
 */
export class InMemoryAgentCoordinator implements AgentCoordinationProtocol {
  private sessions = new Map<string, AgentSession>();
  private blockClaims = new Map<string, string>(); // blockId -> agentId
  private dependencies = new Map<string, TaskDependency>();
  private completedDependencies = new Set<string>();
  private handoffListeners = new Map<string, (context: HandoffContext) => void>();

  async registerAgent(identity: AgentIdentity): Promise<AgentSession> {
    const session: AgentSession = {
      identity,
      status: "active",
      claimed_blocks: [],
      started_at: Date.now(),
      last_activity: Date.now(),
    };
    this.sessions.set(identity.agent_id, session);
    return session;
  }

  async deregisterAgent(agentId: string): Promise<void> {
    const session = this.sessions.get(agentId);
    if (session) {
      // Release all claimed blocks
      for (const blockId of session.claimed_blocks) {
        this.blockClaims.delete(blockId);
      }
      this.sessions.delete(agentId);
    }
  }

  async claimBlocks(agentId: string, blockIds: string[]): Promise<ClaimResult> {
    const session = this.sessions.get(agentId);
    if (!session) {
      return {
        granted: [],
        denied: blockIds.map((blockId) => ({
          blockId,
          reason: "agent_not_registered",
        })),
      };
    }

    const granted: string[] = [];
    const denied: Array<{ blockId: string; reason: string; holder?: string }> = [];

    for (const blockId of blockIds) {
      const holder = this.blockClaims.get(blockId);

      if (!holder) {
        // Block is unclaimed, grant it
        this.blockClaims.set(blockId, agentId);
        session.claimed_blocks.push(blockId);
        granted.push(blockId);
      } else if (holder === agentId) {
        // Already owned by this agent
        granted.push(blockId);
      } else {
        // Claimed by another agent
        denied.push({
          blockId,
          reason: "already_claimed",
          holder,
        });
      }
    }

    session.last_activity = Date.now();
    return { granted, denied };
  }

  async releaseBlocks(agentId: string, blockIds: string[]): Promise<void> {
    const session = this.sessions.get(agentId);
    if (!session) {
      return;
    }

    for (const blockId of blockIds) {
      if (this.blockClaims.get(blockId) === agentId) {
        this.blockClaims.delete(blockId);
        session.claimed_blocks = session.claimed_blocks.filter((id) => id !== blockId);
      }
    }

    session.last_activity = Date.now();
  }

  async declareDependency(agentId: string, dependency: TaskDependency): Promise<void> {
    this.dependencies.set(dependency.dependency_id, dependency);
    this.updateSessionActivity(agentId);
  }

  async waitForDependency(dependencyId: string): Promise<DependencyResult> {
    const dependency = this.dependencies.get(dependencyId);
    if (!dependency) {
      return {
        satisfied: false,
        reason: "dependency_not_found",
        completed: [],
        pending: [],
      };
    }

    const completed = dependency.depends_on.filter((id) => this.completedDependencies.has(id));
    const pending = dependency.depends_on.filter((id) => !this.completedDependencies.has(id));

    return {
      satisfied: pending.length === 0,
      completed,
      pending,
    };
  }

  async handoff(fromAgentId: string, toAgentId: string, context: HandoffContext): Promise<void> {
    const fromSession = this.sessions.get(fromAgentId);
    const toSession = this.sessions.get(toAgentId);

    if (!fromSession || !toSession) {
      throw new Error("Both agents must be registered for handoff");
    }

    // Transfer block claims
    for (const blockId of [...fromSession.claimed_blocks]) {
      this.blockClaims.set(blockId, toAgentId);
      toSession.claimed_blocks.push(blockId);
    }
    fromSession.claimed_blocks = [];

    // Notify receiving agent
    const listener = this.handoffListeners.get(toAgentId);
    if (listener) {
      listener(context);
    }

    fromSession.last_activity = Date.now();
    toSession.last_activity = Date.now();
  }

  checkConflicts(agentId: string, blockIds: string[]): ConflictCheck {
    const conflicts: Array<{
      block_id: string;
      conflict_type: string;
      other_agent?: string;
      description: string;
    }> = [];

    for (const blockId of blockIds) {
      const holder = this.blockClaims.get(blockId);
      if (holder && holder !== agentId) {
        conflicts.push({
          block_id: blockId,
          conflict_type: "block_claimed",
          other_agent: holder,
          description: `Block ${blockId} is claimed by agent ${holder}`,
        });
      }
    }

    return {
      has_conflicts: conflicts.length > 0,
      conflicts,
    };
  }

  getActiveSessions(): AgentSession[] {
    return Array.from(this.sessions.values()).filter((s) => s.status === "active");
  }

  getSession(agentId: string): AgentSession | undefined {
    return this.sessions.get(agentId);
  }

  // ============================================================================
  // Internal helpers
  // ============================================================================

  private updateSessionActivity(agentId: string): void {
    const session = this.sessions.get(agentId);
    if (session) {
      session.last_activity = Date.now();
    }
  }

  /**
   * Mark a dependency as completed
   */
  markDependencyComplete(dependencyId: string): void {
    this.completedDependencies.add(dependencyId);
  }

  /**
   * Register a handoff listener for an agent
   */
  onHandoff(agentId: string, listener: (context: HandoffContext) => void): void {
    this.handoffListeners.set(agentId, listener);
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create an in-memory agent coordinator
 */
export function createAgentCoordinator(): AgentCoordinationProtocol {
  return new InMemoryAgentCoordinator();
}
