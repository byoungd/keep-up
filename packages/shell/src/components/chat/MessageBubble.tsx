"use client";

import { cn } from "@ku0/shared/utils";
import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ThinkingIndicator, TypingCursor } from "./TypingCursor";

export interface MessageBubbleProps {
  content: string;
  isUser: boolean;
  isStreaming: boolean;
  showWaitingLabel?: boolean;
  waitingLabel?: string;
  className?: string;
  density?: "default" | "compact";
}

/**
 * Renders the message content with Markdown support.
 * Handles code blocks, prose styling, and streaming cursor.
 */
export const MessageBubble = React.memo(function MessageBubble({
  content,
  isUser,
  isStreaming,
  showWaitingLabel = false,
  waitingLabel = "Working...",
  className,
  density = "default",
}: MessageBubbleProps) {
  // If streaming but no content yet, show thinking indicator
  if (isStreaming && !content) {
    return (
      <div className="py-2 flex items-center gap-2 text-xs text-muted-foreground">
        <ThinkingIndicator />
        {showWaitingLabel ? <span>{waitingLabel}</span> : null}
      </div>
    );
  }

  const showPlainStreaming = isStreaming && content.length > 0;
  const containerClass = cn(
    "max-w-none leading-normal break-words",
    isUser ? "text-foreground/90" : "text-foreground"
  );

  const components =
    density === "compact"
      ? {
          p: ({ children }: { children: React.ReactNode }) => <p className="my-1">{children}</p>,
          h1: ({ children }: { children: React.ReactNode }) => (
            <h1 className="mt-3 mb-1 text-sm font-semibold tracking-tight">{children}</h1>
          ),
          h2: ({ children }: { children: React.ReactNode }) => (
            <h2 className="mt-2 mb-1 text-xs font-semibold tracking-tight">{children}</h2>
          ),
          h3: ({ children }: { children: React.ReactNode }) => (
            <h3 className="mt-2 mb-1 text-fine font-semibold uppercase text-muted-foreground">
              {children}
            </h3>
          ),
          pre: ({ children }: { children: React.ReactNode }) => (
            <pre
              className="rounded-lg bg-surface-2/70 p-3 text-fine text-foreground/90 overflow-x-auto border border-border/40"
              // biome-ignore lint/a11y/noNoninteractiveTabindex: Scrollable region needs keyboard access.
              tabIndex={0}
            >
              {children}
            </pre>
          ),
          // biome-ignore lint/suspicious/noExplicitAny: ReactMarkdown types are complex
          code: ({ inline, className, children, ...props }: any) =>
            inline ? (
              <code
                className={cn(
                  "rounded bg-surface-2/80 px-1.5 py-0.5 text-fine text-foreground/90",
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
          blockquote: ({ children }: { children: React.ReactNode }) => (
            <blockquote className="border-l-2 border-border/60 pl-3 text-muted-foreground">
              {children}
            </blockquote>
          ),
          ul: ({ children }: { children: React.ReactNode }) => (
            <ul className="my-1 ml-4 list-disc space-y-1">{children}</ul>
          ),
          ol: ({ children }: { children: React.ReactNode }) => (
            <ol className="my-1 ml-4 list-decimal space-y-1">{children}</ol>
          ),
          li: ({ children }: { children: React.ReactNode }) => (
            <li className="leading-relaxed">{children}</li>
          ),
          hr: () => <hr className="my-3 border-border/60" />,
          a: ({ children, href }: { children: React.ReactNode; href?: string }) => (
            <a
              href={href}
              className="font-medium text-primary underline underline-offset-4 hover:text-primary/80"
            >
              {children}
            </a>
          ),
          strong: ({ children }: { children: React.ReactNode }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
          ),
          em: ({ children }: { children: React.ReactNode }) => (
            <em className="text-foreground/80">{children}</em>
          ),
          table: ({ children }: { children: React.ReactNode }) => (
            <div
              className="overflow-x-auto"
              // biome-ignore lint/a11y/noNoninteractiveTabindex: Scrollable region needs keyboard access.
              tabIndex={0}
            >
              <table className="w-full border-collapse">{children}</table>
            </div>
          ),
          th: ({ children }: { children: React.ReactNode }) => (
            <th className="border-b border-border/50 px-2 py-1 text-left text-fine font-semibold">
              {children}
            </th>
          ),
          td: ({ children }: { children: React.ReactNode }) => (
            <td className="border-b border-border/30 px-2 py-1 text-fine">{children}</td>
          ),
        }
      : {
          p: ({ children }: { children: React.ReactNode }) => <p className="my-2">{children}</p>,
          h1: ({ children }: { children: React.ReactNode }) => (
            <h1 className="mt-5 mb-2 text-lg font-semibold tracking-tight">{children}</h1>
          ),
          h2: ({ children }: { children: React.ReactNode }) => (
            <h2 className="mt-4 mb-2 text-base font-semibold tracking-tight">{children}</h2>
          ),
          h3: ({ children }: { children: React.ReactNode }) => (
            <h3 className="mt-3 mb-1 text-sm font-semibold tracking-tight uppercase text-muted-foreground">
              {children}
            </h3>
          ),
          pre: ({ children }: { children: React.ReactNode }) => (
            <pre
              className="rounded-lg bg-surface-2/70 p-3 text-xs text-foreground/90 overflow-x-auto border border-border/40"
              // biome-ignore lint/a11y/noNoninteractiveTabindex: Scrollable region needs keyboard access.
              tabIndex={0}
            >
              {children}
            </pre>
          ),
          // biome-ignore lint/suspicious/noExplicitAny: ReactMarkdown types are complex
          code: ({ inline, className, children, ...props }: any) =>
            inline ? (
              <code
                className={cn(
                  "rounded bg-surface-2/80 px-1.5 py-0.5 text-xs text-foreground/90",
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
          blockquote: ({ children }: { children: React.ReactNode }) => (
            <blockquote className="border-l-2 border-border/60 pl-3 text-muted-foreground">
              {children}
            </blockquote>
          ),
          ul: ({ children }: { children: React.ReactNode }) => (
            <ul className="my-2 ml-5 list-disc space-y-1">{children}</ul>
          ),
          ol: ({ children }: { children: React.ReactNode }) => (
            <ol className="my-2 ml-5 list-decimal space-y-1">{children}</ol>
          ),
          li: ({ children }: { children: React.ReactNode }) => (
            <li className="leading-relaxed">{children}</li>
          ),
          hr: () => <hr className="my-4 border-border/60" />,
          a: ({ children, href }: { children: React.ReactNode; href?: string }) => (
            <a
              href={href}
              className="font-medium text-primary underline underline-offset-4 hover:text-primary/80"
            >
              {children}
            </a>
          ),
          strong: ({ children }: { children: React.ReactNode }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
          ),
          em: ({ children }: { children: React.ReactNode }) => (
            <em className="text-foreground/80">{children}</em>
          ),
          table: ({ children }: { children: React.ReactNode }) => (
            <div
              className="overflow-x-auto"
              // biome-ignore lint/a11y/noNoninteractiveTabindex: Scrollable region needs keyboard access.
              tabIndex={0}
            >
              <table className="w-full border-collapse">{children}</table>
            </div>
          ),
          th: ({ children }: { children: React.ReactNode }) => (
            <th className="border-b border-border/50 px-2 py-1 text-left text-xs font-semibold">
              {children}
            </th>
          ),
          td: ({ children }: { children: React.ReactNode }) => (
            <td className="border-b border-border/30 px-2 py-1 text-xs">{children}</td>
          ),
        };

  if (showPlainStreaming) {
    return (
      <div
        className={cn(
          containerClass,
          "max-w-[70ch] text-content leading-[1.65] ai-message-enter",
          className
        )}
      >
        <div className="whitespace-pre-wrap break-words">{content}</div>
        <TypingCursor />
      </div>
    );
  }

  return (
    <div
      className={cn(
        containerClass,
        "max-w-[70ch] text-content leading-[1.65] ai-message-enter",
        className
      )}
    >
      {/* biome-ignore lint/suspicious/noExplicitAny: Components type mismatch in ReactMarkdown */}
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components as any}>
        {content}
      </ReactMarkdown>
      {isStreaming && <TypingCursor />}
    </div>
  );
});
