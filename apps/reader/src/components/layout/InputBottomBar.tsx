"use client";

import { Button } from "@/components/ui/Button";
import { cn } from "@keepup/shared/utils";
import { Image as ImageIcon, Loader2, Mic, Send, Square } from "lucide-react";

export interface InputBottomBarProps {
  isLoading: boolean;
  isStreaming: boolean;
  hasContent: boolean;
  isOverLimit: boolean;
  isAttachmentBusy: boolean;
  charCount: number;
  maxChars: number;
  translations: {
    addImage: string;
    inputPlaceholder: string;
  };
  onAddAttachment: () => void;
  onSend: () => void;
  onVoiceInput: () => void;
}

export function InputBottomBar({
  isLoading,
  isStreaming,
  hasContent,
  isOverLimit,
  isAttachmentBusy,
  charCount,
  maxChars,
  translations,
  onAddAttachment,
  onSend,
  onVoiceInput,
}: InputBottomBarProps) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 pb-2 pt-1">
      {/* Left: Actions */}
      <div className="flex items-center gap-1 rounded-full border border-border/50 bg-surface-0/80 px-1 py-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 rounded-full text-muted-foreground hover:text-foreground"
          onClick={onAddAttachment}
          disabled={isAttachmentBusy || isLoading || isStreaming}
          aria-label={translations.addImage}
          title={translations.addImage}
        >
          <ImageIcon className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 rounded-full text-muted-foreground hover:text-foreground"
          onClick={onVoiceInput}
          disabled={isAttachmentBusy || isLoading || isStreaming}
          aria-label="Voice Input (Demo)"
          title="Voice Input (Demo)"
        >
          <Mic className="h-4 w-4" />
        </Button>
      </div>

      {/* Right: Counter + Send */}
      <div className="flex items-center gap-2">
        {/* Character Counter */}
        {hasContent && (
          <span
            className={cn(
              "text-[10px] tabular-nums",
              isOverLimit ? "text-destructive font-medium" : "text-muted-foreground"
            )}
            aria-hidden="true"
          >
            {charCount.toLocaleString()} / {maxChars.toLocaleString()}
          </span>
        )}

        {/* Keyboard Hint */}
        <span className="hidden sm:inline text-[10px] text-muted-foreground/60" aria-hidden="true">
          ⌘↵
        </span>

        {/* Send Button */}
        <Button
          size="icon"
          className={cn(
            "h-8 w-8 rounded-full shadow-sm transition-all duration-200",
            isStreaming
              ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
              : hasContent
                ? "bg-primary text-primary-foreground hover:bg-primary/90 scale-100"
                : "bg-muted text-muted-foreground hover:bg-muted/80 scale-95"
          )}
          type="button"
          onClick={onSend}
          disabled={(isLoading && !isStreaming) || isOverLimit || isAttachmentBusy}
          aria-label={isStreaming ? "Stop generating" : "Send message"}
        >
          {isStreaming ? (
            <Square className="h-3.5 w-3.5" />
          ) : isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5 ml-0.5" />
          )}
        </Button>
      </div>
    </div>
  );
}
