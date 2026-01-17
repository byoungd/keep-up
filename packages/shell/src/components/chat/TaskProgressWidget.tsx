"use client";

import { cn } from "@ku0/shared/utils";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import {
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  Circle,
  FileText,
  Image as ImageIcon,
  Link as LinkIcon,
  Loader2,
  Target,
} from "lucide-react";
import * as React from "react";
import { TextShimmer } from "../ui/TextShimmer";
import type { AgentTask, ArtifactItem, TaskPhase } from "./types";
import { groupArtifactsByType } from "./types";

export interface TaskProgressWidgetProps {
  /** Array of agent tasks to display */
  tasks: AgentTask[];
  /** ID of the currently expanded task */
  expandedTaskId?: string | null;
  /** Callback when a task is expanded/collapsed */
  onExpandTask?: (taskId: string | null) => void;
  /** Callback when an artifact chip is clicked */
  onArtifactClick?: (artifact: ArtifactItem, task: AgentTask) => void;
  /** Callback when "Review" is clicked for a task */
  onReviewClick?: (task: AgentTask) => void;
  /** Additional CSS classes */
  className?: string;
}

function PhaseItem({
  phase,
  isActive,
  isCompleted,
}: {
  phase: TaskPhase;
  isActive: boolean;
  isCompleted: boolean;
}) {
  return (
    <div className="flex items-center shrink-0">
      <motion.div
        initial={false}
        animate={{
          backgroundColor: isActive
            ? "var(--primary-10)"
            : isCompleted
              ? "var(--green-10)"
              : "transparent",
          borderColor: isActive
            ? "var(--primary-20)"
            : isCompleted
              ? "var(--green-20)"
              : "var(--border-10)",
        }}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors relative overflow-hidden",
          isActive
            ? "text-primary shadow-[0_0_10px_-3px_var(--primary)]"
            : isCompleted
              ? "text-green-600 dark:text-green-400"
              : "bg-surface-2/50 border-border/10 text-muted-foreground"
        )}
      >
        {/* Pulsing Dot for Active Phase */}
        {isActive && <span className="absolute inset-0 bg-primary/5 animate-pulse" />}

        {isCompleted && <CheckCircle2 className="w-3.5 h-3.5" />}
        {isActive && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        <span className="relative z-10">{phase.label}</span>
      </motion.div>
    </div>
  );
}

