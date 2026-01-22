/**
 * Plan Mode Orchestrator Integration
 *
 * Adapter that integrates PlanModeController with AgentOrchestrator.
 * Provides hooks, events, and state synchronization.
 *
 * This module enables the orchestrator to:
 * 1. Detect when Plan Mode should be activated
 * 2. Route to clarifying questions phase
 * 3. Coordinate codebase research
 * 4. Handle plan approval workflow
 * 5. Emit events for UI synchronization
 */

import type { ExecutionPlan } from "@ku0/agent-runtime-core";
import type { ClarifyingQuestionsEngine } from "./clarifyingQuestionsEngine";
import type { CodebaseResearchEngineImpl } from "./codebaseResearchEngine";
import type { ParallelPlanReviewer } from "./parallelPlanReviewer";
import type { PlanMarkdownRenderer } from "./planMarkdownRenderer";
import type { PlanModeController, PlanModeEvent, PlanModePhase } from "./planModeController";

// ============================================================================
// Types
// ============================================================================

/**
 * Events emitted by the Plan Mode integration.
 * These map to OrchestratorEventType for UI synchronization.
 */
export type PlanModeIntegrationEventType =
  | "plan_mode:started"
  | "plan_mode:phase_changed"
  | "plan_mode:question_generated"
  | "plan_mode:question_answered"
  | "plan_mode:research_started"
  | "plan_mode:research_finding"
  | "plan_mode:research_completed"
  | "plan_mode:plan_drafted"
  | "plan_mode:plan_reviewed"
  | "plan_mode:plan_approved"
  | "plan_mode:plan_rejected"
  | "plan_mode:execution_started"
  | "plan_mode:completed";

/**
 * Event payload for Plan Mode integration events.
 */
export interface PlanModeIntegrationEvent {
  type: PlanModeIntegrationEventType;
  timestamp: number;
  phase: PlanModePhase;
  data?: unknown;
}

/**
 * Handler for integration events.
 */
export type PlanModeIntegrationEventHandler = (event: PlanModeIntegrationEvent) => void;

/**
 * Configuration for the integration.
 */
export interface PlanModeIntegrationConfig {
  /** Enable automatic Plan Mode for complex requests */
  autoActivate: boolean;

  /** Complexity threshold for auto-activation */
  autoActivateComplexity: "moderate" | "complex";

  /** Enable parallel review */
  enableParallelReview: boolean;

  /** Render plan as Markdown */
  renderPlanAsMarkdown: boolean;
}

export const DEFAULT_INTEGRATION_CONFIG: PlanModeIntegrationConfig = {
  autoActivate: true,
  autoActivateComplexity: "moderate",
  enableParallelReview: false,
  renderPlanAsMarkdown: true,
};

// ============================================================================
// Plan Mode Integration
// ============================================================================

/**
 * Integrates PlanModeController with AgentOrchestrator.
 *
 * Provides a unified interface for Plan Mode workflow that the orchestrator
 * can use to coordinate planning phases with agent execution.
 *
 * @example
 * ```typescript
 * const integration = createPlanModeIntegration({
 *   controller: planModeController,
 *   clarifyingEngine,
 *   researchEngine,
 *   markdownRenderer,
 * });
 *
 * // Check if Plan Mode should be used
 * if (integration.shouldActivate(userRequest)) {
 *   await integration.activate(userRequest);
 *
 *   // Handle phases...
 *   while (integration.isActive()) {
 *     const phase = integration.getCurrentPhase();
 *     // Orchestrator handles each phase
 *   }
 * }
 * ```
 */
export class PlanModeIntegration {
  private readonly config: PlanModeIntegrationConfig;
  private readonly controller: PlanModeController;
  private readonly clarifyingEngine?: ClarifyingQuestionsEngine;
  private readonly researchEngine?: CodebaseResearchEngineImpl;
  private readonly markdownRenderer?: PlanMarkdownRenderer;
  private readonly parallelReviewer?: ParallelPlanReviewer;
  private readonly eventHandlers = new Set<PlanModeIntegrationEventHandler>();

  private unsubscribeController?: () => void;

