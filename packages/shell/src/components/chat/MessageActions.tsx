"use client";

import { cn } from "@ku0/shared/utils";
import { Check, Copy, Edit3, GitBranch, Quote, RefreshCcw } from "lucide-react";
import * as React from "react";
import { MessageAction as AiMessageAction } from "../ai-elements/message";

export interface MessageActionsTranslations {
  actionEdit: string;
  actionBranch: string;
  actionQuote: string;
  actionCopy: string;
  actionRetry: string;
}

export interface MessageActionsProps {
  role: "user" | "assistant";
  messageId: string;
  content: string;
  onEdit: (id: string) => void;
  onBranch: (id: string) => void;
  onQuote: (content: string) => void;
  onCopy: (content: string) => void;
  onRetry: (id: string) => void;
  translations: MessageActionsTranslations;
}

/**
 * Action button toolbar for messages (edit, branch, quote, copy, retry).
 */
export const MessageActions = React.memo(function MessageActions({
  role,
  messageId,
  content,
  onEdit,
  onBranch,
  onQuote,
  onCopy,
  onRetry,
  translations,
}: MessageActionsProps) {
  const [isCopied, setIsCopied] = React.useState(false);

  const handleCopy = React.useCallback(() => {
    onCopy(content);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  }, [content, onCopy]);

  return (
    <div className="flex items-center gap-0.5">
      {role === "user" ? (
        <>
          <ActionButton
            label={translations.actionEdit}
            icon={<Edit3 className="h-3.5 w-3.5" aria-hidden="true" />}
            onClick={() => onEdit(messageId)}
          />
          <ActionButton
            label={translations.actionBranch}
            icon={<GitBranch className="h-3.5 w-3.5" aria-hidden="true" />}
            onClick={() => onBranch(messageId)}
          />
          <ActionButton
            label={translations.actionQuote}
            icon={<Quote className="h-3.5 w-3.5" aria-hidden="true" />}
            onClick={() => onQuote(content)}
          />
        </>
      ) : (
        <>
          <ActionButton
            label={isCopied ? "Copied" : translations.actionCopy}
            icon={
              isCopied ? (
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              )
            }
            onClick={handleCopy}
            active={isCopied}
          />
          <ActionButton
            label={translations.actionQuote}
            icon={<Quote className="h-3.5 w-3.5" aria-hidden="true" />}
            onClick={() => onQuote(content)}
          />
          <ActionButton
            label={translations.actionRetry}
            icon={<RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" />}
            onClick={() => onRetry(messageId)}
          />
        </>
      )}
    </div>
  );
});

interface ActionButtonProps {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  active?: boolean;
}

const ActionButton = React.memo(function ActionButton({
  label,
  icon,
  onClick,
  active = false,
}: ActionButtonProps) {
  return (
    <AiMessageAction
      label={label}
      onClick={onClick}
      className={cn(
        "h-6 w-6 rounded-sm",
        active ? "text-success" : "text-muted-foreground hover:bg-surface-2/50"
      )}
    >
      {icon}
    </AiMessageAction>
  );
});
