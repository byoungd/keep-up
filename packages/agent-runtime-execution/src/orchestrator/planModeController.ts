/**
 * Plan Mode Controller
 *
 * Implements Cursor-style Plan Mode workflow with multi-phase execution:
 * 1. Clarifying Questions - Ask questions to refine requirements
 * 2. Codebase Research - Explore codebase to understand context
 * 3. Plan Drafting - Create detailed execution plan
 * 4. Plan Review - Human-in-the-loop approval
 * 5. Execution - Execute the approved plan
 *
 * Inspired by Cursor's Plan Mode (2026) which emphasizes:
 * - Planning-first approach before code execution
 * - Interactive clarifying questions
 * - Codebase research and context gathering
 * - Reviewable Markdown plans with Mermaid diagrams
 */

import type { ExecutionPlan } from "@ku0/agent-runtime-core";
import type { ClarifyingQuestion, ClarifyingQuestionsEngine } from "./clarifyingQuestionsEngine";
import type { CodebaseResearchEngine, ResearchFinding } from "./codebaseResearchEngine";
import type { PlanningEngine } from "./planning";

// ============================================================================
// Plan Mode Phase
// ============================================================================

/**
 * Represents the current phase of Plan Mode execution.
 */
export type PlanModePhase =
  | "idle"
  | "clarifying"
  | "researching"
  | "drafting"
  | "reviewing"
  | "executing"
  | "completed";

/**
 * Event types emitted by the Plan Mode Controller.
 */
export type PlanModeEventType =
  | "phase_changed"
  | "question_generated"
  | "question_answered"
  | "research_started"
  | "research_finding"
  | "research_completed"
  | "plan_drafted"
  | "plan_approved"
  | "plan_rejected"
  | "execution_started"
  | "execution_completed";

/**
 * Event emitted by Plan Mode Controller.
 */
export interface PlanModeEvent {
  type: PlanModeEventType;
  timestamp: number;
  phase: PlanModePhase;
  data?: unknown;
}

/**
 * Handler for Plan Mode events.
 */
export type PlanModeEventHandler = (event: PlanModeEvent) => void;

// ============================================================================
// Plan Mode Configuration
// ============================================================================

/**
 * Configuration for Plan Mode behavior.
 */
export interface PlanModeConfig {
  /** Enable Plan Mode workflow */
  enabled: boolean;

  /** Force clarifying questions before planning */
  requireClarification: boolean;

  /** Require codebase research before planning */
  requireCodebaseResearch: boolean;

  /** Maximum rounds of clarifying questions */
  maxClarificationRounds: number;

  /** Maximum research findings to collect */
  maxResearchFindings: number;

  /** Plan approval mode */
  planApprovalMode: "auto" | "manual" | "hybrid";

  /** Auto-approve plans with low risk assessment */
  autoApproveLowRisk: boolean;

  /** Timeout for research phase (ms) */
  researchTimeoutMs: number;

  /** Timeout for plan drafting (ms) */
  draftingTimeoutMs: number;

  /** Enable Mermaid diagrams in plans */
  enableMermaidDiagrams: boolean;

  /** Enable alternative approach generation */
  enableAlternativeApproaches: boolean;
}

export const DEFAULT_PLAN_MODE_CONFIG: PlanModeConfig = {
  enabled: true,
  requireClarification: false,
  requireCodebaseResearch: true,
  maxClarificationRounds: 3,
  maxResearchFindings: 20,
  planApprovalMode: "hybrid",
  autoApproveLowRisk: true,
  researchTimeoutMs: 60_000,
  draftingTimeoutMs: 30_000,
  enableMermaidDiagrams: true,
  enableAlternativeApproaches: true,
};

// ============================================================================
// Plan Mode State
// ============================================================================

/**
 * Internal state of the Plan Mode Controller.
 */
export interface PlanModeState {
  /** Current phase */
  phase: PlanModePhase;