  constructor(options: {
    controller: PlanModeController;
    clarifyingEngine?: ClarifyingQuestionsEngine;
    researchEngine?: CodebaseResearchEngineImpl;
    markdownRenderer?: PlanMarkdownRenderer;
    parallelReviewer?: ParallelPlanReviewer;
    config?: Partial<PlanModeIntegrationConfig>;
  }) {
    this.config = { ...DEFAULT_INTEGRATION_CONFIG, ...options.config };
    this.controller = options.controller;
    this.clarifyingEngine = options.clarifyingEngine;
    this.researchEngine = options.researchEngine;
    this.markdownRenderer = options.markdownRenderer;
    this.parallelReviewer = options.parallelReviewer;

    // Bind engines to controller
    if (this.clarifyingEngine) {
      this.controller.setClarifyingEngine(this.clarifyingEngine);
    }
    if (this.researchEngine) {
      this.controller.setResearchEngine(this.researchEngine);
    }

    // Subscribe to controller events
    this.unsubscribeController = this.controller.onEvent((event) => {
      this.handleControllerEvent(event);
    });
  }

  // --------------------------------------------------------------------------
  // Event Handling
  // --------------------------------------------------------------------------

  /**
   * Subscribe to integration events.
   */
  onEvent(handler: PlanModeIntegrationEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  private emitEvent(type: PlanModeIntegrationEventType, data?: unknown): void {
    const event: PlanModeIntegrationEvent = {
      type,
      timestamp: Date.now(),
      phase: this.controller.getPhase(),
      data,
    };

    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch {
        // Ignore handler errors
      }
    }
  }

  private handleControllerEvent(event: PlanModeEvent): void {
    // Map controller events to integration events
    const typeMap: Record<string, PlanModeIntegrationEventType> = {
      phase_changed: "plan_mode:phase_changed",
      question_generated: "plan_mode:question_generated",
      question_answered: "plan_mode:question_answered",
      research_started: "plan_mode:research_started",
      research_finding: "plan_mode:research_finding",
      research_completed: "plan_mode:research_completed",
      plan_drafted: "plan_mode:plan_drafted",
      plan_approved: "plan_mode:plan_approved",
      plan_rejected: "plan_mode:plan_rejected",
      execution_started: "plan_mode:execution_started",
      execution_completed: "plan_mode:completed",
    };

    const mappedType = typeMap[event.type];
    if (mappedType) {
      this.emitEvent(mappedType, event.data);
    }
  }

  // --------------------------------------------------------------------------
  // Activation
  // --------------------------------------------------------------------------

  /**
   * Check if Plan Mode should be activated for a request.
   */
  shouldActivate(userRequest: string): boolean {
    if (!this.controller.isEnabled()) {
      return false;
    }

    if (!this.config.autoActivate) {
      return false;
    }

    const complexity = this.controller.assessComplexity(userRequest);

    if (this.config.autoActivateComplexity === "moderate") {
      return complexity === "moderate" || complexity === "complex";
    }

    return complexity === "complex";
  }

  /**
   * Activate Plan Mode for a user request.
   */
  async activate(userRequest: string): Promise<void> {
    await this.controller.start(userRequest);
    this.emitEvent("plan_mode:started", { userRequest });
  }

  /**
   * Check if Plan Mode is currently active.
   */
  isActive(): boolean {
    return this.controller.isActive();
  }

  /**
   * Get current phase.
   */
  getCurrentPhase(): PlanModePhase {
    return this.controller.getPhase();
  }

  // --------------------------------------------------------------------------
  // Phase Handlers
  // --------------------------------------------------------------------------

  /**
   * Get current clarifying questions.
   */
  getClarifyingQuestions() {
    return this.controller.getUnansweredQuestions();
  }

  /**
   * Answer a clarifying question.
   */
  async answerQuestion(questionId: string, answer: string): Promise<void> {
    await this.controller.answerQuestion(questionId, answer);
  }

  /**
   * Skip remaining clarification.
   */
  async skipClarification(): Promise<void> {
    await this.controller.skipClarification();
  }

  /**
   * Get research findings.
   */
  getResearchFindings() {
    return this.controller.getState().researchFindings;
  }

  /**
   * Submit a draft plan.
   */
  async submitPlan(plan: ExecutionPlan): Promise<void> {
    this.controller.submitDraftPlan(plan);

    // Trigger parallel review if enabled
    if (
      this.config.enableParallelReview &&
      this.parallelReviewer &&
      this.controller.getPhase() === "reviewing"
    ) {
      const result = await this.parallelReviewer.submitForReview({
        plan,
        reviewerProfiles: [],
        maxParallelReviews: 4,
        reviewTimeoutMs: 30000,
      });

      this.emitEvent("plan_mode:plan_reviewed", result);

      // Auto-approve if recommendation is approve
      if (result.recommendation === "approve" && this.controller.getPhase() === "reviewing") {
        this.controller.approvePlan(result.consolidatedFeedback);
      }
    }
  }

