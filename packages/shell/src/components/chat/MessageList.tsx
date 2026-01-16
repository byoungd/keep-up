"use client";

import { cn } from "@ku0/shared/utils";
import { useVirtualizer } from "@tanstack/react-virtual";
import * as React from "react";
import type { ReferenceAnchor, ReferenceRange } from "../../lib/ai/referenceAnchors";
import { type AILoadingState, AILoadingStatus } from "./AILoadingStatus";
import { MessageItem } from "./MessageItem";
import { StartupView } from "./StartupView";
import type { ArtifactItem, Message, MessageStatus } from "./types";

// Estimated height per message for virtualization calculations
const ESTIMATED_MESSAGE_HEIGHT = 120;
// Minimum messages before enabling virtualization (avoid overhead for small lists)
const VIRTUALIZATION_THRESHOLD = 30;

export interface MessageListProps {
  messages: Message[];
  suggestions: string[];
  isLoading: boolean;
  isStreaming: boolean;
  listRef: React.RefObject<HTMLDivElement | null>;
  onEdit: (id: string) => void;
  onBranch: (id: string) => void;
  onQuote: (content: string) => void;
  onCopy: (content: string) => void;
  onRetry: (id: string) => void;
  onSuggestionClick: (suggestion: string) => void;
  translations: {
    emptyTitle: string;
    emptyDescription: string;
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
  };
  resolveReference?: (anchor: ReferenceAnchor) => ReferenceRange;
  onReferenceSelect?: (anchor: ReferenceAnchor) => void;
  onPreviewArtifact?: (item: ArtifactItem) => void;
  isMain?: boolean;
}

export function MessageList({
  messages,
  suggestions,
  isLoading,
  isStreaming,
  listRef,
  onEdit,
  onBranch,
  onQuote,
  onCopy,
  onRetry,
  onSuggestionClick,
  translations,
  resolveReference,
  onReferenceSelect,
  onPreviewArtifact,
  isMain = false,
}: MessageListProps) {
  const loadingState = useAILoadingState(isLoading, isStreaming, messages);

  const showLoadingStatus = loadingState !== "idle" && loadingState === "connecting";

  // Virtualization: only enable for larger message lists
  const shouldVirtualize = messages.length >= VIRTUALIZATION_THRESHOLD;

  // TanStack Virtual setup with dynamic height measurement
  const rowVirtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => ESTIMATED_MESSAGE_HEIGHT,
    overscan: 5,
    // Enable dynamic measurement for accurate row heights
    measureElement:
      typeof window !== "undefined"
        ? (element) => element?.getBoundingClientRect().height ?? ESTIMATED_MESSAGE_HEIGHT
        : undefined,
  });

  useScrollManagement(listRef, messages, isStreaming, shouldVirtualize, rowVirtualizer);

  // Render a single message item (memoized callback)
  const renderMessage = React.useCallback(
    (m: Message) => (
      <div className={cn(isMain && "max-w-3xl mx-auto w-full")}>
        <MessageItem
          key={m.id}
          message={m}
          onEdit={onEdit}
          onBranch={onBranch}
          onQuote={onQuote}
          onCopy={onCopy}
          onRetry={onRetry}
          translations={translations}
          resolveReference={resolveReference}
          onReferenceSelect={onReferenceSelect}
          onPreviewArtifact={onPreviewArtifact}
        />
      </div>
    ),
    [
      onEdit,
      onBranch,
      onQuote,
      onCopy,
      onRetry,
      translations,
      resolveReference,
      onReferenceSelect,
      onPreviewArtifact,
      isMain,
    ]
  );

  const containerClass = cn(
    "flex-1 overflow-y-auto overflow-x-hidden px-6 py-6 space-y-6",
    isMain && "px-0", // Remove global padding in main mode to allow full-width scrollbar area (though padding usually inside scrollbar?)
    // Actually, distinct padding logic for items?
    // If I keep px-6, the scrollbar is at the edge of the container (which has padding).
    // So keeping px-6 is fine for scrollbar position.
    // BUT I want content to be max-w-3xl.
    // So I need a wrapper around items.
    "[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent",
    "[&::-webkit-scrollbar-thumb]:bg-transparent hover:[&::-webkit-scrollbar-thumb]:bg-border/40",
    "[&::-webkit-scrollbar-thumb]:rounded-full transition-colors"
  );

  const handleScroll = React.useCallback(() => {
    const container = listRef.current;
    if (!container) {
      return;
    }
    const _distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    // We update stickiness here implicitly or could pass it back from hook
  }, [listRef]);

  // Empty state
  if (messages.length === 0) {
    return (
      <div className={containerClass} ref={listRef} onScroll={handleScroll}>
        <StartupView
          title={translations.emptyTitle}
          description={translations.emptyDescription}
          suggestions={suggestions}
          onSuggestionClick={onSuggestionClick}
        />
      </div>
    );
  }

  // Virtualized rendering
  if (shouldVirtualize) {
    return (
      <div className={containerClass} ref={listRef} onScroll={handleScroll}>
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const message = messages[virtualRow.index];
            return (
              <div
                key={message.id}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <div className="pb-5">
                  <div className={cn(isMain && "max-w-3xl mx-auto w-full")}>
                    <MessageItem
                      message={message}
                      onEdit={onEdit}
                      onBranch={onBranch}
                      onQuote={onQuote}
                      onCopy={onCopy}
                      onRetry={onRetry}
                      translations={translations}
                      resolveReference={resolveReference}
                      onReferenceSelect={onReferenceSelect}
                      onPreviewArtifact={onPreviewArtifact}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {showLoadingStatus ? <AILoadingStatus state={loadingState} className="mt-2" /> : null}
      </div>
    );
  }

  return (
    <div className={cn(containerClass, "space-y-5")} ref={listRef} onScroll={handleScroll}>
      {messages.map(renderMessage)}
      {showLoadingStatus ? <AILoadingStatus state={loadingState} className="mt-2" /> : null}
    </div>
  );
}

