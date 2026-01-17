import {
  MODEL_CATALOG,
  type ModelCapability,
  getDefaultModelId,
  getModelCapability,
  normalizeModelId,
} from "@ku0/ai-core";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { updateSettings } from "../../api/coworkApi";
import { useWorkspace } from "../../app/providers/WorkspaceProvider";
import { detectIntent } from "../../lib/intentDetector";
import { parseSlashCommand } from "../../lib/slashCommands";
import { useChatSession } from "./hooks/useChatSession";
import { generateTaskTitle } from "./utils/textUtils";

export function useCoworkAIPanelController() {
  const { sessionId } = useParams({ strict: false }) as { sessionId: string };
  const navigate = useNavigate();
  const { activeWorkspaceId, createSessionForPath, createSessionWithoutGrant } = useWorkspace();

  const defaultModelId = useMemo(() => getDefaultModelId(), []);
  const [model, setModel] = useState(defaultModelId);
  const [input, setInput] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const pendingMessageRef = useRef<{ content: string; mode: "chat" | "task" } | null>(null);

  // Use unified session hook
  const { messages, sendMessage, sendAction, isSending, isLoading, isConnected, isLive } =
    useChatSession(sessionId);

  // Helper to ensure we have a valid session before sending
  const ensureActiveSession = useCallback(
    async (title?: string) => {
      if (sessionId && sessionId !== "undefined") {
        return sessionId;
      }
      return activeWorkspaceId
        ? (await createSessionForPath(activeWorkspaceId, title)).id
        : (await createSessionWithoutGrant(title)).id;
    },
    [sessionId, activeWorkspaceId, createSessionForPath, createSessionWithoutGrant]
  );

  useEffect(() => {
    if (!sessionId || sessionId === "undefined") {
      return;
    }
    const pending = pendingMessageRef.current;
    if (!pending) {
      return;
    }
    pendingMessageRef.current = null;
    void sendMessage(pending.content, pending.mode, { modelId: model });
  }, [model, sessionId, sendMessage]);

  const resolveMessageMode = useCallback(
    (content: string): { resolvedContent: string; mode: "chat" | "task"; error?: string } => {
      const command = parseSlashCommand(content);
      if (command.type === "help") {
        return {
          resolvedContent: content,
          mode: "chat",
          error: "Help command not fully supported yet.",
        };
      }

      if (command.type === "task") {
        if (!command.prompt) {
          return {
            resolvedContent: content,
            mode: "chat",
            error: "Please provide a prompt after /task",
          };
        }
        return { resolvedContent: command.prompt, mode: "task" };
      }

      const intentResult = detectIntent(content);
      const mode =
        intentResult.intent === "task" && intentResult.confidence === "high" ? "task" : "chat";
      return { resolvedContent: content, mode };
    },
    []
  );

  const prepareSession = useCallback(
    async (content: string) => {
      const derivedTitle = generateTaskTitle(content);
      const sessionTitle = derivedTitle === "New Task" ? "Untitled Session" : derivedTitle;
      return ensureActiveSession(sessionTitle);
    },
    [ensureActiveSession]
  );

  const handleSend = useCallback(async () => {
    const content = input.trim();
    if (!content || isSending) {
      return;
    }

    setStatusMessage(null);
    setInput("");

    try {
      const { resolvedContent, mode, error } = resolveMessageMode(content);
      if (error) {
        setStatusMessage(error);
        if (error.includes("prompt")) {
          setInput(content);
        }
        return;
      }

      const targetSessionId = await prepareSession(resolvedContent);

      if (targetSessionId !== sessionId) {
        pendingMessageRef.current = { content: resolvedContent, mode };
        await navigate({
          to: "/sessions/$sessionId",
          params: { sessionId: targetSessionId },
        });
        return;
      }

      if (mode === "task") {
        setStatusMessage("Initiating task...");
      }

      await sendMessage(resolvedContent, mode, { modelId: model });
      setStatusMessage(null);
    } catch (err) {
      console.error("Failed to send message:", err);
      setInput(content);
      setStatusMessage(
        "Unable to send message. Ensure the Cowork server is running, then try again."
      );
    }
  }, [
    input,
    isSending,
    sessionId,
    prepareSession,
    navigate,
    sendMessage,
    model,
    resolveMessageMode,
  ]);

  const handleSetModel = useCallback(
    (nextModel: string) => {
      const normalized = normalizeModelId(nextModel) ?? nextModel;
      const resolved = getModelCapability(normalized);
      const modelId = resolved?.id ?? defaultModelId;
      if (!modelId || modelId === model) {
        return;
      }
      setModel(modelId);
      updateSettings({ defaultModel: modelId }).catch((err) => {
        console.error("Failed to update model:", err);
        const message = err instanceof Error ? err.message : "Failed to update model.";
        setStatusMessage(message);
      });
    },
    [defaultModelId, model]
  );

  const filteredModels = useMemo<ModelCapability[]>(() => MODEL_CATALOG, []);

  return {
    messages,
    input,
    setInput,
    inputRef,
    listRef,
    isLoading,
    isStreaming: isSending,
    model,
    setModel: handleSetModel,
    filteredModels,
    handleSend,
    handleAbort: () => {
      /* Not implemented yet */
    },
    handleTaskAction: sendAction,
    approvalBusy: false,
    approvalError: null,
    attachments: [],
    // Attachments not supported yet
    onAddAttachment: () => {
      /* Not implemented yet */
    },
    onRemoveAttachment: () => {
      /* Not implemented yet */
    },
    fileInputRef: { current: null },
    onFileChange: () => {
      /* Not implemented yet */
    },
    statusMessage,
    isConnected,
    isLive,
    // Tasks are now embedded in messages, but we can extract them if the UI needs a separate list
    tasks: [], // Deprecated in favor of inline task cards
  };
}