function TaskDetails({
  task,
  onReviewClick,
}: {
  task: AgentTask;
  onReviewClick?: (task: AgentTask) => void;
}) {
  const {
    steps,
    filesChanged = 0,
    linesAdded = 0,
    linesRemoved = 0,
    goal,
    phases,
    currentPhaseId,
  } = task;

  return (
    <div className="bg-surface-2/5 border-t border-border/5">
      {/* Task Goal Header (Spec 2.1.1 Refined) */}
      {goal && (
        <div className="relative px-5 py-4 border-b border-border/5 bg-gradient-to-r from-surface-2/20 to-transparent">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 p-1.5 rounded-md bg-primary/10 text-primary shrink-0">
              <Target className="w-3.5 h-3.5" />
            </div>
            <div className="space-y-1">
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                Current Objective
              </div>
              <div className="text-sm text-foreground font-medium leading-relaxed">{goal}</div>
            </div>
          </div>
        </div>
      )}

      {/* Phase List (Spec 2.1.1 Refined) */}
      {phases && phases.length > 0 && (
        <div className="px-4 py-3 border-b border-border/5 flex items-center gap-2 overflow-x-auto no-scrollbar mask-linear-fade">
          {phases.map((phase, idx) => {
            const isActive = phase.id === currentPhaseId;
            const isCompleted = phase.status === "completed";

            return (
              <React.Fragment key={phase.id}>
                <PhaseItem phase={phase} isActive={isActive} isCompleted={isCompleted} />
                {idx < phases.length - 1 && <div className="w-6 h-px bg-border/20 mx-1 shrink-0" />}
              </React.Fragment>
            );
          })}
        </div>
      )}

      {/* Task Steps List */}
      <div className="px-4 py-3 space-y-3">
        {steps.map((step) => {
          const isCompleted = step.status === "completed";
          const isRunning = step.status === "running";
          const isPending = step.status === "pending";

          return (
            <div
              key={step.id}
              className={cn(
                "flex items-start gap-3 text-sm transition-colors",
                isCompleted ? "opacity-50" : "opacity-100"
              )}
            >
              {/* Status Icon */}
              <div className="mt-0.5 shrink-0 flex items-center justify-center w-4 h-4">
                {isCompleted ? (
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                ) : isRunning ? (
                  <div className="flex items-center justify-center w-4 h-4">
                    <div className="w-3.5 h-3.5 rounded-full border border-blue-500/30 flex items-center justify-center">
                      <div className="w-1.5 h-1.5 bg-gradient-to-tr from-blue-500 to-cyan-400 rounded-full animate-pulse-spring" />
                    </div>
                  </div>
                ) : (
                  <Circle className="w-4 h-4 text-muted-foreground/30" />
                )}
              </div>

              {/* Label */}
              <div className="flex-1 min-w-0">
                <span
                  className={cn(
                    "block leading-5",
                    isCompleted && "line-through decoration-muted-foreground/50",
                    isRunning && "font-medium text-foreground",
                    isPending && "text-muted-foreground"
                  )}
                >
                  {isRunning ? <TextShimmer>{step.label}</TextShimmer> : step.label}
                </span>
              </div>

              {/* Duration */}
              {step.duration && (
                <span className="shrink-0 text-xs font-mono text-muted-foreground/60">
                  {step.duration}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer with Stats */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-surface-1/50 border-t border-border/10 text-xs">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onReviewClick?.(task);
          }}
          className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors group"
        >
          <span className="font-medium">{filesChanged} files</span>
          <span className="text-muted-foreground/50">•</span>
          <span className="text-green-500">+{linesAdded}</span>
          <span className="text-red-500/80">-{linesRemoved}</span>

          <ArrowUpRight className="w-3 h-3 opacity-0 -translate-y-0.5 group-hover:opacity-100 transition-all" />
        </button>
      </div>
    </div>
  );
}

function TaskAccordionItem({
  task,
  isExpanded,
  onToggle,
  onArtifactClick,
  children,
}: {
  task: AgentTask;
  isExpanded: boolean;
  onToggle: () => void;
  onArtifactClick?: (artifact: ArtifactItem, task: AgentTask) => void;
  children: React.ReactNode;
}) {
  const isLoading = task.status === "running";
  const grouped = groupArtifactsByType(task.artifacts);

  return (
    <div
      className={cn(
        "group flex flex-col transition-colors",
        isExpanded ? "bg-surface-1 relative z-10" : "bg-surface-1/50 hover:bg-surface-1/80"
      )}
    >
      {/* Header */}
      <button
        type="button"
        onClick={onToggle}
        className="relative flex items-center gap-4 px-4 py-3 w-full text-left outline-none overflow-hidden cursor-pointer"
      >
        {/* Background Progress Fill (Extremely Light) */}
        {isLoading && (
          <motion.div
            className="absolute inset-y-0 left-0 bg-blue-500/5 z-0"
            initial={{ width: 0 }}
            animate={{ width: `${task.progress}%` }}
            transition={{ duration: 0.5, ease: "easeInOut" }}
          />
        )}

        {/* Left Side: Status Icon */}
        <div className="relative z-10 shrink-0">
          {task.status === "completed" ? (
            <div className="bg-green-500/10 text-green-500 p-1 rounded-full">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          ) : task.status === "running" ? (
            <div className="bg-blue-500/10 text-blue-500 p-1 rounded-full animate-pulse-subtle">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
          ) : task.status === "failed" ? (
            <div className="bg-red-500/10 text-red-500 p-1 rounded-full">
              <Circle className="w-4 h-4" />
            </div>
          ) : (
            <div className="bg-muted/10 text-muted-foreground p-1 rounded-full">
              <Circle className="w-4 h-4" />
            </div>
          )}
        </div>

        {/* Middle: Label & Progress */}
        <div className="relative z-10 flex-1 min-w-0 flex flex-col">
          <div className="flex items-center justify-between">
            <span
              className={cn(
                "text-sm font-medium truncate transition-colors",
                isExpanded ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
              )}
            >
              {task.label}
            </span>
          </div>
        </div>

        {/* Right Side: Artifacts & Chevron */}
        <div className="relative z-10 flex items-center gap-4">
          {/* Artifact Stats (Chips) */}
          {task.artifacts.length > 0 && (
            <div className="flex items-center gap-1.5 mr-2">
              {grouped.docs.length > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const doc = grouped.docs[0];
                    if (doc) {
                      onArtifactClick?.(doc, task);
                    }
                  }}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/10 hover:bg-blue-500/20 transition-colors"
                  title={`${grouped.docs.length} Documents`}
                >
                  <FileText className="w-3 h-3" />
                  <span className="text-[10px] font-mono font-medium">{grouped.docs.length}</span>
                </button>
              )}
              {grouped.images.length > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const image = grouped.images[0];
                    if (image) {
                      onArtifactClick?.(image, task);
                    }
                  }}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/10 hover:bg-purple-500/20 transition-colors"
                  title={`${grouped.images.length} Images`}
                >
                  <ImageIcon className="w-3 h-3" />
                  <span className="text-[10px] font-mono font-medium">{grouped.images.length}</span>
                </button>
              )}
              {grouped.links.length > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const link = grouped.links[0];
                    if (link) {
                      onArtifactClick?.(link, task);
                    }
                  }}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/10 hover:bg-orange-500/20 transition-colors"
                  title={`${grouped.links.length} Links`}
                >
                  <LinkIcon className="w-3 h-3" />
                  <span className="text-[10px] font-mono font-medium">{grouped.links.length}</span>
                </button>
              )}
            </div>
          )}

          {/* Chevron */}
          <div
            className={cn(
              "text-muted-foreground/50 transition-transform duration-200",
              isExpanded && "rotate-90 text-foreground"
            )}
          >
            <ChevronRight className="w-4 h-4" />
          </div>
        </div>
      </button>

      {/* Expanded Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden border-t border-border/5"
          >
            <div className="p-4 pt-2">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function TaskProgressWidget({
  tasks,
  expandedTaskId,
  onExpandTask,
  onArtifactClick,
  onReviewClick,
  className,
}: TaskProgressWidgetProps) {
  return (
    <div
      className={cn(
        "w-full max-w-2xl mx-auto",
        "bg-surface-1/90 backdrop-blur-xl border border-border/10 rounded-xl overflow-hidden",
        className
      )}
    >
      <div className="flex flex-col divide-y divide-border/5">
        <LayoutGroup>
          {tasks.map((task) => {
            const isExpanded = task.id === expandedTaskId;

            return (
              <TaskAccordionItem
                key={task.id}
                task={task}
                isExpanded={isExpanded}
                onToggle={() => onExpandTask?.(isExpanded ? null : task.id)}
                onArtifactClick={onArtifactClick}
              >
                {/* Only render details if expanded */}
                {isExpanded && <TaskDetails task={task} onReviewClick={onReviewClick} />}
              </TaskAccordionItem>
            );
          })}
        </LayoutGroup>
      </div>
    </div>
  );
}
