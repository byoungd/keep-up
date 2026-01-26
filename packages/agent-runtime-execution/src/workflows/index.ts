/**
 * Workflow Templates System
 *
 * Provides reusable workflow patterns for common agent tasks.
 * Based on Claude Code Agent best practices for structured, repeatable workflows.
 */

import type { GraphDefinition } from "../graph";
import type { ExecutionPlan, PlanStep } from "../orchestrator/planning";

// ============================================================================
// Workflow Types
// ============================================================================

/**
 * Workflow template definition.
 */
export interface WorkflowTemplate {
  /** Template identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Template description */
  description: string;
  /** Workflow dependencies */
  dependsOn?: string[];
  /** Workflow phases/steps */
  phases: WorkflowPhase[];
  /** Tools required for this workflow */
  requiredTools: string[];
  /** Success criteria */
  successCriteria: string[];
  /** Typical duration estimate (ms) */
  estimatedDuration?: number;
  /** Risk level */
  riskLevel: "low" | "medium" | "high";
  /** Optional metadata */
  metadata?: Record<string, string>;
  /** Optional graph definition for execution */
  graph?: GraphDefinition;
}

/**
 * Phase within a workflow.
 */
export interface WorkflowPhase {
  /** Phase identifier */
  id: string;
  /** Phase number */
  order: number;
  /** Phase name */
  name: string;
  /** Phase description */
  description: string;
  /** Tools used in this phase */
  tools: string[];
  /** Expected outputs */
  outputs: string[];
  /** Validation criteria */
  validation?: string;
  /** Can run in parallel with other phases */
  parallelizable: boolean;
}

/**
 * Workflow execution context.
 */
export interface WorkflowContext {
  /** Input parameters */
  parameters: Record<string, unknown>;
  /** Working directory */
  workingDir?: string;
  /** Target files */
  targetFiles?: string[];
  /** Additional context */
  metadata?: Record<string, unknown>;
}

/**
 * Workflow execution result.
 */
export interface WorkflowResult {
  /** Success status */
  success: boolean;
  /** Outputs from each phase */
  phaseOutputs: Map<string, unknown>;
  /** Execution plan used */
  plan: ExecutionPlan;
  /** Error if failed */
  error?: string;
}

// ============================================================================
// Built-in Workflow Templates
// ============================================================================

/**
 * Test-Driven Development workflow.
 */
export const TDD_WORKFLOW: WorkflowTemplate = {
  id: "tdd",
  name: "Test-Driven Development",
  description: "Write tests first, then implement to pass them",
  requiredTools: ["file", "code"],
  riskLevel: "low",
  successCriteria: [
    "All tests pass",
    "Code coverage meets target",
    "Tests written before implementation",
  ],
  phases: [
    {
      id: "write-tests",
      order: 1,
      name: "Write Tests",
      description: "Create test cases based on requirements",
      tools: ["file"],
      outputs: ["test_file"],
      validation: "Tests compile and fail as expected",
      parallelizable: false,
    },
    {
      id: "verify-failure",
      order: 2,
      name: "Verify Failure",
      description: "Run tests to confirm they fail",
      tools: ["code"],
      outputs: ["test_results"],
      validation: "Tests fail with expected errors",
      parallelizable: false,
    },
    {
      id: "implement",
      order: 3,
      name: "Implement",
      description: "Write minimal code to pass tests",
      tools: ["file"],
      outputs: ["implementation_file"],
      parallelizable: false,
    },
    {
      id: "verify-success",
      order: 4,
      name: "Verify Success",
      description: "Run tests to confirm they pass",
      tools: ["code"],
      outputs: ["test_results"],
      validation: "All tests pass",
      parallelizable: false,
    },
    {
      id: "refactor",
      order: 5,
      name: "Refactor",
      description: "Clean up code while maintaining passing tests",
      tools: ["file", "code"],
      outputs: ["refactored_code"],
      validation: "Tests still pass after refactoring",
      parallelizable: false,
    },
  ],
};

/**
 * Refactoring workflow.
 */
