import {
  getDefaultModelId,
  getModelCapability,
  MODEL_CATALOG,
  normalizeModelId,
} from "@ku0/ai-core";
import { AIPanel as ShellAIPanel } from "@ku0/shell";
import React, { useCallback, useMemo } from "react";
import { updateSettings } from "../../api/coworkApi";
import { useChatSession } from "./hooks/useChatSession";
// ChatMessage is no longer used, we use Message from @ku0/shell via useChatSession

export function ChatThread({ sessionId }: { sessionId: string }) {
  const { messages, sendMessage, isSending, isLoading } = useChatSession(sessionId);
  const [input, setInput] = React.useState("");
  const [model, setModel] = React.useState(getDefaultModelId());

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
        console.error("Failed to update model:", err);
        setModel(model);
      });
    },
    [model]
  );

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
        listRef={{ current: null }}
        onEdit={() => {
          /* no-op */
        }}
        onBranch={() => {
          /* no-op */
        }}
        onQuote={() => {
          /* no-op */
        }}
        onCopy={(content) => {
          navigator.clipboard.writeText(content);
        }}
        onRetry={() => {
          /* no-op */
        }}
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
          const content = input;
          setInput("");
          await sendMessage(content, "chat", { modelId: model }); // Default to chat execution in thread? Or strict task?
          // Ideally we share the intent detection from controller, but for now
          // let's assume direct chat works. The unified hook handles optimistic updates.
        }}
        onRunBackground={() => {
          /* no-op */
        }}
        onAbort={() => {
          /* no-op */
        }}
        attachments={[]}
        onAddAttachment={() => {
          /* no-op */
        }}
        onRemoveAttachment={() => {
          /* no-op */
        }}
        fileInputRef={{ current: null }}
        inputRef={{ current: null }}
        onFileChange={() => {
          /* no-op */
        }}
        inputTranslations={translations}
        // Features
        tasks={[]} // Tasks are embedded in messages now, but widget might need them if separated.
        // We'll trust the message stream to show tasks.
      />
    </div>
  );
}
