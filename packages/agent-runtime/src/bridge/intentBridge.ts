/**
 * Intent Bridge
 *
 * Bridges EditIntent from @reader/core to agent-runtime orchestrator.
 * Enables intent tracking for agent actions.
 */

import type { EditIntent, EditIntentCategory, IntentRegistry } from "@ku0/core";
import { createEditIntent, createIntentRegistry } from "@ku0/core";
import type { AgentType } from "../agents/types";
import { mapRuntimeAgentToCore } from "./agentMapping";

// ============================================================================
// Intent Bridge
// ============================================================================

/**
 * Configuration for intent bridge.
 */
export interface IntentBridgeConfig {
  /** Optional shared intent registry */
  registry?: IntentRegistry;

  /** Default locale for intent descriptions */
  defaultLocale?: string;
}

/**
 * Maps orchestrator actions to intent categories.
 */
const ACTION_CATEGORY_MAP: Record<string, EditIntentCategory> = {
  // Content generation
  generate: "content_creation",
  create: "content_creation",
  write: "content_creation",
  draft: "content_creation",

  // Content modification
  edit: "content_modification",
  modify: "content_modification",
  update: "content_modification",
  fix: "content_modification",
  refactor: "content_modification",

  // Structure changes
  restructure: "structure_change",
  reorganize: "structure_change",
  move: "structure_change",
  split: "structure_change",
  merge: "structure_change",

  // Quality improvement
  improve: "quality_improvement",
  optimize: "quality_improvement",
  polish: "quality_improvement",
  format: "quality_improvement",

  // Review
  review: "review_feedback",
  comment: "review_feedback",
  suggest: "review_feedback",
  validate: "review_feedback",

  // Collaboration
  delegate: "collaboration",
  handoff: "collaboration",
  coordinate: "collaboration",
};

/**
 * Bridge for creating and tracking EditIntents from agent actions.
 */
export class IntentBridge {
  private readonly registry: IntentRegistry;
  private readonly defaultLocale: string;

  constructor(config: IntentBridgeConfig = {}) {
    this.registry = config.registry ?? createIntentRegistry();
    this.defaultLocale = config.defaultLocale ?? "en-US";
  }

  /**
   * Create an EditIntent for an agent action.
   */
  createIntentForAction(
    agentType: AgentType,
    action: string,
    description: string,
    options?: {
      detailed?: string;
      constraints?: Record<string, unknown>;
      userRequest?: string;
      sessionId?: string;
    }
  ): EditIntent {
    const category = this.mapActionToCategory(action);
    const coreAgentType = mapRuntimeAgentToCore(agentType);

    const intent = createEditIntent(category, description, action, {
      detailed: options?.detailed,
      locale: this.defaultLocale,
      constraints: options?.constraints,
      user_context: options?.userRequest
        ? {
            original_request: options.userRequest,
            session_id: options.sessionId,
          }
        : undefined,
      agent_id: `runtime:${agentType}:${coreAgentType}`,
    });

    // Register the intent
    this.registry.registerIntent(intent);

    return intent;
  }

  /**
   * Create a chained intent for multi-step operations.
   */
  createChainedIntent(
    parentIntent: EditIntent,
    _agentType: AgentType,
    action: string,
    description: string,
    stepIndex: number,
    totalSteps: number
  ): EditIntent {
    const category = this.mapActionToCategory(action);

    const intent = createEditIntent(category, description, action, {
      locale: this.defaultLocale,
      agent_id: parentIntent.agent_id,
      chain: {
        parent_intent_id: parentIntent.id,
        step_index: stepIndex,
        total_steps: totalSteps,
      },
    });

    this.registry.registerIntent(intent);

    return intent;
  }

  /**
   * Get the intent registry.
   */
  getRegistry(): IntentRegistry {
    return this.registry;
  }

  /**
   * Map an action verb to an intent category.
   */
  private mapActionToCategory(action: string): EditIntentCategory {
    const normalizedAction = action.toLowerCase().trim();

    // Direct match
    if (normalizedAction in ACTION_CATEGORY_MAP) {
      return ACTION_CATEGORY_MAP[normalizedAction];
    }

    // Prefix match
    for (const [key, category] of Object.entries(ACTION_CATEGORY_MAP)) {
      if (normalizedAction.startsWith(key)) {
        return category;
      }
    }

    // Default to content modification
    return "content_modification";
  }
}

/**
 * Create an intent bridge.
 */
export function createIntentBridge(config?: IntentBridgeConfig): IntentBridge {
  return new IntentBridge(config);
}