export const REFACTORING_WORKFLOW: WorkflowTemplate = {
  id: "refactoring",
  name: "Safe Refactoring",
  description: "Refactor code with safety checks at each step",
  requiredTools: ["file", "code", "git"],
  riskLevel: "medium",
  successCriteria: ["Tests pass", "Code quality improved", "No behavioral changes"],
  phases: [
    {
      id: "analyze",
      order: 1,
      name: "Analyze Code",
      description: "Read and understand current implementation",
      tools: ["file"],
      outputs: ["code_analysis"],
      parallelizable: false,
    },
    {
      id: "baseline-tests",
      order: 2,
      name: "Establish Baseline",
      description: "Run existing tests to establish baseline",
      tools: ["code"],
      outputs: ["baseline_results"],
      validation: "All tests pass before refactoring",
      parallelizable: false,
    },
    {
      id: "create-checkpoint",
      order: 3,
      name: "Create Checkpoint",
      description: "Git commit or checkpoint current state",
      tools: ["git"],
      outputs: ["checkpoint"],
      parallelizable: false,
    },
    {
      id: "refactor-code",
      order: 4,
      name: "Apply Refactoring",
      description: "Make incremental refactoring changes",
      tools: ["file"],
      outputs: ["refactored_code"],
      parallelizable: false,
    },
    {
      id: "verify-tests",
      order: 5,
      name: "Verify Tests",
      description: "Run tests to ensure no breakage",
      tools: ["code"],
      outputs: ["test_results"],
      validation: "All tests still pass",
      parallelizable: false,
    },
    {
      id: "review-diff",
      order: 6,
      name: "Review Changes",
      description: "Review diff for unintended changes",
      tools: ["git"],
      outputs: ["diff_review"],
      parallelizable: false,
    },
  ],
};

/**
 * Debugging workflow.
 */
export const DEBUGGING_WORKFLOW: WorkflowTemplate = {
  id: "debugging",
  name: "Systematic Debugging",
  description: "Systematically identify and fix bugs",
  requiredTools: ["file", "code"],
  riskLevel: "low",
  successCriteria: ["Bug reproduced", "Root cause identified", "Fix verified"],
  phases: [
    {
      id: "reproduce",
      order: 1,
      name: "Reproduce Bug",
      description: "Create minimal reproduction of the issue",
      tools: ["code"],
      outputs: ["reproduction"],
      validation: "Bug consistently reproduces",
      parallelizable: false,
    },
    {
      id: "isolate",
      order: 2,
      name: "Isolate Cause",
      description: "Narrow down to specific component/function",
      tools: ["file"],
      outputs: ["suspect_code"],
      parallelizable: false,
    },
    {
      id: "analyze",
      order: 3,
      name: "Analyze Root Cause",
      description: "Understand why the bug occurs",
      tools: ["file"],
      outputs: ["root_cause"],
      parallelizable: false,
    },
    {
      id: "fix",
      order: 4,
      name: "Apply Fix",
      description: "Implement the fix",
      tools: ["file"],
      outputs: ["fixed_code"],
      parallelizable: false,
    },
    {
      id: "verify-fix",
      order: 5,
      name: "Verify Fix",
      description: "Confirm bug is resolved",
      tools: ["code"],
      outputs: ["verification_results"],
      validation: "Bug no longer reproduces",
      parallelizable: false,
    },
    {
      id: "regression-test",
      order: 6,
      name: "Add Regression Test",
      description: "Create test to prevent future regression",
      tools: ["file", "code"],
      outputs: ["regression_test"],
      validation: "Test fails before fix, passes after",
      parallelizable: false,
    },
  ],
};

/**
 * Research workflow.
 */
export const RESEARCH_WORKFLOW: WorkflowTemplate = {
  id: "research",
  name: "Research & Documentation",
  description: "Gather information and synthesize findings",
  requiredTools: ["file", "web-search"],
  riskLevel: "low",
  successCriteria: ["Questions answered", "Sources documented", "Findings synthesized"],
  phases: [
    {
      id: "define-questions",
      order: 1,
      name: "Define Questions",
      description: "Clarify what needs to be researched",
      tools: [],
      outputs: ["research_questions"],
      parallelizable: false,
    },
    {
      id: "gather-info",
      order: 2,
      name: "Gather Information",
      description: "Search and collect relevant information",
      tools: ["web-search", "file"],
      outputs: ["source_materials"],
      parallelizable: true,
    },
    {
      id: "analyze",
      order: 3,
      name: "Analyze Findings",
      description: "Review and analyze collected information",
      tools: [],
      outputs: ["analysis"],
      parallelizable: false,
    },
    {
      id: "synthesize",
      order: 4,
      name: "Synthesize",
      description: "Combine findings into coherent summary",
      tools: [],
      outputs: ["synthesis"],
      parallelizable: false,
    },
    {
      id: "document",
      order: 5,
      name: "Document",
      description: "Create documentation with sources",
      tools: ["file"],
      outputs: ["documentation"],
      validation: "All sources cited",
      parallelizable: false,
    },
  ],
};

