"use client";

import { useAIPanelState } from "@/context/PanelStateContext";
import { useAIClient } from "@/hooks/useAIClient";
import { useAiContextConsent } from "@/hooks/useAiContextConsent";
import { useAttachments } from "@/hooks/useAttachments";
import { useAutoScroll } from "@/hooks/useAutoScroll";
import { useBackgroundTasks } from "@/hooks/useBackgroundTasks";
import { useChatPersistence } from "@/hooks/useChatPersistence";
import { useDocumentContent } from "@/hooks/useDocumentContent";
import { useProjectContext } from "@/hooks/useProjectContext";
import type { AgentStreamEvent } from "@/lib/ai/agentStream";
import { composePromptWithContext, createContextPayload } from "@/lib/ai/contextPrivacy";
import { MODEL_CAPABILITIES, getDefaultModel, normalizeModelId } from "@/lib/ai/models";
import { buildReferenceAnchors } from "@/lib/ai/referenceAnchors";
import { getWorkflowSystemPrompt } from "@/lib/ai/workflowPrompts";
import { DEFAULT_POLICY_MANIFEST } from "@keepup/core";
import type { AIContext, LoroRuntime, SpanList, ToolCallRecord } from "@keepup/lfcc-bridge";
import { useTranslations } from "next-intl";
import * as React from "react";
import type { ExecutionStep } from "../components/layout/ExecutionSteps";
import type { Message } from "../components/layout/MessageItem";

function isToolResult(value: unknown): value is ExecutionStep["result"] {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as {
    success?: unknown;
    content?: unknown;
    error?: unknown;
  };
  return typeof record.success === "boolean" && Array.isArray(record.content);
}

function mapToolCallToStep(call: ToolCallRecord, fallbackTime: number): ExecutionStep {
  const result = isToolResult(call.result) ? call.result : undefined;
  const errorMessage = call.error ? { code: "EXECUTION_FAILED", message: call.error } : undefined;
  const status =
    call.status ??
    (result ? (result.success ? "success" : "error") : call.error ? "error" : "pending");

  return {
    id: call.id,
    toolName: call.name,
    arguments: call.arguments,
    status,
    result:
      result ?? (errorMessage ? { success: false, content: [], error: errorMessage } : undefined),
    startTime: call.startTime ?? fallbackTime,
    endTime: call.endTime,
    durationMs: call.durationMs,
  };
}

function findLastIndex<T>(items: T[], predicate: (item: T) => boolean): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index])) {
      return index;
    }
  }
  return -1;
}

function resolveStreamErrorContent(
  error: { message: string; code?: string },
  abortReason: "user" | "timeout" | null,
  t: (key: string, values?: Record<string, string>) => string
): string {
  if (error.code === "canceled" || abortReason === "user") {
    return t("canceledByUser");
  }

  const fallback =
    abortReason === "timeout" ? t("errorTimeout") : (error.message ?? t("errorFallback"));
  return t("errorMessage", { message: fallback });
}

function mergeErrorContext(
  aiContext: AIContext | undefined,
  requestId?: string
): AIContext | undefined {
  if (!aiContext && !requestId) {
    return undefined;
  }
  if (!aiContext) {
    return requestId ? { requestId } : undefined;
  }
  return requestId ? { ...aiContext, requestId } : aiContext;
}

