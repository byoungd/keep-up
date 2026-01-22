"use client";

import type { ModelCapability } from "@ku0/ai-core";
import { cn } from "@ku0/shared/utils";
import { Plus } from "lucide-react";
import { type PromptInputStatus, PromptInputSubmit } from "../ai-elements/prompt-input";
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
  const submitStatus: PromptInputStatus = isStreaming
    ? "streaming"
    : isLoading
      ? "submitted"
      : "ready";
  const isSubmitDisabled =
    (isLoading && !isStreaming) || isOverLimit || isAttachmentBusy || (!hasContent && !isStreaming);

  return (
    <div className="flex items-center justify-between gap-2 px-2 pb-2">
      {/* Left: Context Actions */}
      <div className="flex items-center gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors duration-fast"
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
              "text-micro tabular-nums animate-in fade-in duration-normal",
              isOverLimit ? "text-destructive font-medium" : "text-muted-foreground/50"
            )}
            aria-hidden="true"
          >
            {charCount.toLocaleString()} / {maxChars.toLocaleString()}
          </span>
        )}

        <PromptInputSubmit
          status={submitStatus}
          type="button"
          onClick={onSend}
          disabled={isSubmitDisabled}
          className={cn(
            "h-7 w-7 rounded-md shadow-none transition-all duration-normal",
            !hasContent && !isStreaming && "opacity-50"
          )}
        />
      </div>
    </div>
  );
}
