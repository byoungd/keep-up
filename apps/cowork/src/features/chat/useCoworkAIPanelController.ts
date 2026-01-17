import {
  getDefaultModelId,
  getModelCapability,
  MODEL_CATALOG,
  type ModelCapability,
  normalizeModelId,
} from "@ku0/ai-core";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type ChatAttachmentRef, updateSettings, uploadChatAttachment } from "../../api/coworkApi";
import { useWorkspace } from "../../app/providers/WorkspaceProvider";
import { detectIntent } from "../../lib/intentDetector";
import { parseSlashCommand } from "../../lib/slashCommands";
import { useChatSession } from "./hooks/useChatSession";
import { downloadFile, exportToJson, exportToMarkdown } from "./utils/chatExport";
import { generateTaskTitle } from "./utils/textUtils";

interface PanelAttachment {
  id: string;
  name: string;
  url: string;
  type: string;
  size: number;
  status: "processing" | "ready" | "sending" | "error";
  error?: string;
  previewUrl?: string;
}

export function useCoworkAIPanelController() {
  const { sessionId } = useParams({ strict: false }) as { sessionId: string };
  const navigate = useNavigate();
  const { activeWorkspaceId, createSessionForPath, createSessionWithoutGrant } = useWorkspace();

  const defaultModelId = useMemo(() => getDefaultModelId(), []);
  const [model, setModel] = useState(defaultModelId);
  const [input, setInput] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [branchParentId, setBranchParentId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<PanelAttachment[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingMessageRef = useRef<{
    content: string;
    mode: "chat" | "task";
    attachments?: ChatAttachmentRef[];
  } | null>(null);
  const pendingAttachmentRef = useRef<FileList | null>(null);
  const attachmentRefs = useRef(new Map<string, ChatAttachmentRef>());

  // Use unified session hook
  const {
    messages,
    sendMessage,
    sendAction,
    isSending,
    isLoading,
    isConnected,
    isLive,
    editMessage,
    retryMessage,
    agentMode,
    toggleMode,
    usage,
  } = useChatSession(sessionId);

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

  const clearAttachments = useCallback(() => {
    setAttachments((prev) => {
      for (const att of prev) {
        if (att.previewUrl) {
          URL.revokeObjectURL(att.previewUrl);
        }
      }
      return [];
    });
    attachmentRefs.current.clear();
  }, []);

  useEffect(() => {
    if (!sessionId || sessionId === "undefined") {
      return;
    }
    const pending = pendingMessageRef.current;
    if (!pending) {
      return;
    }
    pendingMessageRef.current = null;
    void sendMessage(pending.content, pending.mode, {
      modelId: model,
      attachments: pending.attachments,
    });
    if (pending.attachments && pending.attachments.length > 0) {
      clearAttachments();
    }
  }, [model, sessionId, sendMessage, clearAttachments]);

  const executeMessageSend = useCallback(
    async (
      resolvedContent: string,
      mode: "chat" | "task",
      nextAttachments: ChatAttachmentRef[],
      parentId?: string
    ) => {
      if (mode === "task") {
        setStatusMessage("Initiating task...");
      }

      if (editingMessageId) {
        await editMessage(editingMessageId, resolvedContent);
        setEditingMessageId(null);
      } else {
        await sendMessage(resolvedContent, mode, {
          modelId: model,
          attachments: mode === "chat" ? nextAttachments : undefined,
          parentId: mode === "chat" ? parentId : undefined,
        });
      }
      setBranchParentId(null);
      setStatusMessage(null);
    },
    [editingMessageId, editMessage, sendMessage, model]
  );

  const getSendBlocker = useCallback(() => {
    if (editingMessageId && attachments.length > 0) {
      return "Attachments are not supported while editing a message.";
    }
    if (attachments.some((attachment) => attachment.status === "processing")) {
      return "Wait for attachments to finish uploading.";
    }
    return null;
  }, [editingMessageId, attachments]);

  const queueSendAfterNavigation = useCallback(
    async (targetSessionId: string, content: string, mode: "chat" | "task") => {
      const readyRefs = getReadyAttachmentRefs(attachments, attachmentRefs.current);
      pendingMessageRef.current = { content, mode, attachments: readyRefs };
      setBranchParentId(null);
      await navigate({
        to: "/sessions/$sessionId",
        params: { sessionId: targetSessionId },
      });
    },
    [attachments, navigate]
  );

  const sendInSession = useCallback(
    async (resolvedContent: string, mode: "chat" | "task", parentId?: string) => {
      const readyRefs = getReadyAttachmentRefs(attachments, attachmentRefs.current);
      await executeMessageSend(resolvedContent, mode, readyRefs, parentId);
      clearAttachments();
    },
    [attachments, executeMessageSend, clearAttachments]
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

      const blocker = getSendBlocker();
      if (blocker) {
        setStatusMessage(blocker);
        setInput(content);
        return;
      }

      const targetSessionId = await prepareSession(resolvedContent);
      if (targetSessionId !== sessionId) {
        await queueSendAfterNavigation(targetSessionId, resolvedContent, mode);
        return;
      }

      await sendInSession(resolvedContent, mode, branchParentId ?? undefined);
    } catch (_err) {
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
    resolveMessageMode,
    getSendBlocker,
    queueSendAfterNavigation,
    sendInSession,
    branchParentId,
  ]);

  const startEditing = useCallback(
    (id: string) => {
      const msg = messages.find((m) => m.id === id);
      if (msg && msg.role === "user") {
        setInput(msg.content);
        setEditingMessageId(id);
        setBranchParentId(null);
        inputRef.current?.focus();
      }
    },
    [messages]
  );

  const startBranching = useCallback((id: string) => {
    setEditingMessageId(null);
    setBranchParentId(id);
    setStatusMessage("Branching from selected message.");
    inputRef.current?.focus();
  }, []);

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
        const message = err instanceof Error ? err.message : "Failed to update model.";
        setStatusMessage(message);
      });
    },
    [defaultModelId, model]
  );

  const filteredModels = useMemo<ModelCapability[]>(() => MODEL_CATALOG, []);

  const handleExport = useCallback(
    (format: "markdown" | "json") => {
      if (!messages.length) {
        return;
      }
      if (format === "markdown") {
        const md = exportToMarkdown(messages);
        downloadFile(`chat-export-${sessionId || "session"}.md`, md, "text/markdown");
      } else {
        const json = exportToJson(messages);
        downloadFile(`chat-export-${sessionId || "session"}.json`, json, "application/json");
      }
    },
    [messages, sessionId]
  );

  const handleQuote = useCallback((content: string) => {
    setInput((prev) => {
      const quoteBlock = content
        .split("\n")
        .map((l) => `> ${l}`)
        .join("\n");
      return prev ? `${prev}\n\n${quoteBlock}\n\n` : `${quoteBlock}\n\n`;
    });
    setEditingMessageId(null);
    setBranchParentId(null);
    inputRef.current?.focus();
  }, []);

  const uploadFiles = useCallback(async (targetSessionId: string, files: FileList) => {
    const fileArray = Array.from(files);
    for (const file of fileArray) {
      const localId = crypto.randomUUID();
      const previewUrl = URL.createObjectURL(file);
      setAttachments((prev) => [
        ...prev,
        {
          id: localId,
          name: file.name,
          url: previewUrl,
          type: file.type,
          size: file.size,
          status: "processing",
          previewUrl,
        },
      ]);

      try {
        const ref = await uploadChatAttachment(targetSessionId, file);
        attachmentRefs.current.set(localId, ref);
        setAttachments((prev) =>
          prev.map((att) => (att.id === localId ? { ...att, status: "ready" } : att))
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "Attachment upload failed";
        setAttachments((prev) =>
          prev.map((att) =>
            att.id === localId ? { ...att, status: "error", error: message } : att
          )
        );
      }
    }
  }, []);

  useEffect(() => {
    if (!sessionId || sessionId === "undefined") {
      return;
    }
    const pending = pendingAttachmentRef.current;
    if (!pending) {
      return;
    }
    pendingAttachmentRef.current = null;
    void uploadFiles(sessionId, pending);
  }, [sessionId, uploadFiles]);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => {
      const target = prev.find((att) => att.id === id);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((att) => att.id !== id);
    });
    attachmentRefs.current.delete(id);
  }, []);

  const handleFileChange = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) {
        return;
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      const targetSessionId = await ensureActiveSession("Untitled Session");
      if (targetSessionId !== sessionId) {
        pendingAttachmentRef.current = files;
        await navigate({
          to: "/sessions/$sessionId",
          params: { sessionId: targetSessionId },
        });
        return;
      }

      await uploadFiles(targetSessionId, files);
    },
    [ensureActiveSession, sessionId, navigate, uploadFiles]
  );

  const handleAddAttachment = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

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
    attachments,
    onAddAttachment: handleAddAttachment,
    onRemoveAttachment: removeAttachment,
    fileInputRef,
    onFileChange: handleFileChange,
    isAttachmentBusy: attachments.some(
      (attachment) => attachment.status === "processing" || attachment.status === "sending"
    ),
    statusMessage,
    isConnected,
    isLive,
    // Tasks are now embedded in messages, but we can extract them if the UI needs a separate list
    tasks: [], // Deprecated in favor of inline task cards
    onExport: handleExport,
    onEdit: startEditing,
    onBranch: startBranching,
    onQuote: handleQuote,
    onRetry: retryMessage,
    editingMessageId,
    agentMode,
    toggleMode,
    usage,
  };
}

function getReadyAttachmentRefs(
  attachments: PanelAttachment[],
  refs: Map<string, ChatAttachmentRef>
): ChatAttachmentRef[] {
  const ready: ChatAttachmentRef[] = [];
  for (const attachment of attachments) {
    if (attachment.status !== "ready") {
      continue;
    }
    const ref = refs.get(attachment.id);
    if (ref) {
      ready.push(ref);
    }
  }
  return ready;
}