function useAILoadingState(
  isLoading: boolean,
  isStreaming: boolean,
  messages: Message[]
): AILoadingState {
  return React.useMemo((): AILoadingState => {
    if (!isLoading && !isStreaming) {
      return "idle";
    }
    const lastMsg = messages[messages.length - 1];
    if (isStreaming && lastMsg?.status === "streaming" && lastMsg?.content) {
      return "idle";
    }
    return isStreaming ? "thinking" : "connecting";
  }, [isLoading, isStreaming, messages]);
}

function useScrollManagement(
  listRef: React.RefObject<HTMLDivElement | null>,
  messages: Message[],
  _isStreaming: boolean,
  shouldVirtualize: boolean,
  rowVirtualizer: {
    scrollToIndex: (
      index: number,
      options?: { align: "start" | "center" | "end" | "auto" }
    ) => void;
  }
) {
  const stickToBottomRef = React.useRef(true);

  const scrollToBottom = React.useCallback(
    (behavior: ScrollBehavior) => {
      const container = listRef.current;
      if (!container || messages.length === 0) {
        return;
      }
      if (shouldVirtualize) {
        rowVirtualizer.scrollToIndex(messages.length - 1, { align: "end" });
        return;
      }
      container.scrollTo({ top: container.scrollHeight, behavior });
    },
    [listRef, messages.length, rowVirtualizer, shouldVirtualize]
  );

  const lastMessage = messages[messages.length - 1];
  const lastTaskMeta = lastMessage?.metadata?.task as
    | { id?: string; status?: string; progress?: number; steps?: unknown[]; artifacts?: unknown[] }
    | undefined;
  const lastTaskKey = lastTaskMeta
    ? `${lastTaskMeta.id ?? ""}:${lastTaskMeta.status ?? ""}:${lastTaskMeta.progress ?? ""}:${
        lastTaskMeta.steps?.length ?? 0
      }:${lastTaskMeta.artifacts?.length ?? 0}`
    : "";
  const lastMessageKey = `${lastMessage?.id ?? ""}:${lastMessage?.status ?? ""}:${
    lastMessage?.content?.length ?? 0
  }:${lastTaskKey}`;

  React.useEffect(() => {
    const container = listRef.current;
    if (!container) {
      return;
    }

    const handleScroll = () => {
      const distanceFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      stickToBottomRef.current = distanceFromBottom < 120;
    };

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [listRef]);

  React.useEffect(() => {
    if (!stickToBottomRef.current || messages.length === 0) {
      return;
    }
    // Using lastMessageKey to trigger scroll on content changes
    const _key = lastMessageKey;
    const raf = requestAnimationFrame(() => scrollToBottom("auto"));
    return () => cancelAnimationFrame(raf);
  }, [messages.length, lastMessageKey, scrollToBottom]);
}
