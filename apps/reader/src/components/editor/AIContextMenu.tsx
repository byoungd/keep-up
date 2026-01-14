import { useLfccEditorContext } from "@/components/lfcc/LfccEditorContext";
import type { AIMenuState } from "@/lib/editor/aiMenuPlugin";
import { useLfccDebugStore } from "@/lib/lfcc/debugStore";
import { createEditorSchemaValidator } from "@/lib/lfcc/editorSchemaValidator";
import { useCompletion } from "@ai-sdk/react";
import { autoUpdate, flip, offset, shift, useFloating, useInteractions } from "@floating-ui/react";
import {
  DEFAULT_POLICY_MANIFEST,
  type EditorSchemaValidator,
  computeContextHash,
  computeOptimisticHash,
  gateway,
} from "@keepup/core";
import {
  type BridgeController,
  type DocumentFacade,
  type LoroRuntime,
  type SpanRange,
  buildSelectionAnnotationId,
  buildSelectionSpanId,
  createDocumentFacade,
  createLoroAIGateway,
  createLoroDocumentProvider,
  createLoroGatewayRetryProviders,
  pmSelectionToSpanList,
} from "@keepup/lfcc-bridge";
import { cn } from "@keepup/shared/utils";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  FileJson,
  Languages,
  RefreshCw,
  Sparkles,
  Wand2,
} from "lucide-react";
import type { EditorView } from "prosemirror-view";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { StructuralDiff } from "./StructuralDiff";

type AIContextMenuProps = {
  state: AIMenuState | null;
  onClose: () => void;
  bridge: BridgeController | null;
};

type Mode = "menu" | "streaming" | "result" | "conflict" | "structural_preview";

interface StructuralPreviewData {
  originalBlocks: ReadonlyArray<unknown>;
  previewBlocks: ReadonlyArray<unknown>;
}

type ConflictInfo = {
  message: string;
  currentHash?: string;
  currentFrontier?: unknown;
  requestId?: string;
  clientRequestId?: string;
};

type AIEnvelopePrecondition = {
  span_id: string;
  if_match_context_hash: string;
};

type SelectionAnchor = {
  block_id: string;
  start_offset: number;
  end_offset: number;
  start_anchor: string;
  end_anchor: string;
  start_bias: "before" | "after";
  end_bias: "before" | "after";
};

type AIEnvelopePayload = {
  doc_frontier: string;
  preconditions: AIEnvelopePrecondition[];
  selection_anchors: SelectionAnchor[];
  request_id: string;
  client_request_id?: string;
  agent_id?: string;
};

type EnvelopeBuildResult = { ok: true; envelope: AIEnvelopePayload } | { ok: false; error: string };

type GatewayAction = "replace" | "insert_below";

type GatewayTargetBuildResult =
  | {
      ok: true;
      targetSpans: gateway.TargetSpan[];
      originalTexts: Map<string, string>;
    }
  | { ok: false; error: string };

type GatewayRequestBuildResult =
  | { ok: true; request: gateway.AIGatewayRequest }
  | { ok: false; error: string };

const VERIFICATION_ERROR = "Document state cannot be verified";

type SelectionSpanResult = { ok: true; spans: SpanRange[] } | { ok: false; error: string };

type BuiltTargetSpan = {
  target: gateway.TargetSpan;
  spanId: string;
  spanText: string;
};

