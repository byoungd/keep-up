import type { CoworkTaskSummary, TaskQueueStats } from "@ku0/agent-runtime";

export type TaskStatusSnapshot = "queued" | "running" | "completed" | "failed" | "cancelled";

export type TaskSnapshot = {
  taskId: string;
  name: string;
  prompt: string;
  status: TaskStatusSnapshot;
  progress: number;
  progressMessage?: string;
  createdAt: number;
  queuedAt?: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
  summary?: CoworkTaskSummary;
};

export type TaskStreamEvent =
  | {
      type: "task.snapshot";
      timestamp: number;
      data: { tasks: TaskSnapshot[]; stats: TaskQueueStats };
    }
  | {
      type:
        | "task.queued"
        | "task.running"
        | "task.progress"
        | "task.completed"
        | "task.failed"
        | "task.cancelled";
      taskId: string;
      timestamp: number;
      data?: Record<string, unknown>;
    }
  | {
      type: "task.confirmation_required";
      taskId: string;
      timestamp: number;
      data: {
        confirmation_id: string;
        toolName: string;
        description: string;
        arguments: Record<string, unknown>;
        risk: "low" | "medium" | "high";
        reason?: string;
        riskTags?: string[];
        request_id: string;
      };
    }
  | {
      type: "task.confirmation_received";
      taskId: string;
      timestamp: number;
      data: { confirmation_id: string; confirmed: boolean };
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseTaskStreamEvent(payload: string): TaskStreamEvent | null {
  if (!payload) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return null;
  }

  if (!isRecord(parsed) || !("event" in parsed)) {
    return null;
  }

  const event = (parsed as { event?: unknown }).event;
  if (!isRecord(event) || typeof event.type !== "string") {
    return null;
  }

  return event as TaskStreamEvent;
}
