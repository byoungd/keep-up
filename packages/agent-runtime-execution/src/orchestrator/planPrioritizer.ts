/**
 * Plan Prioritizer
 *
 * Dynamic plan step prioritization with cost estimation and critical path detection.
 * Improves execution efficiency by optimally ordering steps based on:
 * - Dependencies (topological sort)
 * - Estimated cost/duration
 * - Parallelizability
 * - Critical path analysis
 */

import type { ExecutionPlan, PlanStep } from "@ku0/agent-runtime-core";

// ============================================================================
// Types
// ============================================================================

/**
 * Priority metadata for a plan step.
 */
export interface PlanStepPriority {
  /** Step ID */
  stepId: string;
  /** Priority score (0-100, higher = more urgent) */
  priority: number;
  /** Estimated cost in milliseconds */
  estimatedCostMs: number;
  /** Step dependencies (step IDs) */
  dependencies: string[];
  /** Whether this step is on the critical path */
  criticalPath: boolean;
  /** Earliest possible start time (based on dependencies) */
  earliestStartMs: number;
  /** Latest start time without delaying completion */
  latestStartMs: number;
  /** Slack time (latestStart - earliestStart) */
  slackMs: number;
}

/**
 * Plan prioritization result.
 */
export interface PrioritizationResult {
  /** Prioritized steps in execution order */
  orderedSteps: PlanStep[];
  /** Priority metadata for each step */
  priorities: Map<string, PlanStepPriority>;
  /** Critical path step IDs */
  criticalPath: string[];
  /** Estimated total duration (sequential) */
  estimatedTotalMs: number;
  /** Estimated duration with parallelism */
  estimatedParallelMs: number;
}

/**
 * Configuration for the prioritizer.
 */
export interface PlanPrioritizerConfig {
  /** Default step duration if not specified (ms) */
  defaultStepDurationMs: number;
  /** Weight for critical path in priority calculation */
  criticalPathWeight: number;
  /** Weight for dependency count in priority */
  dependencyWeight: number;
  /** Weight for parallelizability */
  parallelWeight: number;
}

const DEFAULT_CONFIG: PlanPrioritizerConfig = {
  defaultStepDurationMs: 5000,
  criticalPathWeight: 30,
  dependencyWeight: 20,
  parallelWeight: 10,
};

// ============================================================================
// Plan Prioritizer
// ============================================================================

/**
 * Plan Prioritizer class.
 *
 * Analyzes execution plans to determine optimal step ordering
 * using topological sort and critical path method (CPM).
 */
export class PlanPrioritizer {
  private readonly config: PlanPrioritizerConfig;

