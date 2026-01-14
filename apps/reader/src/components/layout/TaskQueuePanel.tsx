"use client";

import type { TaskSnapshot, TaskStatusSnapshot } from "@/lib/ai/taskStream";
import type { TaskQueueStats } from "@ku0/agent-runtime";
import { cn } from "@ku0/shared/utils";
import { CheckCircle2, ChevronDown, ChevronRight, Loader2, Pause, XCircle } from "lucide-react";
import * as React from "react";

export interface TaskQueuePanelTranslations {
  title: string;
  subtitle: string;
  empty: string;
  runningLabel: string;
  queuedLabel: string;
  completedLabel: string;
  statusQueued: string;
  statusRunning: string;
  statusCompleted: string;
  statusFailed: string;
  statusCancelled: string;
  progressLabel: string;
  summaryLabel: string;
  outputsLabel: string;
  filesLabel: string;
  actionsLabel: string;
  followupsLabel: string;
  expand: string;
  collapse: string;
  cancelTask: string;
  updateTask: string;
  updateWalkthrough: string;
}

export interface TaskQueuePanelProps {
  tasks: TaskSnapshot[];
  stats: TaskQueueStats | null;
  error?: string | null;
  onCancelTask: (taskId: string) => void;
  onUpdateTask: (task: TaskSnapshot) => void;
  onUpdateWalkthrough: (task: TaskSnapshot) => void;
  translations: TaskQueuePanelTranslations;
}

const statusMeta: Record<TaskStatusSnapshot, { icon: React.ElementType; className: string }> = {
  queued: { icon: Pause, className: "text-muted-foreground bg-surface-2/60" },
  running: { icon: Loader2, className: "text-primary bg-primary/10" },
  completed: { icon: CheckCircle2, className: "text-emerald-600 bg-emerald-500/10" },
  failed: { icon: XCircle, className: "text-destructive bg-destructive/10" },
  cancelled: { icon: XCircle, className: "text-muted-foreground bg-surface-2/60" },
};

