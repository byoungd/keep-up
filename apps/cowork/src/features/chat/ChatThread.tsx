import {
  getDefaultModelId,
  getModelCapability,
  MODEL_CATALOG,
  normalizeModelId,
} from "@ku0/ai-core";
import { AIPanel as ShellAIPanel } from "@ku0/shell";
import React, { useCallback, useMemo } from "react";
import { type ChatAttachmentRef, updateSettings, uploadChatAttachment } from "../../api/coworkApi";
import { useChatSession } from "./hooks/useChatSession";

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

export function ChatThread({ sessionId }: { sessionId: string }) {
  const { messages, sendMessage, isSending, isLoading, retryMessage } = useChatSession(sessionId);
  const [input, setInput] = React.useState("");
  const [model, setModel] = React.useState(getDefaultModelId());
  const [branchParentId, setBranchParentId] = React.useState<string | null>(null);
  const [attachments, setAttachments] = React.useState<PanelAttachment[]>([]);
  const inputRef = React.useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const attachmentRefs = React.useRef(new Map<string, ChatAttachmentRef>());
  const attachmentsRef = React.useRef<PanelAttachment[]>([]);

  // Reuse the translations from CoworkAIPanel (ideally shared)
  const translations = {
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
  };

  const filteredModels = useMemo(() => MODEL_CATALOG, []);
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
        // biome-ignore lint/suspicious/noConsole: intended
        console.error("Failed to update model:", err);
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
    setBranchParentId(id);
    inputRef.current?.focus();
  }, []);

  return (
    <div className="h-full w-full bg-surface-1">
      <ShellAIPanel
        title={translations.title}
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
          /* no-op */
        }}
        headerTranslations={translations}
        panelPosition="main"
        // Messages
        messages={messages}
        suggestions={[]}
        listRef={listRef}
        onEdit={() => {
          /* no-op */
        }}
        onBranch={(id) => handleBranch(id)}
        onQuote={() => {
          /* no-op */
        }}
        onCopy={(content) => {
          navigator.clipboard.writeText(content);
        }}
        onRetry={retryMessage}
        onSuggestionClick={() => {
          /* no-op */
        }}
        messageListTranslations={translations}
        // Input
        input={input}
        setInput={setInput}
        onSend={async () => {
          if (!input.trim()) {
            return;
          }
          if (isAttachmentBusy) {
            return;
          }
          const content = input;
          setInput("");
          const readyAttachments = getReadyAttachmentRefs();
          await sendMessage(content, "chat", {
            modelId: model,
            attachments: readyAttachments.length > 0 ? readyAttachments : undefined,
            parentId: branchParentId ?? undefined,
          }); // Default to chat execution in thread? Or strict task?
          clearAttachments();
          setBranchParentId(null);
          // Ideally we share the intent detection from controller, but for now
          // let's assume direct chat works. The unified hook handles optimistic updates.
        }}
        onRunBackground={() => {
          /* no-op */
        }}
        onAbort={() => {
          /* no-op */
        }}
        attachments={attachments}
        onAddAttachment={handleAddAttachment}
        onRemoveAttachment={removeAttachment}
        fileInputRef={fileInputRef}
        inputRef={inputRef}
        onFileChange={handleFileChange}
        inputTranslations={translations}
        isAttachmentBusy={isAttachmentBusy}
        // Features
        tasks={[]} // Tasks are embedded in messages now, but widget might need them if separated.
        // We'll trust the message stream to show tasks.
      />
    </div>
  );
}
