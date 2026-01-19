"use client";

import { type ArtifactItem, AIPanel as ShellAIPanel, useReaderShell } from "@ku0/shell";
import { useEffect, useMemo } from "react";
import { ContextPacksPanel } from "../context/ContextPacksPanel";
import { ProjectContextPanel } from "../context/ProjectContextPanel";
import { PreflightPanel } from "../preflight/PreflightPanel";
import { WorkflowTemplatesPanel } from "../workflows/WorkflowTemplatesPanel";
import { useAIControl } from "./AIControlContext";
import { CostMeter } from "./components/CostMeter";
import { useCoworkAIPanelController } from "./useCoworkAIPanelController";

export interface CoworkAIPanelProps {
  onClose?: () => void;
  onPreviewArtifact?: (item: ArtifactItem) => void;
}

export function CoworkAIPanel({ onClose, onPreviewArtifact }: CoworkAIPanelProps) {
  const { aiPanel } = useReaderShell();
  const ctrl = useCoworkAIPanelController();
  const { contextPanel, setContextPanel } = useAIControl();

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
    handleTaskAction,
    attachments,
    onAddAttachment,
    onRemoveAttachment,
    fileInputRef,
    onFileChange,
    isAttachmentBusy,
    statusMessage,
    isConnected,
    isLive,
    tasks,
    onExport,
    onEdit,
    onBranch,
    onQuote,
    onRetry,
    usage,
    runTemplate,
  } = ctrl;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "e") {
        // Placeholder for future shortcuts
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
  const panelPosition = aiPanel.position;

  // Connection status indicator
  const connectionStatus = useMemo(() => {
    if (!isConnected && messages.length > 0) {
      return (
        <div className="text-fine font-medium text-warning flex items-center gap-2 px-2 py-1.5 rounded-lg bg-warning/5 border border-warning/10">
          <span className="h-1.5 w-1.5 rounded-full bg-warning animate-pulse" />
          Reconnecting...
        </div>
      );
    }
    if (isConnected && !isLive && messages.length > 0) {
      return (
        <div className="text-fine font-medium text-warning flex items-center gap-2 px-2 py-1.5 rounded-lg bg-warning/5 border border-warning/10">
          <span className="h-1.5 w-1.5 rounded-full bg-warning" />
          Connection Stalled
        </div>
      );
    }
    if (isConnected && isLive && messages.length > 0) {
      return (
        <div className="text-fine font-medium text-success flex items-center gap-2 px-2 py-1.5 rounded-lg bg-success/5 border border-success/10">
          <span className="h-1.5 w-1.5 rounded-full bg-success" />
          Live
        </div>
      );
    }
    return null;
  }, [isConnected, isLive, messages.length]);

  const contextStatus = (
    <div className="flex items-center gap-2">
      <CostMeter usage={usage} modelId={model} />
      {statusMessage ? (
        <div className="text-fine font-medium text-destructive flex items-center gap-2 px-2 py-1.5 rounded-lg bg-destructive/5 border border-destructive/10">
          {statusMessage}
        </div>
      ) : (
        connectionStatus
      )}
    </div>
  );

  // Simplified translations for Cowork for now
  const translations = {
    title: "AI Assistant",
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

  return (
    <div className="relative h-full">
      <ShellAIPanel
        showHeader={false}
        overlayContent={
          contextPanel ? (
            <div className="absolute inset-0 z-50 flex justify-end">
              <button
                type="button"
                className="absolute inset-0 bg-black/20 w-full h-full border-none cursor-default"
                onClick={() => setContextPanel(null)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setContextPanel(null);
                  }
                }}
                tabIndex={-1}
                aria-label="Close context panel"
              />
              {contextPanel === "project" ? (
                <ProjectContextPanel onClose={() => setContextPanel(null)} />
              ) : contextPanel === "packs" ? (
                <ContextPacksPanel onClose={() => setContextPanel(null)} />
              ) : contextPanel === "preflight" ? (
                <PreflightPanel onClose={() => setContextPanel(null)} />
              ) : (
                <WorkflowTemplatesPanel
                  onClose={() => setContextPanel(null)}
                  onRunTemplate={runTemplate}
                />
              )}
            </div>
          ) : null
        }
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
        showClose={false}
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
          onExport("markdown");
        }}
        headerTranslations={translations}
        panelPosition={panelPosition}
        // Messages
        messages={messages}
        suggestions={[]}
        listRef={listRef}
        onEdit={onEdit}
        onBranch={(id) => {
          // TODO: Implement proper branch UI (set replyingTo state then send)
          onBranch(id);
        }}
        onQuote={onQuote}
        onCopy={(content) => {
          if (content) {
            navigator.clipboard.writeText(content);
          }
        }}
        onRetry={onRetry}
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
        onTaskAction={handleTaskAction}
        attachments={attachments}
        onAddAttachment={onAddAttachment}
        onRemoveAttachment={onRemoveAttachment}
        fileInputRef={fileInputRef}
        inputRef={inputRef}
        onFileChange={onFileChange}
        inputTranslations={translations}
        isAttachmentBusy={isAttachmentBusy}
        contextStatus={contextStatus}
        onPreviewArtifact={onPreviewArtifact}
        tasks={tasks}
      />
    </div>
  );
}
