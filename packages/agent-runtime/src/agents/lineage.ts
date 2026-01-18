/**
 * Agent Lineage Tracker
 *
 * Tracks parent-child relationships between agents and aggregates
 * usage (tokens, cost) from children to parents.
 *
 * Reference: spec Section 5.4 Delegation Contract
 */

// ============================================================================
// Types
// ============================================================================

/** Agent status in lineage */
export type LineageAgentStatus = "active" | "completed" | "failed" | "recovering";

/** Role from delegation spec */
export type DelegationRole = "researcher" | "coder" | "reviewer" | "analyst";

/** Usage metrics for an agent */
export interface AgentUsage {
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

/** Lineage entry for a single agent */
export interface AgentLineageEntry {
  id: string;
  parentId: string | null;
  role: DelegationRole | string;
  status: LineageAgentStatus;
  depth: number;
  createdAt: number;
  completedAt?: number;
  /** Direct usage (not including children) */
  usage: AgentUsage;
  /** Aggregated usage (including all descendants) */
  aggregatedUsage: AgentUsage;
}

/** Lineage chain from root to agent */
export interface LineageChain {
  agent: AgentLineageEntry;
  ancestors: AgentLineageEntry[];
  descendants: AgentLineageEntry[];
}

// ============================================================================
// AgentLineageManager
// ============================================================================

/**
 * Manages parent-child relationships and usage rollup for agents.
 */
export class AgentLineageManager {
  private readonly entries = new Map<string, AgentLineageEntry>();

  /**
   * Track a new agent in the lineage.
   */
  track(
    agentId: string,
    parentId: string | null,
    role: DelegationRole | string,
    depth: number
  ): AgentLineageEntry {
    const entry: AgentLineageEntry = {
      id: agentId,
      parentId,
      role,
      status: "active",
      depth,
      createdAt: Date.now(),
      usage: { inputTokens: 0, outputTokens: 0, cost: 0 },
      aggregatedUsage: { inputTokens: 0, outputTokens: 0, cost: 0 },
    };

    this.entries.set(agentId, entry);
    return entry;
  }

  /**
   * Update status of an agent.
   */
  updateStatus(agentId: string, status: LineageAgentStatus): void {
    const entry = this.entries.get(agentId);
    if (entry) {
      entry.status = status;
      if (status === "completed" || status === "failed") {
        entry.completedAt = Date.now();
      }
    }
  }

  /**
   * Add usage to an agent's direct usage.
   */
  addUsage(agentId: string, usage: Partial<AgentUsage>): void {
    const entry = this.entries.get(agentId);
    if (!entry) {
      return;
    }

    if (usage.inputTokens !== undefined) {
      entry.usage.inputTokens += usage.inputTokens;
      entry.aggregatedUsage.inputTokens += usage.inputTokens;
    }
    if (usage.outputTokens !== undefined) {
      entry.usage.outputTokens += usage.outputTokens;
      entry.aggregatedUsage.outputTokens += usage.outputTokens;
    }
    if (usage.cost !== undefined) {
      entry.usage.cost += usage.cost;
      entry.aggregatedUsage.cost += usage.cost;
    }
  }

  /**
   * Roll up child's aggregated usage to parent.
   * Called when a child agent completes.
   */
  rollupToParent(agentId: string): void {
    const child = this.entries.get(agentId);
    if (!child || !child.parentId) {
      return;
    }

    const parent = this.entries.get(child.parentId);
    if (!parent) {
      return;
    }

    // Add child's aggregated usage to parent's aggregated usage
    parent.aggregatedUsage.inputTokens += child.aggregatedUsage.inputTokens;
    parent.aggregatedUsage.outputTokens += child.aggregatedUsage.outputTokens;
    parent.aggregatedUsage.cost += child.aggregatedUsage.cost;
  }

  /**
   * Get lineage entry for an agent.
   */
  get(agentId: string): AgentLineageEntry | undefined {
    return this.entries.get(agentId);
  }

  /**
   * Get full lineage chain for an agent (ancestors and descendants).
   */
  getLineage(agentId: string): LineageChain | null {
    const agent = this.entries.get(agentId);
    if (!agent) {
      return null;
    }

    const ancestors: AgentLineageEntry[] = [];
    const descendants: AgentLineageEntry[] = [];

    // Walk up to find ancestors
    let current = agent;
    while (current.parentId) {
      const parent = this.entries.get(current.parentId);
      if (!parent) {
        break;
      }
      ancestors.push(parent);
      current = parent;
    }

    // Walk down to find descendants (BFS)
    const queue: string[] = [agentId];
    while (queue.length > 0) {
      const currentId = queue.shift();
      if (!currentId) {
        continue;
      }
      for (const entry of this.entries.values()) {
        if (entry.parentId === currentId) {
          descendants.push(entry);
          queue.push(entry.id);
        }
      }
    }

    return { agent, ancestors: ancestors.reverse(), descendants };
  }

  /**
   * Get all children of an agent.
   */
  getChildren(agentId: string): AgentLineageEntry[] {
    const children: AgentLineageEntry[] = [];
    for (const entry of this.entries.values()) {
      if (entry.parentId === agentId) {
        children.push(entry);
      }
    }
    return children;
  }

  /**
   * Get root agent in lineage for a given agent.
   */
  getRoot(agentId: string): AgentLineageEntry | null {
    const entry = this.entries.get(agentId);
    if (!entry) {
      return null;
    }

    let current = entry;
    while (current.parentId) {
      const parent = this.entries.get(current.parentId);
      if (!parent) {
        break;
      }
      current = parent;
    }
    return current;
  }

  /**
   * Remove an agent from lineage tracking.
   */
  remove(agentId: string): boolean {
    return this.entries.delete(agentId);
  }

  /**
   * Clear all lineage data.
   */
  clear(): void {
    this.entries.clear();
  }

  /**
   * Get current stats.
   */
  getStats(): { total: number; active: number; completed: number; failed: number } {
    let active = 0;
    let completed = 0;
    let failed = 0;

    for (const entry of this.entries.values()) {
      switch (entry.status) {
        case "active":
        case "recovering":
          active++;
          break;
        case "completed":
          completed++;
          break;
        case "failed":
          failed++;
          break;
      }
    }

    return { total: this.entries.size, active, completed, failed };
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a new AgentLineageManager.
 */
export function createLineageManager(): AgentLineageManager {
  return new AgentLineageManager();
}
