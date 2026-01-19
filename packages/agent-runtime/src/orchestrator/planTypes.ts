/**
 * Planning Types
 *
 * Shared plan types for planning engine and persistence.
 */

import type { MCPToolCall } from "../types";

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
