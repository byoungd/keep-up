"use client";

import type { ReferenceAnchor, ReferenceRange } from "@/lib/ai/referenceAnchors";
import { cn } from "@keepup/shared/utils";
import { Bot, User } from "lucide-react";
import * as React from "react";
import { type AIProvenance, ConfidenceBadge } from "../ai/ConfidenceBadge";
import { ExecutionSteps } from "./ExecutionSteps";
import { MessageActions } from "./MessageActions";
import { MessageAlert } from "./MessageAlert";
import { MessageBubble } from "./MessageBubble";
import { MessageReferences } from "./MessageReferences";
import { MessageStatusBadge } from "./MessageStatusBadge";
import { ThinkingProcess } from "./ThinkingProcess";
import { TokenUsageDisplay } from "./TokenUsageDisplay";

export type MessageStatus = "done" | "streaming" | "error" | "canceled";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  status?: MessageStatus;
  requestId?: string;
  modelId?: string;
  references?: ReferenceAnchor[];

  // AI confidence metadata
  confidence?: number;
  provenance?: AIProvenance;

  // Execution metadata (for agent visualization)
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    contextWindow?: number;
    utilization?: number;
  };
  executionSteps?: Array<{
    id: string;
    toolName: string;
    arguments: Record<string, unknown>;
    status: "pending" | "executing" | "success" | "error";
    result?: {
      success: boolean;
      content: Array<{ type: string; text?: string }>;
      error?: { code: string; message: string };
    };
    startTime: number;
    endTime?: number;
    durationMs?: number;
    parallel?: boolean;
  }>;
  thinking?: Array<{
    content: string;
    type: "reasoning" | "planning" | "reflection";
    timestamp: number;
    complete: boolean;
  }>;
  createdAt: number;
}

export interface MessageItemTranslations {
  you: string;
  assistant: string;
  actionEdit: string;
  actionBranch: string;
  actionQuote: string;
  actionCopy: string;
  actionRetry: string;
  requestIdLabel: string;
  statusLabels: Record<MessageStatus, string>;
  alertLabels: {
    titleError: string;
    titleCanceled: string;
    bodyError: string;
    bodyCanceled: string;
    retry: string;
  };
  referenceLabel: string;
  referenceResolved: string;
  referenceRemapped: string;
  referenceUnresolved: string;
  referenceFind: string;
  referenceUnavailable: string;
}

export interface MessageItemProps {
  message: Message;
  onEdit: (id: string) => void;
  onBranch: (id: string) => void;
  onQuote: (content: string) => void;
  onCopy: (content: string) => void;
  onRetry: (id: string) => void;
  translations: MessageItemTranslations;
  resolveReference?: (anchor: ReferenceAnchor) => ReferenceRange;
  onReferenceSelect?: (anchor: ReferenceAnchor) => void;
}

/**
 * Container component for a single chat message.
 * Composes MessageBubble, MessageActions, MessageReferences, and MessageAlert.
 */
export const MessageItem = React.memo(function MessageItem({
  message,
  onEdit,
  onBranch,
  onQuote,
  onCopy,
  onRetry,
  translations,
  resolveReference,
  onReferenceSelect,
}: MessageItemProps) {
  const m = message;
  const isUser = m.role === "user";
  const isStreaming = m.status === "streaming";

  return (
    <div
      className={cn(
        "flex items-start gap-3 group animate-in fade-in slide-in-from-bottom-1 duration-200",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          "shrink-0 h-6 w-6 rounded-md flex items-center justify-center border",
          isUser
            ? "bg-primary/10 border-primary/20 text-primary"
            : "bg-surface-2/60 border-border/30 text-muted-foreground/70"
        )}
      >
        {isUser ? (
          <User className="h-3 w-3" aria-hidden="true" />
        ) : (
          <Bot className="h-3 w-3" aria-hidden="true" />
        )}
      </div>

      {/* Message Content */}
      <div
        className={cn(
          "relative min-w-0 max-w-[92%] py-0.5 text-sm leading-normal",
          isUser ? "text-foreground/90" : "text-foreground"
        )}
      >
        {/* Bubble Content */}
        <MessageBubble content={m.content} isUser={isUser} isStreaming={isStreaming} />

        {/* Status Badge + Confidence + Actions - Assistant */}
        {!isUser && m.status && (
          <div className="mt-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageStatusBadge status={m.status} labels={translations.statusLabels} />
              {m.confidence !== undefined && (
                <ConfidenceBadge score={m.confidence} provenance={m.provenance} size="sm" />
              )}
            </div>
            <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <MessageActions
                role={m.role}
                messageId={m.id}
                content={m.content}
                onEdit={onEdit}
                onBranch={onBranch}
                onQuote={onQuote}
                onCopy={onCopy}
                onRetry={onRetry}
                translations={translations}
              />
            </div>
          </div>
        )}

        {/* References */}
        {!isUser && m.references && m.references.length > 0 && (
          <MessageReferences
            references={m.references}
            resolveReference={resolveReference}
            onReferenceSelect={onReferenceSelect}
            labels={{
              label: translations.referenceLabel,
              resolved: translations.referenceResolved,
              remapped: translations.referenceRemapped,
              unresolved: translations.referenceUnresolved,
              find: translations.referenceFind,
              unavailable: translations.referenceUnavailable,
            }}
          />
        )}

        {/* Execution Steps (Tool Calls) */}
        {!isUser && m.executionSteps && m.executionSteps.length > 0 && (
          <ExecutionSteps steps={m.executionSteps} />
        )}

        {/* Thinking Process */}
        {!isUser && m.thinking && m.thinking.length > 0 && (
          <ThinkingProcess thinking={m.thinking} />
        )}

        {/* Token Usage */}
        {!isUser && m.tokenUsage && (
          <div className="mt-2">
            <TokenUsageDisplay usage={m.tokenUsage} showDetails />
          </div>
        )}

        {/* User Actions on Hover */}
        {isUser && (
          <div className="mt-3 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <MessageActions
              role={m.role}
              messageId={m.id}
              content={m.content}
              onEdit={onEdit}
              onBranch={onBranch}
              onQuote={onQuote}
              onCopy={onCopy}
              onRetry={onRetry}
              translations={translations}
            />
          </div>
        )}

        {/* Error/Canceled Alert */}
        {!isUser && (m.status === "error" || m.status === "canceled") && (
          <MessageAlert
            status={m.status}
            requestId={m.requestId}
            requestIdLabel={translations.requestIdLabel}
            labels={translations.alertLabels}
            onRetry={() => onRetry(m.id)}
          />
        )}
      </div>
    </div>
  );
});

// ============================================================================
// MessageItem
// ============================================================================
