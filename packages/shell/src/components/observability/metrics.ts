export interface DashboardMetrics {
  activeRuns: number;
  totalToolCalls: number;
  avgLatencyMs: number;
  errorRate: number;
  tokenUsage: {
    input: number;
    output: number;
    cached: number;
  };
}

export type RunStatus = "running" | "completed" | "failed" | "pending";

export interface AgentRun {
  id: string;
  title: string;
  status: RunStatus;
  model?: string;
  startedAt: number;
  durationMs?: number;
  toolCalls?: number;
}

export interface MetricsUpdate {
  summary: DashboardMetrics;
  recentRuns: AgentRun[];
}

export interface MetricsClient {
  subscribe(handler: (update: MetricsUpdate) => void): () => void;
}

export function createStaticMetricsClient(update: MetricsUpdate): MetricsClient {
  return {
    subscribe: (handler) => {
      handler(update);
      return () => undefined;
    },
  };
}

export function defaultMetrics(): DashboardMetrics {
  return {
    activeRuns: 0,
    totalToolCalls: 0,
    avgLatencyMs: 0,
    errorRate: 0,
    tokenUsage: {
      input: 0,
      output: 0,
      cached: 0,
    },
  };
}

export function formatDuration(ms?: number): string {
  if (!ms || ms <= 0) {
    return "-";
  }
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}
