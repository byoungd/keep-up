"use client";
import { useSlashCommand } from "@/hooks/useSlashCommand";
import { cn } from "@ku0/shared/utils";
import { AlertTriangle, Loader2, X } from "lucide-react";
import * as React from "react";
import { InputBottomBar } from "./InputBottomBar";
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
}: InputAreaProps) {
  const [isFocused, setIsFocused] = React.useState(false);
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
    }),
    [input, setInput, inputRef, onSend, isOverLimit, isAttachmentBusy, isLoading, isStreaming]
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
    const resolvedMinHeight = Number.isNaN(minHeight) ? 0 : minHeight;
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
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "px-4 py-4 border-t transition-all duration-500 ease-out",
        isFocused
          ? "border-primary/20 bg-surface-0/90 backdrop-blur-xl shadow-[0_-4px_20px_rgba(0,0,0,0.03)]"
          : "border-border/30 bg-surface-0/60 backdrop-blur-md",
        isDragOver && "border-primary bg-primary/5 ring-4 ring-primary/10"
      )}
    >
      <SlashCommandMenu
        isOpen={showSlashMenu}
        filter={slashFilter}
        selectedIndex={slashIndex}
        onSelect={handleSlashSelect}
        onClose={() => setShowSlashMenu(false)}
        position={slashPosition}
      />
      {/* Context Status */}
      {contextStatus && (
        <div className="mb-3 animate-in fade-in slide-in-from-bottom-2 duration-300 ease-out-expo">
          {contextStatus}
        </div>
      )}

      {visionGuard && (
        <div className="mb-3 animate-in fade-in slide-in-from-bottom-2 duration-300 ease-out-expo">
          {visionGuard}
        </div>
      )}

      {attachmentError && (
        <div className="mb-3 text-[11px] font-medium text-destructive flex items-center gap-2 px-2 py-1.5 rounded-lg bg-destructive/5 border border-destructive/10">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>{attachmentError}</span>
        </div>
      )}

      {/* Attachments Preview */}
      <AttachmentList
        attachments={attachments}
        onRemove={onRemoveAttachment}
        isBusy={isAttachmentBusy || isLoading || isStreaming}
        translations={translations}
      />

      {/* Input Container */}
      <div
        className={cn(
          "relative rounded-xl border transition-all duration-300 ease-out",
          isFocused
            ? "border-primary/40 bg-surface-1 shadow-sm ring-1 ring-primary/10"
            : "border-border/40 bg-surface-1/50 hover:border-border/60 hover:bg-surface-1/80"
        )}
      >
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
            "w-full bg-transparent px-4 py-3.5 pr-24 text-[14px] resize-none font-medium",
            "focus-visible:outline-none placeholder:text-foreground/70",
            "leading-relaxed text-foreground"
          )}
          rows={1}
          style={{ minHeight: "48px", maxHeight: `${20 * MAX_ROWS + 24}px` }}
        />

        {/* Bottom Bar */}
        <InputBottomBar
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
        />
      </div>

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
            className="text-[10px] font-medium text-foreground/70 truncate max-w-[80px]"
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
