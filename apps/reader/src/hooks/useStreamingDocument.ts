/**
 * useStreamingDocument Hook
 *
 * Bridges the EnhancedDocument model with React state management.
 * Provides:
 * - Document creation and mutation via immutable operations
 * - Streaming message management
 * - Performance telemetry
 */

"use client";

import {
  type AIContext,
  type DocumentMode,
  type EnhancedDocument,
  applyOperation,
  chatToDocument,
  createEnhancedDocument,
  createMessageBlock,
  createStreamingBlock,
  documentToChat,
  toAIMessages,
  updateMessageContent,
} from "@keepup/lfcc-bridge";
import * as React from "react";

// ============================================================================
// Types
// ============================================================================

export interface StreamingDocumentState {
  document: EnhancedDocument;
  isStreaming: boolean;
  activeMessageId: string | null;
  tokenRate: number;
  totalTokens: number;
}

export interface StreamingDocumentActions {
  /** Append a user message */
  addUserMessage: (content: string) => string;
  /** Start a streaming assistant response */
  startStreaming: (model?: string, provider?: string) => string;
  /** Append content to streaming message */
  appendStreamingContent: (messageId: string, content: string) => void;
  /** Finalize streaming message */
  finalizeStreaming: (messageId: string, aiContext?: AIContext) => void;
  /** Abort streaming */
  abortStreaming: (messageId: string) => void;
  /** Set document mode */
  setMode: (mode: DocumentMode) => void;
  /** Convert chat to document */
  convertToDocument: () => void;
  /** Convert document to chat */
  convertToChat: () => void;
  /** Clear all messages */
  clear: () => void;
  /** Get messages for AI API */
  getAIMessages: () => Array<{ role: string; content: string }>;
  /** Update document title */
  setTitle: (title: string) => void;
  /** Update system prompt */
  setSystemPrompt: (systemPrompt: string | null) => void;
  /** Create version snapshot */
  createSnapshot: (description?: string) => void;
}

export type UseStreamingDocumentResult = StreamingDocumentState & StreamingDocumentActions;

// ============================================================================
// Hook Implementation
// ============================================================================

