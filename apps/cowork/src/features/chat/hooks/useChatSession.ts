import type { Message } from "@ku0/shell";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createTask,
  getChatHistory,
  resolveApproval,
  sendChatMessage,
} from "../../../api/coworkApi";
import { useWorkspace } from "../../../app/providers/WorkspaceProvider";
import { useTaskStream } from "../../tasks/hooks/useTaskStream";
import { projectGraphToMessages } from "../utils/taskProjection";
import { generateTaskTitle } from "../utils/textUtils";

export function useChatSession(sessionId: string | undefined) {
  const { getSession, getWorkspace } = useWorkspace();
  const session = sessionId ? getSession(sessionId) : null;
  const workspace = session ? getWorkspace(session.workspaceId) : null;

  const [historyMessages, setHistoryMessages] = useState<Message[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Subscribe to the real-time task stream
  const { graph, isConnected, isLive } = useTaskStream(sessionId ?? "");

  // Load initial chat history
  useEffect(() => {
    setHistoryMessages([]);
    if (!sessionId || sessionId === "undefined") {
      return;
    }

    let isActive = true;
    setIsLoadingHistory(true);
    getChatHistory(sessionId)
      .then((history) => {
        if (!isActive) {
          return;
        }
        const mapped: Message[] = history.map((msg) => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          createdAt: msg.createdAt,
          status: "done",
          type: "text",
        }));
        setHistoryMessages((prev) => mergeHistory(prev, mapped));
      })
      .catch((_err) => {
        if (!isActive) {
          return;
        }
        setError("Failed to load chat history");
      })
      .finally(() => {
        if (!isActive) {
          return;
        }
        setIsLoadingHistory(false);
      });
    return () => {
      isActive = false;
    };
  }, [sessionId]);

  // Merge History + Real-time Graph
  // Filter out task_stream from historyMessages - graph is the source of truth for tasks
  const messages = useMemo(() => {
    const chatOnlyHistory = historyMessages.filter((m) => m.type !== "task_stream");
    return projectGraphToMessages(graph, chatOnlyHistory);
  }, [graph, historyMessages]);

  const addOptimisticMessage = useCallback((content: string, tempId: string) => {
    const optimisticMsg: Message = {
      id: tempId,
      role: "user",
      content,
      createdAt: Date.now(),
      status: "pending",
      type: "text",
    };
    setHistoryMessages((prev) => [...prev, optimisticMsg]);
  }, []);

  const handleSendTask = useCallback(
    async (sessionId: string, content: string, tempId: string, modelId?: string) => {
      const title = generateTaskTitle(content);
      const task = await createTask(sessionId, { prompt: content, title, modelId });
      const taskStatus = mapTaskStatus(task.status);
      const taskMessage: Message = {
        id: `task-stream-${task.taskId}`,
        role: "assistant",
        content: "",
        createdAt: task.createdAt ?? Date.now(),
        status: taskStatus === "running" ? "streaming" : "done",
        type: "task_stream",
        modelId: task.modelId,
        providerId: task.providerId,
        metadata: {
          task: {
            id: task.taskId,
            label: task.title ?? "Task",
            status: taskStatus,
            progress: taskStatus === "completed" ? 100 : 0,
            steps: [
              {
                id: `task-${task.taskId}-queued`,
                label: taskStatus === "completed" ? "Completed" : "Queued",
                status: taskStatus === "completed" ? "completed" : "pending",
              },
            ],
            artifacts: [],
          },
        },
      };
      setHistoryMessages((prev) => {
        const next = prev.map((m) => (m.id === tempId ? { ...m, status: "done" as const } : m));
        return next.some((m) => m.id === taskMessage.id) ? next : [...next, taskMessage];
      });
    },
    []
  );

  const handleSendChat = useCallback(
    async (sessionId: string, content: string, tempId: string, modelId?: string) => {
      const assistantId = crypto.randomUUID();
      setHistoryMessages((prev) => [
        ...prev,
        {
          id: assistantId,
          role: "assistant",
          content: "",
          createdAt: Date.now(),
          status: "streaming",
          type: "text",
          modelId,
        },
      ]);

      let fullContent = "";
      const response = await sendChatMessage(
        sessionId,
        { content },
        (chunk) => {
          fullContent += chunk;
          setHistoryMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: fullContent } : m))
          );
        },
        (meta) => {
          setHistoryMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    modelId: meta.modelId,
                    providerId: meta.providerId,
                    fallbackNotice: meta.fallbackNotice,
                  }
                : m
            )
          );
        }
      );

      setHistoryMessages((prev) =>
        prev
          .map((m) => (m.id === tempId ? { ...m, status: "done" as const } : m))
          .map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: response.content || fullContent || "No response received.",
                  status: response.content || fullContent ? "done" : "error",
                  modelId: response.modelId,
                  providerId: response.providerId,
                  fallbackNotice: response.fallbackNotice,
                }
              : m
          )
      );
    },
    []
  );

  const sendAction = useCallback(
    async (type: "approve" | "reject", metadata: { approvalId: string }) => {
      // Optimistically update history
      setHistoryMessages((prev) =>
        prev.map((m) =>
          m.metadata?.approvalId === metadata.approvalId
            ? { ...m, status: "pending" as const } // Temporary status if supported, or keep as is but we know it's loading
            : m
        )
      );

      try {
        const status = type === "approve" ? "approved" : "rejected";
        await resolveApproval(metadata.approvalId, status);

        // On success, mark as done
        setHistoryMessages((prev) =>
          prev.map((m) =>
            m.metadata?.approvalId === metadata.approvalId ? { ...m, status: "done" as const } : m
          )
        );
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Action failed";

        // Rollback / Show error
        setHistoryMessages((prev) =>
          prev.map((m) =>
            m.metadata?.approvalId === metadata.approvalId
              ? { ...m, status: "error" as const, metadata: { ...m.metadata, error: errorMessage } }
              : m
          )
        );
        // Re-throw to let caller handle generic alerts if needed
        throw error;
      }
    },
    []
  );

  const sendMessage = useCallback(
    async (content: string, type: "chat" | "task" = "chat", options?: { modelId?: string }) => {
      if (!sessionId || !content.trim()) {
        return;
      }

      setIsSending(true);
      setError(null);

      const tempId = crypto.randomUUID();
      addOptimisticMessage(content, tempId);

      try {
        if (type === "task") {
          await handleSendTask(sessionId, content, tempId, options?.modelId);
        } else {
          await handleSendChat(sessionId, content, tempId, options?.modelId);
        }
      } catch (err) {
        const errorDetail = err instanceof Error ? err.message : "Unknown error";
        setError(`Failed to send message: ${errorDetail}`);
        setHistoryMessages((prev) =>
          prev.map((m) =>
            m.id === tempId || (m.role === "assistant" && m.status === "streaming")
              ? { ...m, status: "error" as const }
              : m
          )
        );
      } finally {
        setIsSending(false);
      }
    },
    [sessionId, handleSendTask, handleSendChat, addOptimisticMessage]
  );

  return {
    messages,
    sendMessage,
    sendAction,
    isSending,
    isLoading: isLoadingHistory || isSending,
    isConnected,
    isLive,
    error,
    workspace,
    session,
  };
}

function mergeHistory(existing: Message[], history: Message[]): Message[] {
  const merged = new Map<string, Message>();
  // First add all history messages
  for (const msg of history) {
    merged.set(msg.id, msg);
  }
  // Then overlay existing messages that are actively streaming or newer
  for (const msg of existing) {
    const previous = merged.get(msg.id);
    if (!previous) {
      // New message not in history
      merged.set(msg.id, msg);
    } else if (msg.status === "streaming" || msg.status === "pending") {
      // Keep actively streaming/pending messages (optimistic updates)
      merged.set(msg.id, msg);
    } else if ((msg.createdAt ?? 0) > (previous.createdAt ?? 0)) {
      // Keep newer version by timestamp
      merged.set(msg.id, msg);
    }
    // Otherwise keep the history version (more authoritative)
  }
  return Array.from(merged.values()).sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
}

function mapTaskStatus(
  status: string
): "queued" | "running" | "completed" | "paused" | "failed" | "cancelled" {
  switch (status) {
    case "running":
    case "planning":
    case "ready":
      return "running";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    default:
      return "queued";
  }
}
