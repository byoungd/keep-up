/**
 * Parallel Plan Reviewer
 *
 * Enables multi-agent parallel review of execution plans.
 * Multiple reviewer agents with different personas can evaluate
 * a plan simultaneously and provide feedback.
 *
 * Inspired by Cursor's multi-agent judging feature.
 */

import type { ExecutionPlan, PlanStep } from "@ku0/agent-runtime-core";

// ============================================================================
// Types
// ============================================================================

/**
 * Reviewer profile defining agent persona and focus.
 */
export interface ReviewerProfile {
  /** Profile identifier */
  id: string;

  /** Human-readable name */
  name: string;

  /** Focus area for review */
  focus: ReviewFocus;

  /** Custom review criteria */
  criteria?: string[];

  /** Weight for final scoring (0-1) */
  weight: number;
}

/**
 * Focus area for a reviewer.
 */
export type ReviewFocus =
  | "correctness" // Focus on logical correctness
  | "security" // Focus on security implications
  | "performance" // Focus on performance impact
  | "maintainability" // Focus on code maintainability
  | "completeness" // Focus on completeness of plan
  | "risk"; // Focus on risk assessment

/**
 * Request to submit a plan for parallel review.
 */
export interface PlanReviewRequest {
  /** Plan to review */
  plan: ExecutionPlan;

  /** Reviewer profiles to use */
  reviewerProfiles: ReviewerProfile[];

  /** Maximum parallel reviews */
  maxParallelReviews: number;

  /** Timeout per review (ms) */
  reviewTimeoutMs: number;
}

/**
 * Individual review from a single reviewer.
 */
export interface PlanReview {
  /** Unique review ID */
  reviewId: string;

  /** Reviewer profile used */
  profile: ReviewerProfile;

  /** Overall score (0-100) */
  score: number;

  /** Detailed feedback */
  feedback: string;

  /** Suggested changes to the plan */
  suggestedChanges: PlanChange[];

  /** Whether this reviewer approves the plan */
  approved: boolean;

  /** Review timestamp */
  reviewedAt: number;

  /** Review duration (ms) */
  durationMs: number;
}

/**
 * Suggested change to a plan from a reviewer.
 */
export interface PlanChange {
  /** Type of change */
  type: "add_step" | "modify_step" | "remove_step" | "reorder" | "add_criteria";

  /** Step ID affected (if applicable) */
  stepId?: string;

  /** Description of the change */
  description: string;

  /** Priority of the change */
  priority: "critical" | "important" | "suggestion";

  /** New/modified step data (if applicable) */
  stepData?: Partial<PlanStep>;
}

/**
 * Consolidated result from all reviewers.
 */
export interface ConsolidatedReview {
  /** Plan being reviewed */
  planId: string;

  /** Individual reviews */
  reviews: PlanReview[];

  /** Aggregated score (weighted average) */
  aggregatedScore: number;

  /** Overall recommendation */
  recommendation: "approve" | "revise" | "reject";

  /** Consolidated feedback */
  consolidatedFeedback: string;

  /** All suggested changes, deduplicated and prioritized */
  prioritizedChanges: PlanChange[];

  /** Reviewers who approved */
  approvedBy: string[];

  /** Reviewers who rejected */
  rejectedBy: string[];
}

/**
 * Configuration for parallel plan reviewer.
 */
export interface ParallelPlanReviewerConfig {
  /** Default reviewer profiles */
  defaultProfiles: ReviewerProfile[];

  /** Minimum approval threshold (0-1) */
  minApprovalThreshold: number;

  /** Minimum score for approval */
  minScoreForApproval: number;

  /** Maximum parallel reviews */
  maxParallelReviews: number;

  /** Default timeout per review (ms) */
  defaultReviewTimeoutMs: number;
}

export const DEFAULT_REVIEWER_PROFILES: ReviewerProfile[] = [
  {
    id: "correctness-reviewer",
    name: "Correctness Reviewer",
    focus: "correctness",
    weight: 0.3,
    criteria: [
      "Are all steps logically ordered?",
      "Do steps have correct dependencies?",
      "Will this achieve the stated goal?",
    ],
  },
  {
    id: "security-reviewer",
    name: "Security Reviewer",
    focus: "security",
    weight: 0.25,
    criteria: [
      "Are there any security vulnerabilities?",
      "Is sensitive data handled properly?",
      "Are permissions appropriate?",
    ],
  },
  {
    id: "completeness-reviewer",
    name: "Completeness Reviewer",
    focus: "completeness",
    weight: 0.25,
    criteria: [
      "Are all necessary steps included?",
      "Is error handling considered?",
      "Are edge cases addressed?",
    ],
  },
  {
    id: "risk-reviewer",
    name: "Risk Reviewer",
    focus: "risk",
    weight: 0.2,
    criteria: [
      "Is the risk assessment accurate?",
      "Are there hidden risks?",
      "Is the plan recoverable if it fails?",
    ],
  },
];

