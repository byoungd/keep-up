"use client";

import { cn } from "@ku0/shared/utils";
import { AlertCircle, CheckCircle2, ChevronRight, Loader2 } from "lucide-react";
import * as React from "react";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
  type ToolState,
} from "../ai-elements/tool";

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
        className="group flex w-full items-center justify-between px-2 py-1.5 text-xs font-medium text-muted-foreground/80 hover:text-foreground transition-colors duration-fast rounded-md hover:bg-surface-2/50"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-1.5">
          <ChevronRight
            className={cn(
              "h-3.5 w-3.5 opacity-70 group-hover:opacity-100 transition-all duration-fast",
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
        <div className="pl-4 ml-2.5 border-l border-border/40 space-y-1.5 py-2 animate-in fade-in slide-in-from-top-1 duration-normal">
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
  const toolState = STEP_STATUS_TO_TOOL_STATE[step.status];
  const errorText = step.result?.error
    ? step.result.error.code
      ? `${step.result.error.code}: ${step.result.error.message}`
      : step.result.error.message
    : undefined;

  const outputText = React.useMemo(() => {
    if (!step.result?.content?.length) {
      return undefined;
    }
    const parts = step.result.content
      .map((entry) => {
        if (entry.type === "text") {
          return entry.text ?? "";
        }
        try {
          return JSON.stringify(entry);
        } catch {
          return "";
        }
      })
      .filter((value) => value);
    return parts.length > 0 ? parts.join("\n") : undefined;
  }, [step.result?.content]);

  const metaItems = React.useMemo(() => {
    const items: string[] = [];
    if (step.durationMs !== undefined) {
      items.push(`${step.durationMs}ms`);
    }
    if (step.parallel) {
      items.push("parallel");
    }
    return items;
  }, [step.durationMs, step.parallel]);

  return (
    <Tool
      defaultOpen={step.status === "executing" || step.status === "error"}
      className={cn(
        "border-border/30 bg-surface-1/50",
        step.status === "executing" && "border-primary/20 bg-primary/5"
      )}
    >
      <ToolHeader type="dynamic-tool" toolName={step.toolName} state={toolState} />
      {metaItems.length > 0 && (
        <div className="mt-2 text-micro text-muted-foreground/80">{metaItems.join(" • ")}</div>
      )}
      <ToolContent>
        <ToolInput input={step.arguments} />
        <ToolOutput output={outputText} errorText={errorText} />
      </ToolContent>
    </Tool>
  );
}

const STEP_STATUS_TO_TOOL_STATE: Record<ExecutionStep["status"], ToolState> = {
  pending: "input-streaming",
  executing: "input-available",
  success: "output-available",
  error: "output-error",
};