  constructor(config: Partial<PlanPrioritizerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Prioritize plan steps for optimal execution.
   */
  prioritize(plan: ExecutionPlan): PrioritizationResult {
    const steps = plan.steps;

    // Build dependency graph
    const { graph, inDegree, stepMap } = this.buildDependencyGraph(steps);

    // Topological sort with priority
    const sortedSteps = this.topologicalSort(steps, graph, inDegree, stepMap);

    // Calculate critical path
    const { priorities, criticalPath } = this.calculateCriticalPath(sortedSteps, stepMap);

    // Calculate final priorities
    this.assignPriorityScores(priorities, sortedSteps.length);

    // Estimate durations
    const estimatedTotalMs = this.calculateSequentialDuration(priorities);
    const estimatedParallelMs = this.calculateParallelDuration(priorities, graph);

    return {
      orderedSteps: sortedSteps,
      priorities,
      criticalPath,
      estimatedTotalMs,
      estimatedParallelMs,
    };
  }

  /**
   * Reorder steps based on new priority information.
   */
  reorderSteps(steps: PlanStep[], priorities: Map<string, PlanStepPriority>): PlanStep[] {
    return [...steps].sort((a, b) => {
      const pa = priorities.get(a.id);
      const pb = priorities.get(b.id);
      if (!pa || !pb) {
        return 0;
      }

      // First, respect dependencies (earlier start = first)
      if (pa.earliestStartMs !== pb.earliestStartMs) {
        return pa.earliestStartMs - pb.earliestStartMs;
      }

      // Then, critical path steps first
      if (pa.criticalPath !== pb.criticalPath) {
        return pa.criticalPath ? -1 : 1;
      }

      // Then, higher priority first
      return pb.priority - pa.priority;
    });
  }

  /**
   * Get parallel execution groups.
   * Returns groups of steps that can execute in parallel.
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: algorithm requires nested loops
  getParallelGroups(steps: PlanStep[], _priorities: Map<string, PlanStepPriority>): PlanStep[][] {
    const groups: PlanStep[][] = [];
    const completed = new Set<string>();
    const remaining = new Set(steps.map((s) => s.id));

    while (remaining.size > 0) {
      const group: PlanStep[] = [];

      for (const step of steps) {
        if (!remaining.has(step.id)) {
          continue;
        }

        // Check if all dependencies are completed
        const deps = step.dependencies ?? [];
        const depsCompleted = deps.every((d) => completed.has(d));

        if (depsCompleted && step.parallelizable) {
          group.push(step);
        } else if (depsCompleted && group.length === 0) {
          // Non-parallelizable step runs alone
          group.push(step);
          break;
        }
      }

      if (group.length === 0) {
        // Should not happen with valid dependency graph
        break;
      }

      for (const step of group) {
        remaining.delete(step.id);
        completed.add(step.id);
      }

      groups.push(group);
    }

    return groups;
  }

  // --------------------------------------------------------------------------
  // Private Methods
  // --------------------------------------------------------------------------

  private buildDependencyGraph(steps: PlanStep[]): {
    graph: Map<string, string[]>;
    inDegree: Map<string, number>;
    stepMap: Map<string, PlanStep>;
  } {
    const graph = new Map<string, string[]>();
    const inDegree = new Map<string, number>();
    const stepMap = new Map<string, PlanStep>();

    for (const step of steps) {
      stepMap.set(step.id, step);
      graph.set(step.id, []);
      inDegree.set(step.id, 0);
    }

    for (const step of steps) {
      const deps = step.dependencies ?? [];
      for (const dep of deps) {
        if (graph.has(dep)) {
          graph.get(dep)?.push(step.id);
          inDegree.set(step.id, (inDegree.get(step.id) ?? 0) + 1);
        }
      }
    }

    return { graph, inDegree, stepMap };
  }

  private topologicalSort(
    _steps: PlanStep[],
    graph: Map<string, string[]>,
    inDegree: Map<string, number>,
    stepMap: Map<string, PlanStep>
  ): PlanStep[] {
    const result: PlanStep[] = [];
    const queue: string[] = [];

    // Start with nodes that have no dependencies
    for (const [id, degree] of inDegree) {
      if (degree === 0) {
        queue.push(id);
      }
    }

    // Sort queue by original order for stability
    queue.sort((a, b) => {
      const stepA = stepMap.get(a);
      const stepB = stepMap.get(b);
      return (stepA?.order ?? 0) - (stepB?.order ?? 0);
    });

    while (queue.length > 0) {
      const id = queue.shift();
      if (!id) {
        break;
      }

      const step = stepMap.get(id);
      if (step) {
        result.push(step);
      }

      for (const neighbor of graph.get(id) ?? []) {
        const newDegree = (inDegree.get(neighbor) ?? 0) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) {
          queue.push(neighbor);
          // Maintain order
          queue.sort((a, b) => {
            const stepA = stepMap.get(a);
            const stepB = stepMap.get(b);
            return (stepA?.order ?? 0) - (stepB?.order ?? 0);
          });
        }
      }
    }

    return result;
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Critical Path Method requires forward/backward passes
  private calculateCriticalPath(
    sortedSteps: PlanStep[],
    stepMap: Map<string, PlanStep>
  ): {
    priorities: Map<string, PlanStepPriority>;
    criticalPath: string[];
  } {
    const priorities = new Map<string, PlanStepPriority>();
    const earliest = new Map<string, number>();
    const latest = new Map<string, number>();

    // Forward pass: calculate earliest start times
    for (const step of sortedSteps) {
      const deps = step.dependencies ?? [];
      let earliestStart = 0;

      for (const dep of deps) {
        const depStep = stepMap.get(dep);
        const depEnd =
          (earliest.get(dep) ?? 0) +
          (depStep?.estimatedDuration ?? this.config.defaultStepDurationMs);
        earliestStart = Math.max(earliestStart, depEnd);
      }

      earliest.set(step.id, earliestStart);
    }

    // Calculate total duration
    let totalDuration = 0;
    for (const step of sortedSteps) {
      const start = earliest.get(step.id) ?? 0;
      const duration = step.estimatedDuration ?? this.config.defaultStepDurationMs;
      totalDuration = Math.max(totalDuration, start + duration);
    }

    // Backward pass: calculate latest start times
    for (let i = sortedSteps.length - 1; i >= 0; i--) {
      const step = sortedSteps[i];
      const duration = step.estimatedDuration ?? this.config.defaultStepDurationMs;

      // Find dependents
      let latestStart = totalDuration - duration;
      for (const otherStep of sortedSteps) {
        if (otherStep.dependencies?.includes(step.id)) {
          const otherLatestStart = latest.get(otherStep.id) ?? totalDuration;
          latestStart = Math.min(latestStart, otherLatestStart - duration);
        }
      }

      latest.set(step.id, latestStart);
    }

    // Identify critical path (slack = 0)
    const criticalPath: string[] = [];
    for (const step of sortedSteps) {
      const earliestStart = earliest.get(step.id) ?? 0;
      const latestStart = latest.get(step.id) ?? 0;
      const slack = latestStart - earliestStart;
      const isCritical = slack === 0;

      if (isCritical) {
        criticalPath.push(step.id);
      }

      priorities.set(step.id, {
        stepId: step.id,
        priority: 0, // Will be assigned later
        estimatedCostMs: step.estimatedDuration ?? this.config.defaultStepDurationMs,
        dependencies: step.dependencies ?? [],
        criticalPath: isCritical,
        earliestStartMs: earliestStart,
        latestStartMs: latestStart,
        slackMs: slack,
      });
    }

    return { priorities, criticalPath };
  }

  private assignPriorityScores(
    priorities: Map<string, PlanStepPriority>,
    _totalSteps: number
  ): void {
    for (const p of priorities.values()) {
      let score = 50; // Base score

      // Critical path bonus
      if (p.criticalPath) {
        score += this.config.criticalPathWeight;
      }

      // Less slack = higher priority
      const maxSlack = p.slackMs;
      if (maxSlack === 0) {
        score += 10;
      } else if (maxSlack < 5000) {
        score += 5;
      }

      // More dependents = higher priority
      score += Math.min(p.dependencies.length * 2, this.config.dependencyWeight);

      p.priority = Math.min(100, Math.max(0, score));
    }
  }

  private calculateSequentialDuration(priorities: Map<string, PlanStepPriority>): number {
    let total = 0;
    for (const p of priorities.values()) {
      total += p.estimatedCostMs;
    }
    return total;
  }

  private calculateParallelDuration(
    priorities: Map<string, PlanStepPriority>,
    _graph: Map<string, string[]>
  ): number {
    // Find the maximum end time (earliest start + duration)
    let maxEnd = 0;
    for (const p of priorities.values()) {
      const endTime = p.earliestStartMs + p.estimatedCostMs;
      maxEnd = Math.max(maxEnd, endTime);
    }
    return maxEnd;
  }
}

/**
 * Create a plan prioritizer instance.
 */
export function createPlanPrioritizer(config?: Partial<PlanPrioritizerConfig>): PlanPrioritizer {
  return new PlanPrioritizer(config);
}