export function useStreamingDocument(
  initialMode: DocumentMode = "chat",
  options: { id?: string; title?: string } = {}
): UseStreamingDocumentResult {
  // Core document state
  const [document, setDocument] = React.useState<EnhancedDocument>(() =>
    createEnhancedDocument(initialMode, options)
  );

  // Streaming state
  const [activeMessageId, setActiveMessageId] = React.useState<string | null>(null);
  const [tokenRate, setTokenRate] = React.useState(0);

  // Content accumulator for streaming
  const contentAccumulatorRef = React.useRef<Map<string, string>>(new Map());
  const lastUpdateTimeRef = React.useRef<number>(0);
  const chunkCountRef = React.useRef<number>(0);

  // Computed values
  const isStreaming = activeMessageId !== null;
  const totalTokens = React.useMemo(() => {
    let total = 0;
    for (const block of document.blocks) {
      if (block.aiContext?.tokens) {
        total += block.aiContext.tokens.input + block.aiContext.tokens.output;
      }
    }
    return total;
  }, [document.blocks]);

  // Actions

  const addUserMessage: StreamingDocumentActions["addUserMessage"] = React.useCallback(
    (content: string) => {
      const block = createMessageBlock("user", content);
      setDocument((doc) =>
        applyOperation(doc, {
          type: "INSERT_BLOCK",
          blockId: block.id,
          block,
        })
      );
      return block.message?.messageId ?? block.id;
    },
    []
  );

  const startStreaming: StreamingDocumentActions["startStreaming"] = React.useCallback(
    (model?: string, provider?: string) => {
      const block = createStreamingBlock(model, provider);
      const messageId = block.message?.messageId ?? block.id;

      contentAccumulatorRef.current.set(messageId, "");
      lastUpdateTimeRef.current = Date.now();
      chunkCountRef.current = 0;

      setDocument((doc) =>
        applyOperation(doc, {
          type: "INSERT_BLOCK",
          blockId: block.id,
          block,
        })
      );
      setActiveMessageId(messageId);

      return messageId;
    },
    []
  );

  const appendStreamingContent: StreamingDocumentActions["appendStreamingContent"] =
    React.useCallback((messageId: string, content: string) => {
      const current = contentAccumulatorRef.current.get(messageId) ?? "";
      const updated = current + content;
      contentAccumulatorRef.current.set(messageId, updated);
      chunkCountRef.current++;

      // Calculate token rate
      const now = Date.now();
      const elapsed = now - lastUpdateTimeRef.current;
      if (elapsed > 0) {
        const tokens = Math.ceil(updated.length / 4);
        const rate = (tokens / elapsed) * 1000;
        setTokenRate(rate);
      }

      // Update document
      setDocument((doc) => updateMessageContent(doc, messageId, updated));
    }, []);

  const finalizeStreaming: StreamingDocumentActions["finalizeStreaming"] = React.useCallback(
    (messageId: string, aiContext?: AIContext) => {
      const finalContent = contentAccumulatorRef.current.get(messageId) ?? "";
      contentAccumulatorRef.current.delete(messageId);

      setDocument((doc) =>
        updateMessageContent(doc, messageId, finalContent, { status: "complete", aiContext })
      );

      setActiveMessageId(null);
      setTokenRate(0);
    },
    []
  );

  const abortStreaming: StreamingDocumentActions["abortStreaming"] = React.useCallback(
    (messageId: string) => {
      const currentContent = contentAccumulatorRef.current.get(messageId) ?? "";
      contentAccumulatorRef.current.delete(messageId);

      setDocument((doc) =>
        updateMessageContent(doc, messageId, currentContent, { status: "error" })
      );

      setActiveMessageId(null);
      setTokenRate(0);
    },
    []
  );

  const setMode: StreamingDocumentActions["setMode"] = React.useCallback((mode: DocumentMode) => {
    setDocument((doc) => applyOperation(doc, { type: "SET_MODE", mode }));
  }, []);

  const convertToDocument: StreamingDocumentActions["convertToDocument"] = React.useCallback(() => {
    setDocument((doc) => chatToDocument(doc));
  }, []);

  const convertToChat: StreamingDocumentActions["convertToChat"] = React.useCallback(() => {
    setDocument((doc) => documentToChat(doc));
  }, []);

  const clear: StreamingDocumentActions["clear"] = React.useCallback(() => {
    setDocument(createEnhancedDocument(document.mode, { title: document.title }));
    setActiveMessageId(null);
    setTokenRate(0);
    contentAccumulatorRef.current.clear();
  }, [document.mode, document.title]);

  const getAIMessages: StreamingDocumentActions["getAIMessages"] = React.useCallback(() => {
    return toAIMessages(document);
  }, [document]);

  const setTitle: StreamingDocumentActions["setTitle"] = React.useCallback((title: string) => {
    setDocument((doc) => applyOperation(doc, { type: "UPDATE_TITLE", title }));
  }, []);

  const setSystemPrompt: StreamingDocumentActions["setSystemPrompt"] = React.useCallback(
    (systemPrompt: string | null) => {
      setDocument((doc) => applyOperation(doc, { type: "SET_SYSTEM_PROMPT", systemPrompt }));
    },
    []
  );

  const createSnapshot: StreamingDocumentActions["createSnapshot"] = React.useCallback(
    (description?: string) => {
      setDocument((doc) => applyOperation(doc, { type: "SNAPSHOT_VERSION", description }));
    },
    []
  );

  return {
    // State
    document,
    isStreaming,
    activeMessageId,
    tokenRate,
    totalTokens,
    // Actions
    addUserMessage,
    startStreaming,
    appendStreamingContent,
    finalizeStreaming,
    abortStreaming,
    setMode,
    convertToDocument,
    convertToChat,
    clear,
    getAIMessages,
    setTitle,
    setSystemPrompt,
    createSnapshot,
  };
}

export default useStreamingDocument;
