"use client";

import { cn } from "@ku0/shared/utils";
import { Bot, User } from "lucide-react";
import * as React from "react";
import { parseArtifactsFromContent } from "../../lib/ai/artifacts";
import type { ReferenceAnchor, ReferenceRange } from "../../lib/ai/referenceAnchors";
import { ApprovalCard } from "../ai/ApprovalCard";
import { ConfidenceBadge } from "../ai/ConfidenceBadge";
import {
  Message as AiMessage,
  MessageContent as AiMessageContent,
  MessageResponse as AiMessageResponse,
} from "../ai-elements/message";
import { ArtifactList } from "./ArtifactCard";
import { AskMessage } from "./AskMessage";
import { ExecutionSteps } from "./ExecutionSteps";
import { InfoMessage } from "./InfoMessage";
import { MessageActions } from "./MessageActions";
import { MessageAlert } from "./MessageAlert";
import { MessageReferences } from "./MessageReferences";
import { MessageStatusBadge } from "./MessageStatusBadge";
import { ModelBadge } from "./ModelBadge";
import { ResultMessage } from "./ResultMessage";
import { TaskStreamMessage } from "./TaskStreamMessage";
import { ThinkingProcess } from "./ThinkingProcess";
import { TokenUsageDisplay } from "./TokenUsageDisplay";
import type {
  AgentTask,
  ApprovalRiskLevel,
  ArtifactItem,
  Message,
  MessageItemTranslations,
} from "./types";

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
  onPreviewArtifact?: (artifact: ArtifactItem) => void;
  onTaskAction?: (
    action: "approve" | "reject",
    metadata: { approvalId: string; toolName: string; args: Record<string, unknown> }
  ) => Promise<void>;
}

/**
 * Container component for a single chat message.
 * Composes MessageBubble, MessageActions, MessageReferences, and MessageAlert.
 */
const useMessageArtifacts = (message: Message) => {
  const isUser = message.role === "user";

  const { content: displayContent, artifacts } = React.useMemo(
    () => parseArtifactsFromContent(message.content),
    [message.content]
  );

  const metadataArtifacts = React.useMemo<ArtifactItem[]>(() => {
    if (isUser) {
      return [];
    }
    const raw = message.metadata?.artifacts;
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw.filter(isArtifactItem).map((artifact, index) => ({
      ...artifact,
      id: artifact.id || `meta-${artifact.type}-${artifact.title}-${index}`,
    }));
  }, [isUser, message.metadata?.artifacts]);

  const parsedArtifacts = React.useMemo<ArtifactItem[]>(() => {
    if (isUser) {
      return [];
    }
    return artifacts.map((artifact, index) => ({
      id: artifact.id || `parsed-${artifact.type}-${artifact.title}-${index}`,
      title: artifact.title,
      type: mapParsedArtifactType(artifact.type),
      content: artifact.summary,
    }));
  }, [isUser, artifacts]);

  const assistantArtifacts = React.useMemo(() => {
    const merged = [...metadataArtifacts, ...parsedArtifacts];
    const seen = new Set<string>();
    return merged.filter((artifact) => {
      if (seen.has(artifact.id)) {
        return false;
      }
      seen.add(artifact.id);
      return true;
    });
  }, [metadataArtifacts, parsedArtifacts]);

  return { displayContent, artifacts, assistantArtifacts };
};

