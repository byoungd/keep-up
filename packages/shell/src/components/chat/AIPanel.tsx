"use client";

import { cn } from "@ku0/shared/utils";
import * as React from "react";
import { AIPanelHeader, type AIPanelHeaderProps } from "./AIPanelHeader";
import { InputArea, type InputAreaProps } from "./InputArea";
import { MessageList, type MessageListProps } from "./MessageList";
import { TaskProgressWidget } from "./TaskProgressWidget";
import type { AgentTask, ArtifactItem } from "./types";

// Combine props from child components, omitting duplicates that are shared
// We use Omit/Pick to avoid conflicts if definitions diverge slightly, though they verify as identical.
type SharedProps = "isLoading" | "isStreaming";

export interface AIPanelProps
  extends Omit<AIPanelHeaderProps, SharedProps | "translations">,
    Omit<MessageListProps, SharedProps | "translations">,
    Omit<InputAreaProps, SharedProps | "translations"> {
  // Specific translations
  headerTranslations: AIPanelHeaderProps["translations"];
  messageListTranslations: MessageListProps["translations"];
  inputTranslations: InputAreaProps["translations"];
  // Shared state
  isLoading: boolean;
  isStreaming: boolean;
  // Model state (explicitly added as they differ from InputAreaProps inheritance)
  setModel: (modelId: string) => void;
  filteredModels: import("@ku0/ai-core").ModelCapability[];

  // Slots
  topContent?: React.ReactNode;
  overlayContent?: React.ReactNode;

  // Configuration
  prompts?: import("../../lib/ai/types").AIPrompt[];

  // Layout
  className?: string;

  // Explicit overrides if intersection fails
  onClose: () => void;
  // External Preview Handler (e.g., for Right Rail -> Main area preview)
  onPreviewArtifact?: (item: ArtifactItem) => void;

  // Agent Runtime task data
  /** Real-time agent tasks to display in TaskProgressWidget */
  /** Real-time agent tasks to display in TaskProgressWidget */
  tasks?: AgentTask[];
  /** Whether to show the top header bar. Defaults to true. */
  showHeader?: boolean;
}

export function AIPanel({
  // Header Props
  title,
  model,
  setModel,
  filteredModels,
  onClose,
  onClear,
  onCopyLast,
  onExport,
  showClose,
  headerTranslations, // Renamed in consumer to match? AIPanelHeader expects 'translations'

  // MessageList Props
  messages,
  suggestions,
  listRef,
  onEdit,
  onBranch,
  onQuote,
  onCopy,
  onRetry,
  onSuggestionClick,
  messageListTranslations,
  resolveReference,
  onReferenceSelect,

  // InputArea Props
  input,
  setInput,
  onSend,
  onRunBackground,
  onAbort,
  attachments,
  onAddAttachment,
  onRemoveAttachment,
  fileInputRef,
  inputRef,
  onFileChange,
  inputTranslations,
  contextStatus,
  visionGuard,
  attachmentError,
  isAttachmentBusy,

  // Shared
  isLoading,
  isStreaming,
  panelPosition,

  // Slots
  topContent,
  overlayContent,
  className,
  prompts,
  onPreviewArtifact,
  tasks,
  showHeader = true,
}: AIPanelProps) {
  const [focusedTaskId, setFocusedTaskId] = React.useState<string | null>("task-1");

  // Always notify parent about artifact clicks
  // Parent (RootLayout) manages the preview in the resizable right panel
  const handleArtifactClick = (item: ArtifactItem) => {
    onPreviewArtifact?.(item);
  };

  return (
    <aside
      className={cn(
        "ai-panel h-full flex font-sans text-foreground overflow-hidden",
        // Standard panel styles (Side mode) - Vertical Stack
        panelPosition !== "main"
          ? [
              "flex-col w-full",
              "shadow-xl",
              "bg-gradient-to-b from-surface-0/80 via-surface-0/85 to-surface-0/92",
              "backdrop-blur-xl",
            ]
          : [
              // Main view styles (Void mode) - Horizontal Layout for Side Panel support
              "flex-row w-full justify-center", // Center the content horizontally
            ],
        // Only animate entrance for side panels to avoid layout shift in main view
        panelPosition !== "main" &&
          "animate-in fade-in slide-in-from-right duration-500 ease-out-expo",
        className
      )}
      aria-label="AI assistant panel"
    >
      <div
        className={cn(
          "flex flex-col h-full min-w-0 overflow-hidden",
          // Main view inner container - constrained width and centered
          panelPosition === "main"
            ? "w-full" // Change: Full width to push scrollbar to edge
            : "w-full" // Full width in side panel mode
        )}
      >
        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-transparent w-full">
          {showHeader && (
            <AIPanelHeader
              title={title}
              isStreaming={isStreaming}
              isLoading={isLoading}
              onClose={onClose}
              onClear={onClear}
              onCopyLast={onCopyLast}
              onExport={onExport}
              translations={headerTranslations}
              panelPosition={panelPosition}
              showClose={showClose}
            />
          )}

          {topContent}

          <MessageList
            messages={messages}
            suggestions={suggestions}
            isLoading={isLoading}
            isStreaming={isStreaming}
            listRef={listRef}
            onEdit={onEdit}
            onBranch={onBranch}
            onQuote={onQuote}
            onCopy={onCopy}
            onRetry={onRetry}
            onSuggestionClick={onSuggestionClick}
            translations={messageListTranslations}
            resolveReference={resolveReference}
            onReferenceSelect={onReferenceSelect}
            onPreviewArtifact={onPreviewArtifact}
            isMain={panelPosition === "main"}
          />

          {overlayContent}

          {/* Task Progress Widget - Show only for parallel tasks (length > 1) to keep UI clean */}
          {panelPosition === "main" && tasks && tasks.length > 1 && (
            <div className="w-full max-w-3xl mx-auto px-4 z-10 relative">
              <TaskProgressWidget
                tasks={tasks}
                expandedTaskId={focusedTaskId}
                onExpandTask={setFocusedTaskId}
                className="mb-0 rounded-b-none border-b-0"
                onArtifactClick={(artifact) => handleArtifactClick(artifact)}
              />
            </div>
          )}

          <InputArea
            input={input}
            setInput={setInput}
            onSend={onSend}
            onRunBackground={onRunBackground}
            onAbort={onAbort}
            isLoading={isLoading} // Decoupled from connection
            isStreaming={isStreaming}
            attachments={attachments}
            onAddAttachment={onAddAttachment}
            onRemoveAttachment={onRemoveAttachment}
            fileInputRef={fileInputRef}
            inputRef={inputRef}
            onFileChange={onFileChange}
            translations={inputTranslations}
            contextStatus={contextStatus}
            visionGuard={visionGuard}
            attachmentError={attachmentError}
            isAttachmentBusy={isAttachmentBusy}
            prompts={prompts}
            model={model}
            models={filteredModels}
            onSelectModel={setModel}
            // In "Main" mode, if widget is present, we need to flatten the top of the input box
            className={cn(
              panelPosition === "main" && [
                "border-t-0 shadow-none bg-transparent max-w-3xl mx-auto",
                // Target the inner omnibox container (which has rounded-xl) to flatten top
                // We use a specific selector assuming the structure in InputArea.tsx
                "[&>div:last-child]:rounded-t-none [&>div:last-child]:border-t-0",
              ]
            )}
          />
        </div>
      </div>
    </aside>
  );
}
