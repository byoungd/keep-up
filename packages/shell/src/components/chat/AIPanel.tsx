"use client";

import { cn } from "@ku0/shared/utils";
import type * as React from "react";
import { AIPanelHeader, type AIPanelHeaderProps } from "./AIPanelHeader";
import { InputArea, type InputAreaProps } from "./InputArea";
import { MessageList, type MessageListProps } from "./MessageList";

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

  // Slots
  topContent?: React.ReactNode;
  overlayContent?: React.ReactNode;

  // Configuration
  prompts?: import("../../lib/ai/types").AIPrompt[];

  // Layout
  className?: string;

  // Explicit overrides if intersection fails
  onClose: () => void;
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
}: AIPanelProps) {
  return (
    <aside
      className={cn(
        "ai-panel h-full flex flex-col font-sans text-foreground",
        "shadow-xl",
        "bg-gradient-to-b from-surface-0/80 via-surface-0/85 to-surface-0/92",
        "backdrop-blur-xl",
        "animate-in fade-in slide-in-from-right duration-500 ease-out-expo",
        className
      )}
      aria-label="AI assistant panel"
    >
      <AIPanelHeader
        title={title}
        model={model}
        setModel={setModel}
        filteredModels={filteredModels}
        isStreaming={isStreaming}
        isLoading={isLoading}
        onClose={onClose}
        onClear={onClear}
        onCopyLast={onCopyLast}
        onExport={onExport}
        translations={headerTranslations}
        panelPosition={panelPosition}
      />

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
      />

      {overlayContent}

      <InputArea
        input={input}
        setInput={setInput}
        onSend={onSend}
        onRunBackground={onRunBackground}
        onAbort={onAbort}
        isLoading={isLoading}
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
      />
    </aside>
  );
}
