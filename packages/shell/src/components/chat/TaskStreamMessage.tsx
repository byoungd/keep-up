"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { ConfirmationSection } from "./ConfirmationSection";
import { DeliverableItem } from "./DeliverableItem";
import { PlanSection } from "./PlanSection";
import { StepItem } from "./StepItem";
import { TaskHeader } from "./TaskHeader";
import {
  buildFallbackStep,
  formatElapsedTime,
  getStatusMeta,
  normalizeSteps,
  TASK_THEME,
} from "./TaskStreamUtils";
import type { AgentTask, ArtifactItem } from "./types";

interface TaskStreamMessageProps {
  task: AgentTask;
  onPreview?: (artifact: ArtifactItem) => void;
  onAction?: (
    action: "approve" | "reject",
    metadata: {
      approvalId: string;
      toolName: string;
      args: Record<string, unknown>;
    }
  ) => Promise<void>;
}

export function TaskStreamMessage({ task, onPreview, onAction }: TaskStreamMessageProps) {
  const defaultExpanded =
    task.status === "running" || task.status === "queued" || task.status === "paused";
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [collapsedSteps, setCollapsedSteps] = useState<Record<string, boolean>>({});

  const { displaySteps, deliverables, report, otherArtifacts, plans, statusMeta, summaryText } =
    useTaskState(task);
  const elapsedLabel = useElapsedLabel(task);

  const isPaused = task.status === "paused";

  return (
    <div className="w-full max-w-[92%] md:max-w-3xl my-1 pl-1">
      {/* Minimal Container - No Borders, No Shadows */}
      <div className="group/task relative">
        <TaskHeader
          task={task}
          isExpanded={isExpanded}
          onToggle={() => setIsExpanded(!isExpanded)}
          statusMeta={statusMeta}
          elapsedLabel={elapsedLabel}
        />

        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={TASK_THEME.motion.spring}
            >
              <div className="pt-2 pl-[19px]">
                {" "}
                {/* Align content with header icon center (approx) */}
                <div className="border-l border-border/40 pl-4 pb-2 space-y-5">
                  {/* Summary / Fallback Notice */}
                  {(summaryText || task.fallbackNotice) && (
                    <div className="text-sm text-foreground/80 leading-relaxed font-normal">
                      {summaryText}
                      {task.fallbackNotice && (
                        <div className="mt-2 text-xs bg-amber-500/10 text-amber-600 px-2 py-1.5 rounded-md inline-block">
                          {task.fallbackNotice}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Integrated Confirmation */}
                  {isPaused && task.approvalMetadata && (
                    <ConfirmationSection metadata={task.approvalMetadata} onAction={onAction} />
                  )}

                  {/* Execution Plan */}
                  {plans.length > 0 && (
                    <div className="space-y-2">
                      {plans.map((p) => (
                        <PlanSection key={p.id} artifact={p} onPreview={onPreview} />
                      ))}
                    </div>
                  )}

                  {/* Steps Timeline */}
                  {displaySteps.length > 0 && (
                    <div className="space-y-0.5 relative">
                      {/* Continuous line overlay for tighter feel if needed, but border-l on parent handles it well */}
                      {displaySteps.map((step, index) => {
                        const isCollapsed = collapsedSteps[step.id] ?? false;
                        return (
                          <StepItem
                            key={step.id}
                            index={index}
                            step={step}
                            isLast={index === displaySteps.length - 1}
                            isCollapsed={isCollapsed}
                            onToggle={() =>
                              setCollapsedSteps((prev) => ({
                                ...prev,
                                [step.id]: !isCollapsed,
                              }))
                            }
                            actions={step.actions ?? []}
                            artifacts={task.artifacts?.filter((a) => a.stepId === step.id)}
                            onPreview={onPreview}
                          />
                        );
                      })}
                    </div>
                  )}

                  {/* Empty State */}
                  {displaySteps.length === 0 && plans.length === 0 && deliverables.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <div className="h-10 w-10 rounded-full bg-surface-2 flex items-center justify-center mb-3 animate-pulse">
                        <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground animate-spin" />
                      </div>
                      <p className="text-sm text-muted-foreground">Preparing task...</p>
                    </div>
                  )}

                  {/* Deliverables */}
                  {deliverables.length > 0 && (
                    <div className="pt-2 space-y-3">
                      <div className="uppercase tracking-widest text-[10px] text-muted-foreground/60 font-semibold select-none">
                        Deliverables
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {report && (
                          <DeliverableItem artifact={report} onPreview={onPreview} isPrimary />
                        )}
                        {otherArtifacts.map((artifact) => (
                          <DeliverableItem
                            key={artifact.id}
                            artifact={artifact}
                            onPreview={onPreview}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function useTaskState(task: AgentTask) {
  const steps = task.steps ?? [];
  const artifacts = task.artifacts ?? [];
  const resolvedSteps = steps.length > 0 ? steps : [buildFallbackStep(task.status, task.id)];
  const displaySteps = useMemo(() => normalizeSteps(resolvedSteps), [resolvedSteps]);

  const deliverables = useMemo(
    () => artifacts.filter((artifact) => artifact.type !== "plan"),
    [artifacts]
  );
  const plans = useMemo(
    () => artifacts.filter((artifact) => artifact.type === "plan"),
    [artifacts]
  );

  const report = deliverables.find((artifact) => artifact.type === "report");
  const otherArtifacts = deliverables.filter((artifact) => artifact.type !== "report");
  const statusMeta = getStatusMeta(task.status);
  const summaryText = task.description || task.goal; // Simplified summary

  return {
    displaySteps,
    deliverables,
    report,
    otherArtifacts,
    plans,
    statusMeta,
    summaryText,
  };
}

function useElapsedLabel(task: AgentTask): string | undefined {
  const elapsedMs = useElapsedTime(task.startedAt, task.completedAt, task.status);
  return elapsedMs === null ? undefined : formatElapsedTime(elapsedMs);
}

function useElapsedTime(
  startedAt?: string,
  completedAt?: string,
  status?: AgentTask["status"]
): number | null {
  const startMs = startedAt ? Date.parse(startedAt) : Number.NaN;
  const endMs = completedAt ? Date.parse(completedAt) : Number.NaN;
  const isActive =
    !Number.isNaN(startMs) &&
    Number.isNaN(endMs) &&
    (status === "running" || status === "queued" || status === "paused");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isActive) {
      return undefined;
    }
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [isActive]);

  if (Number.isNaN(startMs)) {
    return null;
  }

  const effectiveEnd = !Number.isNaN(endMs) ? endMs : now;
  return Math.max(0, effectiveEnd - startMs);
}
