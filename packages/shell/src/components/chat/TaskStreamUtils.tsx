import {
  CheckCircle2,
  Circle,
  FileDiff,
  FileText,
  Image as ImageIcon,
  Link as LinkIcon,
  Loader2,
  AlertCircle as LucideAlertCircle,
  Terminal,
} from "lucide-react";
import type { AgentTask, ArtifactItem, TaskStep } from "./types";

// ----------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------

export interface TaskStreamMessageProps {
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

// ----------------------------------------------------------------------
// Utils
// ----------------------------------------------------------------------

// ----------------------------------------------------------------------
// Theme Tokens "Linear-Style"
// ----------------------------------------------------------------------

export const TASK_THEME = {
  // Status Colors (Backgrounds, Text, Badges)
  status: {
    running: {
      text: "text-warning",
      bg: "bg-warning/10",
      badge: "bg-warning/5",
      icon: "text-warning",
    },
    queued: {
      text: "text-muted-foreground",
      bg: "bg-surface-2",
      badge: "bg-surface-2/50",
      icon: "text-muted-foreground/60",
    },
    completed: {
      text: "text-primary",
      bg: "bg-primary/10",
      badge: "bg-primary/5",
      icon: "text-primary",
    },
    failed: {
      text: "text-error",
      bg: "bg-error/10",
      badge: "bg-error/5",
      icon: "text-error",
    },
    paused: {
      text: "text-warning",
      bg: "bg-warning/10",
      badge: "bg-warning/5",
      icon: "text-warning",
    },
  },
  // Animation Curves (Snappy vs Bouncy)
  motion: {
    spring: { type: "spring", stiffness: 350, damping: 25 },
    bezier: [0.23, 1, 0.32, 1], // Cubic bezier for snappy transitions
  },
  // Typography
  type: {
    stepIndex: "text-micro font-mono tabular-nums text-muted-foreground/40 select-none",
    stepLabel: "text-chrome font-medium leading-[1.5] tracking-[-0.01em]",
    meta: "text-fine text-muted-foreground/70 font-medium",
  },
} as const;

export function getStatusMeta(status: AgentTask["status"]) {
  switch (status) {
    case "running":
      return {
        label: "In Progress",
        icon: <Loader2 className="h-3.5 w-3.5" aria-hidden="true" />,
        textClass: TASK_THEME.status.running.text,
        bgClass: TASK_THEME.status.running.bg,
        badgeBg: TASK_THEME.status.running.badge,
      };
    case "queued":
      return {
        label: "Queued",
        icon: <Circle className="h-3.5 w-3.5" aria-hidden="true" />,
        textClass: TASK_THEME.status.queued.text,
        bgClass: TASK_THEME.status.queued.bg,
        badgeBg: TASK_THEME.status.queued.badge,
      };
    case "completed":
      return {
        label: "Done",
        icon: <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />,
        textClass: TASK_THEME.status.completed.text,
        bgClass: TASK_THEME.status.completed.bg,
        badgeBg: TASK_THEME.status.completed.badge,
      };
    case "failed":
      return {
        label: "Failed",
        icon: <LucideAlertCircle className="h-3.5 w-3.5" aria-hidden="true" />,
        textClass: TASK_THEME.status.failed.text,
        bgClass: TASK_THEME.status.failed.bg,
        badgeBg: TASK_THEME.status.failed.badge,
      };
    case "paused": // Review state
      return {
        label: "Review",
        icon: (
          <div
            className="h-2.5 w-2.5 rounded-full border-[2.5px] border-warning"
            aria-hidden="true"
          />
        ),
        textClass: TASK_THEME.status.paused.text,
        bgClass: TASK_THEME.status.paused.bg,
        badgeBg: TASK_THEME.status.paused.badge,
      };
    default:
      return {
        label: "Working",
        icon: <Circle className="h-3.5 w-3.5 opacity-50" aria-hidden="true" />,
        textClass: "text-muted-foreground",
        bgClass: "bg-surface-2",
        badgeBg: "bg-surface-2",
      };
  }
}

export function getArtifactIcon(type: ArtifactItem["type"]) {
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

// ... existing code ...

export function buildFallbackStep(status: AgentTask["status"], taskId: string): TaskStep {
  const label =
    status === "completed" ? "Completed" : status === "failed" ? "Failed" : "Planning & Execution";
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

export function normalizeSteps(steps: TaskStep[]): TaskStep[] {
  if (steps.length <= 1) {
    return steps;
  }
  const cleaned = steps.filter((step) => step.label.trim().length > 0);
  const withoutPlaceholders = cleaned.filter((step) => !isStatusPlaceholder(step.label));
  const base = withoutPlaceholders.length > 0 ? withoutPlaceholders : cleaned;
  const deduped = dedupeSteps(base);
  return deduped.length > 0 ? deduped : steps;
}

export function dedupeSteps(steps: TaskStep[]): TaskStep[] {
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

export function isStatusPlaceholder(label: string): boolean {
  const normalized = label.trim().toLowerCase();
  return (
    normalized === "queued" ||
    normalized === "planning" ||
    normalized === "ready" ||
    normalized === "running" ||
    normalized === "working" ||
    normalized === "completed" ||
    normalized === "failed" ||
    normalized === "executing task"
  );
}

export function buildPreviewText(content?: string): string | undefined {
  if (!content) {
    return undefined;
  }
  const normalized = stripMarkdown(content);
  return normalized || undefined;
}

export function stripMarkdown(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*>\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

export function formatElapsedTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}