/**
 * All built-in workflow templates.
 */
export const BUILT_IN_WORKFLOWS: WorkflowTemplate[] = [
  TDD_WORKFLOW,
  REFACTORING_WORKFLOW,
  DEBUGGING_WORKFLOW,
  RESEARCH_WORKFLOW,
];

// ============================================================================
// Workflow Template Manager
// ============================================================================

/**
 * Manages workflow templates and execution.
 */
export class WorkflowTemplateManager {
  private templates = new Map<string, WorkflowTemplate>();

  constructor() {
    // Register built-in workflows
    for (const template of BUILT_IN_WORKFLOWS) {
      this.templates.set(template.id, template);
    }
  }

  /**
   * Get a workflow template by ID.
   */
  getTemplate(id: string): WorkflowTemplate | undefined {
    return this.templates.get(id);
  }

  /**
   * List all available templates.
   */
  listTemplates(): WorkflowTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Get a graph definition by template ID.
   */
  getGraphDefinition(id: string): GraphDefinition | undefined {
    return this.templates.get(id)?.graph;
  }

  /**
   * Register a custom workflow template.
   */
  registerTemplate(template: WorkflowTemplate): void {
    this.templates.set(template.id, template);
  }

  /**
   * Convert workflow template to execution plan.
   */
  createPlanFromTemplate(template: WorkflowTemplate, context: WorkflowContext): ExecutionPlan {
    const steps: PlanStep[] = template.phases.map((phase) => ({
      id: phase.id,
      order: phase.order,
      description: phase.description,
      tools: phase.tools,
      expectedOutcome: phase.outputs.join(", "),
      dependencies: this.calculateDependencies(phase, template.phases),
      parallelizable: phase.parallelizable,
      status: "pending",
    }));

    return {
      id: crypto.randomUUID(),
      goal: `Execute ${template.name} workflow`,
      steps,
      estimatedDuration: template.estimatedDuration ?? this.estimateDuration(steps),
      riskAssessment: template.riskLevel,
      toolsNeeded: template.requiredTools,
      contextRequired: context.targetFiles ?? [],
      successCriteria: template.successCriteria,
      createdAt: Date.now(),
      status: "draft",
      requiresApproval: template.riskLevel !== "low",
    };
  }

  /**
   * Calculate step dependencies based on phase order.
   */
  private calculateDependencies(phase: WorkflowPhase, allPhases: WorkflowPhase[]): string[] {
    // Non-parallelizable phases depend on all previous phases
    if (!phase.parallelizable) {
      return allPhases.filter((p) => p.order < phase.order).map((p) => p.id);
    }
    return [];
  }

  /**
   * Estimate workflow duration.
   */
  private estimateDuration(steps: PlanStep[]): number {
    // Simple estimate: 30 seconds per step
    return steps.length * 30000;
  }
}

/**
 * Create a workflow template manager.
 */
export function createWorkflowTemplateManager(): WorkflowTemplateManager {
  return new WorkflowTemplateManager();
}

export type {
  WorkflowFrontmatter,
  WorkflowParseOutcome,
  WorkflowValidationOptions,
} from "./workflowParsing";
export {
  normalizeWorkflowId,
  parseWorkflowMarkdown,
  validateWorkflowId,
} from "./workflowParsing";
export type {
  WorkflowDirectoryConfig,
  WorkflowDiscoveryResult,
  WorkflowRegistryOptions,
  WorkflowValidationError,
} from "./workflowRegistry";
export { WorkflowRegistry } from "./workflowRegistry";