  /** Original user request */
  userRequest: string;

  /** Clarifying questions asked */
  clarifyingQuestions: ClarifyingQuestion[];

  /** Current clarification round */
  clarificationRound: number;

  /** Research findings collected */
  researchFindings: ResearchFinding[];

  /** Research summary text */
  researchSummary: string;

  /** Draft execution plan */
  draftPlan: ExecutionPlan | null;

  /** Alternative approaches considered */
  alternativeApproaches: AlternativeApproach[];

  /** Approval decision */
  approvalDecision: "pending" | "approved" | "rejected";

  /** Approval feedback */
  approvalFeedback?: string;

  /** Phase start timestamp */
  phaseStartedAt: number;

  /** Phase history */
  phaseHistory: Array<{
    phase: PlanModePhase;
    startedAt: number;
    endedAt: number;
    reason?: string;
  }>;
}

/**
 * Alternative approach considered during planning.
 */
export interface AlternativeApproach {
  id: string;
  title: string;
  description: string;
  prosAndCons: {
    pros: string[];
    cons: string[];
  };
  rejected: boolean;
  rejectionReason?: string;
}

// ============================================================================
// Plan Mode Controller
// ============================================================================

/**
 * Plan Mode Controller coordinates the multi-phase planning workflow.
 *
 * The workflow phases are:
 * 1. **Clarifying** - Ask questions to clarify requirements
 * 2. **Researching** - Explore codebase to understand context
 * 3. **Drafting** - Create detailed execution plan
 * 4. **Reviewing** - Human approves or requests changes
 * 5. **Executing** - Execute the approved plan
 *
 * @example
 * ```typescript
 * const controller = new PlanModeController({
 *   enabled: true,
 *   requireClarification: true,
 * });
 *
 * // Start Plan Mode with user request
 * await controller.start("Add authentication to the API");
 *
 * // Answer clarifying questions
 * await controller.answerQuestion(questionId, "Use JWT tokens");
 *
 * // Wait for research to complete
 * await controller.waitForResearch();
 *
 * // Review and approve the plan
 * await controller.approvePlan();
 *
 * // Get the approved plan for execution
 * const plan = controller.getApprovedPlan();
 * ```
 */
export class PlanModeController {
  private readonly config: PlanModeConfig;
  private state: PlanModeState;
  private eventHandlers = new Set<PlanModeEventHandler>();

  private clarifyingEngine?: ClarifyingQuestionsEngine;
  private researchEngine?: CodebaseResearchEngine;
  private planningEngine?: PlanningEngine;

  constructor(config: Partial<PlanModeConfig> = {}) {
    this.config = { ...DEFAULT_PLAN_MODE_CONFIG, ...config };
    this.state = this.createInitialState();
  }

  // --------------------------------------------------------------------------
  // Engine Bindings
  // --------------------------------------------------------------------------

  /**
   * Bind the clarifying questions engine.
   */
  setClarifyingEngine(engine: ClarifyingQuestionsEngine): void {
    this.clarifyingEngine = engine;
  }

  /**
   * Bind the codebase research engine.
   */
  setResearchEngine(engine: CodebaseResearchEngine): void {
    this.researchEngine = engine;
  }

  /**
   * Bind the planning engine.
   */
  setPlanningEngine(engine: PlanningEngine): void {
    this.planningEngine = engine;
  }

  // --------------------------------------------------------------------------
  // Event Handling
  // --------------------------------------------------------------------------

