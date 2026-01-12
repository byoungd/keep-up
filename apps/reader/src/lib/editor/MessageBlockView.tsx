/**
 * MessageBlockView - Chat message block rendering
 *
 * Renders message blocks with:
 * - Role-based styling (user/assistant)
 * - Streaming indicator animation
 * - Model badge for AI responses
 * - Timestamp display
 *
 * Premium Linear-quality design.
 */

"use client";

import type { NodeViewComponentProps } from "@handlewithcare/react-prosemirror";
import { Bot, Loader2, User } from "lucide-react";
import * as React from "react";

// ============================================================================
// Types
// ============================================================================

type MessageRole = "user" | "assistant" | "system";

interface MessageBlockProps extends NodeViewComponentProps {
  children?: React.ReactNode;
}

// ============================================================================
// Helper Components
// ============================================================================

function RoleIndicator({ role, streaming }: { role: MessageRole; streaming: boolean }) {
  if (role === "user") {
    return (
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary flex items-center justify-center">
        <User className="w-4 h-4 text-primary-foreground" />
      </div>
    );
  }

  if (role === "assistant") {
    return (
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
        {streaming ? (
          <Loader2 className="w-4 h-4 text-white animate-spin" />
        ) : (
          <Bot className="w-4 h-4 text-white" />
        )}
      </div>
    );
  }

  // System message
  return (
    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-muted flex items-center justify-center">
      <span className="text-xs font-medium text-muted-foreground">S</span>
    </div>
  );
}

function ModelBadge({ model }: { model: string | null }) {
  if (!model) {
    return null;
  }

  return (
    <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-muted/50 text-muted-foreground">
      {model}
    </span>
  );
}

function Timestamp({ timestamp }: { timestamp: number }) {
  if (!timestamp) {
    return null;
  }

  const date = new Date(timestamp);
  const timeStr = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return <span className="text-[10px] text-muted-foreground tabular-nums">{timeStr}</span>;
}

// ============================================================================
// Main Component
// ============================================================================

export const MessageBlockView = React.forwardRef<HTMLDivElement, MessageBlockProps>(
  ({ nodeProps, children, ...props }, ref) => {
    const { node } = nodeProps;

    // Extract message attributes
    const role = node.attrs.role as MessageRole;
    const messageId = node.attrs.message_id as string;
    const timestamp = node.attrs.timestamp as number;
    const streaming = node.attrs.streaming === true;
    const model = node.attrs.model as string | null;

    // Role-based styling
    const isUser = role === "user";
    const containerClasses = isUser
      ? "flex flex-row-reverse gap-3" // User messages aligned right
      : "flex flex-row gap-3"; // AI messages aligned left

    const bubbleClasses = isUser
      ? "bg-primary/10 rounded-2xl rounded-tr-sm px-4 py-3 max-w-[85%]"
      : "bg-surface-2 rounded-2xl rounded-tl-sm px-4 py-3 max-w-[85%] border border-border/30";

    const streamingClasses = streaming
      ? "relative before:absolute before:inset-0 before:rounded-2xl before:animate-pulse before:bg-gradient-to-r before:from-violet-500/5 before:to-purple-500/5"
      : "";

    return (
      <div
        {...props}
        ref={ref}
        className={`py-2 ${containerClasses}`}
        data-message-id={messageId}
        data-role={role}
      >
        {/* Role Indicator */}
        <RoleIndicator role={role} streaming={streaming} />

        {/* Message Content */}
        <div className={`${bubbleClasses} ${streamingClasses}`}>
          {/* Header */}
          <div className="flex items-center gap-2 mb-1">
            {!isUser && <ModelBadge model={model} />}
            <Timestamp timestamp={timestamp} />
            {streaming && (
              <span className="text-[10px] text-violet-500 animate-pulse">Generating...</span>
            )}
          </div>

          {/* Content */}
          <div className="prose prose-sm dark:prose-invert max-w-none">{children}</div>
        </div>
      </div>
    );
  }
);

MessageBlockView.displayName = "MessageBlockView";

export default MessageBlockView;
