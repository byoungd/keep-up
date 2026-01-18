"use client";

import type { ModelCapability } from "@ku0/ai-core";
import { cn } from "@ku0/shared/utils";
import { ArrowUp, Loader2, Plus, Square } from "lucide-react";
import { Button } from "../ui/Button";
import { ModelSelector } from "./ModelSelector";

export interface InputToolbarProps {
  isLoading: boolean;
  isStreaming: boolean;
  hasContent: boolean;
  isOverLimit: boolean;
  isAttachmentBusy: boolean;
  charCount: number;
  maxChars: number;
  model: string;
  models: ModelCapability[];
  onSelectModel: (modelId: string) => void;
  translations: {
    addImage: string;
    runBackground: string;
    inputPlaceholder: string;
  };
  onAddAttachment: () => void;
  onSend: () => void;
  onVoiceInput: () => void;
  onRunBackground: () => void;
}

export function InputToolbar({
  isLoading,
  isStreaming,
  hasContent,
  isOverLimit,
  isAttachmentBusy,
  charCount,
  maxChars,
  model,
  models,
  onSelectModel,
  translations,
  onAddAttachment,
  onSend,
  onVoiceInput: _onVoiceInput,
  onRunBackground: _onRunBackground,
}: InputToolbarProps) {
  return (
    <div className="flex items-center justify-between gap-2 px-2 pb-2">
      {/* Left: Context Actions */}
      <div className="flex items-center gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors"
          onClick={onAddAttachment}
          disabled={isAttachmentBusy || isLoading || isStreaming}
          aria-label={translations.addImage}
          title={translations.addImage}
        >
          <Plus className="h-4 w-4" />
        </Button>

        <div className="h-4 w-px bg-border/40 mx-1" />

        <ModelSelector
          model={model}
          models={models}
          onSelect={onSelectModel}
          className="h-7 px-2 text-xs hover:bg-surface-2"
          panelPosition="main"
        />
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {/* Character Counter (Only visible when typing) */}
        {hasContent && (
          <span
            className={cn(
              "text-micro tabular-nums animate-in fade-in duration-200",
              isOverLimit ? "text-destructive font-medium" : "text-muted-foreground/50"
            )}
            aria-hidden="true"
          >
            {charCount.toLocaleString()} / {maxChars.toLocaleString()}
          </span>
        )}

        {/* Send Button */}
        <Button
          size="icon"
          className={cn(
            "h-7 w-7 rounded-md shadow-none transition-all duration-200",
            isStreaming
              ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
              : hasContent
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-muted text-muted-foreground hover:bg-muted/80 opacity-50"
          )}
          type="button"
          onClick={onSend}
          disabled={
            (isLoading && !isStreaming) ||
            isOverLimit ||
            isAttachmentBusy ||
            (!hasContent && !isStreaming)
          }
          aria-label={isStreaming ? "Stop generating" : "Send message"}
        >
          {isStreaming ? (
            <Square className="h-3 w-3 fill-current" />
          ) : isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ArrowUp className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
