"use client";

import { useAIPanelState } from "@/context/PanelStateContext";
import { useAIClient } from "@/hooks/useAIClient";
import { useAiContextConsent } from "@/hooks/useAiContextConsent";
import { useAttachments } from "@/hooks/useAttachments";
import { useAutoScroll } from "@/hooks/useAutoScroll";
import { useChatPersistence } from "@/hooks/useChatPersistence";
import { useDocumentContent } from "@/hooks/useDocumentContent";
import { useProjectContext } from "@/hooks/useProjectContext";
import { composePromptWithContext, createContextPayload } from "@/lib/ai/contextPrivacy";
import { MODEL_CAPABILITIES, getDefaultModel, normalizeModelId } from "@/lib/ai/models";
import { buildReferenceAnchors } from "@/lib/ai/referenceAnchors";
import { getWorkflowSystemPrompt } from "@/lib/ai/workflowPrompts";
import { DEFAULT_POLICY_MANIFEST } from "@keepup/core";
import type { LoroRuntime, SpanList } from "@keepup/lfcc-bridge";
import { useTranslations } from "next-intl";
import * as React from "react";
import type { Message } from "../components/layout/MessageItem";

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

  // 1. Persistence & State (Facade)
  const {
    facade,
    messages: rawMessages,
    addMessage,
    createStreamingMessage,
    model,
    setModel,
    clearHistory,
    exportHistory,
  } = useChatPersistence(getDefaultModel().id);

  // Computed messages for UI compatibility
  const messages = React.useMemo(() => {
    return rawMessages.map((b) => {
      // Access meta via facade/block if needed, currently on attrs logic in blockToMessage
      // But map to UI Message type
      return {
        id: b.id,
        role: b.role,
        content: b.text,
        status: b.status === "streaming" ? "streaming" : b.status === "error" ? "error" : "done",
        modelId: b.aiContext?.model,
        requestId: b.aiContext?.requestId,
        confidence: b.aiContext?.confidence,
        provenance: b.aiContext?.provenance,
        createdAt: b.createdAt,
      };
    }) as Message[];
  }, [rawMessages]);

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

  // System prompt handling - Facade doesn't have doc-level system prompt yet
  // We'll manage it locally or find a place in facade later if needed.
  // For now, we pass it to the stream call.

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
  const projectContext = useProjectContext();
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

  const projectSections = React.useMemo(
    () =>
      projectContext.data?.sections.map((section) => ({
        label: section.label,
        text: section.text,
        originalLength: section.originalLength,
        truncated: section.truncated,
        blockId: section.blockId,
      })) ?? [],
    [projectContext.data]
  );

  const contextPayload = React.useMemo(
    () =>
      createContextPayload({
        selectedText,
        pageContext: pageContext || docContent || undefined,
        extraSections: projectSections,
        policy: dataAccessPolicy,
      }),
    [pageContext, selectedText, docContent, projectSections, dataAccessPolicy]
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
      if (!ctx || !facade) {
        return;
      }

      facade.updateMessage({
        messageId: ctx.messageId,
        content, // Replace content
      });
    },
    [facade]
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
      if (streamCallbacksRef.current && facade) {
        const { messageId } = streamCallbacksRef.current;

        facade.finalizeMessage(messageId, {
          model,
          requestId: result.requestId,
          agentId: result.agentId,
          confidence: result.confidence,
          provenance: result.provenance,
        });

        setAttachments([]);
      }
      streamCallbacksRef.current = null;
    },
    [facade, setAttachments, model]
  );

  const handleStreamError = React.useCallback(
    (error: { message: string; code?: string; requestId?: string }) => {
      if (streamCallbacksRef.current && facade) {
        const { messageId, draftContent } = streamCallbacksRef.current;
        const isCanceled = error.code === "canceled" || abortReasonRef.current === "user";
        const fallback =
          abortReasonRef.current === "timeout"
            ? t("errorTimeout")
            : (error.message ?? t("errorFallback"));

        const errorContent = isCanceled
          ? t("canceledByUser")
          : t("errorMessage", { message: fallback });

        facade.updateMessage({
          messageId,
          content: errorContent,
          status: "error",
          aiContext: error.requestId
            ? {
                requestId: error.requestId,
              }
            : undefined,
        });

        setInput(draftContent);
        setAttachments((prev) =>
          prev.map((att) => (att.status === "sending" ? { ...att, status: "ready" } : att))
        );
      }
      streamCallbacksRef.current = null;
      abortReasonRef.current = null;
    },
    [facade, setAttachments, t]
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

    if (!rawContent || isLoading || isStreaming || isBusy || !ensureVisionSupported() || !facade) {
      return;
    }

    // 1. Prepare Context & Content
    const { contextBlock } = prepareContext();
    const content = composePromptWithContext(rawContent, contextBlock);
    const draftContent = rawContent;

    // 2. Reset UI
    setInput("");
    resetState();

    // 3. Create Messages (Facade)
    addMessage("user", content);
    const messageId = createStreamingMessage({ model });

    // 4. Usage History
    const previousHistory = rawMessages.map((b) => ({
      role: b.role as "user" | "assistant",
      content: b.text,
    }));

    // System prompt is local for now
    const resolvedSystemPrompt = workflowPrompt;

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
    facade,
    rawMessages,
    workflowPrompt,
    addMessage,
    createStreamingMessage,
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

  const handleRetry = React.useCallback((_messageId: string) => {
    console.warn("Retry not yet fully supported in new architecture");
  }, []);

  const handleEdit = React.useCallback(
    (messageId: string) => {
      const block = rawMessages.find((b) => b.id === messageId);
      if (block) {
        setInput(block.text);
        inputRef.current?.focus();
      }
    },
    [rawMessages]
  );

  const handleBranch = React.useCallback((_messageId: string) => {
    console.warn("Branching not yet supported in new architecture");
    setInput("");
  }, []);

  const handleQuote = React.useCallback((content: string) => {
    setInput((prev) => `${prev}\n> ${content}\n`);
    inputRef.current?.focus();
  }, []);

  const handleSuggestionClick = React.useCallback((suggestion: string) => {
    setInput(suggestion);
  }, []);

  const handleUseTask = React.useCallback((title: string, openItems: string[]) => {
    const focusItem = openItems[0];
    const prompt = focusItem
      ? `Start \"${title}\". Focus on: ${focusItem}`
      : `Start \"${title}\". Propose the next actionable step.`;
    setInput(prompt);
    inputRef.current?.focus();
  }, []);

  const handleCopyLastAnswer = React.useCallback(() => {
    const lastAssistant = [...rawMessages]
      .reverse()
      .find((b) => b.role === "assistant" && b.text.length > 0);
    if (lastAssistant) {
      void navigator.clipboard.writeText(lastAssistant.text);
    }
  }, [rawMessages]);

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
    projectContext,

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
    handleUseTask,
    exportHistory,
  };
}
