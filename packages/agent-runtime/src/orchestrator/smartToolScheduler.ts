import type { MCPToolCall, ToolErrorCode } from "../types";
import type { DependencyAnalyzer } from "./dependencyAnalyzer";
import { createDependencyAnalyzer } from "./dependencyAnalyzer";

export interface ToolExecutionProfile {
  name: string;
  avgDurationMs: number;
  cpuIntensive: boolean;
  networkBound: boolean;
  canParallelize: boolean;
}

export interface SmartToolSchedulerConfig {
  maxCpuConcurrent?: number;
  maxNetworkConcurrent?: number;
  maxDefaultConcurrent?: number;
  profiles?: ToolExecutionProfile[];
  adaptiveConcurrency?: boolean;
  targetLatencyMs?: number;
  minConcurrencyScale?: number;
  maxConcurrencyScale?: number;
  failureDecay?: number;
  failurePenalty?: number;
  rateLimitPenalty?: number;
  minFailureScale?: number;
}

type ConcurrencyBudget = {
  cpu: number;
  network: number;
  default: number;
};

const DEFAULT_BUDGET: ConcurrencyBudget = {
  cpu: 2,
  network: 5,
  default: 5,
};

const PROFILE_PRESETS: ToolExecutionProfile[] = [
  {
    name: "web:search",
    avgDurationMs: 2500,
    cpuIntensive: false,
    networkBound: true,
    canParallelize: true,
  },
  {
    name: "web:fetch",
    avgDurationMs: 2000,
    cpuIntensive: false,
    networkBound: true,
    canParallelize: true,
  },
  {
    name: "bash:execute",
    avgDurationMs: 3000,
    cpuIntensive: true,
    networkBound: false,
    canParallelize: false,
  },
  {
    name: "code:run",
    avgDurationMs: 2500,
    cpuIntensive: true,
    networkBound: false,
    canParallelize: false,
  },
  {
    name: "file:read",
    avgDurationMs: 120,
    cpuIntensive: false,
    networkBound: false,
    canParallelize: true,
  },
  {
    name: "file:list",
    avgDurationMs: 150,
    cpuIntensive: false,
    networkBound: false,
    canParallelize: true,
  },
  {
    name: "file:info",
    avgDurationMs: 180,
    cpuIntensive: false,
    networkBound: false,
    canParallelize: true,
  },
  {
    name: "git:status",
    avgDurationMs: 600,
    cpuIntensive: true,
    networkBound: false,
    canParallelize: false,
  },
];

const DEFAULT_PROFILE: ToolExecutionProfile = {
  name: "default",
  avgDurationMs: 1000,
  cpuIntensive: false,
  networkBound: false,
  canParallelize: true,
};

const DEFAULT_TARGET_LATENCY_MS = 2000;
const DEFAULT_MIN_CONCURRENCY_SCALE = 0.5;
const DEFAULT_MAX_CONCURRENCY_SCALE = 1.5;
const DEFAULT_FAILURE_DECAY = 0.85;
const DEFAULT_FAILURE_PENALTY = 0.25;
const DEFAULT_RATE_LIMIT_PENALTY = 0.4;
const DEFAULT_MIN_FAILURE_SCALE = 0.25;

const FAILURE_HEAVY_CODES = new Set<ToolErrorCode>(["RATE_LIMITED", "TIMEOUT"]);

export interface ToolExecutionOutcome {
  success: boolean;
  errorCode?: ToolErrorCode;
}

type BatchState = {
  calls: MCPToolCall[];
  cpuCount: number;
  networkCount: number;
  defaultCount: number;
};

export class SmartToolScheduler {
  private readonly dependencyAnalyzer: DependencyAnalyzer;
  private readonly profiles = new Map<string, ToolExecutionProfile>();
  private readonly budget: ConcurrencyBudget;
  private readonly adaptiveConcurrency: boolean;
  private readonly targetLatencyMs: number;
  private readonly minConcurrencyScale: number;
  private readonly maxConcurrencyScale: number;
  private readonly failureDecay: number;
  private readonly failurePenalty: number;
  private readonly rateLimitPenalty: number;
  private readonly minFailureScale: number;
  private readonly failureScores = new Map<string, number>();

  constructor(
    options: { config?: SmartToolSchedulerConfig; dependencyAnalyzer?: DependencyAnalyzer } = {}
  ) {
    const config = options.config ?? {};
    this.dependencyAnalyzer = options.dependencyAnalyzer ?? createDependencyAnalyzer();
    this.budget = {
      cpu: config.maxCpuConcurrent ?? DEFAULT_BUDGET.cpu,
      network: config.maxNetworkConcurrent ?? DEFAULT_BUDGET.network,
      default: config.maxDefaultConcurrent ?? DEFAULT_BUDGET.default,
    };
    this.adaptiveConcurrency = config.adaptiveConcurrency ?? true;
    this.targetLatencyMs = config.targetLatencyMs ?? DEFAULT_TARGET_LATENCY_MS;
    this.minConcurrencyScale = config.minConcurrencyScale ?? DEFAULT_MIN_CONCURRENCY_SCALE;
    this.maxConcurrencyScale = config.maxConcurrencyScale ?? DEFAULT_MAX_CONCURRENCY_SCALE;
    this.failureDecay = config.failureDecay ?? DEFAULT_FAILURE_DECAY;
    this.failurePenalty = config.failurePenalty ?? DEFAULT_FAILURE_PENALTY;
    this.rateLimitPenalty = config.rateLimitPenalty ?? DEFAULT_RATE_LIMIT_PENALTY;
    this.minFailureScale = config.minFailureScale ?? DEFAULT_MIN_FAILURE_SCALE;

    const mergedProfiles = [...PROFILE_PRESETS, ...(config.profiles ?? [])];
    for (const profile of mergedProfiles) {
      this.profiles.set(profile.name, profile);
    }
  }

