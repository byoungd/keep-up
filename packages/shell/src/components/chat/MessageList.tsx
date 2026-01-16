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
  // Determine loading state for AILoadingStatus
  const loadingState = React.useMemo((): AILoadingState => {
    if (!isLoading && !isStreaming) {
      return "idle";
    }
    const lastMsg = messages[messages.length - 1];
    if (isStreaming && lastMsg?.status === "streaming" && lastMsg?.content) {
      return "idle";
    }
    if (isStreaming) {
      return "thinking";
    }
    return "connecting";
  }, [isLoading, isStreaming, messages]);

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

  // Empty state
  if (messages.length === 0) {
    return (
      <div className={containerClass} ref={listRef}>
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
      <div className={containerClass} ref={listRef}>
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

  // Standard rendering for small message counts
  return (
    <div className={cn(containerClass, "space-y-5")} ref={listRef}>
      {messages.map(renderMessage)}
      {showLoadingStatus ? <AILoadingStatus state={loadingState} className="mt-2" /> : null}
    </div>
  );
}
