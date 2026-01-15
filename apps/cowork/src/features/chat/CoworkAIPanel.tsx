"use client";

import { AIPanel as ShellAIPanel, useReaderShell } from "@ku0/shell";
import type { ArtifactItem } from "@ku0/shell";
import { useCoworkAIPanelController } from "./useCoworkAIPanelController";

export interface CoworkAIPanelProps {
  onClose?: () => void;
  onPreviewArtifact?: (item: ArtifactItem) => void;
}

export function CoworkAIPanel({ onClose, onPreviewArtifact }: CoworkAIPanelProps) {
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
    statusMessage,
    tasks,
  } = ctrl;
  const panelPosition = aiPanel.position;

  const contextStatus = statusMessage ? (
    <div className="text-[11px] font-medium text-destructive flex items-center gap-2 px-2 py-1.5 rounded-lg bg-destructive/5 border border-destructive/10">
      {statusMessage}
    </div>
  ) : null;

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
      models={filteredModels}
      onSelectModel={setModel}
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
        const last = messages[messages.length - 1];
        if (last?.content) {
          navigator.clipboard.writeText(last.content);
        }
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
      onCopy={(content) => {
        if (content) {
          navigator.clipboard.writeText(content);
        }
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
      contextStatus={contextStatus}
      onPreviewArtifact={onPreviewArtifact}
      tasks={tasks}
    />
  );
}