export const DEFAULT_PARALLEL_REVIEWER_CONFIG: ParallelPlanReviewerConfig = {
  defaultProfiles: DEFAULT_REVIEWER_PROFILES,
  minApprovalThreshold: 0.5,
  minScoreForApproval: 70,
  maxParallelReviews: 4,
  defaultReviewTimeoutMs: 30_000,
};

// ============================================================================
// Agent Review Executor Interface
// ============================================================================

/**
 * Interface for executing reviews with an agent.
 * The orchestrator provides this implementation.
 */
export interface AgentReviewExecutor {
  /**
   * Execute a single review with the given profile.
   */
  executeReview(plan: ExecutionPlan, profile: ReviewerProfile): Promise<PlanReview>;
}

// ============================================================================
// Parallel Plan Reviewer
// ============================================================================

/**
 * Parallel Plan Reviewer enables multi-agent review of execution plans.
 *
 * @example
 * ```typescript
 * const reviewer = createParallelPlanReviewer();
 * reviewer.setExecutor(agentReviewExecutor);
 *
 * const result = await reviewer.submitForReview({
 *   plan,
 *   reviewerProfiles: DEFAULT_REVIEWER_PROFILES,
 *   maxParallelReviews: 4,
 *   reviewTimeoutMs: 30000,
 * });
 *
 * if (result.recommendation === "approve") {
 *   // Proceed with execution
 * }
 * ```
 */
export class ParallelPlanReviewer {
  private readonly config: ParallelPlanReviewerConfig;
  private executor?: AgentReviewExecutor;

  constructor(config: Partial<ParallelPlanReviewerConfig> = {}) {
    this.config = { ...DEFAULT_PARALLEL_REVIEWER_CONFIG, ...config };
  }

  /**
   * Set the agent executor for running reviews.
   */
  setExecutor(executor: AgentReviewExecutor): void {
    this.executor = executor;
  }

  /**
   * Submit a plan for parallel review.
   */
  async submitForReview(request: PlanReviewRequest): Promise<ConsolidatedReview> {
    const profiles =
      request.reviewerProfiles.length > 0 ? request.reviewerProfiles : this.config.defaultProfiles;

    const maxReviews = Math.min(
      request.maxParallelReviews,
      profiles.length,
      this.config.maxParallelReviews
    );

    const selectedProfiles = profiles.slice(0, maxReviews);
    const reviews = await this.executeParallelReviews(
      request.plan,
      selectedProfiles,
      request.reviewTimeoutMs
    );

    return this.consolidateReviews(request.plan.id, reviews);
  }

