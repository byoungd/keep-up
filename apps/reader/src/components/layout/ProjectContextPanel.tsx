"use client";

import type { ProjectTaskSummary } from "@/lib/ai/projectContextTypes";
import { cn } from "@ku0/shared/utils";
import { RefreshCw } from "lucide-react";
import * as React from "react";

export interface ProjectContextPanelTranslations {
  title: string;
  subtitle: string;
  loading: string;
  empty: string;
  refresh: string;
  tasksLabel: string;
  openItemsLabel: string;
  checklistLabel: string;
  useTask: string;
  warningsLabel: string;
  updatedLabel: string;
}

export interface ProjectContextPanelProps {
  tasks: ProjectTaskSummary[];
  isLoading: boolean;
  error: string | null;
  updatedAt?: string;
  warnings?: string[];
  onUseTask: (title: string, openItems: string[]) => void;
  onRefresh: () => void;
  translations: ProjectContextPanelTranslations;
}

export function ProjectContextPanel({
  tasks,
  isLoading,
  error,
  updatedAt,
  warnings,
  onUseTask,
  onRefresh,
  translations: t,
}: ProjectContextPanelProps) {
  const activeTasks = React.useMemo(() => tasks.filter((task) => !task.isComplete), [tasks]);
  const displayTasks = activeTasks.length > 0 ? activeTasks.slice(0, 3) : tasks.slice(0, 3);
  const dedupedWarnings = React.useMemo(() => Array.from(new Set(warnings ?? [])), [warnings]);
  const updatedText = React.useMemo(() => {
    if (!updatedAt) {
      return null;
    }
    const time = new Date(updatedAt).toLocaleTimeString();
    return t.updatedLabel.replace("{time}", time);
  }, [updatedAt, t]);

  return (
    <section className="px-4 py-2">
      <div className="rounded-xl border border-border/50 bg-surface-1/70 shadow-sm">
        <div className="flex items-center justify-between px-3 py-2">
          <div>
            <div className="text-xs font-medium text-foreground">{t.title}</div>
            <div className="text-[10px] text-muted-foreground/70">{t.subtitle}</div>
            {updatedText && (
              <div className="text-[9px] text-muted-foreground/50">{updatedText}</div>
            )}
          </div>
          <button
            type="button"
            onClick={onRefresh}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className="h-3 w-3" aria-hidden="true" />
            {t.refresh}
          </button>
        </div>

        <div className="border-t border-border/40 px-3 py-2">
          {isLoading && <div className="text-[10px] text-muted-foreground">{t.loading}</div>}
          {!isLoading && error && <div className="text-[10px] text-destructive">{error}</div>}
          {!isLoading && !error && displayTasks.length === 0 && (
            <div className="text-[10px] text-muted-foreground">{t.empty}</div>
          )}

          {!isLoading && !error && displayTasks.length > 0 && (
            <div className="space-y-2">
              <div className="text-[10px] text-muted-foreground/60">
                {t.tasksLabel}: {tasks.length}
              </div>
              {displayTasks.map((task) => {
                const hasChecklist = task.checklistTotal > 0;
                const progress = hasChecklist
                  ? `${task.checklistDone}/${task.checklistTotal}`
                  : "n/a";

                return (
                  <div
                    key={task.id}
                    className="rounded-lg border border-border/40 bg-surface-2/40 px-2.5 py-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[11px] font-medium text-foreground truncate">
                          {task.title}
                        </div>
                        <div className="mt-0.5 text-[10px] text-muted-foreground/70">
                          {t.checklistLabel}: {progress}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onUseTask(task.title, task.openItems)}
                        className="text-[10px] font-medium text-primary hover:text-primary/80"
                      >
                        {t.useTask}
                      </button>
                    </div>

                    {task.openItems.length > 0 && (
                      <div className="mt-2 text-[10px] text-muted-foreground/70">
                        <span className="font-medium text-muted-foreground/80">
                          {t.openItemsLabel}:
                        </span>
                        <div className="mt-1 space-y-0.5">
                          {task.openItems.map((item) => (
                            <div key={`${task.id}-${item}`} className="truncate">
                              - {item}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {dedupedWarnings.length > 0 && (
            <div
              className={cn(
                "mt-2 text-[9px] text-muted-foreground/60",
                dedupedWarnings.length > 0 && "border-t border-border/30 pt-2"
              )}
            >
              <div className="font-medium uppercase tracking-wide">{t.warningsLabel}</div>
              <div className="mt-1 space-y-0.5">
                {dedupedWarnings.slice(0, 3).map((warning) => (
                  <div key={warning}>- {warning}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