export function TaskQueuePanel({
  tasks,
  stats,
  error,
  onCancelTask,
  onUpdateTask,
  onUpdateWalkthrough,
  translations: t,
}: TaskQueuePanelProps) {
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());

  const toggleExpanded = React.useCallback((taskId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  }, []);

  if (tasks.length === 0 && !error) {
    return (
      <section className="px-4 py-2">
        <div className="rounded-xl border border-border/50 bg-surface-1/70 shadow-sm">
          <div className="px-3 py-2">
            <div className="text-xs font-medium text-foreground">{t.title}</div>
            <div className="text-[10px] text-muted-foreground/70">{t.subtitle}</div>
          </div>
          <div className="border-t border-border/40 px-3 py-2 text-[10px] text-muted-foreground">
            {t.empty}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="px-4 py-2">
      <div className="rounded-xl border border-border/50 bg-surface-1/70 shadow-sm">
        <div className="flex items-center justify-between px-3 py-2">
          <div>
            <div className="text-xs font-medium text-foreground">{t.title}</div>
            <div className="text-[10px] text-muted-foreground/70">{t.subtitle}</div>
          </div>
          {stats && (
            <div className="text-[10px] text-muted-foreground/70 flex items-center gap-2">
              <span>
                {t.runningLabel}: {stats.running}
              </span>
              <span>
                {t.queuedLabel}: {stats.queued}
              </span>
              <span>
                {t.completedLabel}: {stats.completed}
              </span>
            </div>
          )}
        </div>

        <div className="border-t border-border/40 px-3 py-2 space-y-2">
          {error && <div className="text-[10px] text-destructive">{error}</div>}
          {tasks.map((task) => (
            <TaskQueueItem
              key={task.taskId}
              task={task}
              isExpanded={expanded.has(task.taskId)}
              onToggle={toggleExpanded}
              onCancelTask={onCancelTask}
              onUpdateTask={onUpdateTask}
              onUpdateWalkthrough={onUpdateWalkthrough}
              translations={t}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function TaskQueueItem({
  task,
  isExpanded,
  onToggle,
  onCancelTask,
  onUpdateTask,
  onUpdateWalkthrough,
  translations: t,
}: {
  task: TaskSnapshot;
  isExpanded: boolean;
  onToggle: (taskId: string) => void;
  onCancelTask: (taskId: string) => void;
  onUpdateTask: (task: TaskSnapshot) => void;
  onUpdateWalkthrough: (task: TaskSnapshot) => void;
  translations: TaskQueuePanelTranslations;
}) {
  const meta = statusMeta[task.status];
  const StatusIcon = meta.icon;
  const statusLabel = resolveStatusLabel(task.status, t);
  const canCancel = task.status === "queued" || task.status === "running";
  const canUpdate = task.status === "completed";

  return (
    <div className="rounded-lg border border-border/40 bg-surface-2/40 px-2.5 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex h-5 w-5 items-center justify-center rounded-md",
                meta.className
              )}
            >
              <StatusIcon
                className={cn("h-3 w-3", task.status === "running" && "animate-spin")}
                aria-hidden="true"
              />
            </span>
            <div className="text-[11px] font-medium text-foreground truncate">{task.name}</div>
          </div>
          <div className="mt-1 text-[10px] text-muted-foreground/70">
            {t.progressLabel}: {statusLabel}
          </div>
          {task.progressMessage && (
            <div className="mt-1 text-[10px] text-muted-foreground/70">{task.progressMessage}</div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onToggle(task.taskId)}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
          >
            {isExpanded ? (
              <ChevronDown className="h-3 w-3" aria-hidden="true" />
            ) : (
              <ChevronRight className="h-3 w-3" aria-hidden="true" />
            )}
            {isExpanded ? t.collapse : t.expand}
          </button>
          {canCancel && (
            <button
              type="button"
              onClick={() => onCancelTask(task.taskId)}
              className="text-[10px] font-medium text-destructive hover:text-destructive/80"
            >
              {t.cancelTask}
            </button>
          )}
        </div>
      </div>

      <div className="mt-2 h-1.5 rounded-full bg-surface-3/60">
        <div
          className={cn(
            "h-1.5 rounded-full",
            task.status === "failed" ? "bg-destructive/70" : "bg-primary/60"
          )}
          style={{ width: `${Math.min(100, Math.max(0, task.progress))}%` }}
        />
      </div>

      {isExpanded && (
        <div className="mt-3 space-y-3 text-[10px] text-muted-foreground/80">
          <TaskSummaryDetails task={task} translations={t} />
          <TaskUpdateActions
            task={task}
            enabled={canUpdate}
            onUpdateTask={onUpdateTask}
            onUpdateWalkthrough={onUpdateWalkthrough}
            translations={t}
          />
        </div>
      )}
    </div>
  );
}

function TaskSummaryDetails({
  task,
  translations: t,
}: {
  task: TaskSnapshot;
  translations: TaskQueuePanelTranslations;
}) {
  const summary = task.summary;
  if (!summary) {
    return null;
  }

  return (
    <div className="space-y-2">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground/60">
        {t.summaryLabel}
      </div>
      {summary.outputs.length > 0 && (
        <div>
          <div className="font-medium text-muted-foreground/80">{t.outputsLabel}</div>
          <div className="mt-1 space-y-0.5">
            {summary.outputs.map((output) => (
              <div key={output.path}>- {output.path}</div>
            ))}
          </div>
        </div>
      )}
      {summary.fileChanges.length > 0 && (
        <div>
          <div className="font-medium text-muted-foreground/80">{t.filesLabel}</div>
          <div className="mt-1 space-y-0.5">
            {summary.fileChanges.map((file) => (
              <div key={`${file.path}-${file.change}`}>
                - {file.path} ({file.change})
              </div>
            ))}
          </div>
        </div>
      )}
      {summary.actionLog.length > 0 && (
        <div>
          <div className="font-medium text-muted-foreground/80">{t.actionsLabel}</div>
          <div className="mt-1 space-y-0.5">
            {summary.actionLog.map((entry, index) => (
              <div key={`${entry.timestamp}-${index}`}>
                - {entry.action}: {entry.details}
              </div>
            ))}
          </div>
        </div>
      )}
      {summary.followups.length > 0 && (
        <div>
          <div className="font-medium text-muted-foreground/80">{t.followupsLabel}</div>
          <div className="mt-1 space-y-0.5">
            {summary.followups.map((followup) => (
              <div key={followup}>- {followup}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TaskUpdateActions({
  task,
  enabled,
  onUpdateTask,
  onUpdateWalkthrough,
  translations: t,
}: {
  task: TaskSnapshot;
  enabled: boolean;
  onUpdateTask: (task: TaskSnapshot) => void;
  onUpdateWalkthrough: (task: TaskSnapshot) => void;
  translations: TaskQueuePanelTranslations;
}) {
  if (!enabled) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => onUpdateTask(task)}
        className="rounded-md border border-border/50 bg-surface-2/60 px-2.5 py-1 text-[10px] font-medium text-foreground hover:bg-surface-2"
      >
        {t.updateTask}
      </button>
      <button
        type="button"
        onClick={() => onUpdateWalkthrough(task)}
        className="rounded-md border border-border/50 bg-surface-2/60 px-2.5 py-1 text-[10px] font-medium text-foreground hover:bg-surface-2"
      >
        {t.updateWalkthrough}
      </button>
    </div>
  );
}

function resolveStatusLabel(status: TaskStatusSnapshot, t: TaskQueuePanelTranslations) {
  switch (status) {
    case "queued":
      return t.statusQueued;
    case "running":
      return t.statusRunning;
    case "completed":
      return t.statusCompleted;
    case "failed":
      return t.statusFailed;
    case "cancelled":
      return t.statusCancelled;
    default:
      return status;
  }
}