  /**
   * Execute reviews in parallel.
   */
  private async executeParallelReviews(
    plan: ExecutionPlan,
    profiles: ReviewerProfile[],
    timeoutMs: number
  ): Promise<PlanReview[]> {
    if (!this.executor) {
      // Return mock reviews if no executor (for testing)
      return profiles.map((profile) => this.createMockReview(plan, profile));
    }

    const executor = this.executor;

    const reviewPromises = profiles.map(async (profile) => {
      const startTime = Date.now();
      try {
        const timeoutPromise = new Promise<PlanReview>((_, reject) => {
          setTimeout(() => reject(new Error("Review timeout")), timeoutMs);
        });

        const reviewPromise = executor.executeReview(plan, profile);
        return await Promise.race([reviewPromise, timeoutPromise]);
      } catch (error) {
        // Return a failed review
        return {
          reviewId: crypto.randomUUID(),
          profile,
          score: 0,
          feedback: `Review failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          suggestedChanges: [],
          approved: false,
          reviewedAt: Date.now(),
          durationMs: Date.now() - startTime,
        };
      }
    });

    return Promise.all(reviewPromises);
  }

  /**
   * Create a mock review for testing.
   */
  private createMockReview(plan: ExecutionPlan, profile: ReviewerProfile): PlanReview {
    // Simple heuristic-based mock review
    let score = 75;
    const suggestedChanges: PlanChange[] = [];

    // Adjust score based on plan characteristics
    if (plan.steps.length === 0) {
      score -= 30;
      suggestedChanges.push({
        type: "add_step",
        description: "Plan has no steps",
        priority: "critical",
      });
    }

    if (plan.riskAssessment === "high") {
      score -= 10;
      if (profile.focus === "risk") {
        suggestedChanges.push({
          type: "add_criteria",
          description: "Add mitigation steps for high-risk plan",
          priority: "important",
        });
      }
    }

    if (plan.successCriteria.length === 0) {
      score -= 15;
      suggestedChanges.push({
        type: "add_criteria",
        description: "Add success criteria to measure completion",
        priority: "important",
      });
    }

    return {
      reviewId: crypto.randomUUID(),
      profile,
      score: Math.max(0, Math.min(100, score)),
      feedback: `Review by ${profile.name}: Plan ${score >= 70 ? "meets" : "does not meet"} ${profile.focus} standards.`,
      suggestedChanges,
      approved: score >= this.config.minScoreForApproval,
      reviewedAt: Date.now(),
      durationMs: 100,
    };
  }

  /**
   * Consolidate multiple reviews into a single result.
   */
  consolidateReviews(planId: string, reviews: PlanReview[]): ConsolidatedReview {
    // Calculate weighted average score
    let totalWeight = 0;
    let weightedScore = 0;

    for (const review of reviews) {
      totalWeight += review.profile.weight;
      weightedScore += review.score * review.profile.weight;
    }

    const aggregatedScore = totalWeight > 0 ? weightedScore / totalWeight : 0;

    // Determine approval/rejection
    const approvedBy = reviews.filter((r) => r.approved).map((r) => r.profile.name);
    const rejectedBy = reviews.filter((r) => !r.approved).map((r) => r.profile.name);
    const approvalRate = reviews.length > 0 ? approvedBy.length / reviews.length : 0;

    // Recommendation
    let recommendation: ConsolidatedReview["recommendation"];
    if (
      approvalRate >= this.config.minApprovalThreshold &&
      aggregatedScore >= this.config.minScoreForApproval
    ) {
      recommendation = "approve";
    } else if (approvalRate >= 0.25 || aggregatedScore >= 50) {
      recommendation = "revise";
    } else {
      recommendation = "reject";
    }

    // Consolidate feedback
    const consolidatedFeedback = reviews
      .map((r) => `**${r.profile.name}** (${r.score}/100): ${r.feedback}`)
      .join("\n\n");

    // Prioritize and deduplicate changes
    const allChanges = reviews.flatMap((r) => r.suggestedChanges);
    const prioritizedChanges = this.prioritizeChanges(allChanges);

    return {
      planId,
      reviews,
      aggregatedScore: Math.round(aggregatedScore),
      recommendation,
      consolidatedFeedback,
      prioritizedChanges,
      approvedBy,
      rejectedBy,
    };
  }

  /**
   * Select the best plan from multiple alternatives.
   */
  selectBestPlan(
    plans: ExecutionPlan[],
    reviewResults: Map<string, ConsolidatedReview>
  ): ExecutionPlan | null {
    if (plans.length === 0) {
      return null;
    }

    let bestPlan: ExecutionPlan | null = null;
    let bestScore = -1;

    for (const plan of plans) {
      const review = reviewResults.get(plan.id);
      if (review && review.aggregatedScore > bestScore) {
        bestScore = review.aggregatedScore;
        bestPlan = plan;
      }
    }

    return bestPlan;
  }

  /**
   * Prioritize and deduplicate suggested changes.
   */
  private prioritizeChanges(changes: PlanChange[]): PlanChange[] {
    // Sort by priority
    const priorityOrder = { critical: 0, important: 1, suggestion: 2 };
    const sorted = [...changes].sort(
      (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]
    );

    // Simple deduplication by description
    const seen = new Set<string>();
    return sorted.filter((change) => {
      const key = `${change.type}:${change.description}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a parallel plan reviewer.
 */
export function createParallelPlanReviewer(
  config?: Partial<ParallelPlanReviewerConfig>
): ParallelPlanReviewer {
  return new ParallelPlanReviewer(config);
}
