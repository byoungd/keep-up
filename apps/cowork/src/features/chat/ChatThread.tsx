import {
  getDefaultModelId,
  getModelCapability,
  MODEL_CATALOG,
  normalizeModelId,
} from "@ku0/ai-core";
import {
  type AgentTask,
  BackgroundTaskIndicator,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  AIPanel as ShellAIPanel,
} from "@ku0/shell";
import { Download } from "lucide-react";
import React, { useCallback, useMemo } from "react";
import { type ChatAttachmentRef, updateSettings, uploadChatAttachment } from "../../api/coworkApi";
import { CostMeter } from "./components/CostMeter";
import { ModeToggle } from "./components/ModeToggle";
import { useChatSession } from "./hooks/useChatSession";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { downloadFile, exportToJson, exportToMarkdown } from "./utils/exportUtils";

// ChatMessage is no longer used, we use Message from @ku0/shell via useChatSession

type PanelAttachment = {
  id: string;
  name: string;
  url: string;
  type: string;
  size: number;
  status: "processing" | "ready" | "sending" | "error";
  error?: string;
  previewUrl?: string;
};

const TRANSLATIONS = {
  title: "Session Chat",
  statusStreaming: "Streaming...",
  statusDone: "Done",
  statusError: "Error",
  statusCanceled: "Canceled",
  emptyTitle: "What can I do for you?",
  emptyDescription: "Assign a task or ask anything.",
  you: "You",
  assistant: "Assistant",
  actionEdit: "Edit",
  actionBranch: "Branch",
  actionQuote: "Quote",
  actionCopy: "Copy",
  actionRetry: "Retry",
  requestIdLabel: "Request ID",
  copyLast: "Copy Last",
  newChat: "New Chat",
  closePanel: "Close",
  exportChat: "Export",
  attachmentsLabel: "Attachments",
  addImage: "Add Image",
  runBackground: "Run in Background",
  removeAttachment: "Remove",
  inputPlaceholder: "Message current session...",
  attachmentsMeta: "",
  referenceLabel: "Ref",
  referenceResolved: "Resolved",
  referenceRemapped: "Remapped",
  referenceUnresolved: "Unresolved",
  referenceFind: "Find",
  referenceUnavailable: "Unavailable",
  alertTitleError: "Error",
  alertTitleCanceled: "Canceled",
  alertBodyError: "Something went wrong.",
  alertBodyCanceled: "Request was canceled.",
  alertRetry: "Retry",
  statusLabels: {
    streaming: "Streaming",
    done: "Done",
    error: "Error",
    canceled: "Canceled",
    pending: "Pending",
  },
  alertLabels: {
    titleError: "Error",
    titleCanceled: "Canceled",
    bodyError: "Error",
    bodyCanceled: "Canceled",
    retry: "Retry",
  },
} as const;

function isAgentTask(value: unknown): value is AgentTask {
  if (!value || typeof value !== "object") {
    return false;
  }
  return "id" in value && "status" in value;
}

