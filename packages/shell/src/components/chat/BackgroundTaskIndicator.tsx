"use client";

import { cn } from "@ku0/shared/utils";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import type { AgentTask } from "./types";

const ACTIVE_STATUSES = new Set<AgentTask["status"]>(["queued", "running", "paused"]);

export interface BackgroundTaskIndicatorProps {
  tasks: AgentTask[];
  onViewTask?: (taskId: string) => void;
  className?: string;
}

function formatTaskLabel(count: number, stateLabel: string): string {
  const noun = count === 1 ? "task" : "tasks";
  return `${count} ${noun} ${stateLabel}`;
}

export function BackgroundTaskIndicator({
  tasks,
  onViewTask,
  className,
}: BackgroundTaskIndicatorProps) {
  const activeTasks = tasks.filter((task) => ACTIVE_STATUSES.has(task.status));

  if (activeTasks.length === 0) {
    return null;
  }

  const hasRunning = activeTasks.some((task) => task.status === "running");
  const hasPaused = activeTasks.some((task) => task.status === "paused");
  const stateLabel = hasRunning ? "running" : hasPaused ? "awaiting approval" : "queued";
  const label = formatTaskLabel(activeTasks.length, stateLabel);

  const badge = (
    <Badge
      variant={hasRunning || hasPaused ? "warning" : "secondary"}
      className={cn("gap-2 px-2.5 py-1 text-micro font-semibold", className)}
    >
      <span
        className={cn(
          "h-2 w-2 rounded-full",
          hasRunning ? "bg-accent-amber" : hasPaused ? "bg-accent-blue" : "bg-muted-foreground/60"
        )}
        aria-hidden="true"
      />
      <span>{label}</span>
    </Badge>
  );

  if (!onViewTask) {
    return badge;
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="compact"
      className="h-auto p-0 rounded-full hover:bg-transparent"
      onClick={() => onViewTask(activeTasks[0].id)}
    >
      {badge}
    </Button>
  );
}
