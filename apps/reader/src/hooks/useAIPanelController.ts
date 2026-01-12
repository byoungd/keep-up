"use client";

import { useAIPanelState } from "@/context/PanelStateContext";
import { useAIClient } from "@/hooks/useAIClient";
import { useAiContextConsent } from "@/hooks/useAiContextConsent";
import { useAttachments } from "@/hooks/useAttachments";
import { useAutoScroll } from "@/hooks/useAutoScroll";
import { useChatPersistence } from "@/hooks/useChatPersistence";
import { useDocumentContent } from "@/hooks/useDocumentContent";
import { composePromptWithContext, createContextPayload } from "@/lib/ai/contextPrivacy";
import { MODEL_CAPABILITIES, getDefaultModel, normalizeModelId } from "@/lib/ai/models";
import { buildReferenceAnchors } from "@/lib/ai/referenceAnchors";
import { getWorkflowSystemPrompt } from "@/lib/ai/workflowPrompts";
import { DEFAULT_POLICY_MANIFEST } from "@keepup/core";
import type { LoroRuntime, SpanList } from "@keepup/lfcc-bridge";
import {
  applyOperation,
  createMessageBlock,
  createStreamingBlock,
  findMessage,
  getBlockText,
  updateMessageContent,
} from "@keepup/lfcc-bridge";
import { useTranslations } from "next-intl";
import * as React from "react";
import type { Message } from "../components/layout/MessageItem";

const MESSAGE_STATUS_MAP: Record<string, Message["status"]> = {
  streaming: "streaming",
  error: "error",
  draft: "done",
  complete: "done",
};

function resolveMessageStatus(status: string): Message["status"] {
  return MESSAGE_STATUS_MAP[status] ?? "done";
}

function resolveRequestId(meta: Record<string, unknown> | undefined): string | undefined {
  const value = meta?.requestId;
  return typeof value === "string" ? value : undefined;
}

function resolveConfidence(
  meta: Record<string, unknown> | undefined,
  fallback?: number
): number | undefined {
  const value = meta?.confidence;
  return typeof value === "number" ? value : fallback;
}

