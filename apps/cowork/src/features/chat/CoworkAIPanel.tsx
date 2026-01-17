"use client";

import { type ArtifactItem, AIPanel as ShellAIPanel, useReaderShell } from "@ku0/shell";
import { useEffect, useMemo, useState } from "react";
import { ContextPacksPanel } from "../context/ContextPacksPanel";
import { ProjectContextPanel } from "../context/ProjectContextPanel";
import { PreflightPanel } from "../preflight/PreflightPanel";
import { WorkflowTemplatesPanel } from "../workflows/WorkflowTemplatesPanel";
import { CostMeter } from "./components/CostMeter";
import { ModeToggle } from "./components/ModeToggle";
import { useCoworkAIPanelController } from "./useCoworkAIPanelController";

export interface CoworkAIPanelProps {
  onClose?: () => void;
  onPreviewArtifact?: (item: ArtifactItem) => void;
}

export function CoworkAIPanel({ onClose, onPreviewArtifact }: CoworkAIPanelProps) {
  const { aiPanel } = useReaderShell();
  const ctrl = useCoworkAIPanelController();
  const [contextPanel, setContextPanel] = useState<
    "project" | "packs" | "workflows" | "preflight" | null
  >(null);

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
    agentMode,
    toggleMode,
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
        <div className="text-[11px] font-medium text-amber-600 flex items-center gap-2 px-2 py-1.5 rounded-lg bg-amber-500/5 border border-amber-500/10">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
          Reconnecting...
        </div>
      );
    }
    if (isConnected && !isLive && messages.length > 0) {
      return (
        <div className="text-[11px] font-medium text-amber-600 flex items-center gap-2 px-2 py-1.5 rounded-lg bg-amber-500/5 border border-amber-500/10">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          Connection Stalled
        </div>
      );
    }
    if (isConnected && isLive && messages.length > 0) {
      return (
        <div className="text-[11px] font-medium text-emerald-600 flex items-center gap-2 px-2 py-1.5 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
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
        <div className="text-[11px] font-medium text-destructive flex items-center gap-2 px-2 py-1.5 rounded-lg bg-destructive/5 border border-destructive/10">
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

  const headerContent = (
    <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200/50 dark:border-gray-800/50 bg-surface-0 min-h-[48px]">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-sm">Cowork Agent</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setContextPanel("project")}
          className="text-xs font-medium text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-surface-100 transition-colors flex items-center gap-1"
          title="Project Context"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <title>Context Icon</title>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          Context
        </button>
        <button
          type="button"
          onClick={() => setContextPanel("packs")}
          className="text-xs font-medium text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-surface-100 transition-colors flex items-center gap-1"
          title="Context Packs"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <title>Pack Icon</title>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 16.5a2.5 2.5 0 01-2.5 2.5h-13A2.5 2.5 0 013 16.5V7.5A2.5 2.5 0 015.5 5h2.086a1 1 0 01.707.293l1.414 1.414A1 1 0 0010.414 7H18.5A2.5 2.5 0 0121 9.5v7z"
            />
          </svg>
          Packs
        </button>
        <button
          type="button"
          onClick={() => setContextPanel("workflows")}
          className="text-xs font-medium text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-surface-100 transition-colors flex items-center gap-1"
          title="Workflow Templates"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <title>Workflow Icon</title>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 8h10M7 12h6m-6 4h10M6 4h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2z"
            />
          </svg>
          Workflows
        </button>
        <button
          type="button"
          onClick={() => setContextPanel("preflight")}
          className="text-xs font-medium text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-surface-100 transition-colors flex items-center gap-1"
          title="Preflight QA"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <title>Preflight Icon</title>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-7 8h8a2 2 0 002-2V8l-6-6H8a2 2 0 00-2 2v14a2 2 0 002 2z"
            />
          </svg>
          Preflight
        </button>
        <div className="h-4 w-px bg-border mx-1" />
        <ModeToggle mode={agentMode} onToggle={toggleMode} />
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1 ml-1 hover:bg-surface-100 rounded"
          >
            <span className="sr-only">Close</span>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <title>Close Icon</title>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );

  return (
    <ShellAIPanel
      showHeader={false}
      topContent={headerContent}
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
  );
}
