"use client";

import { cn } from "@ku0/shared/utils";
import * as React from "react";
import { Badge } from "../ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/Card";
import { LoadingState } from "../ui/LoadingState";
import {
  type AgentRun,
  type DashboardMetrics,
  defaultMetrics,
  formatDuration,
  formatPercent,
  type MetricsClient,
} from "./metrics";

export interface ObservabilityDashboardProps {
  client?: MetricsClient;
  initialMetrics?: DashboardMetrics;
  initialRuns?: AgentRun[];
}

export function ObservabilityDashboard({
  client,
  initialMetrics,
  initialRuns,
}: ObservabilityDashboardProps) {
  const [metrics, setMetrics] = React.useState<DashboardMetrics | null>(initialMetrics ?? null);
  const [runs, setRuns] = React.useState<AgentRun[]>(initialRuns ?? []);

  React.useEffect(() => {
    if (!client) {
      return undefined;
    }

    const unsubscribe = client.subscribe((update) => {
      setMetrics(update.summary);
      setRuns(update.recentRuns);
    });

    return unsubscribe;
  }, [client]);

  const summary = metrics ?? defaultMetrics();
  const isLoading = !metrics && runs.length === 0;

  if (isLoading) {
    return <LoadingState variant="skeleton" message="Loading observability" />;
  }

  return (
    <section className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Active Runs" value={summary.activeRuns} trend="neutral" />
        <MetricCard title="Tool Calls" value={summary.totalToolCalls} trend="up" />
        <MetricCard title="Avg Latency" value={`${summary.avgLatencyMs}ms`} trend="down" />
        <MetricCard
          title="Error Rate"
          value={formatPercent(summary.errorRate)}
          trend={summary.errorRate > 0.01 ? "alert" : "down"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card variant="elevated">
          <CardHeader>
            <CardTitle>Recent Runs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <RunTimeline runs={runs} />
          </CardContent>
        </Card>

        <Card variant="elevated">
          <CardHeader>
            <CardTitle>Token Usage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <UsageRow label="Input" value={summary.tokenUsage.input} />
            <UsageRow label="Output" value={summary.tokenUsage.output} />
            <UsageRow label="Cached" value={summary.tokenUsage.cached} />
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function MetricCard({
  title,
  value,
  trend,
}: {
  title: string;
  value: string | number;
  trend: "up" | "down" | "neutral" | "alert";
}) {
  const badgeVariant = trend === "up" ? "success" : trend === "alert" ? "destructive" : "secondary";

  return (
    <Card variant="elevated" padding="sm">
      <CardHeader className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{title}</span>
          <Badge variant={badgeVariant}>{trend.toUpperCase()}</Badge>
        </div>
        <CardTitle className="text-2xl font-semibold">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function RunTimeline({ runs }: { runs: AgentRun[] }) {
  if (runs.length === 0) {
    return <p className="text-sm text-muted-foreground">No recent runs.</p>;
  }

  return (
    <div className="space-y-3">
      {runs.map((run) => (
        <div
          key={run.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/50 bg-surface-2 px-4 py-3"
        >
          <div className="space-y-1">
            <div className="text-sm font-medium text-foreground">{run.title}</div>
            <div className="text-xs text-muted-foreground">
              {run.model ?? "default model"} · {formatDuration(run.durationMs)}
            </div>
          </div>
          <RunStatus status={run.status} toolCalls={run.toolCalls} />
        </div>
      ))}
    </div>
  );
}

function RunStatus({ status, toolCalls }: { status: AgentRun["status"]; toolCalls?: number }) {
  const statusStyle =
    status === "completed"
      ? "bg-success/15 text-success"
      : status === "failed"
        ? "bg-destructive/15 text-destructive"
        : status === "running"
          ? "bg-primary/15 text-primary"
          : "bg-muted text-muted-foreground";

  return (
    <div className="flex items-center gap-3">
      <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", statusStyle)}>
        {status.toUpperCase()}
      </span>
      <span className="text-xs text-muted-foreground">{toolCalls ?? 0} tool calls</span>
    </div>
  );
}

function UsageRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span>{label}</span>
      <span className="font-medium text-foreground">{value.toLocaleString()}</span>
    </div>
  );
}