  /**
   * Approve the current plan.
   */
  approvePlan(feedback?: string): void {
    this.controller.approvePlan(feedback);
  }

  /**
   * Reject the current plan.
   */
  rejectPlan(feedback: string): void {
    this.controller.rejectPlan(feedback);
  }

  /**
   * Get the approved plan.
   */
  getApprovedPlan(): ExecutionPlan | null {
    return this.controller.getApprovedPlan();
  }

  /**
   * Mark execution as complete.
   */
  completeExecution(): void {
    this.controller.completeExecution();
  }

  // --------------------------------------------------------------------------
  // Rendering
  // --------------------------------------------------------------------------

  /**
   * Render plan as Markdown.
   */
  renderPlanAsMarkdown(plan: ExecutionPlan): string {
    if (!this.markdownRenderer) {
      return `# Plan: ${plan.goal}\n\n${plan.steps.map((s) => `- ${s.description}`).join("\n")}`;
    }

    const state = this.controller.getState();
    return this.markdownRenderer.render({
      ...plan,
      researchSummary: state.researchSummary,
      clarifications: state.clarifyingQuestions,
      alternativeApproaches: state.alternativeApproaches,
    });
  }

  // --------------------------------------------------------------------------
  // Orchestrator Hooks
  // --------------------------------------------------------------------------

  /**
   * Get prompt injection for current phase.
   * Returns additional instructions to inject into the system prompt.
   */
  getPromptInjection(): string | null {
    const phase = this.controller.getPhase();

    switch (phase) {
      case "clarifying":
        return `
You are currently in PLAN MODE - CLARIFYING PHASE.
Before making any code changes, gather necessary information by asking clarifying questions.
Use the provided questions as a starting point, but ask additional questions if needed.
`;

      case "researching":
        return `
You are currently in PLAN MODE - RESEARCH PHASE.
Explore the codebase to understand the current implementation before planning changes.
Use tools like grep_search, view_file, and find_by_name to gather context.
`;

      case "drafting":
        return `
You are currently in PLAN MODE - DRAFTING PHASE.
Create a detailed execution plan before making any changes.
The plan should include:
- Clear steps with dependencies
- Risk assessment
- Success criteria
- Files to be affected
`;

      case "reviewing":
        return `
You are currently in PLAN MODE - REVIEW PHASE.
Present the plan to the user for approval before execution.
Be prepared to revise the plan based on feedback.
`;

      case "executing":
        return `
You are currently in PLAN MODE - EXECUTION PHASE.
Follow the approved plan step by step.
Report progress and update step status as you complete each step.
`;

      default:
        return null;
    }
  }

  /**
   * Get tools that should be prioritized for current phase.
   */
  getPreferredTools(): string[] {
    const phase = this.controller.getPhase();

    switch (phase) {
      case "researching":
        return ["grep_search", "find_by_name", "view_file", "view_file_outline"];
      case "drafting":
        return ["write_file"]; // For writing plan artifacts
      case "executing": {
        const plan = this.controller.getDraftPlan();
        return plan?.toolsNeeded ?? [];
      }
      default:
        return [];
    }
  }

  // --------------------------------------------------------------------------
  // Cleanup
  // --------------------------------------------------------------------------

  /**
   * Reset Plan Mode.
   */
  reset(): void {
    this.controller.reset();
  }

  /**
   * Dispose of the integration.
   */
  dispose(): void {
    this.unsubscribeController?.();
    this.eventHandlers.clear();
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a Plan Mode integration.
 */
export function createPlanModeIntegration(options: {
  controller: PlanModeController;
  clarifyingEngine?: ClarifyingQuestionsEngine;
  researchEngine?: CodebaseResearchEngineImpl;
  markdownRenderer?: PlanMarkdownRenderer;
  parallelReviewer?: ParallelPlanReviewer;
  config?: Partial<PlanModeIntegrationConfig>;
}): PlanModeIntegration {
  return new PlanModeIntegration(options);
}
