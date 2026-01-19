"use client";
import type { ModelCapability } from "@ku0/ai-core";
import { SPRINGS } from "@ku0/shared/ui/motion";
import { cn } from "@ku0/shared/utils";
import { motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, Loader2, X } from "lucide-react";
import * as React from "react";
import { useSlashCommand } from "../../hooks/useSlashCommand";
import type { AIPrompt } from "../../lib/ai/types";
import { InputToolbar } from "./InputToolbar";
import { SlashCommandMenu } from "./SlashCommandMenu";

export interface Attachment {
  id: string;
  name: string;
  url: string;
  type: string;
  size: number;
  status: "processing" | "ready" | "sending" | "error";
  error?: string;
}

export interface InputAreaProps {
  input: string;
  setInput: (value: string) => void;
  onSend: () => void;
  onRunBackground: () => void;
  onAbort: () => void;
  isLoading: boolean;
  isStreaming: boolean;
  attachments: Attachment[];
  onAddAttachment: () => void;
  onRemoveAttachment: (id: string) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  onFileChange: (files: FileList | null) => void;
  translations: {
    attachmentsLabel: string;
    attachmentsMeta: string;
    addImage: string;
    runBackground: string;
    removeAttachment: string;
    inputPlaceholder: string;
  };
  contextStatus?: React.ReactNode;
  visionGuard?: React.ReactNode;
  attachmentError?: string;
  isAttachmentBusy?: boolean;
  prompts?: AIPrompt[];
  className?: string;
  model: string;
  models: ModelCapability[];
  onSelectModel: (modelId: string) => void;
}

const MAX_CHARS = 4000;
const MAX_ROWS = 6;