  /**
   * Subscribe to Plan Mode events.
   */
  onEvent(handler: PlanModeEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  private emitEvent(type: PlanModeEventType, data?: unknown): void {
    const event: PlanModeEvent = {
      type,
      timestamp: Date.now(),
      phase: this.state.phase,
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

  // --------------------------------------------------------------------------
  // State Management
  // --------------------------------------------------------------------------

  /**
   * Get current phase.
   */
  getPhase(): PlanModePhase {
    return this.state.phase;
  }

  /**
   * Get current state (read-only).
   */
  getState(): Readonly<PlanModeState> {
    return this.state;
  }

  /**
   * Check if Plan Mode is active.
   */
  isActive(): boolean {
    return this.state.phase !== "idle" && this.state.phase !== "completed";
  }

  /**
   * Check if Plan Mode is enabled.
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  private createInitialState(): PlanModeState {
    return {
      phase: "idle",
      userRequest: "",
      clarifyingQuestions: [],
      clarificationRound: 0,
      researchFindings: [],
      researchSummary: "",
      draftPlan: null,
      alternativeApproaches: [],
      approvalDecision: "pending",
      phaseStartedAt: 0,
      phaseHistory: [],
    };
  }

  private transitionPhase(newPhase: PlanModePhase, reason?: string): void {
    const now = Date.now();

    // Record phase history
    if (this.state.phase !== "idle") {
      this.state.phaseHistory.push({
        phase: this.state.phase,
        startedAt: this.state.phaseStartedAt,
        endedAt: now,
        reason,
      });
    }

    this.state.phase = newPhase;
    this.state.phaseStartedAt = now;

    this.emitEvent("phase_changed", { newPhase, reason });
  }

  // --------------------------------------------------------------------------
  // Workflow Control
  // --------------------------------------------------------------------------

  /**
   * Start Plan Mode with a user request.
   */
  async start(userRequest: string): Promise<void> {
    if (this.state.phase !== "idle") {
      throw new Error(`Cannot start Plan Mode from phase: ${this.state.phase}`);
    }

    this.state = {
      ...this.createInitialState(),
      userRequest,
      phaseStartedAt: Date.now(),
    };

    // Determine initial phase based on config
    if (this.config.requireClarification) {
      await this.startClarifyingPhase();
    } else if (this.config.requireCodebaseResearch) {
      await this.startResearchPhase();
    } else {
      await this.startDraftingPhase();
    }
  }

  /**
   * Reset Plan Mode to idle state.
   */
  reset(): void {
    this.state = this.createInitialState();
    this.transitionPhase("idle", "manual reset");
  }

  // --------------------------------------------------------------------------
  // Clarifying Phase
  // --------------------------------------------------------------------------

  private async startClarifyingPhase(): Promise<void> {
    this.transitionPhase("clarifying", "starting clarification");
    this.state.clarificationRound++;

    if (!this.clarifyingEngine) {
      await this.advanceAfterClarification();
      return;
    }

    const questions = await this.clarifyingEngine.generateQuestions(this.state.userRequest);
    this.state.clarifyingQuestions = questions;

    for (const q of questions) {
      this.emitEvent("question_generated", q);
    }

    if (questions.length === 0) {
      await this.advanceAfterClarification();
    }
  }

  /**
   * Answer a clarifying question.
   */
  async answerQuestion(questionId: string, answer: string): Promise<void> {
    if (this.state.phase !== "clarifying") {
      throw new Error("Not in clarifying phase");
    }

    const question = this.state.clarifyingQuestions.find((q) => q.id === questionId);
    if (!question) {
      throw new Error(`Question not found: ${questionId}`);
    }

    question.answer = answer;
    question.answeredAt = Date.now();

    if (this.clarifyingEngine) {
      this.clarifyingEngine.updateAnswer(questionId, answer);
    }

    this.emitEvent("question_answered", { questionId, answer });

    // Check if all blocking questions are answered
    const hasBlockingUnanswered = this.state.clarifyingQuestions.some(
      (q) => q.priority === "blocking" && !q.answer
    );

    if (!hasBlockingUnanswered) {
      await this.advanceAfterClarification();
    }
  }

  /**
   * Skip remaining clarifying questions and proceed.
   */
  async skipClarification(): Promise<void> {
    if (this.state.phase !== "clarifying") {
      throw new Error("Not in clarifying phase");
    }

    await this.advanceAfterClarification();
  }

  /**
   * Get unanswered clarifying questions.
   */
  getUnansweredQuestions(): ClarifyingQuestion[] {
    return this.state.clarifyingQuestions.filter((q) => !q.answer);
  }

  /**
   * Get formatted Q&A context for plan generation.
   */
  getClarificationContext(): string {
    if (this.clarifyingEngine) {
      return this.clarifyingEngine.getContext();
    }

    const answered = this.state.clarifyingQuestions.filter((q) => q.answer);
    if (answered.length === 0) {
      return "";
    }

    return answered.map((q) => `Q: ${q.question}\nA: ${q.answer}`).join("\n\n");
  }

  // --------------------------------------------------------------------------
  // Research Phase
  // --------------------------------------------------------------------------

  private async startResearchPhase(): Promise<void> {
    this.transitionPhase("researching", "starting codebase research");
    this.emitEvent("research_started");

    if (this.researchEngine) {
      this.researchEngine.clear();
      const strategy = await this.researchEngine.analyzeRequest(
        this.state.userRequest,
        this.getClarificationContext()
      );

      const findings = await this.researchEngine.executeResearch(strategy);
      this.state.researchFindings = findings.slice(0, this.config.maxResearchFindings);

      for (const finding of this.state.researchFindings) {
        this.emitEvent("research_finding", finding);
      }

      this.state.researchSummary = this.researchEngine.summarizeFindings();
    }

    this.emitEvent("research_completed", {
      findingsCount: this.state.researchFindings.length,
    });

    await this.startDraftingPhase();
  }

  /**
   * Add a research finding manually.
   */
  addResearchFinding(finding: ResearchFinding): void {
    if (this.state.researchFindings.length < this.config.maxResearchFindings) {
      this.state.researchFindings.push(finding);
      this.emitEvent("research_finding", finding);
    }
  }

  /**
   * Get research summary.
   */
  getResearchSummary(): string {
    return this.state.researchSummary;
  }

  // --------------------------------------------------------------------------
  // Drafting Phase
  // --------------------------------------------------------------------------

  private async startDraftingPhase(): Promise<void> {
    this.transitionPhase("drafting", "drafting execution plan");

    // Plan generation would be handled by the orchestrator/LLM
    // This phase transitions when the plan is submitted
  }

  /**
   * Submit a draft plan for review.
   */
  submitDraftPlan(plan: ExecutionPlan): void {
    if (this.state.phase !== "drafting") {
      throw new Error("Not in drafting phase");
    }

    this.state.draftPlan = plan;

    if (this.planningEngine) {
      this.planningEngine.registerPlan(plan);
    }

    this.emitEvent("plan_drafted", { planId: plan.id });

    // Transition to review
    this.startReviewPhase();
  }

  /**
   * Add an alternative approach that was considered.
   */
  addAlternativeApproach(approach: Omit<AlternativeApproach, "id">): void {
    const fullApproach: AlternativeApproach = {
      ...approach,
      id: crypto.randomUUID(),
    };
    this.state.alternativeApproaches.push(fullApproach);
  }

  // --------------------------------------------------------------------------
  // Review Phase
  // --------------------------------------------------------------------------

  private startReviewPhase(): void {
    this.transitionPhase("reviewing", "awaiting plan approval");

    // Auto-approve if configured
    if (this.state.draftPlan?.requiresApproval) {
      return;
    }

    if (this.config.planApprovalMode === "auto") {
      this.approvePlan();
    } else if (
      this.config.planApprovalMode === "hybrid" &&
      this.config.autoApproveLowRisk &&
      this.state.draftPlan?.riskAssessment === "low"
    ) {
      this.approvePlan();
    }
    // Otherwise wait for manual approval
  }

  private async advanceAfterClarification(): Promise<void> {
    if (this.config.requireCodebaseResearch) {
      await this.startResearchPhase();
    } else {
      await this.startDraftingPhase();
    }
  }

  /**
   * Approve the current plan.
   */
  approvePlan(feedback?: string): void {
    if (this.state.phase !== "reviewing") {
      throw new Error("Not in reviewing phase");
    }

    this.state.approvalDecision = "approved";
    this.state.approvalFeedback = feedback;

    if (this.state.draftPlan && this.planningEngine) {
      this.planningEngine.requestApproval(this.state.draftPlan.id);
    }

    this.emitEvent("plan_approved", { feedback });
    this.transitionPhase("executing", "plan approved");
    this.emitEvent("execution_started");
  }

  /**
   * Reject the current plan and request changes.
   */
  rejectPlan(feedback: string): void {
    if (this.state.phase !== "reviewing") {
      throw new Error("Not in reviewing phase");
    }

    this.state.approvalDecision = "rejected";
    this.state.approvalFeedback = feedback;
    this.state.draftPlan = null;

    this.emitEvent("plan_rejected", { feedback });

    // Return to drafting for revision
    this.transitionPhase("drafting", "plan rejected, revising");
  }

  /**
   * Get the current draft plan.
   */
  getDraftPlan(): ExecutionPlan | null {
    return this.state.draftPlan;
  }

  // --------------------------------------------------------------------------
  // Execution Phase
  // --------------------------------------------------------------------------

  /**
   * Mark execution as complete.
   */
  completeExecution(): void {
    if (this.state.phase !== "executing") {
      throw new Error("Not in executing phase");
    }

    if (this.state.draftPlan && this.planningEngine) {
      this.planningEngine.markExecuted(this.state.draftPlan.id);
    }

    this.emitEvent("execution_completed");
    this.transitionPhase("completed", "execution finished");
  }

  /**
   * Get the approved plan for execution.
   * Returns null if plan is not yet approved.
   */
  getApprovedPlan(): ExecutionPlan | null {
    if (this.state.approvalDecision !== "approved") {
      return null;
    }
    return this.state.draftPlan;
  }

  // --------------------------------------------------------------------------
  // Utilities
  // --------------------------------------------------------------------------

  /**
   * Get the configuration.
   */
  getConfig(): Readonly<PlanModeConfig> {
    return this.config;
  }

  /**
   * Check if plan should go through clarification.
   */
  shouldClarify(userRequest: string): boolean {
    if (!this.config.requireClarification) {
      return false;
    }

    // Heuristics for when clarification is needed:
    // - Short requests (might be ambiguous)
    // - Requests with question marks (user is already unclear)
    // - Requests mentioning "maybe", "could", "or" (multiple options)
    const isShort = userRequest.split(/\s+/).length < 10;
    const hasQuestions = userRequest.includes("?");
    const hasAmbiguity = /\b(maybe|could|or|either|possibly)\b/i.test(userRequest);

    return isShort || hasQuestions || hasAmbiguity;
  }

  /**
   * Determine complexity of request to decide if Plan Mode is needed.
   */
  assessComplexity(userRequest: string): "simple" | "moderate" | "complex" {
    const wordCount = userRequest.split(/\s+/).length;
    const mentionsMultipleFiles = /\b(files|multiple|across|several)\b/i.test(userRequest);
    const mentionsRefactoring = /\b(refactor|restructure|reorganize|migrate)\b/i.test(userRequest);
    const mentionsArchitecture = /\b(architecture|design|pattern|system)\b/i.test(userRequest);

    if (mentionsArchitecture || mentionsRefactoring) {
      return "complex";
    }

    if (mentionsMultipleFiles || wordCount > 50) {
      return "moderate";
    }

    return "simple";
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a Plan Mode Controller.
 */
export function createPlanModeController(config?: Partial<PlanModeConfig>): PlanModeController {
  return new PlanModeController(config);
}
