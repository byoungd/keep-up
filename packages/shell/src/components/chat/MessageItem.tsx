"use client";

import { cn } from "@ku0/shared/utils";
import { Bot, User } from "lucide-react";
import * as React from "react";
import { parseArtifactsFromContent } from "../../lib/ai/artifacts";
import type { ReferenceAnchor, ReferenceRange } from "../../lib/ai/referenceAnchors";
import { type AIProvenance, ConfidenceBadge } from "../ai/ConfidenceBadge";
import { ArtifactList } from "./ArtifactCard";
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
  const { content: displayContent, artifacts } = React.useMemo(
    () => parseArtifactsFromContent(m.content),
    [m.content]
  );
  const showBubble = isUser || isStreaming || displayContent.length > 0;
  const assistantArtifacts = isUser ? [] : artifacts;

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
        {showBubble && (
          <MessageBubble content={displayContent} isUser={isUser} isStreaming={isStreaming} />
        )}

        {/* Artifacts */}
        <ArtifactList artifacts={assistantArtifacts} />

        {/* Status Badge + Confidence + Actions - Assistant */}
        <AssistantStatusRow
          isUser={isUser}
          message={m}
          translations={translations}
          onEdit={onEdit}
          onBranch={onBranch}
          onQuote={onQuote}
          onCopy={onCopy}
          onRetry={onRetry}
        />

        {/* References */}
        <AssistantReferences
          isUser={isUser}
          message={m}
          translations={translations}
          resolveReference={resolveReference}
          onReferenceSelect={onReferenceSelect}
        />

        {/* Execution Steps (Tool Calls) */}
        <AssistantExecutionSteps isUser={isUser} message={m} />

        {/* Thinking Process */}
        <AssistantThinking isUser={isUser} message={m} />

        {/* Token Usage */}
        <AssistantTokenUsage isUser={isUser} message={m} />

        {/* User Actions on Hover */}
        <UserActionsRow
          isUser={isUser}
          message={m}
          onEdit={onEdit}
          onBranch={onBranch}
          onQuote={onQuote}
          onCopy={onCopy}
          onRetry={onRetry}
          translations={translations}
        />

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

function AssistantStatusRow({
  isUser,
  message,
  translations,
  onEdit,
  onBranch,
  onQuote,
  onCopy,
  onRetry,
}: {
  isUser: boolean;
  message: Message;
  translations: MessageItemTranslations;
  onEdit: (id: string) => void;
  onBranch: (id: string) => void;
  onQuote: (content: string) => void;
  onCopy: (content: string) => void;
  onRetry: (id: string) => void;
}) {
  if (isUser || !message.status) {
    return null;
  }

  return (
    <div className="mt-2 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <MessageStatusBadge status={message.status} labels={translations.statusLabels} />
        {message.confidence !== undefined && (
          <ConfidenceBadge score={message.confidence} provenance={message.provenance} size="sm" />
        )}
      </div>
      <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <MessageActions
          role={message.role}
          messageId={message.id}
          content={message.content}
          onEdit={onEdit}
          onBranch={onBranch}
          onQuote={onQuote}
          onCopy={onCopy}
          onRetry={onRetry}
          translations={translations}
        />
      </div>
    </div>
  );
}

function AssistantReferences({
  isUser,
  message,
  translations,
  resolveReference,
  onReferenceSelect,
}: {
  isUser: boolean;
  message: Message;
  translations: MessageItemTranslations;
  resolveReference?: (anchor: ReferenceAnchor) => ReferenceRange;
  onReferenceSelect?: (anchor: ReferenceAnchor) => void;
}) {
  if (isUser || !message.references?.length) {
    return null;
  }

  return (
    <MessageReferences
      references={message.references}
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
  );
}

function AssistantExecutionSteps({ isUser, message }: { isUser: boolean; message: Message }) {
  if (isUser || !message.executionSteps?.length) {
    return null;
  }

  return <ExecutionSteps steps={message.executionSteps} />;
}

function AssistantThinking({ isUser, message }: { isUser: boolean; message: Message }) {
  if (isUser || !message.thinking?.length) {
    return null;
  }

  return <ThinkingProcess thinking={message.thinking} />;
}

function AssistantTokenUsage({ isUser, message }: { isUser: boolean; message: Message }) {
  if (isUser || !message.tokenUsage) {
    return null;
  }

  return (
    <div className="mt-2">
      <TokenUsageDisplay usage={message.tokenUsage} showDetails />
    </div>
  );
}

function UserActionsRow({
  isUser,
  message,
  onEdit,
  onBranch,
  onQuote,
  onCopy,
  onRetry,
  translations,
}: {
  isUser: boolean;
  message: Message;
  onEdit: (id: string) => void;
  onBranch: (id: string) => void;
  onQuote: (content: string) => void;
  onCopy: (content: string) => void;
  onRetry: (id: string) => void;
  translations: MessageItemTranslations;
}) {
  if (!isUser) {
    return null;
  }

  return (
    <div className="mt-3 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity duration-200">
      <MessageActions
        role={message.role}
        messageId={message.id}
        content={message.content}
        onEdit={onEdit}
        onBranch={onBranch}
        onQuote={onQuote}
        onCopy={onCopy}
        onRetry={onRetry}
        translations={translations}
      />
    </div>
  );
}

// ============================================================================
// MessageItem
// ============================================================================