  schedule(calls: MCPToolCall[]): MCPToolCall[][] {
    if (calls.length <= 1) {
      return calls.length === 0 ? [] : [calls];
    }
    const analysis = this.dependencyAnalyzer.analyze(calls);
    return this.scheduleGroups(analysis.groups);
  }

  scheduleGroups(groups: MCPToolCall[][]): MCPToolCall[][] {
    const scheduled: MCPToolCall[][] = [];

    for (const group of groups) {
      if (group.length <= 1) {
        if (group.length === 1) {
          scheduled.push(group);
        }
        continue;
      }

      const sorted = [...group].sort((a, b) => {
        const aProfile = this.getProfile(a.name);
        const bProfile = this.getProfile(b.name);
        return aProfile.avgDurationMs - bProfile.avgDurationMs;
      });

      const batches = this.buildBatches(sorted);
      scheduled.push(...batches);
    }

    return scheduled;
  }

  recordExecution(toolName: string, durationMs: number): void {
    const profile = this.getProfile(toolName);
    const next = durationMs * 0.2 + profile.avgDurationMs * 0.8;
    this.profiles.set(toolName, { ...profile, avgDurationMs: Math.max(10, next) });
  }

  recordResult(toolName: string, durationMs: number, outcome: ToolExecutionOutcome): void {
    this.recordExecution(toolName, durationMs);
    this.updateFailureScore(toolName, outcome);
  }

  recommendConcurrency(calls: MCPToolCall[], baseConcurrency: number): number {
    if (!this.adaptiveConcurrency || calls.length === 0) {
      return baseConcurrency;
    }

    const profiles = calls.map((call) => this.getProfile(call.name));
    const avgDuration =
      profiles.reduce((sum, profile) => sum + profile.avgDurationMs, 0) / profiles.length;

    let scale = 1;
    if (avgDuration > this.targetLatencyMs) {
      scale = Math.max(this.minConcurrencyScale, this.targetLatencyMs / avgDuration);
    } else if (avgDuration < this.targetLatencyMs * 0.5) {
      scale = Math.min(this.maxConcurrencyScale, this.targetLatencyMs / avgDuration);
    }

    const cpuHeavyRatio =
      profiles.filter((profile) => profile.cpuIntensive).length / profiles.length;
    if (cpuHeavyRatio > 0.5) {
      scale *= 0.8;
    }

    scale *= this.resolveFailureScale(calls);

    return Math.max(1, Math.min(baseConcurrency, Math.round(baseConcurrency * scale)));
  }

  private buildBatches(calls: MCPToolCall[]): MCPToolCall[][] {
    const batches: BatchState[] = [];

    let current: BatchState = {
      calls: [],
      cpuCount: 0,
      networkCount: 0,
      defaultCount: 0,
    };

    for (const call of calls) {
      const profile = this.getProfile(call.name);
      if (!profile.canParallelize) {
        if (current.calls.length > 0) {
          batches.push(current);
          current = createEmptyBatch();
        }
        batches.push({ calls: [call], cpuCount: 0, networkCount: 0, defaultCount: 0 });
        continue;
      }

      if (!this.canFit(current, profile)) {
        if (current.calls.length > 0) {
          batches.push(current);
        }
        current = createEmptyBatch();
      }

      current.calls.push(call);
      this.incrementBatch(current, profile);
    }

    if (current.calls.length > 0) {
      batches.push(current);
    }

    return batches.map((batch) => batch.calls);
  }

  private getProfile(toolName: string): ToolExecutionProfile {
    return this.profiles.get(toolName) ?? { ...DEFAULT_PROFILE, name: toolName };
  }

  private canFit(batch: BatchState, profile: ToolExecutionProfile): boolean {
    if (profile.networkBound) {
      return batch.networkCount + 1 <= this.budget.network;
    }
    if (profile.cpuIntensive) {
      return batch.cpuCount + 1 <= this.budget.cpu;
    }
    return batch.defaultCount + 1 <= this.budget.default;
  }

  private incrementBatch(batch: BatchState, profile: ToolExecutionProfile): void {
    if (profile.networkBound) {
      batch.networkCount += 1;
      return;
    }
    if (profile.cpuIntensive) {
      batch.cpuCount += 1;
      return;
    }
    batch.defaultCount += 1;
  }

  private updateFailureScore(toolName: string, outcome: ToolExecutionOutcome): void {
    const current = this.failureScores.get(toolName) ?? 0;
    if (outcome.success) {
      this.failureScores.set(toolName, current * this.failureDecay);
      return;
    }

    const penalty =
      outcome.errorCode && FAILURE_HEAVY_CODES.has(outcome.errorCode)
        ? this.rateLimitPenalty
        : this.failurePenalty;
    const next = Math.min(1, current * this.failureDecay + penalty);
    this.failureScores.set(toolName, next);
  }

  private resolveFailureScale(calls: MCPToolCall[]): number {
    let maxScore = 0;
    for (const call of calls) {
      const score = this.failureScores.get(call.name) ?? 0;
      if (score > maxScore) {
        maxScore = score;
      }
    }
    if (maxScore <= 0) {
      return 1;
    }
    return Math.max(this.minFailureScale, 1 - maxScore);
  }
}

function createEmptyBatch(): BatchState {
  return {
    calls: [],
    cpuCount: 0,
    networkCount: 0,
    defaultCount: 0,
  };
}
