"use client";

import { AIPanel as ShellAIPanel, useReaderShell } from "@ku0/shell";
import { useCoworkAIPanelController } from "./useCoworkAIPanelController";

export interface CoworkAIPanelProps {
  onClose?: () => void;
}

export function CoworkAIPanel({ onClose }: CoworkAIPanelProps) {
  const { aiPanel } = useReaderShell();
  const ctrl = useCoworkAIPanelController();

  const {
    messages,
    input,
    setInput,
    inputRef,
    listRef,
    isLoading,
    isStreaming,
    model,
    setModel,
    filteredModels,
    handleSend,
    handleAbort,
    attachments,
    onAddAttachment,
    onRemoveAttachment,
    fileInputRef,
    onFileChange,
  } = ctrl;
  const panelPosition = aiPanel.position === "left" ? "left" : "right";

  // Simplified translations for Cowork for now
  const translations = {
    title: "AI Assistant",
    statusStreaming: "Streaming...",
    statusDone: "Done",
    statusError: "Error",
    statusCanceled: "Canceled",
    emptyTitle: "How can I help you today?",
    emptyDescription: "I can help you plan and execute tasks in your workspace.",
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
    inputPlaceholder: "Ask anything...",
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
    },
    alertLabels: {
      titleError: "Error",
      titleCanceled: "Canceled",
      bodyError: "Error",
      bodyCanceled: "Canceled",
      retry: "Retry",
    },
  };

  return (
    <ShellAIPanel
      title={translations.title}
      model={model}
      setModel={setModel}
      filteredModels={filteredModels}
      isStreaming={isStreaming}
      isLoading={isLoading}
      onClose={
        onClose ??
        (() => {
          /* No-op */
        })
      }
      onClear={() => {
        /* TODO */
      }}
      onCopyLast={() => {
        /* TODO */
      }}
      onExport={() => {
        /* TODO */
      }}
      headerTranslations={translations}
      panelPosition={panelPosition}
      // Messages
      messages={messages}
      suggestions={[]}
      listRef={listRef}
      onEdit={() => {
        /* TODO */
      }}
      onBranch={() => {
        /* TODO */
      }}
      onQuote={() => {
        /* TODO */
      }}
      onCopy={() => {
        /* TODO */
      }}
      onRetry={() => {
        /* TODO */
      }}
      onSuggestionClick={() => {
        /* TODO */
      }}
      messageListTranslations={translations}
      // Input
      input={input}
      setInput={setInput}
      onSend={handleSend}
      onRunBackground={() => {
        /* TODO */
      }}
      onAbort={handleAbort}
      attachments={attachments}
      onAddAttachment={onAddAttachment}
      onRemoveAttachment={onRemoveAttachment}
      fileInputRef={fileInputRef}
      inputRef={inputRef}
      onFileChange={onFileChange}
      inputTranslations={translations}
    />
  );
}
