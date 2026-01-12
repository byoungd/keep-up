"use client";

import type { ReferenceAnchor, ReferenceRange } from "@/lib/ai/referenceAnchors";
import * as React from "react";
import type { MessageStatus } from "./MessageItem";

/**
 * Translations for message list and items.
 */
export interface MessageListTranslations {
  // List-level
  emptyTitle: string;
  emptyDescription: string;
  // Item-level
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

/**
 * Action callbacks for message interactions.
 */
export interface MessageListActions {
  onEdit: (id: string) => void;
  onBranch: (id: string) => void;
  onQuote: (content: string) => void;
  onCopy: (content: string) => void;
  onRetry: (id: string) => void;
  onSuggestionClick: (suggestion: string) => void;
  resolveReference?: (anchor: ReferenceAnchor) => ReferenceRange;
  onReferenceSelect?: (anchor: ReferenceAnchor) => void;
}

/**
 * Combined context value.
 */
export interface MessageListContextValue {
  translations: MessageListTranslations;
  actions: MessageListActions;
}

const MessageListContext = React.createContext<MessageListContextValue | null>(null);

// Export for internal use by MessageItem (avoids circular import issues)
export { MessageListContext as MessageListContextInternal };

/**
 * Provider for message list context.
 */
export function MessageListProvider({
  children,
  translations,
  actions,
}: {
  children: React.ReactNode;
  translations: MessageListTranslations;
  actions: MessageListActions;
}) {
  const value = React.useMemo(() => ({ translations, actions }), [translations, actions]);

  return <MessageListContext.Provider value={value}>{children}</MessageListContext.Provider>;
}

/**
 * Hook to access message list context.
 * Throws if used outside provider.
 */
export function useMessageListContext(): MessageListContextValue {
  const ctx = React.useContext(MessageListContext);
  if (!ctx) {
    throw new Error("useMessageListContext must be used within MessageListProvider");
  }
  return ctx;
}

/**
 * Selector hook for actions only (stable reference).
 */
export function useMessageActions(): MessageListActions {
  return useMessageListContext().actions;
}

/**
 * Selector hook for translations only (stable reference).
 */
export function useMessageTranslations(): MessageListTranslations {
  return useMessageListContext().translations;
}
