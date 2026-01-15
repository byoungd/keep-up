"use client";

import { cn } from "@ku0/shared/utils";
import * as React from "react";
// @ts-ignore
import ReactMarkdown from "react-markdown";
import { ThinkingIndicator, TypingCursor } from "./TypingCursor";

export interface MessageBubbleProps {
  content: string;
  isUser: boolean;
  isStreaming: boolean;
}

/**
 * Renders the message content with Markdown support.
 * Handles code blocks, prose styling, and streaming cursor.
 */
export const MessageBubble = React.memo(function MessageBubble({
  content,
  isUser,
  isStreaming,
}: MessageBubbleProps) {
  // If streaming but no content yet, show thinking indicator
  if (isStreaming && !content) {
    return (
      <div className="py-2">
        <ThinkingIndicator />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "prose prose-sm max-w-none leading-normal break-words",
        "prose-pre:max-w-[calc(100vw-4rem)] lg:prose-pre:max-w-[calc(450px-6rem)]",
        "prose-p:my-1.5 prose-a:text-primary prose-code:text-[13px]",
        isUser
          ? "prose-p:text-foreground/90"
          : "prose-headings:font-semibold prose-headings:text-foreground dark:prose-invert"
      )}
    >
      <ReactMarkdown>{content}</ReactMarkdown>
      {isStreaming && content && <TypingCursor />}
    </div>
  );
});