type PendingApproval = {
  confirmationId: string;
  toolName: string;
  description: string;
  arguments: Record<string, unknown>;
  risk: "low" | "medium" | "high";
  reason?: string;
  riskTags?: string[];
};

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

  const backgroundTasks = useBackgroundTasks({
    completed: (name) => t("taskToastCompleted", { name }),
    failed: (name) => t("taskToastFailed", { name }),
    cancelled: (name) => t("taskToastCancelled", { name }),
    streamError: t("taskStreamError"),
  });

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
      const executionSteps = b.aiContext?.toolCalls?.map((call) =>
        mapToolCallToStep(call, b.createdAt)
      );
      const thinking = b.aiContext?.thinking
        ? [
            {
              content: b.aiContext.thinking,
              type: "reasoning" as const,
              timestamp: b.updatedAt ?? b.createdAt,
              complete: true,
            },
          ]
        : undefined;

      return {
        id: b.id,
        role: b.role,
        content: b.text,
        status: b.status === "streaming" ? "streaming" : b.status === "error" ? "error" : "done",
        modelId: b.aiContext?.model,
        requestId: b.aiContext?.requestId,
        confidence: b.aiContext?.confidence,
        provenance: b.aiContext?.provenance,
        executionSteps,
        thinking,
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

  const streamContextRef = React.useRef<{
    messageId: string;
    draftContent: string;
    aiContext: AIContext;
  } | null>(null);

  const handleStreamContentUpdate = React.useCallback(
    (content: string) => {
      const ctx = streamContextRef.current;
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
      if (streamContextRef.current && facade) {
        const { messageId, aiContext } = streamContextRef.current;
        const finalizedContext: AIContext = {
          ...aiContext,
          model,
          requestId: result.requestId,
          agentId: result.agentId,
          confidence: result.confidence,
          provenance: result.provenance,
        };

        facade.finalizeMessage(messageId, finalizedContext);

        setAttachments([]);
      }
      streamContextRef.current = null;
    },
    [facade, setAttachments, model]
  );

  const handleStreamError = React.useCallback(
    (error: { message: string; code?: string; requestId?: string }) => {
      const ctx = streamContextRef.current;
      if (!ctx || !facade) {
        streamContextRef.current = null;
        abortReasonRef.current = null;
        return;
      }

      const errorContent = resolveStreamErrorContent(error, abortReasonRef.current, t);
      const nextContext = mergeErrorContext(ctx.aiContext, error.requestId);

      facade.updateMessage({
        messageId: ctx.messageId,
        content: errorContent,
        status: "error",
        aiContext: nextContext,
      });

      setInput(ctx.draftContent);
      setAttachments((prev) =>
        prev.map((att) => (att.status === "sending" ? { ...att, status: "ready" } : att))
      );

      streamContextRef.current = null;
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
    confirm,
  } = useAIClient();

  React.useEffect(() => {
    if (!streamContextRef.current) {
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

  const [pendingApproval, setPendingApproval] = React.useState<PendingApproval | null>(null);
  const [approvalBusy, setApprovalBusy] = React.useState(false);
  const [approvalError, setApprovalError] = React.useState<string | null>(null);

  const updateStreamingAiContext = React.useCallback(
    (updater: (current: AIContext) => AIContext) => {
      const ctx = streamContextRef.current;
      if (!ctx || !facade) {
        return;
      }

      const nextContext = updater(ctx.aiContext);
      ctx.aiContext = nextContext;
      facade.updateMessage({
        messageId: ctx.messageId,
        aiContext: nextContext,
      });
    },
    [facade]
  );

  const updateToolCalls = React.useCallback(
    (updater: (calls: ToolCallRecord[]) => ToolCallRecord[]) => {
      updateStreamingAiContext((current) => {
        const nextCalls = updater([...(current.toolCalls ?? [])]);
        return {
          ...current,
          toolCalls: nextCalls,
        };
      });
    },
    [updateStreamingAiContext]
  );

  const createToolCallId = React.useCallback((prefix: string) => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }, []);

  const handleAgentEvent = React.useCallback(
    (event: AgentStreamEvent) => {
      switch (event.type) {
        case "thinking": {
          const content =
            typeof event.data === "object" && event.data && "content" in event.data
              ? (event.data as { content?: unknown }).content
              : undefined;
          if (typeof content === "string" && content.trim()) {
            updateStreamingAiContext((current) => ({
              ...current,
              thinking: current.thinking ? `${current.thinking}\n\n${content}` : content,
            }));
          }
          break;
        }
        case "confirmation:required": {
          const confirmationId = event.data.confirmation_id ?? createToolCallId("confirm");
          setPendingApproval({
            confirmationId,
            toolName: event.data.toolName,
            description: event.data.description,
            arguments: event.data.arguments,
            risk: event.data.risk,
            reason: event.data.reason,
            riskTags: event.data.riskTags,
          });
          setApprovalError(null);
          updateToolCalls((calls) => {
            calls.push({
              id: confirmationId,
              name: event.data.toolName,
              arguments: event.data.arguments,
              status: "pending",
              startTime: event.timestamp,
              confirmationId,
            });
            return calls;
          });
          break;
        }
        case "confirmation:received": {
          setPendingApproval(null);
          setApprovalBusy(false);
          if (!event.data.confirmed) {
            updateToolCalls((calls) => {
              const index = findLastIndex(
                calls,
                (call) =>
                  call.status === "pending" &&
                  (event.data.confirmation_id
                    ? call.confirmationId === event.data.confirmation_id
                    : true)
              );
              if (index >= 0) {
                calls[index] = {
                  ...calls[index],
                  status: "error",
                  endTime: event.timestamp,
                  durationMs: event.timestamp - (calls[index].startTime ?? event.timestamp),
                  error: "User denied the operation",
                  result: {
                    success: false,
                    content: [],
                    error: { code: "PERMISSION_DENIED", message: "User denied the operation" },
                  },
                };
              }
              return calls;
            });
          }
          break;
        }
        case "tool:calling": {
          updateToolCalls((calls) => {
            const index = findLastIndex(
              calls,
              (call) => call.name === event.data.toolName && call.status === "pending"
            );
            if (index >= 0) {
              calls[index] = {
                ...calls[index],
                status: "executing",
                startTime: calls[index].startTime ?? event.timestamp,
              };
              return calls;
            }

            calls.push({
              id: createToolCallId("tool"),
              name: event.data.toolName,
              arguments: event.data.arguments,
              status: "executing",
              startTime: event.timestamp,
            });
            return calls;
          });
          break;
        }
        case "tool:result": {
          updateToolCalls((calls) => {
            const index = findLastIndex(
              calls,
              (call) => call.name === event.data.toolName && call.status !== "success"
            );
            if (index >= 0) {
              const durationMs = event.timestamp - (calls[index].startTime ?? event.timestamp);
              calls[index] = {
                ...calls[index],
                status: event.data.result.success ? "success" : "error",
                result: event.data.result,
                endTime: event.timestamp,
                durationMs,
              };
            }
            return calls;
          });
          break;
        }
        default:
          break;
      }
    },
    [createToolCallId, updateStreamingAiContext, updateToolCalls]
  );

  const resetState = React.useCallback(() => {
    abortReasonRef.current = null;
    streamContextRef.current = null;
    setPendingApproval(null);
    setApprovalBusy(false);
    setApprovalError(null);
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
      systemPrompt: string | null,
      mode: "chat" | "agent",
      onEvent?: (event: AgentStreamEvent) => void
    ) => {
      streamContextRef.current = {
        messageId,
        draftContent,
        aiContext: { model },
      };

      await stream(
        {
          prompt: content,
          model,
          history,
          attachments: attachmentPayload,
          workflow: selectedWorkflow as "tdd" | "refactoring" | "debugging" | "research" | "none",
          systemPrompt: systemPrompt ?? undefined,
          mode,
        },
        { onEvent }
      );
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

    const agentModeEnabled =
      selectedCapability.supports.tools &&
      selectedCapability.provider !== "gemini" &&
      attachmentPayload.length === 0;
    const streamMode = agentModeEnabled ? "agent" : "chat";
    const eventHandler = streamMode === "agent" ? handleAgentEvent : undefined;

    // 6. Execute
    await runStreamExecution(
      content,
      previousHistory,
      messageId,
      attachmentPayload,
      draftContent,
      workflow,
      resolvedSystemPrompt ?? null,
      streamMode,
      eventHandler
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
    selectedCapability.provider,
    selectedCapability.supports.tools,
    handleAgentEvent,
  ]);

  const handleRunBackground = React.useCallback(async () => {
    const rawContent = input.trim();
    const isBusy = attachments.some(
      (att) => att.status === "processing" || att.status === "sending" || att.status === "error"
    );

    if (!rawContent || isLoading || isStreaming || isBusy || !facade) {
      return;
    }

    if (attachments.length > 0) {
      setAttachmentError(t("taskAttachmentsUnsupported"));
      return;
    }

    const { contextBlock } = prepareContext();
    const content = composePromptWithContext(rawContent, contextBlock);
    const draftContent = rawContent;

    setInput("");
    setAttachmentError(null);

    addMessage("user", content);

    const previousHistory = rawMessages.map((b) => ({
      role: b.role as "user" | "assistant",
      content: b.text,
    }));

    const taskLabel = buildTaskLabel(rawContent);
    try {
      await backgroundTasks.enqueueTask({
        prompt: content,
        model,
        history: previousHistory,
        systemPrompt: workflowPrompt ?? undefined,
      });
      addMessage("assistant", t("taskQueuedMessage", { task: taskLabel }));
    } catch (error) {
      const message = error instanceof Error ? error.message : t("taskEnqueueFailed");
      addMessage("assistant", t("taskEnqueueFailedMessage", { message }));
      setInput(draftContent);
    }
  }, [
    input,
    isLoading,
    isStreaming,
    attachments,
    facade,
    prepareContext,
    addMessage,
    rawMessages,
    backgroundTasks,
    model,
    workflowPrompt,
    setAttachmentError,
    t,
  ]);

  const handleAbort = React.useCallback(() => {
    abortReasonRef.current = "user";
    abort();
    setPendingApproval(null);
    setApprovalBusy(false);
    setApprovalError(null);
    handleStreamError({ message: t("canceledByUser"), code: "canceled" });
  }, [abort, handleStreamError, t]);

  const handleApprovalDecision = React.useCallback(
    async (confirmed: boolean) => {
      if (!pendingApproval || approvalBusy) {
        return;
      }

      setApprovalBusy(true);
      setApprovalError(null);
      try {
        await confirm({
          confirmationId: pendingApproval.confirmationId,
          confirmed,
        });
        setPendingApproval(null);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Approval failed";
        setApprovalError(message);
      } finally {
        setApprovalBusy(false);
      }
    },
    [pendingApproval, approvalBusy, confirm]
  );

  const handleApprove = React.useCallback(
    () => handleApprovalDecision(true),
    [handleApprovalDecision]
  );

  const handleReject = React.useCallback(
    () => handleApprovalDecision(false),
    [handleApprovalDecision]
  );

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

  const handleUpdateTask = React.useCallback(
    (taskTitle: string, summary?: string) => {
      const prompt = summary
        ? t("taskUpdatePrompt", { task: taskTitle, summary })
        : t("taskUpdatePromptFallback", { task: taskTitle });
      setInput(prompt);
      inputRef.current?.focus();
    },
    [t]
  );

  const handleUpdateWalkthrough = React.useCallback(
    (taskTitle: string, summary?: string) => {
      const prompt = summary
        ? t("walkthroughUpdatePrompt", { task: taskTitle, summary })
        : t("walkthroughUpdatePromptFallback", { task: taskTitle });
      setInput(prompt);
      inputRef.current?.focus();
    },
    [t]
  );

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
    pendingApproval,
    approvalBusy,
    approvalError,

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
    backgroundTasks,

    // Actions
    handleSend,
    handleRunBackground,
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
    handleApprove,
    handleReject,
    handleUpdateTask,
    handleUpdateWalkthrough,
    exportHistory,
  };
}

function buildTaskLabel(prompt: string): string {
  const trimmed = prompt.trim().replace(/\s+/g, " ");
  if (!trimmed) {
    return "task";
  }
  if (trimmed.length <= 48) {
    return trimmed;
  }
  return `${trimmed.slice(0, 45)}...`;
}
