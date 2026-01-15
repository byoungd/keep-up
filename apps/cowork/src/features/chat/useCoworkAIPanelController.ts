import {
  MODEL_CATALOG,
  type ModelCapability,
  getDefaultModelId,
  getModelCapability,
  normalizeModelId,
} from "@ku0/ai-core";
import type { Message } from "@ku0/shell";
import { useParams } from "@tanstack/react-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { createTask } from "../../api/coworkApi";
import { useWorkspace } from "../../app/providers/WorkspaceProvider";
import { useTaskStream } from "../tasks/hooks/useTaskStream";
import type { TaskGraph } from "../tasks/types";

export function useCoworkAIPanelController() {
  const { sessionId } = useParams({ strict: false }) as { sessionId: string };
  const { getSession, getWorkspace } = useWorkspace();
  const session = sessionId ? getSession(sessionId) : null;
  const workspace = session ? getWorkspace(session.workspaceId) : null;

  const defaultModelId = useMemo(() => getDefaultModelId(), []);
  const [model, setModel] = useState(defaultModelId);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Subscribe to task stream
  const { graph, isConnected } = useTaskStream(sessionId);

  // Derive messages from graph nodes
  const messages = useMemo<Message[]>(
    () => generateMessages(graph.nodes, workspace?.name, sessionId, session?.createdAt),
    [graph.nodes, workspace?.name, sessionId, session?.createdAt]
  );

  const handleSend = useCallback(async () => {
    if (!input.trim() || !sessionId || isSending) {
      return;
    }

    const content = input.trim();
    setInput("");
    setIsSending(true);

    try {
      await createTask(sessionId, { prompt: content });
    } catch (err) {
      console.error("Failed to create task:", err);
    } finally {
      setIsSending(false);
    }
  }, [input, sessionId, isSending]);

  const handleAbort = useCallback(() => {
    /* No abort logic required for this controller */
  }, []);

  const filteredModels = useMemo<ModelCapability[]>(() => MODEL_CATALOG, []);

  const handleSetModel = useCallback(
    (nextModel: string) => {
      const normalized = normalizeModelId(nextModel) ?? nextModel;
      const resolved = getModelCapability(normalized);
      setModel(resolved?.id ?? defaultModelId);
    },
    [defaultModelId]
  );

  return {
    messages,
    input,
    setInput,
    inputRef,
    listRef,
    isLoading: !isConnected,
    isStreaming: isSending,
    model,
    setModel: handleSetModel,
    filteredModels,
    handleSend,
    handleAbort,
    // Add other properties required by ShellAIPanel
    pendingApproval: null,
    approvalBusy: false,
    approvalError: null,
    attachments: [],
    onAddAttachment: () => {
      /* Attachments not supported yet */
    },
    onRemoveAttachment: () => {
      /* Attachments not supported yet */
    },
    fileInputRef: { current: null },
    onFileChange: () => {
      /* Attachments not supported yet */
    },
  };
}

function generateMessages(
  nodes: TaskGraph["nodes"],
  workspaceName: string | undefined,
  sessionId: string | undefined,
  sessionCreatedAt: number | undefined
): Message[] {
  const msgs: Message[] = [
    {
      id: "initial",
      role: "assistant",
      content:
        sessionId && sessionId !== "undefined"
          ? `Session ready${workspaceName ? ` for ${workspaceName}` : ""}. Ask me to plan or execute a task.`
          : "Please select a session from the sidebar to start chatting.",
      createdAt: sessionCreatedAt ?? Date.now(),
      status: "done",
    },
  ];

  for (const node of nodes) {
    if (node.type === "thinking") {
      msgs.push({
        id: String(node.id),
        role: "assistant",
        content: String(node.content),
        createdAt: new Date(node.timestamp).getTime(),
        status: "done",
      });
    }
  }

  return msgs;
}
