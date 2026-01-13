/**
 * LFCC v0.9.1 — Intent Registry
 *
 * In-memory registry for tracking EditIntents across a document session.
 * Can be backed by Redis or persistent storage in production.
 *
 * @see docs/specs/proposals/LFCC_v0.9.1_AI_Native_Enhancement.md §3.2
 */

import type { EditIntent } from "./intent.js";

// ============================================================================
// Intent Registry Interface
// ============================================================================

/**
 * Registry for managing EditIntents.
 */
export interface IntentRegistry {
  /**
   * Register a new intent
   * @returns The intent ID
   */
  registerIntent(intent: EditIntent): string;

  /**
   * Get an intent by ID
   */
  getIntent(id: string): EditIntent | undefined;

  /**
   * Get the full chain of intents starting from a given intent
   * (walks up through parent_intent_id)
   */
  getIntentChain(intentId: string): EditIntent[];

  /**
   * Get all intents created by a specific agent
   */
  getIntentsByAgent(agentId: string): EditIntent[];

  /**
   * Get intents within a time range
   */
  getIntentsInRange(startMs: number, endMs: number): EditIntent[];

  /**
   * Get all intents (for debugging/export)
   */
  getAllIntents(): EditIntent[];

  /**
   * Clear all intents
   */
  clear(): void;

  /**
   * Get registry statistics
   */
  getStats(): IntentRegistryStats;
}

/**
 * Registry statistics
 */
export interface IntentRegistryStats {
  /** Total number of intents */
  total: number;

  /** Breakdown by category */
  byCategory: Record<string, number>;

  /** Breakdown by agent */
  byAgent: Record<string, number>;

  /** Number of intent chains */
  chainCount: number;
}

// ============================================================================
// In-Memory Implementation
// ============================================================================

/**
 * In-memory IntentRegistry implementation.
 * Suitable for single-session use. For production, consider Redis-backed storage.
 */
export class InMemoryIntentRegistry implements IntentRegistry {
  private intents = new Map<string, EditIntent>();
  private agentIndex = new Map<string, Set<string>>();
  private childIndex = new Map<string, Set<string>>();

  registerIntent(intent: EditIntent): string {
    const id = intent.id;

    // Store intent
    this.intents.set(id, { ...intent });

    // Index by agent
    if (intent.agent_id) {
      let agentIntents = this.agentIndex.get(intent.agent_id);
      if (!agentIntents) {
        agentIntents = new Set();
        this.agentIndex.set(intent.agent_id, agentIntents);
      }
      agentIntents.add(id);
    }

    // Index by parent (for chain queries)
    if (intent.chain?.parent_intent_id) {
      let children = this.childIndex.get(intent.chain.parent_intent_id);
      if (!children) {
        children = new Set();
        this.childIndex.set(intent.chain.parent_intent_id, children);
      }
      children.add(id);
    }

    return id;
  }

  getIntent(id: string): EditIntent | undefined {
    const intent = this.intents.get(id);
    return intent ? { ...intent } : undefined;
  }

  getIntentChain(intentId: string): EditIntent[] {
    const result: EditIntent[] = [];
    let current = this.intents.get(intentId);

    // Walk up the chain
    while (current) {
      result.unshift({ ...current });
      current = current.chain?.parent_intent_id
        ? this.intents.get(current.chain.parent_intent_id)
        : undefined;
    }

    return result;
  }

  getIntentsByAgent(agentId: string): EditIntent[] {
    const intentIds = this.agentIndex.get(agentId);
    if (!intentIds) {
      return [];
    }

    return Array.from(intentIds)
      .map((id) => this.intents.get(id))
      .filter((intent): intent is EditIntent => intent !== undefined)
      .map((intent) => ({ ...intent }));
  }

  getIntentsInRange(startMs: number, endMs: number): EditIntent[] {
    return Array.from(this.intents.values())
      .filter((intent) => {
        const createdAt = intent.created_at ?? 0;
        return createdAt >= startMs && createdAt <= endMs;
      })
      .map((intent) => ({ ...intent }));
  }

  getAllIntents(): EditIntent[] {
    return Array.from(this.intents.values()).map((intent) => ({ ...intent }));
  }

  clear(): void {
    this.intents.clear();
    this.agentIndex.clear();
    this.childIndex.clear();
  }

  getStats(): IntentRegistryStats {
    const byCategory: Record<string, number> = {};
    const byAgent: Record<string, number> = {};
    let chainCount = 0;

    for (const intent of this.intents.values()) {
      // Count by category
      byCategory[intent.category] = (byCategory[intent.category] ?? 0) + 1;

      // Count by agent
      if (intent.agent_id) {
        byAgent[intent.agent_id] = (byAgent[intent.agent_id] ?? 0) + 1;
      }

      // Count root intents (chains)
      if (!intent.chain?.parent_intent_id) {
        chainCount++;
      }
    }

    return {
      total: this.intents.size,
      byCategory,
      byAgent,
      chainCount,
    };
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create an in-memory intent registry
 */
export function createIntentRegistry(): IntentRegistry {
  return new InMemoryIntentRegistry();
}