export function useAIPanelController({
  docId,
  selectedText,
  pageContext,
  selectionSpans,
  runtime,
}: {
  docId?: string;
  selectedText?: string;
  pageContext?: string;
  selectionSpans?: SpanList;
  runtime?: LoroRuntime | null;
}) {
  const t = useTranslations("AIPanel");

  // 1. Persistence & State (EnhancedDocument)
  const { doc, setDoc, model, setModel, clearHistory, exportHistory } = useChatPersistence(
    getDefaultModel().id
  );

  // Computed messages for UI compatibility
  const messages = React.useMemo(() => {
    return doc.blocks
      .filter((b) => b.type === "message" || b.message)
      .map((b) => {
        const meta = b.meta;
        const requestId = resolveRequestId(meta);
        const confidence = resolveConfidence(meta, b.aiContext?.confidence);

        return {
          id: b.message?.messageId ?? b.id,
          role: b.message?.role ?? "user",
          content: getBlockText(b),
          status: resolveMessageStatus(b.status),
          modelId: b.message?.ai?.model ?? b.aiContext?.model,
          requestId,
          confidence,
          provenance: b.aiContext?.provenance,
          createdAt: b.message?.timestamp ?? b.createdAt,
        };
      }) as Message[];
  }, [doc.blocks]);

  const [input, setInput] = React.useState("");
  const [workflow, setWorkflow] = React.useState<
    "tdd" | "refactoring" | "debugging" | "research" | "none"
  >("none");
  const workflowPrompt = React.useMemo(() => getWorkflowSystemPrompt(workflow), [workflow]);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  // 1.5 Global AI Request Listener
  const { aiRequest, setAIRequest } = useAIPanelState();

  React.useEffect(() => {
    if (aiRequest?.prompt) {
      const { prompt, docId: reqDocId } = aiRequest;
      if (!reqDocId || reqDocId === docId) {
        setInput(prompt);
        setAIRequest(null);
        setTimeout(() => {
          inputRef.current?.focus();
        }, 100);
      }
    }
  }, [aiRequest, docId, setAIRequest]);

  // 1.6 Legacy Model Migration
  React.useEffect(() => {
    const normalizedId = normalizeModelId(model);
    const candidateId = normalizedId ?? model;
    const activeModel = MODEL_CAPABILITIES.find((entry) => entry.id === candidateId);

    if (normalizedId && normalizedId !== model) {
      setModel(normalizedId);
      return;
    }

    if (!activeModel) {
      const defaultModel = getDefaultModel();
      setModel(defaultModel.id);
    }
  }, [model, setModel]);

  React.useEffect(() => {
    setDoc((prevDoc) => {
      if (prevDoc.systemPrompt === workflowPrompt) {
        return prevDoc;
      }
      return applyOperation(prevDoc, {
        type: "SET_SYSTEM_PROMPT",
        systemPrompt: workflowPrompt,
      });
    });
  }, [workflowPrompt, setDoc]);

  // 2. Attachments
  const attachmentsCtrl = useAttachments();
  const { attachments, setAttachments, setAttachmentError, clearAttachments } = attachmentsCtrl;

  // 3. Auto-scroll
  const { setAutoScroll, containerRef: listRef } = useAutoScroll({ dependencies: [messages] });

  // 4. Model Capabilities
  const selectedCapability = React.useMemo(
    () => MODEL_CAPABILITIES.find((entry) => entry.id === model) ?? getDefaultModel(),
    [model]
  );

  const visionFallback = React.useMemo(
    () => MODEL_CAPABILITIES.find((entry) => entry.supports.vision),
    []
  );

  const filteredModels = MODEL_CAPABILITIES;

  // 5. Context & Privacy
  const { content: docContent } = useDocumentContent(docId ?? null);
  const dataAccessPolicy = React.useMemo(() => {
    const policy = DEFAULT_POLICY_MANIFEST.ai_native_policy?.data_access;
    if (!policy) {
      return undefined;
    }
    return {
      max_context_chars: policy.max_context_chars,
      allow_blocks: policy.allow_blocks,
      deny_blocks: policy.deny_blocks,
      redaction_strategy: policy.redaction_strategy,
      pii_handling: policy.pii_handling,
    };
  }, []);

  const contextPayload = React.useMemo(
    () =>
      createContextPayload({
        selectedText,
        pageContext: pageContext || docContent || undefined,
        policy: dataAccessPolicy,
      }),
    [pageContext, selectedText, docContent, dataAccessPolicy]
  );

  const consentCtrl = useAiContextConsent(docId);
  const { decision } = consentCtrl;

  // 6. Streaming Logic
  const abortReasonRef = React.useRef<"user" | "timeout" | null>(null);

  const streamCallbacksRef = React.useRef<{
    messageId: string;
    draftContent: string;
  } | null>(null);

  const handleStreamContentUpdate = React.useCallback(
    (content: string) => {
      const ctx = streamCallbacksRef.current;
      if (!ctx) {
        return;
      }
      setDoc((prevDoc) => updateMessageContent(prevDoc, ctx.messageId, content));
    },
    [setDoc]
  );

  const handleStreamComplete = React.useCallback(
    (result: {
      requestId: string;
      agentId?: string;
      intentId?: string;
      confidence?: number;
      provenance?: {
        model_id: string;
        prompt_hash?: string;
        prompt_template_id?: string;
        input_context_hashes?: string[];
        rationale_summary?: string;
        temperature?: number;
      };
    }) => {
      if (streamCallbacksRef.current) {
        const { messageId } = streamCallbacksRef.current;
        setDoc((prevDoc) => {
          const messageBlock = findMessage(prevDoc, messageId);
          if (!messageBlock) {
            return prevDoc;
          }

          const updatedDoc = updateMessageContent(prevDoc, messageId, getBlockText(messageBlock), {
            status: "complete",
            aiContext: {
              model,
              request_id: result.requestId,
              agent_id: result.agentId,
              intent_id: result.intentId,
              confidence: result.confidence,
              provenance: result.provenance,
            },
          });

          const updatedBlocks = updatedDoc.blocks.map((b) =>
            b.id === messageBlock.id
              ? {
                  ...b,
                  meta: {
                    ...b.meta,
                    requestId: result.requestId,
                    agentId: result.agentId,
                    intentId: result.intentId,
                    confidence: result.confidence,
                  },
                }
              : b
          );

          return { ...updatedDoc, blocks: updatedBlocks, updatedAt: Date.now() };
        });
        setAttachments([]);
      }
      streamCallbacksRef.current = null;
    },
    [setDoc, setAttachments, model]
  );

  const handleStreamError = React.useCallback(
    (error: { message: string; code?: string; requestId?: string }) => {
      if (streamCallbacksRef.current) {
        const { messageId, draftContent } = streamCallbacksRef.current;
        const isCanceled = error.code === "canceled" || abortReasonRef.current === "user";
        const fallback =
          abortReasonRef.current === "timeout"
            ? t("errorTimeout")
            : (error.message ?? t("errorFallback"));

        setDoc((prevDoc) => {
          const messageBlock = findMessage(prevDoc, messageId);
          if (!messageBlock) {
            return prevDoc;
          }

          const errorContent = isCanceled
            ? t("canceledByUser")
            : t("errorMessage", { message: fallback });

          const updatedDoc = updateMessageContent(prevDoc, messageId, errorContent, {
            status: "error",
          });

          if (!error.requestId) {
            return updatedDoc;
          }

          const updatedBlocks = updatedDoc.blocks.map((b) =>
            b.id === messageBlock.id ? { ...b, meta: { ...b.meta, requestId: error.requestId } } : b
          );

          return { ...updatedDoc, blocks: updatedBlocks, updatedAt: Date.now() };
        });
        setInput(draftContent);
        setAttachments((prev) =>
          prev.map((att) => (att.status === "sending" ? { ...att, status: "ready" } : att))
        );
      }
      streamCallbacksRef.current = null;
      abortReasonRef.current = null;
    },
    [setDoc, setAttachments, t]
  );

  const {
    status: aiStatus,
    content: aiContent,
    error: aiError,
    result: aiResult,
    stream,
    abort,
    reset: resetAIClient,
  } = useAIClient();

  React.useEffect(() => {
    if (!streamCallbacksRef.current) {
      return;
    }

    if (aiStatus === "streaming") {
      handleStreamContentUpdate(aiContent);
      return;
    }

    if (aiStatus === "done" && aiResult) {
      handleStreamComplete(aiResult);
      return;
    }

    if (aiStatus === "error" && aiError) {
      if (aiError.code === "timeout") {
        abortReasonRef.current = "timeout";
      }
      handleStreamError({
        message: aiError.message,
        code: aiError.code,
        requestId: aiError.requestId,
      });
    }
  }, [
    aiStatus,
    aiContent,
    aiError,
    aiResult,
    handleStreamContentUpdate,
    handleStreamComplete,
    handleStreamError,
  ]);

  const isStreaming = aiStatus === "streaming";
  const isLoading = isStreaming;

  const resetState = React.useCallback(() => {
    abortReasonRef.current = null;
    streamCallbacksRef.current = null;
  }, []);

  // --- Sub-actions ---

  const ensureVisionSupported = React.useCallback(() => {
    if (attachments.length === 0 || selectedCapability.supports.vision) {
      setAttachmentError(null);
      return true;
    }
    setAttachmentError(t("errorVisionRequired"));
    return false;
  }, [attachments.length, selectedCapability, t, setAttachmentError]);

  const prepareContext = React.useCallback(() => {
    const referenceAnchors =
      decision.allowContext && runtime && selectionSpans && selectionSpans.length > 0
        ? buildReferenceAnchors(selectionSpans, runtime, docId)
        : [];

    const contextBlock = decision.allowContext ? (contextPayload?.text ?? null) : null;
    return { referenceAnchors, contextBlock };
  }, [decision.allowContext, runtime, selectionSpans, docId, contextPayload]);

  // --- Main Actions ---

  const handleClear = React.useCallback(() => {
    abort();
    resetAIClient();
    clearHistory();
    clearAttachments();
    setInput("");
    resetState();
    setAutoScroll(true);
  }, [abort, resetAIClient, clearHistory, clearAttachments, resetState, setAutoScroll]);

  const prepareAttachments = React.useCallback(
    () =>
      attachments
        .filter((att) => att.status === "ready")
        .map((att) => ({ type: "image", url: att.url }) as const),
    [attachments]
  );

  const runStreamExecution = React.useCallback(
    async (
      content: string,
      history: { role: "user" | "assistant"; content: string }[],
      messageId: string,
      attachmentPayload: { type: "image"; url: string }[],
      draftContent: string,
      selectedWorkflow: string,
      systemPrompt: string | null
    ) => {
      streamCallbacksRef.current = { messageId, draftContent };

      await stream({
        prompt: content,
        model,
        history,
        attachments: attachmentPayload,
        workflow: selectedWorkflow as "tdd" | "refactoring" | "debugging" | "research" | "none",
        systemPrompt: systemPrompt ?? undefined,
      });
    },
    [stream, model]
  );

  const handleSend = React.useCallback(async () => {
    const rawContent = input.trim();
    const isBusy = attachments.some(
      (att) => att.status === "processing" || att.status === "sending" || att.status === "error"
    );

    if (!rawContent || isLoading || isStreaming || isBusy || !ensureVisionSupported()) {
      return;
    }

    // 1. Prepare Context & Content
    const { contextBlock } = prepareContext();
    const content = composePromptWithContext(rawContent, contextBlock);
    const draftContent = rawContent;

    // 2. Reset UI
    setInput("");
    resetState();

    // 3. Create Messages (EnhancedDocument style)
    // Create user message block
    const userBlock = createMessageBlock("user", content);

    // Create streaming assistant block
    const assistantBlock = createStreamingBlock(model);
    const messageId = assistantBlock.message?.messageId ?? assistantBlock.id;

    // Apply both operations
    setDoc((prevDoc) => {
      let newDoc = applyOperation(prevDoc, {
        type: "INSERT_BLOCK",
        blockId: userBlock.id,
        block: userBlock,
      });
      newDoc = applyOperation(newDoc, {
        type: "INSERT_BLOCK",
        blockId: assistantBlock.id,
        block: assistantBlock,
      });
      return newDoc;
    });

    // 4. Usage History
    const previousHistory = doc.blocks
      .filter((b) => b.type === "message" || b.message)
      .map((b) => ({
        role: b.message?.role as "user" | "assistant",
        content: getBlockText(b),
      }));
    const resolvedSystemPrompt = doc.systemPrompt ?? workflowPrompt;

    // 5. Attachments
    const attachmentPayload = prepareAttachments();
    setAttachments((prev) =>
      prev.map((att) => (att.status === "ready" ? { ...att, status: "sending" } : att))
    );

    // 6. Execute
    await runStreamExecution(
      content,
      previousHistory,
      messageId,
      attachmentPayload,
      draftContent,
      workflow,
      resolvedSystemPrompt ?? null
    );
  }, [
    input,
    isLoading,
    isStreaming,
    attachments,
    ensureVisionSupported,
    prepareContext,
    prepareAttachments,
    resetState,
    doc,
    workflowPrompt,
    setDoc,
    setAttachments,
    runStreamExecution,
    workflow,
    model,
  ]);

  const handleAbort = React.useCallback(() => {
    abortReasonRef.current = "user";
    abort();
    handleStreamError({ message: t("canceledByUser"), code: "canceled" });
  }, [abort, handleStreamError, t]);

  const handleRetry = React.useCallback(
    (messageId: string) => {
      const blockIndex = doc.blocks.findIndex((b) => b.message?.messageId === messageId);
      if (blockIndex <= 0) {
        return;
      }

      const historyBlocks = doc.blocks.slice(0, blockIndex);
      const lastUserBlock = [...historyBlocks].reverse().find((b) => b.message?.role === "user");

      if (lastUserBlock) {
        setInput(getBlockText(lastUserBlock));
      }

      setDoc((prev) => ({
        ...prev,
        blocks: historyBlocks,
        updatedAt: Date.now(),
      }));
    },
    [doc.blocks, setDoc]
  );

  const handleEdit = React.useCallback(
    (messageId: string) => {
      const block = doc.blocks.find((b) => b.message?.messageId === messageId);
      if (block) {
        setInput(getBlockText(block));
        inputRef.current?.focus();
      }
    },
    [doc.blocks]
  );

  const handleBranch = React.useCallback(
    (messageId: string) => {
      setDoc((prev) => {
        const index = prev.blocks.findIndex((b) => b.message?.messageId === messageId);
        if (index === -1) {
          return prev;
        }
        return {
          ...prev,
          blocks: prev.blocks.slice(0, index + 1),
          updatedAt: Date.now(),
        };
      });
      setInput("");
    },
    [setDoc]
  );

  const handleQuote = React.useCallback((content: string) => {
    setInput((prev) => `${prev}\n> ${content}\n`);
    inputRef.current?.focus();
  }, []);

  const handleSuggestionClick = React.useCallback((suggestion: string) => {
    setInput(suggestion);
  }, []);

  const handleCopyLastAnswer = React.useCallback(() => {
    const lastAssistant = [...doc.blocks]
      .reverse()
      .find((b) => b.message?.role === "assistant" && getBlockText(b).length > 0);
    if (lastAssistant) {
      void navigator.clipboard.writeText(getBlockText(lastAssistant));
    }
  }, [doc.blocks]);

  const handleCopy = React.useCallback((content: string) => {
    void navigator.clipboard.writeText(content);
  }, []);

  return {
    // State
    messages,
    input,
    setInput,
    inputRef,
    isLoading,
    isStreaming,
    model,
    setModel,
    workflow,
    setWorkflow,

    // Sub-controllers
    attachmentsCtrl,
    consentCtrl,
    listRef,

    // Computed
    filteredModels,
    contextPayload,
    selectedCapability,
    visionFallback,

    // Actions
    handleSend,
    handleAbort,
    handleClear,
    handleRetry,
    handleEdit,
    handleBranch,
    handleQuote,
    handleSuggestionClick,
    handleCopyLastAnswer,
    handleCopy,
    exportHistory,
  };
}
