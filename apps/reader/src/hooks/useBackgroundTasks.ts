"use client";

import { aiClient } from "@/lib/ai/aiClientService";
import { type TaskSnapshot, type TaskStreamEvent, parseTaskStreamEvent } from "@/lib/ai/taskStream";
import { createNotifier } from "@/lib/errors/notify";
import type { TaskQueueStats } from "@ku0/agent-runtime";
import * as React from "react";

type TaskApprovalRequest = {
  taskId: string;
  confirmationId: string;
  toolName: string;
  description: string;
  arguments: Record<string, unknown>;
  risk: "low" | "medium" | "high";
  reason?: string;
  riskTags?: string[];
  requestId?: string;
};

const notifier = createNotifier("useBackgroundTasks");

type TaskNotifications = {
  completed: (name: string) => string;
  failed: (name: string) => string;
  cancelled: (name: string) => string;
  streamError: string;
};

type TaskEventWithId = Extract<TaskStreamEvent, { taskId: string }>;

function sortTasks(tasks: TaskSnapshot[]): TaskSnapshot[] {
  return [...tasks].sort((a, b) => b.createdAt - a.createdAt);
}

function extractTaskSnapshot(event: TaskStreamEvent): TaskSnapshot | null {
  if (!("data" in event)) {
    return null;
  }
  const data = event.data;
  if (!data || typeof data !== "object") {
    return null;
  }
  const task = (data as Record<string, unknown>).task;
  if (!task || typeof task !== "object") {
    return null;
  }
  return task as TaskSnapshot;
}

function isTaskEventWithId(event: TaskStreamEvent): event is TaskEventWithId {
  return "taskId" in event;
}

