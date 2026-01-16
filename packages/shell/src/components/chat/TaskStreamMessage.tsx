"use client";

import { cn } from "@ku0/shared/utils";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileDiff,
  FileText,
  Globe,
  Image as ImageIcon,
  Lightbulb,
  Link as LinkIcon,
  Loader2,
  Terminal,
} from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import type { AgentTask, ArtifactItem, TaskStep } from "./types";

interface TaskStreamMessageProps {
  task: AgentTask;
  onPreview?: (artifact: ArtifactItem) => void;
}

export function TaskStreamMessage({ task, onPreview }: TaskStreamMessageProps) {
  const defaultExpanded = task.status === "running" || task.status === "queued";
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [collapsedSteps, setCollapsedSteps] = useState<Record<string, boolean>>({});
  const steps = task.steps ?? [];
  const thoughts = task.thoughts ?? [];
  const resolvedSteps = steps.length > 0 ? steps : [buildFallbackStep(task.status, task.id)];
  const totalSteps = resolvedSteps.length;
  const completedSteps = resolvedSteps.filter((step) => step.status === "completed").length;
  const progressLabel = totalSteps > 0 ? `${completedSteps}/${totalSteps}` : "";
  const actions = useMemo(() => parseActions(thoughts, task.id), [thoughts, task.id]);
  const actionsByStep = useMemo(
    () => assignActionsToSteps(resolvedSteps, actions),
    [resolvedSteps, actions]
  );
  const deliverables = useMemo(
    () => task.artifacts.filter((artifact) => artifact.type !== "plan"),
    [task.artifacts]
  );
  const report = deliverables.find((artifact) => artifact.type === "report");
  const otherArtifacts = deliverables.filter((artifact) => artifact.type !== "report");
  const statusMeta = getStatusMeta(task.status);
  const summaryText = task.description || task.goal || statusMeta.summary;

  return (
    <div className="w-full max-w-[90%] md:max-w-2xl my-2">
      <div className="rounded-2xl border border-border/40 bg-surface-1/80 shadow-sm overflow-hidden">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-4 px-4 py-3 bg-surface-2/30 hover:bg-surface-2/60 transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
          onClick={() => setIsExpanded(!isExpanded)}
          aria-expanded={isExpanded}
          aria-label="Toggle task details"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-8 w-8 rounded-full border border-border/50 bg-surface-2/60 text-muted-foreground flex items-center justify-center">
              <Lightbulb className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground truncate">
                {task.label || "Executing Task"}
              </div>
              <div className="text-[11px] text-muted-foreground">{statusMeta.subLabel}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span
              className={cn(
                "inline-flex items-center gap-1 px-2 py-1 rounded-full border",
                statusMeta.badgeClass
              )}
            >
              {statusMeta.icon}
              {statusMeta.label}
            </span>
            {progressLabel && (
              <span className="tabular-nums text-[11px] text-muted-foreground/80">
                {progressLabel}
              </span>
            )}
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            )}
          </div>
        </button>

        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div className="px-4 pb-4 space-y-4">
                {summaryText && (
                  <div className="text-xs text-muted-foreground leading-relaxed">{summaryText}</div>
                )}

                <section className="relative pl-6">
                  <div className="space-y-3">
                    {resolvedSteps.map((step, index) => {
                      const isCollapsed = collapsedSteps[step.id] ?? false;
                      const stepActions = actionsByStep.get(step.id) ?? [];
                      return (
                        <StepItem
                          key={step.id}
                          step={step}
                          isLast={index === resolvedSteps.length - 1}
                          isCollapsed={isCollapsed}
                          onToggle={() =>
                            setCollapsedSteps((prev) => ({
                              ...prev,
                              [step.id]: !isCollapsed,
                            }))
                          }
                          actions={stepActions}
                          artifacts={task.artifacts?.filter((a) => a.stepId === step.id)}
                          onPreview={onPreview}
                        />
                      );
                    })}
                  </div>
                </section>

                {deliverables.length > 0 && (
                  <section className="space-y-2">
                    <div className="text-[11px] uppercase tracking-widest text-muted-foreground/70">
                      Deliverables
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                      {report && <DeliverableCard artifact={report} onPreview={onPreview} />}
                      {otherArtifacts.map((artifact) => (
                        <DeliverableCard
                          key={artifact.id}
                          artifact={artifact}
                          onPreview={onPreview}
                        />
                      ))}
                    </div>
                  </section>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function StepStatusIcon({ status }: { status: TaskStep["status"] }) {
  const isActive = status === "running";
  const isCompleted = status === "completed";
  const isFailed = status === "failed";

  return (
    <div
      className={cn(
        "mt-1 h-4 w-4 rounded-full border flex items-center justify-center bg-surface-1",
        isActive
          ? "border-primary text-primary"
          : isCompleted
            ? "border-emerald-500 text-emerald-500"
            : isFailed
              ? "border-red-500 text-red-500"
              : "border-border text-muted-foreground"
      )}
    >
      {isActive ? (
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
      ) : isCompleted ? (
        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
      ) : (
        <span className="h-2 w-2 rounded-full bg-current" aria-hidden="true" />
      )}
    </div>
  );
}

function StepItem({
  step,
  isLast,
  isCollapsed,
  onToggle,
  actions,
  artifacts,
  onPreview,
}: {
  step: TaskStep;
  isLast: boolean;
  isCollapsed: boolean;
  onToggle: () => void;
  actions: ActionItem[];
  artifacts?: ArtifactItem[];
  onPreview?: (artifact: ArtifactItem) => void;
}) {
  const isActive = step.status === "running";
  const isCompleted = step.status === "completed";

  return (
    <div className="relative">
      {!isLast && <div className="absolute left-[7px] top-4 bottom-0 w-px bg-border/40" />}
      <div className="flex items-start gap-3">
        <StepStatusIcon status={step.status} />

        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onToggle}
            className="flex w-full items-start justify-between gap-3 text-left"
          >
            <span
              className={cn(
                "text-sm font-medium leading-relaxed",
                isActive
                  ? "text-foreground"
                  : isCompleted
                    ? "text-foreground/80"
                    : "text-muted-foreground"
              )}
            >
              {step.label}
            </span>
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>

          {!isCollapsed && (
            <div className="mt-2 space-y-2">
              {actions.length > 0 && (
                <div className="space-y-2">
                  {actions.map((action) => (
                    <div
                      key={action.id}
                      className="flex items-center gap-2 rounded-xl border border-border/40 bg-surface-2/50 px-3 py-2 text-xs text-muted-foreground"
                    >
                      {action.icon}
                      <span className="leading-relaxed">{action.label}</span>
                    </div>
                  ))}
                </div>
              )}

              {actions.length === 0 && isActive && (
                <div className="text-xs text-muted-foreground/80 italic">Working...</div>
              )}

              {artifacts && artifacts.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {artifacts.map((art) => (
                    <button
                      key={art.id}
                      onClick={() => onPreview?.(art)}
                      type="button"
                      className="inline-flex items-center gap-2 rounded-full border border-border/40 bg-surface-1/70 px-3 py-1 text-[11px] text-muted-foreground hover:bg-surface-2 transition-colors"
                    >
                      <FileText className="h-3 w-3" aria-hidden="true" />
                      <span className="truncate max-w-[180px]">{art.title}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DeliverableCard({
  artifact,
  onPreview,
}: {
  artifact: ArtifactItem;
  onPreview?: (artifact: ArtifactItem) => void;
}) {
  const Icon = getArtifactIcon(artifact.type);
  const preview =
    artifact.content && artifact.content.length > 0 ? artifact.content.slice(0, 160) : undefined;

  return (
    <button
      type="button"
      onClick={() => onPreview?.(artifact)}
      className="flex items-start gap-3 rounded-xl border border-border/50 bg-surface-1/70 px-3 py-2 text-left hover:bg-surface-2 transition-colors"
    >
      <div className="h-9 w-9 rounded-lg bg-surface-2 flex items-center justify-center text-muted-foreground">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="text-sm font-medium text-foreground truncate">
          {artifact.title || "Untitled"}
        </div>
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {artifact.type}
        </div>
        {preview && (
          <div className="text-xs text-muted-foreground/80 max-h-[3.6em] overflow-hidden">
            {preview}
          </div>
        )}
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground/70 shrink-0" aria-hidden="true" />
    </button>
  );
}

function getArtifactIcon(type: ArtifactItem["type"]) {
  switch (type) {
    case "image":
      return ImageIcon;
    case "link":
      return LinkIcon;
    case "code":
      return Terminal;
    case "diff":
      return FileDiff;
    default:
      return FileText;
  }
}

function getStatusMeta(status: AgentTask["status"]) {
  switch (status) {
    case "running":
      return {
        label: "Running",
        badgeClass: "border-primary/30 bg-primary/10 text-primary",
        icon: <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />,
        subLabel: "In progress",
        summary: "Working on your request. Updates will appear as steps complete.",
      };
    case "queued":
      return {
        label: "Queued",
        badgeClass: "border-border/50 bg-surface-2/60 text-muted-foreground",
        icon: <Terminal className="h-3 w-3" aria-hidden="true" />,
        subLabel: "Preparing to start",
        summary: "Queued. Preparing to start execution.",
      };
    case "completed":
      return {
        label: "Completed",
        badgeClass: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
        icon: <CheckCircle2 className="h-3 w-3" aria-hidden="true" />,
        subLabel: "All steps completed",
        summary: "All steps completed. Deliverables are ready.",
      };
    case "failed":
      return {
        label: "Failed",
        badgeClass: "border-red-500/30 bg-red-500/10 text-red-500",
        icon: <Terminal className="h-3 w-3" aria-hidden="true" />,
        subLabel: "Execution failed",
        summary: "Task failed. Review the last step for details.",
      };
    case "paused":
      return {
        label: "Paused",
        badgeClass: "border-amber-400/40 bg-amber-400/10 text-amber-600",
        icon: <Terminal className="h-3 w-3" aria-hidden="true" />,
        subLabel: "Awaiting confirmation",
        summary: "Paused. Awaiting confirmation to proceed.",
      };
    case "cancelled":
      return {
        label: "Cancelled",
        badgeClass: "border-border/50 bg-surface-2/60 text-muted-foreground",
        icon: <Terminal className="h-3 w-3" aria-hidden="true" />,
        subLabel: "Execution stopped",
        summary: "Task cancelled.",
      };
    default:
      return {
        label: "Working",
        badgeClass: "border-border/50 bg-surface-2/60 text-muted-foreground",
        icon: <Terminal className="h-3 w-3" aria-hidden="true" />,
        subLabel: "In progress",
        summary: "Working on your request.",
      };
  }
}

type ActionItem = {
  id: string;
  label: string;
  icon: ReactNode;
};

function parseActions(entries: string[], taskId: string): ActionItem[] {
  return entries.map((entry, index) => {
    const raw = entry.replace(/^Running tool:\s*/i, "").trim();
    const normalized = raw.replace(/[_-]+/g, " ").trim();
    const lower = normalized.toLowerCase();
    const label = formatActionLabel(lower, normalized);
    const icon = lower.includes("search") ? (
      <Globe key="search" className="h-3.5 w-3.5" aria-hidden="true" />
    ) : lower.includes("browse") || lower.includes("open") ? (
      <Globe key="browse" className="h-3.5 w-3.5" aria-hidden="true" />
    ) : (
      <Terminal key="terminal" className="h-3.5 w-3.5" aria-hidden="true" />
    );
    return {
      id: `${taskId}-action-${index}`,
      label,
      icon,
    };
  });
}

function formatActionLabel(lower: string, label: string) {
  if (lower.includes("search")) {
    return lower === "search" ? "Searching" : `Searching ${label}`;
  }
  if (lower.includes("browse") || lower.includes("open")) {
    return lower === "browse" || lower === "open" ? "Browsing" : `Browsing ${label}`;
  }
  if (lower.includes("read")) {
    return lower === "read" ? "Reading" : `Reading ${label}`;
  }
  if (lower.includes("write") || lower.includes("create") || lower.includes("generate")) {
    return `Creating ${label}`;
  }
  if (label.length === 0) {
    return "Running tool";
  }
  return `Running ${label}`;
}

function assignActionsToSteps(steps: TaskStep[], actions: ActionItem[]) {
  const map = new Map<string, ActionItem[]>();
  if (steps.length === 0) {
    return map;
  }
  const activeIndex = steps.findIndex((step) => step.status === "running");
  const target = activeIndex >= 0 ? steps[activeIndex] : steps[steps.length - 1];
  map.set(target.id, actions);
  return map;
}

function buildFallbackStep(status: AgentTask["status"], taskId: string): TaskStep {
  const label = status === "completed" ? "Completed" : status === "failed" ? "Failed" : "Running";
  const mapped =
    status === "completed"
      ? "completed"
      : status === "failed"
        ? "failed"
        : status === "running"
          ? "running"
          : "pending";
  return {
    id: `task-${taskId}-${status}`,
    label,
    status: mapped,
  };
}