export function ChatThread({ sessionId }: { sessionId: string }) {
  const {
    messages,
    sendMessage,
    sendAction,
    isSending,
    isLoading,
    retryMessage,
    editMessage,
    agentMode,
    toggleMode,
    usage,
    session,
  } = useChatSession(sessionId);
  const [input, setInput] = React.useState("");
  const [model, setModel] = React.useState(getDefaultModelId());
  const [branchParentId, setBranchParentId] = React.useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = React.useState<string | null>(null);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [attachments, setAttachments] = React.useState<PanelAttachment[]>([]);
  const inputRef = React.useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const attachmentRefs = React.useRef(new Map<string, ChatAttachmentRef>());
  const attachmentsRef = React.useRef<PanelAttachment[]>([]);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onSend: () => {
      // Logic handled by wrapping ShellAIPanel's onSend usually,
      // but purely keyboard trigger can try to submit if input is ready
      // For now, ShellAIPanel handles cmd+enter internally for text area.
    },
    onToggleMode: () => {
      void toggleMode();
    },
    onNewSession: () => {
      // Handled globally or by router
    },
  });

  const filteredModels = useMemo(() => MODEL_CATALOG, []);
  const backgroundTasks = useMemo(() => {
    const tasks = new Map<string, AgentTask>();
    for (const message of messages) {
      if (message.type !== "task_stream") {
        continue;
      }
      const taskCandidate = message.metadata?.task;
      if (!isAgentTask(taskCandidate)) {
        continue;
      }
      tasks.set(taskCandidate.id, taskCandidate);
    }
    return Array.from(tasks.values());
  }, [messages]);
  const handleSetModel = useCallback(
    (nextModel: string) => {
      const normalized = normalizeModelId(nextModel) ?? nextModel;
      const resolved = getModelCapability(normalized);
      const modelId = resolved?.id ?? getDefaultModelId();
      if (!modelId || modelId === model) {
        return;
      }
      setModel(modelId);
      updateSettings({ defaultModel: modelId }).catch((err) => {
        void err;
        setModel(model);
      });
    },
    [model]
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

  const uploadFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) {
        return;
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

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
          const ref = await uploadChatAttachment(sessionId, file);
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
    },
    [sessionId]
  );

  const handleAddAttachment = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (files: FileList | null) => {
      await uploadFiles(files);
    },
    [uploadFiles]
  );

  React.useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  React.useEffect(() => {
    return () => {
      for (const att of attachmentsRef.current) {
        if (att.previewUrl) {
          URL.revokeObjectURL(att.previewUrl);
        }
      }
    };
  }, []);

  const getReadyAttachmentRefs = useCallback((): ChatAttachmentRef[] => {
    const ready: ChatAttachmentRef[] = [];
    for (const attachment of attachments) {
      if (attachment.status !== "ready") {
        continue;
      }
      const ref = attachmentRefs.current.get(attachment.id);
      if (ref) {
        ready.push(ref);
      }
    }
    return ready;
  }, [attachments]);

  const isAttachmentBusy = attachments.some(
    (attachment) => attachment.status === "processing" || attachment.status === "sending"
  );

  const handleBranch = useCallback((id: string) => {
    setEditingMessageId(null);
    setStatusMessage(null);
    setBranchParentId(id);
    inputRef.current?.focus();
  }, []);

  const submitEditIfNeeded = useCallback(
    async (draft: string) => {
      if (!editingMessageId) {
        return false;
      }
      if (attachments.length > 0) {
        setStatusMessage("Attachments are not supported while editing a message.");
        return true;
      }
      setStatusMessage(null);
      const targetMessageId = editingMessageId;
      setEditingMessageId(null);
      setInput("");
      try {
        await editMessage(targetMessageId, draft);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to edit message.";
        setStatusMessage(message);
        setEditingMessageId(targetMessageId);
        setInput(draft);
        inputRef.current?.focus();
      }
      return true;
    },
    [attachments.length, editMessage, editingMessageId]
  );

  const submitNewMessage = useCallback(
    async (draft: string) => {
      setStatusMessage(null);
      const content = draft;
      setInput("");
      const readyAttachments = getReadyAttachmentRefs();
      await sendMessage(content, "chat", {
        modelId: model,
        attachments: readyAttachments.length > 0 ? readyAttachments : undefined,
        parentId: branchParentId ?? undefined,
      });
      clearAttachments();
      setBranchParentId(null);
    },
    [branchParentId, clearAttachments, getReadyAttachmentRefs, model, sendMessage]
  );

  const handleSend = useCallback(async () => {
    const trimmedInput = input.trim();
    if (!trimmedInput) {
      return;
    }
    if (isAttachmentBusy) {
      return;
    }
    if (await submitEditIfNeeded(input)) {
      return;
    }
    await submitNewMessage(input);
  }, [input, isAttachmentBusy, submitEditIfNeeded, submitNewMessage]);

  const handleEdit = useCallback(
    (id: string) => {
      const message = messages.find((msg) => msg.id === id);
      if (!message || message.role !== "user") {
        return;
      }
      setEditingMessageId(id);
      setBranchParentId(null);
      setStatusMessage(null);
      setInput(message.content);
      inputRef.current?.focus();
    },
    [messages]
  );

  const handleQuote = useCallback((content: string) => {
    setInput((prev) => {
      const quoteBlock = content
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
      return prev ? `${prev}\n\n${quoteBlock}\n\n` : `${quoteBlock}\n\n`;
    });
    setEditingMessageId(null);
    setBranchParentId(null);
    setStatusMessage(null);
    inputRef.current?.focus();
  }, []);

  const clearEditState = useCallback(() => {
    setEditingMessageId(null);
    setStatusMessage(null);
    setInput("");
  }, []);

  const clearBranchState = useCallback(() => {
    setBranchParentId(null);
    setStatusMessage(null);
  }, []);

  const handleExport = useCallback(
    (format: "markdown" | "json") => {
      if (!messages.length || !session) {
        return;
      }
      if (format === "markdown") {
        // biome-ignore lint/suspicious/noExplicitAny: Loosened type for export
        const md = exportToMarkdown(session as any, messages);
        downloadFile(`chat-export-${sessionId || "session"}.md`, md, "text/markdown");
      } else {
        // biome-ignore lint/suspicious/noExplicitAny: Loosened type for export
        const json = exportToJson(session as any, messages);
        downloadFile(`chat-export-${sessionId || "session"}.json`, json, "application/json");
      }
    },
    [messages, sessionId, session]
  );

  const contextStatus = useMemo(() => {
    if (editingMessageId) {
      return (
        <div className="text-fine font-medium text-foreground flex items-center justify-between gap-3 px-2 py-1.5 rounded-lg bg-surface-2/60 border border-border/40">
          <div className="flex flex-col">
            <span>Editing message. Send to save changes.</span>
            {statusMessage ? (
              <span className="text-xs text-destructive">{statusMessage}</span>
            ) : null}
          </div>
          <Button variant="ghost" size="compact" onClick={clearEditState}>
            Cancel
          </Button>
        </div>
      );
    }
    if (branchParentId) {
      return (
        <div className="text-fine font-medium text-foreground flex items-center justify-between gap-3 px-2 py-1.5 rounded-lg bg-surface-2/60 border border-border/40">
          <span>Branching from selected message.</span>
          <Button variant="ghost" size="compact" onClick={clearBranchState}>
            Cancel
          </Button>
        </div>
      );
    }
    if (statusMessage) {
      return (
        <div className="text-fine font-medium text-destructive flex items-center gap-2 px-2 py-1.5 rounded-lg bg-destructive/5 border border-destructive/10">
          <span>{statusMessage}</span>
        </div>
      );
    }
    return null;
  }, [branchParentId, clearBranchState, clearEditState, editingMessageId, statusMessage]);

  const inputTranslations = useMemo(
    () => ({
      ...TRANSLATIONS,
      inputPlaceholder: editingMessageId
        ? "Edit your message..."
        : branchParentId
          ? "Reply to branch..."
          : TRANSLATIONS.inputPlaceholder,
    }),
    [branchParentId, editingMessageId]
  );

  const headerContent = (
    <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200/50 dark:border-gray-800/50 bg-surface-0 min-h-[48px]">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-sm">Cowork Session</span>
      </div>
      <div className="flex items-center gap-2">
        <BackgroundTaskIndicator tasks={backgroundTasks} />
        <CostMeter usage={usage} modelId={model} />
        <div className="h-4 w-px bg-border mx-1" />
        <ModeToggle mode={agentMode} onToggle={toggleMode} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-2/60"
              aria-label="Export chat"
            >
              <Download className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={6} className="w-44 rounded-lg p-1">
            <DropdownMenuItem
              onSelect={() => handleExport("markdown")}
              className="gap-2 rounded-md px-2 py-1.5 text-[13px] focus:bg-foreground/[0.05] focus:text-foreground cursor-pointer outline-none"
            >
              Export Markdown
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => handleExport("json")}
              className="gap-2 rounded-md px-2 py-1.5 text-[13px] focus:bg-foreground/[0.05] focus:text-foreground cursor-pointer outline-none"
            >
              Export JSON
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );

  return (
    <div className="h-full w-full bg-surface-1">
      <ShellAIPanel
        showHeader={false}
        topContent={headerContent}
        title={TRANSLATIONS.title}
        model={model}
        setModel={handleSetModel}
        models={filteredModels}
        onSelectModel={handleSetModel}
        filteredModels={filteredModels}
        isStreaming={isSending}
        isLoading={isLoading}
        onClose={() => {
          /* no-op */
        }}
        showClose={false}
        onClear={() => {
          /* no-op */
        }}
        onCopyLast={() => {
          /* no-op */
        }}
        onExport={() => {
          handleExport("markdown");
        }}
        headerTranslations={TRANSLATIONS}
        panelPosition="main"
        // Messages
        messages={messages}
        suggestions={[]}
        listRef={listRef}
        onEdit={handleEdit}
        onBranch={(id) => handleBranch(id)}
        onQuote={handleQuote}
        onCopy={(content) => {
          navigator.clipboard.writeText(content);
        }}
        onRetry={retryMessage}
        onSuggestionClick={() => {
          /* no-op */
        }}
        messageListTranslations={TRANSLATIONS}
        // Input
        input={input}
        setInput={setInput}
        onSend={handleSend}
        onRunBackground={() => {
          /* no-op */
        }}
        onAbort={() => {
          /* no-op */
        }}
        onTaskAction={(action, metadata) => sendAction(action, { approvalId: metadata.approvalId })}
        attachments={attachments}
        onAddAttachment={handleAddAttachment}
        onRemoveAttachment={removeAttachment}
        fileInputRef={fileInputRef}
        inputRef={inputRef}
        onFileChange={handleFileChange}
        inputTranslations={inputTranslations}
        contextStatus={contextStatus ?? undefined}
        isAttachmentBusy={isAttachmentBusy}
        // Features
        tasks={[]} // Tasks are embedded in messages now, but widget might need them if separated.
        // We'll trust the message stream to show tasks.
      />
    </div>
  );
}