export function useBackgroundTasks(notifications?: TaskNotifications) {
  const [tasks, setTasks] = React.useState<TaskSnapshot[]>([]);
  const [stats, setStats] = React.useState<TaskQueueStats | null>(null);
  const [pendingApprovals, setPendingApprovals] = React.useState<TaskApprovalRequest[]>([]);
  const [approvalBusy, setApprovalBusy] = React.useState(false);
  const [approvalError, setApprovalError] = React.useState<string | null>(null);
  const [streamError, setStreamError] = React.useState<string | null>(null);

  const taskMapRef = React.useRef<Map<string, TaskSnapshot>>(new Map());

  const upsertTask = React.useCallback((task: TaskSnapshot) => {
    taskMapRef.current.set(task.taskId, task);
    setTasks(sortTasks(Array.from(taskMapRef.current.values())));
  }, []);

  const replaceTasks = React.useCallback((snapshotTasks: TaskSnapshot[]) => {
    taskMapRef.current = new Map(snapshotTasks.map((task) => [task.taskId, task]));
    setTasks(sortTasks(snapshotTasks));
  }, []);

  const removeApproval = React.useCallback((confirmationId: string) => {
    setPendingApprovals((prev) => prev.filter((item) => item.confirmationId !== confirmationId));
  }, []);

  const handleSnapshot = React.useCallback(
    (event: Extract<TaskStreamEvent, { type: "task.snapshot" }>) => {
      replaceTasks(event.data.tasks ?? []);
      setStats(event.data.stats);
    },
    [replaceTasks]
  );

  const handleConfirmationRequired = React.useCallback(
    (event: Extract<TaskStreamEvent, { type: "task.confirmation_required" }>) => {
      setPendingApprovals((prev) => {
        if (prev.some((item) => item.confirmationId === event.data.confirmation_id)) {
          return prev;
        }
        return [
          ...prev,
          {
            taskId: event.taskId,
            confirmationId: event.data.confirmation_id,
            toolName: event.data.toolName,
            description: event.data.description,
            arguments: event.data.arguments,
            risk: event.data.risk,
            reason: event.data.reason,
            riskTags: event.data.riskTags,
            requestId: event.data.request_id,
          },
        ];
      });
    },
    []
  );

  const handleConfirmationReceived = React.useCallback(
    (event: Extract<TaskStreamEvent, { type: "task.confirmation_received" }>) => {
      removeApproval(event.data.confirmation_id);
    },
    [removeApproval]
  );

  const handleTaskUpdate = React.useCallback(
    (event: TaskEventWithId) => {
      const snapshot = extractTaskSnapshot(event);
      if (snapshot) {
        upsertTask(snapshot);
      }

      if (!notifications) {
        return;
      }

      const taskName = snapshot?.name ?? event.taskId;
      if (event.type === "task.completed") {
        notifier.success(notifications.completed(taskName));
      } else if (event.type === "task.failed") {
        notifier.error(new Error(notifications.failed(taskName)));
      } else if (event.type === "task.cancelled") {
        notifier.warning(notifications.cancelled(taskName));
      }
    },
    [notifications, upsertTask]
  );

  const handleEvent = React.useCallback(
    (event: TaskStreamEvent) => {
      if (event.type === "task.snapshot") {
        handleSnapshot(event);
        return;
      }
      if (event.type === "task.confirmation_required") {
        handleConfirmationRequired(event);
        return;
      }
      if (event.type === "task.confirmation_received") {
        handleConfirmationReceived(event);
        return;
      }
      if (isTaskEventWithId(event)) {
        handleTaskUpdate(event);
      }
    },
    [handleSnapshot, handleConfirmationRequired, handleConfirmationReceived, handleTaskUpdate]
  );

  const streamErrorMessage =
    notifications?.streamError ?? "Unable to connect to background task stream.";

  React.useEffect(() => {
    let active = true;
    let source: EventSource | null = null;
    let reconnectTimer: number | null = null;
    let attempt = 0;

    const connect = () => {
      if (!active) {
        return;
      }
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      source = new EventSource("/api/ai/agent/tasks/stream");
      source.onopen = () => {
        attempt = 0;
        setStreamError(null);
      };
      source.onmessage = (message) => {
        const event = parseTaskStreamEvent(message.data);
        if (event) {
          handleEvent(event);
        }
      };
      source.onerror = () => {
        source?.close();
        if (!active) {
          return;
        }
        setStreamError(streamErrorMessage);
        attempt += 1;
        const delay = Math.min(30000, 1000 * 2 ** (attempt - 1));
        reconnectTimer = window.setTimeout(connect, delay);
      };
    };

    connect();
    return () => {
      active = false;
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }
      source?.close();
    };
  }, [handleEvent, streamErrorMessage]);

  const enqueueTask = React.useCallback(
    async (payload: {
      prompt: string;
      model: string;
      name?: string;
      history?: Array<{ role: "user" | "assistant"; content: string }>;
      systemPrompt?: string;
    }) => {
      setStreamError(null);
      const response = await fetch("/api/ai/agent/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: payload.prompt,
          model: payload.model,
          name: payload.name,
          messages: payload.history,
          systemPrompt: payload.systemPrompt,
        }),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to enqueue background task");
      }

      const result = (await response.json()) as { task_id?: string };
      if (!result.task_id) {
        throw new Error("Background task ID missing");
      }
      return result.task_id;
    },
    []
  );

  const cancelTask = React.useCallback(async (taskId: string) => {
    const response = await fetch(`/api/ai/agent/tasks/${taskId}/cancel`, { method: "POST" });
    if (!response.ok) {
      throw new Error("Failed to cancel task");
    }
  }, []);

  const confirmApproval = React.useCallback(
    async (approval: TaskApprovalRequest, confirmed: boolean) => {
      if (approvalBusy) {
        return;
      }

      setApprovalBusy(true);
      setApprovalError(null);
      try {
        await aiClient.confirm({
          confirmationId: approval.confirmationId,
          confirmed,
          requestId: approval.requestId,
        });
        removeApproval(approval.confirmationId);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Approval failed";
        setApprovalError(message);
      } finally {
        setApprovalBusy(false);
      }
    },
    [approvalBusy, removeApproval]
  );

  const approveNext = React.useCallback(() => {
    const approval = pendingApprovals[0];
    if (!approval) {
      return;
    }
    void confirmApproval(approval, true);
  }, [confirmApproval, pendingApprovals]);

  const rejectNext = React.useCallback(() => {
    const approval = pendingApprovals[0];
    if (!approval) {
      return;
    }
    void confirmApproval(approval, false);
  }, [confirmApproval, pendingApprovals]);

  return {
    tasks,
    stats,
    streamError,
    pendingApproval: pendingApprovals[0] ?? null,
    approvalBusy,
    approvalError,
    enqueueTask,
    cancelTask,
    approveNext,
    rejectNext,
  };
}
