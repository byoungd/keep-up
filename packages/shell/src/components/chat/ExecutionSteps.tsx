"use client";

import { cn } from "@ku0/shared/utils";
import { AlertCircle, CheckCircle2, ChevronRight, Clock, Loader2 } from "lucide-react";
import * as React from "react";

export interface ExecutionStep {
  id: string;
  toolName: string;
  arguments: Record<string, unknown>;
  status: "pending" | "executing" | "success" | "error";
  result?: {
    success: boolean;
    content: Array<{ type: string; text?: string }>;
    error?: { code: string; message: string };
  };
  startTime: number;
  endTime?: number;
  durationMs?: number;
  parallel?: boolean;
}

export interface ExecutionStepsProps {
  steps: ExecutionStep[];
  className?: string;
  defaultExpanded?: boolean;
}

/**
 * Visualize agent execution flow with tool calls and results.
 * Shows timeline of steps with status indicators.
 */
export function ExecutionSteps({ steps, className, defaultExpanded = false }: ExecutionStepsProps) {
  const [expanded, setExpanded] = React.useState(defaultExpanded);

  if (steps.length === 0) {
    return null;
  }

  return (
    <div className={cn("mt-2 ml-1", className)}>
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="group flex w-full items-center justify-between px-2 py-1.5 text-xs font-medium text-muted-foreground/80 hover:text-foreground transition-colors rounded-md hover:bg-surface-2/50"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-1.5">
          <ChevronRight
            className={cn(
              "h-3.5 w-3.5 opacity-70 group-hover:opacity-100 transition-all",
              expanded && "rotate-90"
            )}
            aria-hidden="true"
          />
          <span className="opacity-90">Used Tools</span>
          {!expanded && <StepsSummary steps={steps} />}
        </div>
      </button>

      {/* Steps List */}
      {expanded && (
        <div className="pl-4 ml-2.5 border-l border-border/40 space-y-1.5 py-2 animate-in fade-in slide-in-from-top-1 duration-200">
          {steps.map((step) => (
            <StepItem key={step.id} step={step} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Summary of steps (status counts).
 */
function StepsSummary({ steps }: { steps: ExecutionStep[] }) {
  const statusCounts = steps.reduce(
    (acc, step) => {
      acc[step.status]++;
      return acc;
    },
    { pending: 0, executing: 0, success: 0, error: 0 } as Record<ExecutionStep["status"], number>
  );

  return (
    <div className="flex items-center gap-2 text-micro">
      {statusCounts.success > 0 && (
        <span className="flex items-center gap-1 text-success">
          <CheckCircle2 className="h-2.5 w-2.5" />
          {statusCounts.success}
        </span>
      )}
      {statusCounts.executing > 0 && (
        <span className="flex items-center gap-1 text-primary">
          <Loader2 className="h-2.5 w-2.5 animate-spin" />
          {statusCounts.executing}
        </span>
      )}
      {statusCounts.error > 0 && (
        <span className="flex items-center gap-1 text-destructive">
          <AlertCircle className="h-2.5 w-2.5" />
          {statusCounts.error}
        </span>
      )}
    </div>
  );
}

/**
 * Individual step item.
 */
function StepItem({ step }: { step: ExecutionStep }) {
  const [showDetails, setShowDetails] = React.useState(false);

  const status = step.status;
  const StatusIcon = (
    {
      pending: Clock,
      executing: Loader2,
      success: CheckCircle2,
      error: AlertCircle,
    } as const
  )[status];

  const statusColor = (
    {
      pending: "text-muted-foreground",
      executing: "text-primary",
      success: "text-success",
      error: "text-destructive",
    } as const
  )[status];

  return (
    <div
      className={cn(
        "rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-surface-2/40 border border-transparent hover:border-border/30",
        status === "executing" && "bg-primary/5 border-primary/10"
      )}
    >
      {/* Step Header */}
      <button
        type="button"
        onClick={() => setShowDetails(!showDetails)}
        className="flex w-full items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <StatusIcon
            className={cn(
              "h-3.5 w-3.5",
              statusColor,
              step.status === "executing" && "animate-spin"
            )}
            aria-hidden="true"
          />
          <span className="font-medium">{step.toolName}</span>
          {step.parallel && (
            <span className="rounded bg-primary/20 px-1 py-0.5 text-tiny text-primary">
              parallel
            </span>
          )}
        </div>
        {step.durationMs !== undefined && (
          <span className="text-muted-foreground text-micro">{step.durationMs}ms</span>
        )}
      </button>

      {/* Step Details */}
      {showDetails && (
        <div className="mt-2 space-y-2 text-fine">
          {/* Arguments */}
          {Object.keys(step.arguments).length > 0 && (
            <div>
              <div className="font-medium text-muted-foreground mb-1">Arguments:</div>
              <pre className="rounded bg-surface-3/50 p-1.5 overflow-x-auto">
                {JSON.stringify(step.arguments, null, 2)}
              </pre>
            </div>
          )}

          {/* Result */}
          {step.result && (
            <div>
              <div className="font-medium text-muted-foreground mb-1">Result:</div>
              <div className="rounded bg-surface-3/50 p-1.5 space-y-1">
                {step.result.content.map(
                  (content: { type: string; text?: string }, idx: number) => (
                    <div key={`${step.id}-result-${idx}-${content.type}`}>
                      {content.type === "text" && (
                        <div className="text-foreground">{content.text}</div>
                      )}
                    </div>
                  )
                )}
                {step.result.error && (
                  <div className="text-destructive">Error: {step.result.error.message}</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
