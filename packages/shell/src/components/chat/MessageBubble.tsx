"use client";

import { cn } from "@ku0/shared/utils";
import * as React from "react";
// @ts-ignore
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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

  const containerClass = cn(
    "max-w-none leading-normal break-words",
    isUser ? "text-foreground/90" : "text-foreground"
  );

  return (
    <div className={cn(containerClass, "max-w-[70ch] text-[14.5px] leading-[1.65]")}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="my-2">{children}</p>,
          h1: ({ children }) => (
            <h1 className="mt-5 mb-2 text-lg font-semibold tracking-tight">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-4 mb-2 text-base font-semibold tracking-tight">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-3 mb-1 text-sm font-semibold tracking-tight uppercase text-muted-foreground">
              {children}
            </h3>
          ),
          pre: ({ children }) => (
            <pre className="rounded-lg bg-surface-2/70 p-3 text-xs text-foreground/90 overflow-x-auto border border-border/40">
              {children}
            </pre>
          ),
          // biome-ignore lint/suspicious/noExplicitAny: ReactMarkdown types are complex
          code: ({ inline, className, children, ...props }: any) =>
            inline ? (
              <code
                className={cn(
                  "rounded bg-surface-2/80 px-1.5 py-0.5 text-[12px] text-foreground/90",
                  className
                )}
                {...props}
              >
                {children}
              </code>
            ) : (
              <code className={className} {...props}>
                {children}
              </code>
            ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-border/60 pl-3 text-muted-foreground">
              {children}
            </blockquote>
          ),
          ul: ({ children }) => <ul className="my-2 ml-5 list-disc space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="my-2 ml-5 list-decimal space-y-1">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          hr: () => <hr className="my-4 border-border/60" />,
          a: ({ children, href }) => (
            <a
              href={href}
              className="font-medium text-primary underline underline-offset-4 hover:text-primary/80"
            >
              {children}
            </a>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
          ),
          em: ({ children }) => <em className="text-foreground/80">{children}</em>,
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border-b border-border/50 px-2 py-1 text-left text-xs font-semibold">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b border-border/30 px-2 py-1 text-xs">{children}</td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
      {isStreaming && <TypingCursor />}
    </div>
  );
});
