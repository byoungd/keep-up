/**
 * Planning System for Agent Orchestrator
 *
 * Implements plan-then-execute workflow pattern from Claude Code Agent best practices.
 * Agents create structured plans before execution, enabling review and refinement.
 */

import type { MCPToolCall } from "../types";

// ============================================================================
// Planning Types
// ============================================================================

/**
 * Execution plan created by agent before taking action.
 */
export interface ExecutionPlan {
  /** Plan identifier */
  id: string;
  /** High-level goal */
  goal: string;
  /** Ordered execution steps */
  steps: PlanStep[];
  /** Estimated duration in milliseconds */
  estimatedDuration: number;
  /** Risk assessment */
  riskAssessment: "low" | "medium" | "high";
  /** Tools required for execution */
  toolsNeeded: string[];
  /** Context/files needed */
  contextRequired: string[];
  /** Success criteria */
  successCriteria: string[];
  /** Created timestamp */
  createdAt: number;
  /** Status */
  status: "draft" | "approved" | "rejected" | "executed";
  /** Approval required */
  requiresApproval: boolean;
}

/**
 * Individual step in execution plan.
 */
export interface PlanStep {
  /** Step identifier */
  id: string;
  /** Step number in sequence */
  order: number;
  /** Human-readable description */
  description: string;
  /** Tools to be used */
  tools: string[];
  /** Expected outcome */
  expectedOutcome: string;
  /** Dependencies on other steps (by ID) */
  dependencies: string[];
  /** Estimated duration in ms */
  estimatedDuration?: number;
  /** Whether this step can run in parallel */
  parallelizable: boolean;
  /** Execution status */
  status?: "pending" | "executing" | "complete" | "failed" | "skipped";
  /** Actual tool calls made (populated during execution) */
  toolCalls?: MCPToolCall[];
}

/**
 * Plan refinement request.
 */
export interface PlanRefinement {
  planId: string;
  feedback: string;
  requestedChanges: string[];
  timestamp: number;
}

/**
 * Plan approval decision.
 */
export interface PlanApproval {
  planId: string;
  approved: boolean;
  feedback?: string;
  timestamp: number;
}

// ============================================================================
// Planning Configuration
// ============================================================================

export interface PlanningConfig {
  /** Enable planning phase */
  enabled: boolean;
  /** Require human approval before execution */
  requireApproval: boolean;
  /** Maximum planning iterations */
  maxRefinements: number;
  /** Timeout for plan creation (ms) */
  planningTimeoutMs: number;
  /** Automatically execute low-risk plans */
  autoExecuteLowRisk: boolean;
}

export const DEFAULT_PLANNING_CONFIG: PlanningConfig = {
  enabled: true,
  requireApproval: false,
  maxRefinements: 3,
  planningTimeoutMs: 30000,
  autoExecuteLowRisk: true,
};

// ============================================================================
// Planning Engine
// ============================================================================

/**
 * Handler for plan approval (human-in-the-loop).
 */
export type PlanApprovalHandler = (plan: ExecutionPlan) => Promise<PlanApproval>;

/**
 * Planning engine that creates and refines execution plans.
 */
export class PlanningEngine {
  private readonly config: PlanningConfig;
  private plans = new Map<string, ExecutionPlan>();
  private refinements = new Map<string, PlanRefinement[]>();
  private approvalHandler?: PlanApprovalHandler;

  constructor(config: Partial<PlanningConfig> = {}) {
    this.config = { ...DEFAULT_PLANNING_CONFIG, ...config };
  }

  /**
   * Set approval handler for human review.
   */
  setApprovalHandler(handler: PlanApprovalHandler): void {
    this.approvalHandler = handler;
  }

  /**
   * Create a new plan.
   */
  createPlan(plan: Omit<ExecutionPlan, "id" | "createdAt" | "status">): ExecutionPlan {
    const fullPlan: ExecutionPlan = {
      ...plan,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      status: "draft",
      requiresApproval: this.shouldRequireApproval(plan),
    };

    this.plans.set(fullPlan.id, fullPlan);
    this.refinements.set(fullPlan.id, []);

    return fullPlan;
  }

  /**
   * Refine an existing plan based on feedback.
   */
  refinePlan(refinement: PlanRefinement): ExecutionPlan | null {
    const plan = this.plans.get(refinement.planId);
    if (!plan) {
      return null;
    }

    // Record refinement
    const planRefinements = this.refinements.get(refinement.planId) ?? [];
    planRefinements.push(refinement);
    this.refinements.set(refinement.planId, planRefinements);

    // Check max refinements
    if (planRefinements.length >= this.config.maxRefinements) {
      plan.status = "rejected";
      return plan;
    }

    // Plan remains in draft for further refinement
    return plan;
  }

  /**
   * Request approval for a plan.
   */
  async requestApproval(planId: string): Promise<PlanApproval> {
    const plan = this.plans.get(planId);
    if (!plan) {
      throw new Error(`Plan ${planId} not found`);
    }

    if (!this.approvalHandler) {
      // Auto-approve if no handler
      return {
        planId,
        approved: true,
        timestamp: Date.now(),
      };
    }

    const approval = await this.approvalHandler(plan);

    if (approval.approved) {
      plan.status = "approved";
    } else {
      plan.status = "rejected";
    }

    return approval;
  }

  /**
   * Get a plan by ID.
   */
  getPlan(planId: string): ExecutionPlan | undefined {
    return this.plans.get(planId);
  }

  /**
   * Get all refinements for a plan.
   */
  getRefinements(planId: string): PlanRefinement[] {
    return this.refinements.get(planId) ?? [];
  }

  /**
   * Mark plan as executed.
   */
  markExecuted(planId: string): void {
    const plan = this.plans.get(planId);
    if (plan) {
      plan.status = "executed";
    }
  }

  /**
   * Determine if plan requires approval.
   */
  private shouldRequireApproval(plan: Omit<ExecutionPlan, "id" | "createdAt" | "status">): boolean {
    if (!this.config.requireApproval) {
      return false;
    }

    // Auto-execute low-risk plans if configured
    if (this.config.autoExecuteLowRisk && plan.riskAssessment === "low") {
      return false;
    }

    // High and medium risk require approval
    return plan.riskAssessment === "high" || plan.riskAssessment === "medium";
  }

  /**
   * Clear all plans (for testing).
   */
  clear(): void {
    this.plans.clear();
    this.refinements.clear();
  }
}

/**
 * Create a planning engine.
 */
export function createPlanningEngine(config?: Partial<PlanningConfig>): PlanningEngine {
  return new PlanningEngine(config);
}
