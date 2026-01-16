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
import { MessageBubble } from "./MessageBubble";
import type { AgentTask, ArtifactItem, TaskStep } from "./types";

interface TaskStreamMessageProps {
  task: AgentTask;
  onPreview?: (artifact: ArtifactItem) => void;
}

export function TaskStreamMessage({ task, onPreview }: TaskStreamMessageProps) {
  const defaultExpanded = task.status === "running" || task.status === "queued";
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [collapsedSteps, setCollapsedSteps] = useState<Record<string, boolean>>({});

  const {
    displaySteps,
    progressLabel,
    progressPercent,
    actionsByStep,
    deliverables,
    report,
    otherArtifacts,
    statusMeta,
    summaryText,
  } = useTaskState(task);

  return (
    <div className="w-full max-w-[92%] md:max-w-3xl my-2">
      <div className="rounded-2xl border border-border/40 bg-surface-1/80 shadow-sm overflow-hidden">
        <TaskHeader
          task={task}
          isExpanded={isExpanded}
          onToggle={() => setIsExpanded(!isExpanded)}
          statusMeta={statusMeta}
          progressLabel={progressLabel}
        />
        <TaskProgressBar show={displaySteps.length > 1} percent={progressPercent} />

        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <TaskContent
                task={task}
                summaryText={summaryText}
                displaySteps={displaySteps}
                collapsedSteps={collapsedSteps}
                setCollapsedSteps={setCollapsedSteps}
                actionsByStep={actionsByStep}
                deliverables={deliverables}
                report={report}
                otherArtifacts={otherArtifacts}
                onPreview={onPreview}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function useTaskState(task: AgentTask) {
  const steps = task.steps ?? [];
  const thoughts = task.thoughts ?? [];
  const resolvedSteps = steps.length > 0 ? steps : [buildFallbackStep(task.status, task.id)];
  const displaySteps = useMemo(() => normalizeSteps(resolvedSteps), [resolvedSteps]);
  const totalSteps = displaySteps.length;
  const completedSteps = displaySteps.filter((step) => step.status === "completed").length;
  const progressLabel =
    totalSteps > 1 && task.status !== "completed" ? `${completedSteps}/${totalSteps} steps` : "";
  const progressPercent =
    totalSteps > 0 ? Math.min(100, Math.round((completedSteps / totalSteps) * 100)) : 0;
  const actions = useMemo(() => parseActions(thoughts, task.id), [thoughts, task.id]);
  const actionsByStep = useMemo(
    () => assignActionsToSteps(displaySteps, actions),
    [displaySteps, actions]
  );
  const deliverables = useMemo(
    () => task.artifacts.filter((artifact) => artifact.type !== "plan"),
    [task.artifacts]
  );
  const report = deliverables.find((artifact) => artifact.type === "report");
  const otherArtifacts = deliverables.filter((artifact) => artifact.type !== "report");
  const statusMeta = getStatusMeta(task.status);
  const summaryText = task.description || task.goal || statusMeta.summary;

  return {
    displaySteps,
    progressLabel,
    progressPercent,
    actionsByStep,
    deliverables,
    report,
    otherArtifacts,
    statusMeta,
    summaryText,
  };
}

function TaskHeader({
  task,
  isExpanded,
  onToggle,
  statusMeta,
  progressLabel,
}: {
  task: AgentTask;
  isExpanded: boolean;
  onToggle: () => void;
  statusMeta: ReturnType<typeof getStatusMeta>;
  progressLabel: string;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-start justify-between gap-4 px-4 py-3 bg-surface-2/30 hover:bg-surface-2/60 transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
      onClick={onToggle}
      aria-expanded={isExpanded}
      aria-label="Toggle task details"
    >
      <div className="flex-1 min-w-0">
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
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          {progressLabel && <span className="tabular-nums">{progressLabel}</span>}
        </div>
      </div>
      <div className="flex items-center gap-2 pt-0.5 text-xs text-muted-foreground">
        <span
          className={cn(
            "inline-flex items-center gap-1 px-2 py-1 rounded-full border",
            statusMeta.badgeClass
          )}
        >
          {statusMeta.icon}
          {statusMeta.label}
        </span>
        {isExpanded ? (
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        )}
      </div>
    </button>
  );
}

function TaskProgressBar({ show, percent }: { show: boolean; percent: number }) {
  if (!show) {
    return null;
  }
  return (
    <div className="px-4">
      <div className="h-1 w-full rounded-full bg-border/40">
        <div
          className="h-1 rounded-full bg-primary/70 transition-[width]"
          style={{ width: `${percent}%` }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

function TaskContent({
  task,
  summaryText,
  displaySteps,
  collapsedSteps,
  setCollapsedSteps,
  actionsByStep,
  deliverables,
  report,
  otherArtifacts,
  onPreview,
}: {
  task: AgentTask;
  summaryText?: string;
  displaySteps: TaskStep[];
  collapsedSteps: Record<string, boolean>;
  setCollapsedSteps: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  actionsByStep: Map<string, ActionItem[]>;
  deliverables: ArtifactItem[];
  report?: ArtifactItem;
  otherArtifacts: ArtifactItem[];
  onPreview?: (artifact: ArtifactItem) => void;
}) {
  return (
    <div className="px-4 pb-4 space-y-4">
      {(summaryText || task.fallbackNotice) && (
        <div className="space-y-2">
          {summaryText && (
            <div className="text-xs text-muted-foreground">
              <MessageBubble
                content={summaryText}
                isUser={false}
                isStreaming={false}
                density="compact"
                className="max-w-none text-xs text-muted-foreground leading-relaxed"
              />
            </div>
          )}
          {task.fallbackNotice && (
            <div className="text-[11px] px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600/90 leading-relaxed">
              {task.fallbackNotice}
            </div>
          )}
        </div>
      )}

      {displaySteps.length > 0 && (
        <section className="relative">
          <div className="space-y-3">
            {displaySteps.map((step, index) => {
              const isCollapsed = collapsedSteps[step.id] ?? false;
              const stepActions = actionsByStep.get(step.id) ?? [];
              return (
                <StepItem
                  key={step.id}
                  step={step}
                  isLast={index === displaySteps.length - 1}
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
      )}

      {deliverables.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground/70">
            <span className="uppercase tracking-widest">Deliverables</span>
            <span className="tabular-nums">{deliverables.length}</span>
          </div>
          <div className="grid grid-cols-1 gap-2">
            {report && <DeliverableCard artifact={report} onPreview={onPreview} isPrimary />}
            {otherArtifacts.map((artifact) => (
              <DeliverableCard key={artifact.id} artifact={artifact} onPreview={onPreview} />
            ))}
          </div>
        </section>
      )}
      {deliverables.length === 0 && task.status === "completed" && (
        <section className="rounded-xl border border-dashed border-border/60 bg-surface-2/40 px-4 py-3 text-xs text-muted-foreground">
          No deliverables produced. Re-run the task or adjust the request.
        </section>
      )}
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
        "h-4 w-4 rounded-full border flex items-center justify-center bg-surface-1",
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
  const _isActive = step.status === "running";
  const hasDetails = actions.length > 0 || (artifacts?.length ?? 0) > 0;
  const showDetails = hasDetails && !isCollapsed;

  return (
    <div className="relative">
      {!isLast && <div className="absolute left-2 top-4 bottom-0 w-px bg-border/40" />}
      {hasDetails ? (
        <button
          type="button"
          onClick={onToggle}
          className="flex w-full items-start gap-3 text-left"
        >
          <StepHeader step={step} hasDetails={hasDetails} isCollapsed={isCollapsed} />
        </button>
      ) : (
        <div className="flex items-start gap-3">
          <StepHeader step={step} hasDetails={false} isCollapsed={false} />
        </div>
      )}

      {showDetails && (
        <div className="mt-2 space-y-2">
          {actions.length > 0 && <StepActivity actions={actions} />}
          {(artifacts?.length ?? 0) > 0 && (
            <StepFiles artifacts={artifacts} onPreview={onPreview} />
          )}
        </div>
      )}
    </div>
  );
}

function StepHeader({
  step,
  hasDetails,
  isCollapsed,
}: {
  step: TaskStep;
  hasDetails: boolean;
  isCollapsed: boolean;
}) {
  const isActive = step.status === "running";
  const isCompleted = step.status === "completed";

  return (
    <>
      <div className="pt-0.5 shrink-0">
        <StepStatusIcon status={step.status} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div
            className={cn(
              "flex-1 min-w-0 text-sm font-medium leading-relaxed",
              isActive
                ? "text-foreground"
                : isCompleted
                  ? "text-foreground/80"
                  : "text-muted-foreground"
            )}
          >
            <MessageBubble
              content={step.label}
              isUser={false}
              isStreaming={false}
              density="compact"
              className={cn(
                "max-w-none text-sm font-medium leading-relaxed [&_p]:my-0",
                isCompleted && "line-through decoration-muted-foreground/40",
                !isActive && "text-foreground/80"
              )}
            />
          </div>
          {step.duration && (
            <span className="text-[10px] text-muted-foreground/70 font-mono mt-0.5">
              {step.duration}
            </span>
          )}
          {hasDetails &&
            (isCollapsed ? (
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            ))}
        </div>
        {!hasDetails && isActive && (
          <div className="mt-1 text-xs text-muted-foreground/80 italic">Working...</div>
        )}
      </div>
    </>
  );
}

function StepActivity({ actions }: { actions: ActionItem[] }) {
  return (
    <div className="rounded-xl border border-border/40 bg-surface-2/40 overflow-hidden">
      <div className="px-3 pt-2 text-[10px] uppercase tracking-widest text-muted-foreground/60">
        Activity
      </div>
      <div className="divide-y divide-border/40">
        {actions.map((action) => (
          <div
            key={action.id}
            className="flex items-start gap-2 px-3 py-2 text-[11px] text-muted-foreground"
          >
            <span className="mt-0.5 text-muted-foreground/80">{action.icon}</span>
            <span className="leading-relaxed">{action.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StepFiles({
  artifacts,
  onPreview,
}: {
  artifacts?: ArtifactItem[];
  onPreview?: (artifact: ArtifactItem) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground/60">Files</div>
      <div className="space-y-2">
        {artifacts?.map((art) => (
          <button
            key={art.id}
            onClick={() => onPreview?.(art)}
            type="button"
            className="flex w-full items-center gap-2 rounded-lg border border-border/40 bg-surface-1/70 px-3 py-2 text-[11px] text-muted-foreground hover:bg-surface-2 transition-colors"
          >
            <FileText className="h-3 w-3" aria-hidden="true" />
            <span className="truncate">{art.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function DeliverableCard({
  artifact,
  onPreview,
  isPrimary = false,
}: {
  artifact: ArtifactItem;
  onPreview?: (artifact: ArtifactItem) => void;
  isPrimary?: boolean;
}) {
  const Icon = getArtifactIcon(artifact.type);
  const preview = buildPreviewText(artifact.content);

  return (
    <button
      type="button"
      onClick={() => onPreview?.(artifact)}
      className={cn(
        "flex items-start gap-3 rounded-xl border border-border/50 bg-surface-1/70 px-3 py-2 text-left hover:bg-surface-2 transition-colors",
        isPrimary && "border-primary/30 bg-primary/5"
      )}
    >
      <div className="h-9 w-9 rounded-lg bg-surface-2 flex items-center justify-center text-muted-foreground">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <div className="text-sm font-medium text-foreground truncate">
            {artifact.title || "Untitled"}
          </div>
          {isPrimary && (
            <span className="rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
              Primary
            </span>
          )}
        </div>
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {artifact.type}
        </div>
        {preview && (
          <MessageBubble
            content={preview}
            isUser={false}
            isStreaming={false}
            density="compact"
            className="max-w-none text-xs text-muted-foreground/80 leading-relaxed max-h-[3.6em] overflow-hidden"
          />
        )}
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground/70 shrink-0" aria-hidden="true" />
    </button>
  );
}

function buildPreviewText(content?: string): string | undefined {
  if (!content) {
    return undefined;
  }
  const withoutCode = content.replace(/```[\s\S]*?```/g, " ");
  const withoutInlineCode = withoutCode.replace(/`([^`]*)`/g, "$1");
  const withoutImages = withoutInlineCode.replace(/!\[[^\]]*]\([^)]*\)/g, " ");
  const withoutLinks = withoutImages.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  const normalized = withoutLinks
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*>\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return undefined;
  }
  const snippet = normalized.slice(0, 160);
  return snippet;
}

function normalizeSteps(steps: TaskStep[]): TaskStep[] {
  if (steps.length <= 1) {
    return steps;
  }
  const cleaned = steps.filter((step) => step.label.trim().length > 0);
  const withoutPlaceholders = cleaned.filter((step) => !isStatusPlaceholder(step.label));
  const base = withoutPlaceholders.length > 0 ? withoutPlaceholders : cleaned;
  const deduped = dedupeSteps(base);
  return deduped.length > 0 ? deduped : steps;
}

function dedupeSteps(steps: TaskStep[]): TaskStep[] {
  const seen = new Map<string, TaskStep>();
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const step = steps[index];
    const key = `${step.label.toLowerCase()}::${step.status}`;
    if (!seen.has(key)) {
      seen.set(key, step);
    }
  }
  return Array.from(seen.values()).reverse();
}

function isStatusPlaceholder(label: string): boolean {
  const normalized = label.trim().toLowerCase();
  return (
    normalized === "queued" ||
    normalized === "planning" ||
    normalized === "ready" ||
    normalized === "running" ||
    normalized === "working" ||
    normalized === "completed" ||
    normalized === "failed"
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
  const seen = new Set<string>();
  const items: ActionItem[] = [];
  for (const [index, entry] of entries.entries()) {
    const raw = entry.replace(/^Running tool:\s*/i, "").trim();
    const normalized = raw.replace(/[_-]+/g, " ").trim();
    const lower = normalized.toLowerCase();
    if (shouldSkipAction(lower)) {
      continue;
    }
    const label = formatActionLabel(lower, normalized);
    const key = label.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const icon = lower.includes("search") ? (
      <Globe key="search" className="h-3.5 w-3.5" aria-hidden="true" />
    ) : lower.includes("browse") || lower.includes("open") ? (
      <Globe key="browse" className="h-3.5 w-3.5" aria-hidden="true" />
    ) : (
      <Terminal key="terminal" className="h-3.5 w-3.5" aria-hidden="true" />
    );
    items.push({
      id: `${taskId}-action-${index}`,
      label,
      icon,
    });
  }
  return items;
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

function shouldSkipAction(lower: string): boolean {
  return (
    lower === "tool finished" ||
    lower === "tool output" ||
    lower === "tool result" ||
    lower === "output"
  );
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