export function InputArea({
  input,
  setInput,
  onSend,
  onRunBackground,
  onAbort,
  isLoading,
  isStreaming,
  attachments,
  onAddAttachment,
  onRemoveAttachment,
  fileInputRef,
  inputRef,
  onFileChange,
  translations,
  contextStatus,
  visionGuard,
  attachmentError,
  isAttachmentBusy = false,
  prompts = [],
  className,
  model,
  models,
  onSelectModel,
}: InputAreaProps) {
  const [isFocused, setIsFocused] = React.useState(false);
  const prefersReducedMotion = useReducedMotion();
  // Memoize derived values to simplify render logic
  const charCount = input.length;
  const isOverLimit = charCount > MAX_CHARS;
  const hasContent = input.trim().length > 0;

  const slashCommandProps = React.useMemo(
    () => ({
      input,
      setInput,
      inputRef,
      onSend,
      isOverLimit,
      isAttachmentBusy,
      isLoading,
      isStreaming,
      prompts,
    }),
    [
      input,
      setInput,
      inputRef,
      onSend,
      isOverLimit,
      isAttachmentBusy,
      isLoading,
      isStreaming,
      prompts,
    ]
  );

  const {
    showSlashMenu,
    slashFilter,
    slashIndex,
    slashPosition,
    setShowSlashMenu,
    handleInputChange,
    handleKeyDown,
    handleSlashSelect,
  } = useSlashCommand(slashCommandProps);

  const handleSendClick = () => {
    if (isStreaming) {
      onAbort();
    } else {
      onSend();
    }
  };

  const handleAddAttachment = () => {
    onAddAttachment();
  };

  const handleVoiceInput = () => {
    // Demo: append voice placeholder to input
    setInput(input ? `${input} [voice:todo]` : "[voice:todo]");
  };

  // Auto-resize textarea with CSS-derived bounds to prevent initial jump
  // biome-ignore lint/correctness/useExhaustiveDependencies: inputRef.current is stable, input triggers resize
  React.useLayoutEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) {
      return;
    }
    const styles = window.getComputedStyle(textarea);
    const minHeight = Number.parseFloat(styles.minHeight);
    const maxHeight = Number.parseFloat(styles.maxHeight);
    const resolvedMinHeight = Number.isNaN(minHeight) ? 44 : minHeight;
    const resolvedMaxHeight = Number.isNaN(maxHeight) ? Number.POSITIVE_INFINITY : maxHeight;

    textarea.style.height = "auto";
    const newHeight = Math.min(
      Math.max(textarea.scrollHeight, resolvedMinHeight),
      resolvedMaxHeight
    );
    textarea.style.height = `${newHeight}px`;
  }, [input]);

  const [isDragOver, setIsDragOver] = React.useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFileChange(e.dataTransfer.files);
    }
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Drag and drop zone
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "w-full max-w-3xl mx-auto px-4 pb-4 transition-all duration-300 ease-out",
        className
      )}
    >
      <SlashCommandMenu
        isOpen={showSlashMenu}
        filter={slashFilter}
        selectedIndex={slashIndex}
        onSelect={handleSlashSelect}
        onClose={() => setShowSlashMenu(false)}
        position={slashPosition}
        prompts={prompts}
      />
      {/* Context Status */}
      {contextStatus && (
        <div className="mb-2 animate-in fade-in slide-in-from-bottom-2 duration-300 ease-out-expo">
          {contextStatus}
        </div>
      )}

      {visionGuard && (
        <div className="mb-2 animate-in fade-in slide-in-from-bottom-2 duration-300 ease-out-expo">
          {visionGuard}
        </div>
      )}

      {attachmentError && (
        <div className="mb-2 text-fine font-medium text-destructive flex items-center gap-2 px-2 py-1.5 rounded-lg bg-destructive/5 border border-destructive/10">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>{attachmentError}</span>
        </div>
      )}

      {/* Main Omnibox Container */}
      <motion.div
        layout
        transition={prefersReducedMotion ? { duration: 0 } : SPRINGS.layout}
        className={cn(
          "relative flex flex-col rounded-xl border transition-all duration-200 ease-out",
          // Idle state
          "bg-surface-1 border-border/40",
          // Focus state
          isFocused || hasContent
            ? "bg-surface-0 border-border shadow-sm ring-1 ring-border/20"
            : "hover:border-border/60",
          // Drag state
          isDragOver && "border-primary bg-primary/5 ring-2 ring-primary/10"
        )}
      >
        {/* Attachments Area (Top) */}
        <div className={cn("px-3", attachments.length > 0 && "pt-3")}>
          <AttachmentList
            attachments={attachments}
            onRemove={onRemoveAttachment}
            isBusy={isAttachmentBusy || isLoading || isStreaming}
            translations={translations}
          />
        </div>

        {/* Textarea */}
        <textarea
          ref={inputRef}
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={translations.inputPlaceholder}
          aria-label={translations.inputPlaceholder}
          className={cn(
            "w-full bg-transparent px-3 py-3 text-content resize-none font-medium",
            "focus-visible:outline-none placeholder:text-muted-foreground/40",
            "leading-relaxed text-foreground min-h-[44px]",
            // Hide scrollbar but allow scrolling
            "[&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']"
          )}
          rows={1}
          style={{ maxHeight: `${20 * MAX_ROWS + 24}px` }}
        />

        {/* Toolbar (Bottom) */}
        <InputToolbar
          isLoading={isLoading}
          isStreaming={isStreaming}
          hasContent={hasContent}
          isOverLimit={isOverLimit}
          isAttachmentBusy={isAttachmentBusy}
          charCount={charCount}
          maxChars={MAX_CHARS}
          translations={translations}
          onAddAttachment={handleAddAttachment}
          onSend={handleSendClick}
          onVoiceInput={handleVoiceInput}
          onRunBackground={onRunBackground}
          model={model}
          models={models}
          onSelectModel={onSelectModel}
        />
      </motion.div>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => onFileChange(event.target.files)}
        aria-label="Add image attachments"
      />
    </div>
  );
}

function AttachmentList({
  attachments,
  onRemove,
  isBusy,
  translations,
}: {
  attachments: Attachment[];
  onRemove: (id: string) => void;
  isBusy: boolean;
  translations: { removeAttachment: string };
}) {
  if (attachments.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-3">
      {attachments.map((att) => (
        <div
          key={att.id}
          className={cn(
            "group flex items-center gap-1.5 rounded-full border pl-0.5 pr-2 py-0.5",
            "bg-surface-2/40 border-border/20 hover:border-border/40 hover:bg-surface-2/60",
            "animate-in fade-in zoom-in-95 duration-150 transition-all",
            att.status === "error" && "border-destructive/30 bg-destructive/5"
          )}
        >
          <div className="h-5 w-5 rounded-full overflow-hidden bg-surface-3/50 shrink-0">
            <img src={att.url} alt={att.name} className="h-full w-full object-cover" />
          </div>
          <span
            className="text-micro font-medium text-foreground/70 truncate max-w-[80px]"
            title={att.name}
          >
            {att.name}
          </span>
          {(att.status === "processing" || att.status === "sending") && (
            <Loader2 className="h-2.5 w-2.5 animate-spin text-primary/60" />
          )}
          {att.status === "error" && <AlertTriangle className="h-2.5 w-2.5 text-destructive" />}
          <button
            type="button"
            onClick={() => onRemove(att.id)}
            className="h-4 w-4 inline-flex items-center justify-center rounded-full text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-colors duration-100 opacity-0 group-hover:opacity-100"
            aria-label={translations.removeAttachment}
            disabled={isBusy}
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