function normalizeAnchor(anchor: string): string {
  return anchor.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function serializeFrontier(frontier: unknown): string | null {
  try {
    return JSON.stringify(frontier);
  } catch {
    return null;
  }
}

function buildSelectionAnchors(
  view: EditorView,
  runtime: LoroRuntime
): { ok: true; anchors: SelectionAnchor[] } | { ok: false; error: string } {
  const mapping = pmSelectionToSpanList(view.state.selection, view.state, runtime);
  if (!mapping.verified || mapping.spanList.length === 0) {
    return { ok: false, error: VERIFICATION_ERROR };
  }

  const anchors = mapping.spanList.flatMap((span) => {
    if (!span.startAnchor || !span.endAnchor) {
      return [];
    }

    return [
      {
        block_id: span.blockId,
        start_offset: span.start,
        end_offset: span.end,
        start_anchor: normalizeAnchor(span.startAnchor.anchor),
        end_anchor: normalizeAnchor(span.endAnchor.anchor),
        start_bias: span.startAnchor.bias,
        end_bias: span.endAnchor.bias,
      },
    ];
  });

  if (anchors.length === 0) {
    return { ok: false, error: VERIFICATION_ERROR };
  }

  return { ok: true, anchors };
}

function getSelectionSpans(
  view: EditorView,
  runtime: LoroRuntime,
  action: GatewayAction
): SelectionSpanResult {
  const mapping = pmSelectionToSpanList(view.state.selection, view.state, runtime, {
    strict: false,
  });
  if (!mapping.verified || mapping.spanList.length === 0) {
    return { ok: false, error: VERIFICATION_ERROR };
  }
  if (action !== "insert_below") {
    return { ok: true, spans: mapping.spanList };
  }
  const lastSpan = mapping.spanList[mapping.spanList.length - 1];
  if (!lastSpan) {
    return { ok: false, error: VERIFICATION_ERROR };
  }
  return {
    ok: true,
    spans: [{ ...lastSpan, start: lastSpan.end, end: lastSpan.end }],
  };
}

async function buildTargetSpan(
  facade: DocumentFacade,
  span: SpanRange,
  requestId: string,
  annotationId: string
): Promise<BuiltTargetSpan | null> {
  const block = facade.getBlock(span.blockId);
  if (!block) {
    return null;
  }
  const blockText = block.text ?? "";
  if (span.start < 0 || span.end < span.start || span.end > blockText.length) {
    return null;
  }
  const spanText = blockText.slice(span.start, span.end);
  const spanId = buildSelectionSpanId(requestId, span.blockId, span.start, span.end);
  const { hash } = await computeContextHash({
    span_id: spanId,
    block_id: span.blockId,
    text: spanText,
  });

  return {
    spanId,
    spanText,
    target: {
      annotation_id: annotationId,
      span_id: spanId,
      if_match_context_hash: hash,
    },
  };
}

async function buildTargetSpans(
  facade: DocumentFacade,
  spans: SpanRange[],
  requestId: string
): Promise<GatewayTargetBuildResult> {
  const annotationId = buildSelectionAnnotationId(requestId);
  const targetSpans: gateway.TargetSpan[] = [];
  const originalTexts = new Map<string, string>();

  for (const span of spans) {
    const built = await buildTargetSpan(facade, span, requestId, annotationId);
    if (!built) {
      return { ok: false, error: VERIFICATION_ERROR };
    }
    targetSpans.push(built.target);
    originalTexts.set(built.spanId, built.spanText);
  }

  if (targetSpans.length === 0) {
    return { ok: false, error: VERIFICATION_ERROR };
  }

  return { ok: true, targetSpans, originalTexts };
}

function buildGatewayRequest(params: {
  docId: string;
  docFrontierTag: string;
  targetSpans: gateway.TargetSpan[];
  instructions: string;
  payload: string;
  requestId: string;
  agentId: string;
}): GatewayRequestBuildResult {
  try {
    const request = gateway.createGatewayRequest({
      docId: params.docId,
      docFrontierTag: params.docFrontierTag,
      targetSpans: params.targetSpans,
      instructions: params.instructions,
      format: "html",
      payload: params.payload,
      requestId: params.requestId,
      clientRequestId: params.requestId,
      agentId: params.agentId,
      policyContext: { policy_id: DEFAULT_POLICY_MANIFEST.policy_id },
    });
    return { ok: true, request };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to build gateway request";
    return { ok: false, error: message };
  }
}

function parseConflictError(err: Error): ConflictInfo | null {
  const raw = err.message;
  try {
    const parsed = JSON.parse(raw) as {
      error?: {
        code?: string;
        message?: string;
        current_hash?: unknown;
        current_frontier?: unknown;
        request_id?: unknown;
        client_request_id?: unknown;
      };
    };
    if (parsed?.error?.code === "CONFLICT") {
      return {
        message: parsed.error.message ?? "Document changed. Refresh and retry.",
        currentHash:
          typeof parsed.error.current_hash === "string" ? parsed.error.current_hash : undefined,
        currentFrontier: parsed.error.current_frontier,
        requestId:
          typeof parsed.error.request_id === "string" ? parsed.error.request_id : undefined,
        clientRequestId:
          typeof parsed.error.client_request_id === "string"
            ? parsed.error.client_request_id
            : undefined,
      };
    }
  } catch {
    // Not JSON; fall through.
  }

  if (raw.includes("CONFLICT") || raw.includes("409")) {
    return { message: "Document changed. Refresh and retry." };
  }

  return null;
}

function toGatewayConflictInfo(conflict: gateway.AIGateway409Response): ConflictInfo {
  const hashFailure = conflict.failed_preconditions.find(
    (failure) => typeof failure.actual_hash === "string"
  );
  return {
    message: conflict.message ?? "Document changed. Refresh and retry.",
    currentHash: hashFailure?.actual_hash,
    currentFrontier: conflict.server_doc_frontier ?? conflict.server_frontier_tag,
    requestId: conflict.request_id,
    clientRequestId: conflict.client_request_id,
  };
}

/**
 * AI-001: Validate AI output through dry-run pipeline before insertion
 * Returns sanitized text if valid, null if rejected
 */
async function validateAIOutput(
  text: string,
  schemaValidator?: EditorSchemaValidator
): Promise<{ ok: boolean; sanitized?: string; error?: string }> {
  try {
    const pipelineConfig = schemaValidator
      ? { ...gateway.DEFAULT_PIPELINE_CONFIG, schemaValidator }
      : gateway.DEFAULT_PIPELINE_CONFIG;
    const result = await gateway.executePipeline({ html: text }, pipelineConfig);
    if (!result.ok) {
      console.warn("[AI Pipeline] Validation failed:", result.reason);
      return { ok: false, error: result.reason ?? "AI output rejected by security pipeline" };
    }
    // Pipeline passed - use original text (canonRoot is for internal use)
    return { ok: true, sanitized: text };
  } catch (err) {
    console.error("[AI Pipeline] Error during validation:", err);
    return { ok: false, error: "Pipeline validation error" };
  }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: AI menu has inherently complex mode handling
export function AIContextMenu({ state, onClose, bridge }: AIContextMenuProps) {
  const lfcc = useLfccEditorContext();
  const setContextHash = useLfccDebugStore((store) => store.setContextHash);
  const [mode, setMode] = useState<Mode>("menu");
  const [customPrompt, setCustomPrompt] = useState("");
  const [conflictInfo, setConflictInfo] = useState<ConflictInfo | null>(null);
  const [structuralPreview, setStructuralPreview] = useState<StructuralPreviewData | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const lastPromptRef = useRef<string | null>(null);
  const lastRequestIdRef = useRef<string | null>(null);
  const lastGatewayRequestRef = useRef<gateway.AIGatewayRequest | null>(null);
  const lastGatewayConflictRef = useRef<gateway.AIGateway409Response | null>(null);
  const lastGatewayOriginalTextsRef = useRef<Map<string, string>>(new Map());
  const gatewayFacade = useMemo(
    () => (lfcc?.runtime ? createDocumentFacade(lfcc.runtime) : null),
    [lfcc?.runtime]
  );
  const documentProvider = useMemo(
    () =>
      gatewayFacade && lfcc?.runtime
        ? createLoroDocumentProvider(gatewayFacade, lfcc.runtime)
        : null,
    [gatewayFacade, lfcc?.runtime]
  );
  const gatewayInstance = useMemo(
    () =>
      gatewayFacade && lfcc?.runtime ? createLoroAIGateway(gatewayFacade, lfcc.runtime) : null,
    [gatewayFacade, lfcc?.runtime]
  );
  const retryProviders = useMemo(
    () =>
      gatewayFacade && lfcc?.runtime
        ? createLoroGatewayRetryProviders(gatewayFacade, lfcc.runtime)
        : null,
    [gatewayFacade, lfcc?.runtime]
  );
  const schemaValidator = useMemo(
    () => (lfcc?.view ? createEditorSchemaValidator(lfcc.view.state.schema) : undefined),
    [lfcc?.view]
  );

  const { completion, complete, isLoading, error, setCompletion } = useCompletion({
    api: "/api/ai/stream",
    onFinish: () => {
      if (mode !== "conflict" && mode !== "structural_preview") {
        setMode("result");
      }
    },
    onError: (err) => {
      const conflict = parseConflictError(err);
      if (conflict) {
        lastGatewayConflictRef.current = null;
        lastGatewayRequestRef.current = null;
        setConflictInfo(conflict);
        setMode("conflict");
        return;
      }
      setMode("result");
    },
  });

  const showGatewayError = (message: string) => {
    setCompletion(message);
    setMode("result");
  };

  const resolveAgentId = () =>
    lfcc?.runtime?.peerId ? `ai-menu:${lfcc.runtime.peerId}` : "ai-menu:local";

  const processGatewayResult = async (
    result: gateway.AIGatewayResult,
    request: gateway.AIGatewayRequest,
    agentId: string,
    requestIdFallback: string
  ) => {
    if (!bridge) {
      showGatewayError("AI gateway is not available");
      return;
    }

    if (gateway.isGateway409(result)) {
      lastGatewayConflictRef.current = result;
      setConflictInfo(toGatewayConflictInfo(result));
      setMode("conflict");
      return;
    }

    if (gateway.isGatewayError(result)) {
      showGatewayError(result.message ?? "AI gateway rejected the request");
      return;
    }

    if (!result.apply_plan) {
      showGatewayError("AI gateway did not return an apply plan");
      return;
    }

    const applyResult = await bridge.applyAIGatewayPlan({
      plan: result.apply_plan,
      metadata: {
        source: "ai-context-menu",
        requestId: request.request_id ?? requestIdFallback,
        agentId,
        intentId: request.intent_id,
        aiMeta: request.ai_meta,
      },
    });

    if (!applyResult.success) {
      showGatewayError(applyResult.error ?? "Failed to apply AI result");
      return;
    }

    setConflictInfo(null);
    setMode("menu");
    onClose();
  };

  const buildEnvelope = useCallback(async (): Promise<EnvelopeBuildResult> => {
    if (!lfcc?.runtime || !lfcc.view) {
      return { ok: false, error: VERIFICATION_ERROR };
    }

    const selectionText = state?.selectionText ?? "";
    if (!selectionText.trim()) {
      return { ok: false, error: VERIFICATION_ERROR };
    }

    const docFrontier = serializeFrontier(lfcc.runtime.frontiers);
    if (!docFrontier) {
      return { ok: false, error: VERIFICATION_ERROR };
    }

    const anchorsResult = buildSelectionAnchors(lfcc.view, lfcc.runtime);
    if (!anchorsResult.ok) {
      return { ok: false, error: anchorsResult.error };
    }

    const contextHash = await computeOptimisticHash(selectionText);
    setContextHash(contextHash);
    const requestId = crypto.randomUUID();
    lastRequestIdRef.current = requestId;
    const agentId = lfcc?.runtime?.peerId ? `ai-menu:${lfcc.runtime.peerId}` : "ai-menu:local";

    return {
      ok: true,
      envelope: {
        doc_frontier: docFrontier,
        preconditions: [
          {
            span_id: `selection:${requestId}`,
            if_match_context_hash: contextHash,
          },
        ],
        selection_anchors: anchorsResult.anchors,
        request_id: requestId,
        client_request_id: requestId,
        agent_id: agentId,
      },
    };
  }, [lfcc, setContextHash, state?.selectionText]);

  const buildGatewayTargets = async (
    requestId: string,
    action: GatewayAction
  ): Promise<GatewayTargetBuildResult> => {
    if (!lfcc?.runtime || !lfcc.view || !gatewayFacade) {
      return { ok: false, error: VERIFICATION_ERROR };
    }

    const selectionResult = getSelectionSpans(lfcc.view, lfcc.runtime, action);
    if (!selectionResult.ok) {
      return selectionResult;
    }

    return buildTargetSpans(gatewayFacade, selectionResult.spans, requestId);
  };

  const applyGatewayOutput = async (action: GatewayAction, text: string) => {
    if (!gatewayFacade || !gatewayInstance || !documentProvider || !bridge) {
      showGatewayError("AI gateway is not available");
      return;
    }

    const requestId = lastRequestIdRef.current ?? crypto.randomUUID();
    lastRequestIdRef.current = requestId;
    const agentId = resolveAgentId();
    const targetsResult = await buildGatewayTargets(requestId, action);
    if (!targetsResult.ok) {
      showGatewayError(targetsResult.error);
      return;
    }

    const instructions = lastPromptRef.current ?? "AI edit";
    const requestResult = buildGatewayRequest({
      docId: gatewayFacade.docId,
      docFrontierTag: documentProvider.getFrontierTag(),
      targetSpans: targetsResult.targetSpans,
      instructions,
      payload: text,
      requestId,
      agentId,
    });
    if (!requestResult.ok) {
      showGatewayError(requestResult.error);
      return;
    }

    const request = requestResult.request;
    lastGatewayRequestRef.current = request;
    lastGatewayOriginalTextsRef.current = targetsResult.originalTexts;
    lastGatewayConflictRef.current = null;

    const result = await gatewayInstance.processRequest(request);
    await processGatewayResult(result, request, agentId, requestId);
  };

  const handleAction = useCallback(
    async (prompt: string) => {
      if (!state) {
        return;
      }

      setConflictInfo(null);
      lastGatewayConflictRef.current = null;
      lastGatewayRequestRef.current = null;
      lastGatewayOriginalTextsRef.current = new Map();
      lastPromptRef.current = prompt;
      const envelopeResult = await buildEnvelope();
      if (!envelopeResult.ok) {
        setCompletion(envelopeResult.error);
        setMode("result");
        return;
      }

      try {
        complete(prompt, {
          body: {
            prompt,
            context: state.selectionText,
            doc_frontier: envelopeResult.envelope.doc_frontier,
            preconditions: envelopeResult.envelope.preconditions,
            selection_anchors: envelopeResult.envelope.selection_anchors,
            request_id: envelopeResult.envelope.request_id,
            client_request_id: envelopeResult.envelope.client_request_id,
            agent_id: envelopeResult.envelope.agent_id,
            policy_context: { policy_id: DEFAULT_POLICY_MANIFEST.policy_id },
          },
        });
      } catch (e) {
        console.error(e);
      }
    },
    [buildEnvelope, complete, setCompletion, state]
  );

  // Auto-execute if prompt is provided in state (e.g. from Slash Command)
  useEffect(() => {
    if (state?.isOpen && state.prompt && mode === "menu" && !isLoading) {
      handleAction(state.prompt);
    }
  }, [handleAction, isLoading, mode, state?.isOpen, state?.prompt]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    if (state?.isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [state?.isOpen, onClose]);

  // Reset state when menu opens/closes
  useEffect(() => {
    if (!state) {
      setMode("menu");
      setCustomPrompt("");
      setCompletion("");
      setConflictInfo(null);
      setStructuralPreview(null);
    }
  }, [state, setCompletion]);

  // Watch loading state to update mode
  useEffect(() => {
    if (isLoading) {
      setMode("streaming");
    }
  }, [isLoading]);

  const retryGatewayRequest = async (
    request: gateway.AIGatewayRequest,
    conflict: gateway.AIGateway409Response
  ) => {
    if (!retryProviders || !gatewayInstance || !bridge) {
      showGatewayError("AI gateway is not available");
      return;
    }

    setCompletion("");
    setConflictInfo(null);
    const retryResult = await gateway.executeRetryLoop(
      request,
      conflict,
      gateway.DEFAULT_RETRY_POLICY,
      retryProviders.rebaseProvider,
      retryProviders.relocationProvider,
      lastGatewayOriginalTextsRef.current
    );

    if (!retryResult.success) {
      showGatewayError("AI retry failed after conflict");
      return;
    }

    lastGatewayRequestRef.current = retryResult.request;
    lastGatewayConflictRef.current = null;
    const result = await gatewayInstance.processRequest(retryResult.request);
    await processGatewayResult(
      result,
      retryResult.request,
      resolveAgentId(),
      request.request_id ?? "unknown"
    );
  };

  const retryPromptFallback = async () => {
    const prompt = lastPromptRef.current;
    if (!prompt) {
      setMode("menu");
      return;
    }
    setCompletion("");
    setConflictInfo(null);
    await handleAction(prompt);
  };

  const handleConflictRetry = async () => {
    const request = lastGatewayRequestRef.current;
    const conflict = lastGatewayConflictRef.current;
    if (request && conflict) {
      await retryGatewayRequest(request, conflict);
      return;
    }
    await retryPromptFallback();
  };

  const handleTranslate = async () => {
    setMode("streaming");
    setCompletion("");
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: state?.selectionText, targetLang: "zh" }),
      });
      const data = await res.json();
      if (data.success && data.text) {
        setCompletion(data.text);
        setMode("result");
      } else {
        setCompletion(data.error || "Translation failed");
        setMode("result");
      }
    } catch {
      setCompletion("Translation request failed");
      setMode("result");
    }
  };

  const handleForceConflict = () => {
    setConflictInfo({
      message: "Document changed. Refresh and retry.",
    });
    setMode("conflict");
  };

  const handleRefactorPreview = async () => {
    if (!lfcc?.view) {
      return;
    }
    const view = lfcc.view;

    // Import diff logic
    const { computeStructuralDiff } = await import("@/lib/editor/structuralDiff");

    // Simulate AI result (demo)
    const { selection, doc } = view.state;
    const text = doc.textBetween(selection.from, selection.to, "\n");
    if (!text) {
      return;
    }

    // Demo: Simulate AI converting text to a list structure
    const newContentHTML = `<ul>
      <li><strong>Refactored:</strong> ${text.substring(0, 20)}...</li>
      <li>Expanded point 1</li>
      <li>Expanded point 2</li>
    </ul>`;

    const refactoredDoc = computeStructuralDiff(view.state.schema, doc, newContentHTML);

    // Convert to blocks for preview
    // We assume the preview expects an array of block nodes in JSON format
    const previewBlocks: unknown[] = [];
    for (let index = 0; index < refactoredDoc.childCount; index += 1) {
      previewBlocks.push(refactoredDoc.child(index).toJSON());
    }

    // For original, use current selection or doc
    // Use the *actual* nodes in selection for accurate 'original' preview
    const originalBlocks: unknown[] = [];
    doc.nodesBetween(selection.from, selection.to, (node) => {
      if (node.isBlock) {
        originalBlocks.push(node.toJSON());
      }
      return false;
    });

    setStructuralPreview({
      originalBlocks,
      previewBlocks,
    });
    setMode("structural_preview");
  };

  const menuActions = [
    {
      label: "Improve Writing",
      icon: Sparkles,
      prompt: "Improve clarity and tone",
      isTranslate: false,
    },
    { label: "Fix Grammar", icon: Wand2, prompt: "Fix grammar and spelling", isTranslate: false },
    { label: "Shorten", icon: ArrowRight, prompt: "Make it more concise", isTranslate: false },
    { label: "Translate to Chinese", icon: Languages, prompt: "", isTranslate: true },
  ];

  // Float positioning
  const { refs, floatingStyles } = useFloating({
    open: state?.isOpen,
    strategy: "fixed",
    placement: "bottom-start",
    middleware: [offset(10), flip({ padding: 10 }), shift({ padding: 10 })],
    whileElementsMounted: autoUpdate,
  });

  const { getFloatingProps } = useInteractions([]);
  const setFloatingRef = useCallback(
    (node: HTMLDivElement | null) => {
      refs.setFloating(node);
      containerRef.current = node;
    },
    [refs]
  );

  // Sync virtual reference
  const isOpen = state?.isOpen;
  const x = state?.x;
  const y = state?.y;

  useEffect(() => {
    if (isOpen && x !== undefined && y !== undefined) {
      refs.setReference({
        getBoundingClientRect() {
          return {
            width: 0,
            height: 0,
            x: x,
            y: y,
            top: y,
            left: x,
            right: x,
            bottom: y,
          };
        },
      });
    }
  }, [isOpen, x, y, refs]);

  if (!state || !state.isOpen) {
    return null;
  }

  const style: React.CSSProperties = {
    ...floatingStyles,
    maxWidth: mode === "conflict" || mode === "structural_preview" ? "500px" : "340px",
  };

  return createPortal(
    <AnimatePresence>
      {state.isOpen && (
        <motion.div
          ref={setFloatingRef}
          style={style}
          {...getFloatingProps()}
          initial={{ opacity: 0, scale: 0.95, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -4 }}
          transition={{ type: "spring", damping: 20, stiffness: 300 }}
          className={cn(
            "flex flex-col overflow-hidden rounded-xl border p-1 shadow-2xl backdrop-blur-2xl z-popover",
            // Brighter/Cleaner background
            "bg-popover/90 border-border/60"
          )}
        >
          {/* Header / Actions */}
          <div className="flex items-center justify-between px-2 py-2 border-b border-border/10 mb-1">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-accent-indigo uppercase tracking-wider">
              <Sparkles className="w-3 h-3" />
              <span>
                AI Assistant {mode === "conflict" && "(Scalpel)"}{" "}
                {mode === "structural_preview" && "(Dry Run)"}
              </span>
            </div>
          </div>

          {mode === "menu" && (
            <div className="flex flex-col gap-0.5 p-1 min-w-[240px]">
              {/* Quick Actions Grid? or List? List is safer for labels. */}
              {menuActions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={() =>
                    action.isTranslate ? handleTranslate() : handleAction(action.prompt)
                  }
                  className={cn(
                    "flex items-center gap-2.5 px-2 py-2 text-sm rounded-lg transition-all text-left group",
                    "hover:bg-accent-indigo/5 text-muted-foreground hover:text-foreground"
                  )}
                >
                  <action.icon className="w-4 h-4 text-accent-indigo/70 group-hover:text-accent-indigo" />
                  <span className="font-medium">{action.label}</span>
                </button>
              ))}

              <div className="h-px bg-border/20 my-1 mx-1" />

              {/* Demo Actions (Subtle) */}
              <div className="grid grid-cols-2 gap-1">
                <button
                  type="button"
                  onClick={handleForceConflict}
                  className="flex items-center justify-center gap-1.5 px-2 py-1.5 text-[10px] font-medium rounded-md transition-colors text-warning/80 hover:bg-warning/10 hover:text-warning"
                >
                  <RefreshCw className="w-3 h-3" />
                  Conflict Demo
                </button>
                <button
                  type="button"
                  onClick={handleRefactorPreview}
                  className="flex items-center justify-center gap-1.5 px-2 py-1.5 text-[10px] font-medium rounded-md transition-colors text-success/80 hover:bg-success/10 hover:text-success"
                >
                  <FileJson className="w-3 h-3" />
                  Struct Demo
                </button>
              </div>

              <div className="h-px bg-border/20 my-1 mx-1" />

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (customPrompt.trim()) {
                    handleAction(customPrompt);
                  }
                }}
                className="flex items-center gap-2 px-2 py-1 bg-muted/30 rounded-lg mx-1 mb-1 border border-transparent focus-within:border-accent-indigo/30 focus-within:bg-surface-0 transition-all"
              >
                <input
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70 h-7"
                  placeholder="Ask AI regarding selection..."
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  aria-label="Custom AI prompt"
                />
                <button
                  type="submit"
                  disabled={!customPrompt.trim()}
                  className={cn(
                    "w-6 h-6 flex items-center justify-center rounded-md transition-all",
                    customPrompt.trim()
                      ? "bg-accent-indigo text-white shadow-sm"
                      : "text-muted-foreground/40"
                  )}
                  aria-label="Send prompt"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          )}

          {mode === "conflict" && (
            <div className="flex flex-col gap-3 p-3 w-[480px]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-warning">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Context conflict</span>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="text-muted-foreground hover:text-foreground transition-colors text-xs"
                >
                  Close
                </button>
              </div>
              <div className="text-xs text-muted-foreground bg-muted/30 border border-border/40 rounded-md px-2 py-1.5">
                {conflictInfo?.message ?? "Document changed. Refresh and retry."}
              </div>
              {(conflictInfo?.currentHash || conflictInfo?.clientRequestId) && (
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>
                    Hash:{" "}
                    {conflictInfo?.currentHash
                      ? `${conflictInfo.currentHash.slice(0, 12)}...`
                      : "n/a"}
                  </span>
                  <span>
                    Req:{" "}
                    {conflictInfo?.clientRequestId
                      ? `${conflictInfo.clientRequestId.slice(0, 8)}...`
                      : "n/a"}
                  </span>
                </div>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleConflictRetry}
                  disabled={!lastPromptRef.current || !state}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors",
                    lastPromptRef.current && state
                      ? "bg-foreground text-background hover:bg-foreground/90"
                      : "bg-muted text-muted-foreground cursor-not-allowed"
                  )}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Refresh & Retry
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConflictInfo(null);
                    setMode("menu");
                  }}
                  className="flex-1 px-3 py-1.5 text-xs font-medium rounded-md border border-border/50 hover:bg-muted/30"
                >
                  Back
                </button>
              </div>
            </div>
          )}

          {mode === "structural_preview" && structuralPreview && (
            <div className="p-2 w-[480px]">
              <StructuralDiff
                originalBlocks={structuralPreview.originalBlocks}
                previewBlocks={structuralPreview.previewBlocks}
              />
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => onClose()}
                  className="flex-1 bg-surface-2 hover:bg-surface-3 py-1.5 rounded text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => onClose()}
                  className="flex-1 bg-success hover:bg-success/90 text-success-foreground py-1.5 rounded text-xs"
                >
                  Apply Refactor
                </button>
              </div>
            </div>
          )}

          {(mode === "streaming" || mode === "result") && (
            <div className="flex flex-col w-[300px]">
              {/* AI-002: Enhanced streaming header with progress */}
              {mode === "streaming" && (
                <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/10 bg-accent-indigo/5">
                  <div className="flex items-center gap-2 text-[10px] text-accent-indigo font-medium">
                    <span className="inline-block w-2 h-2 bg-accent-indigo rounded-full animate-pulse" />
                    Generating...
                  </div>
                  <div className="text-[10px] text-muted-foreground tabular-nums">
                    {completion.length} chars
                  </div>
                </div>
              )}
              <div className="max-h-[220px] overflow-y-auto p-3 text-sm leading-relaxed text-foreground/90 bg-transparent">
                {completion || (error ? `Error: ${error.message}` : "")}
                {mode === "streaming" && (
                  <span className="inline-block w-1.5 h-4 align-middle ml-0.5 bg-accent-indigo animate-pulse rounded-sm" />
                )}
              </div>

              {mode === "result" && (
                <div className="flex gap-2 p-2 border-t border-border/10 bg-muted/20">
                  <button
                    type="button"
                    onClick={async () => {
                      const { ok, sanitized, error } = await validateAIOutput(
                        completion,
                        schemaValidator
                      );
                      if (!ok) {
                        console.error("AI content rejected:", error);
                        return;
                      }
                      await applyGatewayOutput("replace", sanitized ?? completion);
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md hover:translate-y-px transition-all bg-foreground text-background shadow-sm"
                  >
                    <Check className="w-3.5 h-3.5" /> Replace
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const { ok, sanitized, error } = await validateAIOutput(
                        completion,
                        schemaValidator
                      );
                      if (!ok) {
                        console.error("AI content rejected:", error);
                        return;
                      }
                      await applyGatewayOutput("insert_below", sanitized ?? completion);
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-foreground/80 text-xs font-medium rounded-md transition-colors bg-surface-0 border border-border/50 hover:bg-surface-2"
                  >
                    <ArrowRight className="w-3.5 h-3.5" /> Insert
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("menu")}
                    className="px-2 py-1.5 text-muted-foreground rounded-md hover:bg-muted/50"
                    aria-label="Back to menu"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