type ApprovalMetadata = {
  approvalId: string;
  toolName: string;
  args: Record<string, unknown>;
  riskLevel?: ApprovalRiskLevel;
  reason?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractApprovalMetadata(message: Message): ApprovalMetadata | null {
  if (!message.metadata || !isRecord(message.metadata)) {
    return null;
  }
  const approvalId =
    typeof message.metadata.approvalId === "string" ? message.metadata.approvalId : undefined;
  const toolName =
    typeof message.metadata.toolName === "string" ? message.metadata.toolName : undefined;
  const args = isRecord(message.metadata.args) ? message.metadata.args : undefined;
  if (!approvalId || !toolName || !args) {
    return null;
  }
  const riskLevel =
    typeof message.metadata.riskLevel === "string" &&
    ["low", "medium", "high", "critical"].includes(message.metadata.riskLevel)
      ? (message.metadata.riskLevel as ApprovalRiskLevel)
      : undefined;
  const reason = typeof message.metadata.reason === "string" ? message.metadata.reason : undefined;
  return { approvalId, toolName, args, riskLevel, reason };
}

const MessageContent = ({
  message,
  displayContent,
  assistantArtifacts,
  showBubble,
  isUser,
  isStreaming,
  onPreviewArtifact,
  onTaskAction,
}: {
  message: Message;
  displayContent: string;
  assistantArtifacts: ArtifactItem[];
  showBubble: boolean;
  isUser: boolean;
  isStreaming: boolean;
  onPreviewArtifact?: (artifact: ArtifactItem) => void;
  onTaskAction?: (
    action: "approve" | "reject",
    metadata: { approvalId: string; toolName: string; args: Record<string, unknown> }
  ) => Promise<void>;
}) => {
  const [pendingApproval, setPendingApproval] = React.useState<"approve" | "reject" | null>(null);

  if (message.type === "info") {
    return <InfoMessage content={message.content} />;
  }
  if (message.type === "ask") {
    const approvalMetadata = extractApprovalMetadata(message);
    if (approvalMetadata) {
      const toolDescription =
        approvalMetadata.reason ?? `Approval required to run ${approvalMetadata.toolName}.`;
      const isPending = message.status === "pending";
      const handleApprovalAction = async (action: "approve" | "reject") => {
        if (!onTaskAction) {
          return;
        }
        setPendingApproval(action);
        try {
          await onTaskAction(action, {
            approvalId: approvalMetadata.approvalId,
            toolName: approvalMetadata.toolName,
            args: approvalMetadata.args,
          });
        } finally {
          setPendingApproval(null);
        }
      };
      return (
        <ApprovalCard
          toolName={approvalMetadata.toolName}
          toolDescription={toolDescription}
          parameters={approvalMetadata.args}
          riskLevel={approvalMetadata.riskLevel ?? "medium"}
          onApprove={() => handleApprovalAction("approve")}
          onReject={() => handleApprovalAction("reject")}
          pendingAction={pendingApproval}
          isDisabled={!onTaskAction || !isPending}
        />
      );
    }
    return (
      <AskMessage
        content={message.content}
        suggestedAction={message.suggested_action}
        metadata={message.metadata}
      />
    );
  }
  if (message.type === "result") {
    return (
      <ResultMessage
        content={message.content}
        artifacts={assistantArtifacts}
        onPreview={onPreviewArtifact}
      />
    );
  }
  if (message.type === "task_stream" && message.metadata?.task) {
    return (
      <TaskStreamMessage
        task={message.metadata.task as AgentTask}
        onPreview={onPreviewArtifact}
        onAction={onTaskAction}
      />
    );
  }
  if (showBubble) {
    const showWaitingLabel = Boolean(message.metadata?.stalled);
    return (
      <AiMessage from={isUser ? "user" : "assistant"} className="w-full">
        <AiMessageContent>
          <AiMessageResponse
            isStreaming={isStreaming}
            showWaitingLabel={showWaitingLabel}
            waitingLabel={showWaitingLabel ? "Working..." : undefined}
          >
            {displayContent}
          </AiMessageResponse>
        </AiMessageContent>
      </AiMessage>
    );
  }
  return null;
};

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
  onPreviewArtifact,
  onTaskAction,
}: MessageItemProps) {
  const isUser = message.role === "user";
  const isStreaming = message.status === "streaming";

  const { displayContent, artifacts, assistantArtifacts } = useMessageArtifacts(message);
  const showBubble = isUser || isStreaming || displayContent.length > 0;

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
          "shrink-0 h-6 w-6 rounded-md flex items-center justify-center",
          isUser ? "text-primary" : "text-muted-foreground/70",
          message.type === "task_stream" && "text-muted-foreground/60"
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
          isUser ? "text-foreground/90" : "text-foreground",
          message.type === "task_stream" && "w-full max-w-none"
        )}
      >
        <MessageContent
          message={message}
          displayContent={displayContent}
          assistantArtifacts={assistantArtifacts}
          showBubble={showBubble}
          isUser={isUser}
          isStreaming={isStreaming}
          onPreviewArtifact={onPreviewArtifact}
          onTaskAction={onTaskAction}
        />
        {!isUser && message.fallbackNotice && message.type !== "task_stream" && (
          <div className="mt-2 text-fine text-warning/90">{message.fallbackNotice}</div>
        )}

        {/* Artifacts (from inline artifact blocks only) */}
        <ArtifactList artifacts={artifacts} />

        <AssistantStatusRow
          isUser={isUser}
          message={message}
          translations={translations}
          onEdit={onEdit}
          onBranch={onBranch}
          onQuote={onQuote}
          onCopy={onCopy}
          onRetry={onRetry}
        />

        <AssistantReferences
          isUser={isUser}
          message={message}
          translations={translations}
          resolveReference={resolveReference}
          onReferenceSelect={onReferenceSelect}
        />

        <AssistantExecutionSteps isUser={isUser} message={message} />
        <AssistantThinking isUser={isUser} message={message} />
        <AssistantTokenUsage isUser={isUser} message={message} />

        <UserActionsRow
          isUser={isUser}
          message={message}
          onEdit={onEdit}
          onBranch={onBranch}
          onQuote={onQuote}
          onCopy={onCopy}
          onRetry={onRetry}
          translations={translations}
        />

        {!isUser && (message.status === "error" || message.status === "canceled") && (
          <MessageAlert
            status={message.status}
            requestId={message.requestId}
            requestIdLabel={translations.requestIdLabel}
            labels={translations.alertLabels}
            onRetry={() => onRetry(message.id)}
          />
        )}
      </div>
    </div>
  );
});

function isArtifactItem(value: unknown): value is ArtifactItem {
  if (!value || typeof value !== "object") {
    return false;
  }
  return "type" in value && "title" in value;
}

function mapParsedArtifactType(type: string): ArtifactItem["type"] {
  switch (type) {
    case "plan":
      return "plan";
    case "diff":
      return "diff";
    case "report":
      return "report";
    default:
      return "doc";
  }
}

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
        <ModelBadge
          modelId={message.modelId}
          providerId={message.providerId}
          fallbackNotice={message.fallbackNotice}
        />
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
