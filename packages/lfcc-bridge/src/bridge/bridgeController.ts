import type { DirtyInfo, EditorSchemaValidator, RelocationPolicy } from "@ku0/core";
import { DEFAULT_POLICY_MANIFEST, gateway, observability } from "@ku0/core";
import type { Node as PMNode } from "prosemirror-model";
import type { EditorState, Transaction } from "prosemirror-state";
import { ReplaceAroundStep, ReplaceStep } from "prosemirror-transform";
import type { EditorView } from "prosemirror-view";

import { EditorAdapterPM } from "../adapters/editorAdapterPM";
import { validateAnchorIntegrity } from "../anchors/loroAnchors";
import {
  type ApplyPmTransactionResult,
  applyPmTransactionToLoro,
  BRIDGE_ORIGIN_META,
  LFCC_STRUCTURAL_META,
} from "../apply/applyPmTransaction";
import { createEmptyDoc, getRootBlocks, migrateToSchemaV2, nextBlockId } from "../crdt/crdtSchema";
import { assertDirtyInfoSuperset, formatDirtyInfoDiff } from "../dirty/assertDirtyInfo";
import {
  collectContentBlockOrder,
  computeDirtyInfo,
  computeDirtyInfoWithPolicy,
} from "../dirty/dirtyInfo";
import { createDivergenceDetector, type DivergenceDetector } from "../integrity/divergence";
import { assignMissingBlockIds } from "../pm/validateBlockIds";
import { projectLoroToPm } from "../projection/projection";
import type { LoroRuntime } from "../runtime/loroRuntime";
import {
  AI_GATEWAY_AGENT_ID,
  AI_GATEWAY_INTENT_ID,
  AI_GATEWAY_REQUEST_ID,
  AI_GATEWAY_SOURCE,
  AI_INTENT_META,
  buildAICommitOriginWithMeta,
  detectUnvalidatedAIWrite,
  hasGatewayMetadata,
  markAIGatewayTransaction,
} from "../security/aiGatewayWrite";
import { createRelocationSecurity, type RelocationSecurity } from "../security/relocation";
import { createSecurityValidator, type SecurityValidator } from "../security/validator";
import { pmSelectionToSpanList, spanListToPmRanges } from "../selection/selectionMapping";

const logger = observability.getLogger();

import {
  type AIGatewayPlanApplyOptions,
  type AIGatewayPlanApplyResult,
  buildApplyPlanTransaction,
  buildFragmentFromHtml,
  ensureApplyPlanInputs,
  type PayloadFragmentResult,
  resolveApplyOperations,
} from "./aiGatewayPlan";
import {
  buildStructuralOpsFromDirtyInfo,
  mergeAndOrderStructuralOps,
  type StructuralOp,
} from "./opOrdering";

// Re-export types for external consumers
export type { AIGatewayPlanApplyOptions, AIGatewayPlanApplyResult } from "./aiGatewayPlan";

function shouldAssignBlockIds(tr: Transaction): boolean {
  if (!tr.docChanged) {
    return false;
  }

  for (const step of tr.steps) {
    if (step instanceof ReplaceStep || step instanceof ReplaceAroundStep) {
      let hasBlock = false;
      const replaceStep = step as ReplaceStep | ReplaceAroundStep;
      replaceStep.slice.content.descendants((node: PMNode) => {
        if (node.isBlock && node.type.name !== "doc") {
          hasBlock = true;
          return false;
        }
        return true;
      });
      if (hasBlock) {
        return true;
      }
      continue;
    }

    return true;
  }

  return false;
}

export type StructuralOrderingEvent = {
  phase: "local_emit" | "remote_apply" | "replay";
  ordered: StructuralOp[];
  conflicts: Array<{ a: StructuralOp; b: StructuralOp }>;
  dropped: StructuralOp[];
  localPending: StructuralOp[];
  remotePending: StructuralOp[];
};

type SyncPerfStats = {
  localSyncs: number;
  localFastText: number;
  localTextBatch: number;
  localReorderOnly: number;
  localPartial: number;
  localFull: number;
  remoteSyncs: number;
  remotePatch: number;
  remoteMultiPatch: number;
  remoteFull: number;
  remoteEqSkip: number;
};

export type DivergenceResult = {
  diverged: boolean;
  editorChecksum: string;
  loroChecksum: string;
  reason?: string;
  analysis?: import("../integrity/divergence").DivergenceAnalysis;
};

export type BridgeControllerOptions = {
  runtime: LoroRuntime;
  adapter?: EditorAdapterPM;
  originTag?: string;
  onDirtyInfo?: (info: DirtyInfo) => void;
  onError?: (error: Error) => void;
  /** Callback when divergence is detected (for UI banners) */
  onDivergence?: (result: DivergenceResult) => void;
  /** Structured telemetry for structural op ordering */
  onStructuralOrdering?: (event: StructuralOrderingEvent) => void;
  /** Relocation policy (defaults to DEFAULT_POLICY_MANIFEST.relocation_policy) */
  relocationPolicy?: RelocationPolicy;
  /** Enable divergence detection (default: true) */
  enableDivergenceDetection?: boolean;
  /** Divergence check interval in ms (default: 5000) */
  divergenceCheckIntervalMs?: number;
  /** PERF-001: Debounce sync-from-Loro during rapid typing (0 = disabled, default: 50ms) */
  syncDebounceMs?: number;
  /**
   * LFCC §11.2: Schema validator for AI payload dry-run validation
   * When provided, AI payloads must pass schema validation in addition to sanitization
   */
  schemaValidator?: EditorSchemaValidator;
  /** Custom node views */
  nodeViews?: Record<
    string,
    (
      node: import("prosemirror-model").Node,
      view: EditorView,
      getPos: () => number | undefined,
      decorations: readonly import("prosemirror-view").Decoration[],
      innerDecorations: import("prosemirror-view").DecorationSource
    ) => import("prosemirror-view").NodeView
  >;
  /** Optional peer id used only to bootstrap an empty doc with deterministic ops */
  bootstrapPeerId?: number | bigint | `${number}`;
  /**
   * PERF-008: Callback when EditorState changes due to sync from Loro.
   * Use this for React integration instead of subscribing to Loro events directly.
   */
  onStateChange?: (state: EditorState) => void;
};

export class BridgeController {
  readonly runtime: LoroRuntime;
  readonly adapter: EditorAdapterPM;
  readonly originTag: string;
  public view: EditorView | null = null;
  private readonly onDirtyInfo?: (info: DirtyInfo) => void;
  private readonly onError?: (error: Error) => void;
  private readonly onDivergence?: (result: DivergenceResult) => void;
  private readonly onStructuralOrdering?: (event: StructuralOrderingEvent) => void;
  private readonly onStateChange?: (state: EditorState) => void;
  private readonly nodeViews?: BridgeControllerOptions["nodeViews"];
  private readonly bootstrapPeerId?: BridgeControllerOptions["bootstrapPeerId"];
  private perfStats: SyncPerfStats = {
    localSyncs: 0,
    localFastText: 0,
    localTextBatch: 0,
    localReorderOnly: 0,
    localPartial: 0,
    localFull: 0,
    remoteSyncs: 0,
    remotePatch: 0,
    remoteMultiPatch: 0,
    remoteFull: 0,
    remoteEqSkip: 0,
  };
  private perfLastLogMs = 0;

  // Security and integrity components
  private readonly securityValidator: SecurityValidator;
  private readonly relocationSecurity: RelocationSecurity;
  private readonly divergenceDetector: DivergenceDetector;
  private readonly enableDivergenceDetection: boolean;

  // PERF-001: Debounce support for sync-from-Loro
  private readonly syncDebounceMs: number;
  private syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private syncPending = false;
  private structuralOpClock = 0;
  private pendingLocalStructuralOps: StructuralOp[] = [];
  private pendingRemoteStructuralOps: StructuralOp[] = [];

  // PERF-006: Track last synced version to skip redundant syncs
  private lastSyncedVersion: string | null = null;

  // PERF-007: Cache BlockID -> { pos, size } for O(1) incremental updates
  private blockIdCache: Map<string, { pos: number; size: number }> = new Map();

  private getFrontierSignature(): string {
    const frontiers = this.runtime.doc.frontiers();
    if (!frontiers || frontiers.length === 0) {
      return "";
    }
    const entries = frontiers.map((frontier) => {
      const peer = String(frontier.peer);
      return `${peer}:${frontier.counter}`;
    });
    entries.sort();
    return entries.join("|");
  }

  constructor(options: BridgeControllerOptions) {
    this.runtime = options.runtime;
    this.adapter = options.adapter ?? new EditorAdapterPM();
    this.originTag = options.originTag ?? "lfcc-bridge";
    this.onDirtyInfo = options.onDirtyInfo;
    this.onError = options.onError;
    this.onDivergence = options.onDivergence;
    this.onStructuralOrdering = options.onStructuralOrdering;
    this.onStateChange = options.onStateChange;
    this.nodeViews = options.nodeViews;
    this.bootstrapPeerId = options.bootstrapPeerId;

    // Initialize security validator with optional schema validator (LFCC §11.2)
    this.securityValidator = createSecurityValidator({
      schemaValidator: options.schemaValidator,
    });

    // Initialize relocation security
    const relocationPolicy = options.relocationPolicy ?? DEFAULT_POLICY_MANIFEST.relocation_policy;
    this.relocationSecurity = createRelocationSecurity(relocationPolicy);

    // Initialize divergence detector
    this.enableDivergenceDetection = options.enableDivergenceDetection ?? true;
    this.divergenceDetector = createDivergenceDetector({
      checkIntervalMs: options.divergenceCheckIntervalMs ?? 5000,
      enablePeriodicChecks: false, // Disabled periodic checks to avoid races in controlled mode
      viewProvider: () => (this.view ? { view: this.view } : null),
      runtime: this.runtime,
      schema: this.adapter.schema,
      onDivergence: (result) => {
        if (!this.view) {
          this.handleDivergence(result);
          return;
        }
        const analysis = this.divergenceDetector.analyzeDivergence(
          this.view.state,
          this.runtime.doc,
          this.adapter.schema
        );
        this.handleDivergence({
          ...result,
          analysis,
        });
      },
      onError: (error) => {
        this.onError?.(error);
      },
    });

    if (this.enableDivergenceDetection) {
      this.divergenceDetector.start();
    }

    // Schema Migration: Upgrade V1 RichText to V2 format
    migrateToSchemaV2(this.runtime.doc);

    // PERF-001: Initialize sync debounce
    this.syncDebounceMs = options.syncDebounceMs ?? 50;
  }

  setView(view: EditorView | null): void {
    this.view = view;
  }

  createView(mount: HTMLElement): EditorView {
    if (this.bootstrapPeerId !== undefined && getRootBlocks(this.runtime.doc).length === 0) {
      const originalPeerId = this.runtime.doc.peerIdStr;
      this.runtime.doc.setPeerId(this.bootstrapPeerId);
      createEmptyDoc(this.runtime.doc);
      this.runtime.doc.setPeerId(originalPeerId);
    } else {
      createEmptyDoc(this.runtime.doc);
    }
    const initialDoc = projectLoroToPm(this.runtime.doc, this.adapter.schema);
    const state = this.adapter.createState(initialDoc);

    const view = this.adapter.createView(mount, {
      state,
      dispatchTransaction: (tr) => this.handleTransaction(tr),
      nodeViews: this.nodeViews,
    });

    this.setView(view);
    return view;
  }

  applyRemoteUpdate(bytes: Uint8Array): void {
    this.runtime.importBytes(bytes);
    this.syncFromLoro();

    // Automatic divergence check after remote update
    if (this.enableDivergenceDetection && this.view) {
      // Use setTimeout to avoid blocking the update flow
      setTimeout(() => {
        this.checkDivergence();
      }, 0);
    }
  }

  destroy(): void {
    // Clear any pending debounce
    if (this.syncDebounceTimer) {
      clearTimeout(this.syncDebounceTimer);
      this.syncDebounceTimer = null;
    }
    this.divergenceDetector.stop();
    this.view?.destroy();
    this.view = null;
  }

  /**
   * Validate AI payload using the full LFCC §11.2 pipeline
   * Returns sanitized payload if valid, throws error if invalid
   *
   * Pipeline: Sanitize → Normalize → Schema Dry-Run
   *
   * P0.1: Client-side integration point for AI payload validation
   * Use this method when applying AI-generated content from the Gateway.
   *
   * @see packages/lfcc-bridge/src/security/aiPayloadIntegration.md for integration guide
   */
  async validateAIPayload(payload: string): Promise<string> {
    // Step 0: Quick malicious pattern detection (fail-closed)
    const maliciousCheck = gateway.detectMaliciousPayload(payload);
    if (maliciousCheck.isMalicious) {
      const error = new Error("AI payload validation failed: malicious patterns detected");
      (error as Error & { code: string; patterns: string[] }).code = "MALICIOUS_PAYLOAD_DETECTED";
      (error as Error & { code: string; patterns: string[] }).patterns = maliciousCheck.patterns;
      this.logSecurityEvent("pipeline_rejected", {
        stage: "pre_check",
        reason: "Malicious patterns detected",
        patterns: maliciousCheck.patterns,
        payload: payload.substring(0, 100),
      });
      throw error;
    }

    // Build pipeline config with schema validator if provided
    const pipelineConfig: gateway.PipelineConfig = {
      ...gateway.DEFAULT_PIPELINE_CONFIG,
      schemaValidator: this.securityValidator.getSchemaValidator(),
    };

    const result = await gateway.executePipeline({ html: payload }, pipelineConfig);

    if (!result.ok) {
      const error = new Error(
        `AI payload validation failed at stage '${result.stage}': ${result.reason}`
      );
      (error as Error & { code: string; stage: string }).code = "PIPELINE_VALIDATION_FAILED";
      (error as Error & { code: string; stage: string }).stage = result.stage;
      this.logSecurityEvent("pipeline_rejected", {
        stage: result.stage,
        reason: result.reason,
        diagnostics: result.diagnostics,
        payload: payload.substring(0, 100),
      });
      throw error;
    }

    // Log any diagnostics as warnings
    if (result.diagnostics.length > 0) {
      this.logSecurityEvent("payload_sanitized", {
        diagnostics: result.diagnostics,
      });
    }

    // Return sanitized payload for downstream application
    return this.validateAIPayloadSync(payload);
  }

  /**
   * Validate AI payload synchronously (legacy method)
   * @deprecated Use validateAIPayload (async) for full LFCC §11.2 compliance
   */
  validateAIPayloadSync(payload: string): string {
    const result = this.securityValidator.validate(payload);
    if (!result.ok) {
      const error = new Error(
        `AI payload validation failed: ${result.errors.map((e) => e.message).join("; ")}`
      );
      (error as Error & { code: string }).code = "SECURITY_VALIDATION_FAILED";
      this.logSecurityEvent("potential_xss", {
        errors: result.errors,
        payload: payload.substring(0, 100),
      });
      throw error;
    }

    if (result.warnings.length > 0) {
      this.logSecurityEvent("payload_sanitized", {
        warnings: result.warnings,
      });
    }

    return result.sanitized ?? payload;
  }

  /**
   * Apply an AI gateway apply_plan by converting payload to a PM transaction.
   */
  async applyAIGatewayPlan(options: AIGatewayPlanApplyOptions): Promise<AIGatewayPlanApplyResult> {
    const precheck = ensureApplyPlanInputs(this.view, options);
    if (!precheck.ok) {
      return { success: false, error: precheck.error };
    }

    const payloadResult = await this.resolvePayloadFragment(precheck.view, options.payloadHtml);
    if (!payloadResult.ok) {
      return { success: false, error: payloadResult.error };
    }

    const operationsResult = resolveApplyOperations({
      plan: precheck.plan,
      view: precheck.view,
      runtime: this.runtime,
      payloadFragment: payloadResult.fragment,
      spanResolver: options.spanResolver,
    });
    if (!operationsResult.ok) {
      return { success: false, error: operationsResult.error };
    }

    const transactionResult = buildApplyPlanTransaction(precheck.view, operationsResult.operations);
    if (!transactionResult.ok) {
      return { success: false, error: transactionResult.error };
    }

    const tr = markAIGatewayTransaction(transactionResult.tr, precheck.metadata);
    precheck.view.dispatch(tr);
    precheck.view.focus();

    return {
      success: true,
      transaction: tr,
      appliedSpanIds: operationsResult.appliedSpanIds,
    };
  }

  private async resolvePayloadFragment(
    view: EditorView,
    payloadHtml?: string
  ): Promise<PayloadFragmentResult> {
    if (!payloadHtml) {
      return { ok: true, fragment: null };
    }
    const sanitized = await this.validateAIPayload(payloadHtml);
    const htmlFragment = buildFragmentFromHtml(sanitized, view.state.schema);
    if (!htmlFragment.ok) {
      return { ok: false, error: htmlFragment.error };
    }
    return { ok: true, fragment: htmlFragment.fragment };
  }

  /**
   * Validate anchor integrity
   */
  validateAnchor(anchor: Uint8Array): boolean {
    const isValid = validateAnchorIntegrity(anchor);
    if (!isValid) {
      this.logSecurityEvent("invalid_anchor", {
        anchorLength: anchor.length,
      });
    }
    return isValid;
  }

  /**
   * Validate relocation according to policy
   */
  validateRelocation(
    annotationId: string,
    originalSpan: { blockId: string; start: number; end: number },
    relocatedSpan: { blockId: string; start: number; end: number },
    level: 1 | 2 | 3,
    blockLength: number,
    blockOrder?: Map<string, number>
  ): { ok: boolean; requiresConfirmation: boolean; error?: string } {
    const result = this.relocationSecurity.validateRelocation(
      originalSpan,
      relocatedSpan,
      level,
      blockLength,
      { blockOrder }
    );

    if (!result.ok) {
      this.logSecurityEvent("relocation_denied", {
        annotationId,
        level,
        error: result.error?.code,
      });
      return {
        ok: false,
        requiresConfirmation: false,
        error: result.error?.message,
      };
    }

    if (result.requiresConfirmation) {
      // Check if user confirmation exists
      const hasConfirmation = this.relocationSecurity.hasUserConfirmation(
        annotationId,
        originalSpan,
        relocatedSpan,
        level
      );

      if (!hasConfirmation) {
        return {
          ok: false,
          requiresConfirmation: true,
          error: "User confirmation required for relocation",
        };
      }
    }

    // Record successful relocation
    this.relocationSecurity.recordUserConfirmation(
      annotationId,
      originalSpan,
      relocatedSpan,
      level
    );

    return {
      ok: true,
      requiresConfirmation: result.requiresConfirmation,
    };
  }

  /**
   * Check for divergence between Editor and Loro states
   */
  /**
   * Check for divergence between Editor and Loro states.
   * @param nextState - Optional predicted next state to check against.
   *                   If not provided, uses this.view.state.
   */
  checkDivergence(nextState?: EditorState): boolean {
    if (!this.view || !this.enableDivergenceDetection) {
      return false;
    }

    const state = nextState ?? this.view.state;
    const result = this.divergenceDetector.checkDivergence(
      state,
      this.runtime.doc,
      this.adapter.schema
    );

    return result.diverged;
  }

  /**
   * Handle divergence detection result
   */
  private handleDivergence(result: DivergenceResult): void {
    if (!result.diverged || !this.view) {
      return;
    }

    this.logSecurityEvent("divergence_detected", {
      editorChecksum: result.editorChecksum,
      loroChecksum: result.loroChecksum,
      reason: result.reason,
      analysis: result.analysis,
    });

    // Notify external UI (e.g., DivergenceBanner)
    this.onDivergence?.(result);

    // Trigger hard-reset: re-project from Loro
    const resetResult = this.divergenceDetector.triggerHardReset(
      this.runtime.doc,
      this.adapter.schema,
      this.view.state
    );

    if (resetResult.needsReset) {
      // Re-project from Loro
      this.syncFromLoro();
      this.logSecurityEvent("hard_reset_triggered", {
        reason: "divergence_detected",
      });
    }
  }

  /**
   * Log security events
   */
  private logSecurityEvent(eventType: string, data: Record<string, unknown>): void {
    const error = new Error(`Security event: ${eventType}`);
    (error as Error & { code: string; data: Record<string, unknown> }).code = eventType;
    (error as Error & { code: string; data: Record<string, unknown> }).data = data;
    this.onError?.(error);
  }

  private nextStructuralTimestamp(): number {
    this.structuralOpClock += 1;
    return this.structuralOpClock;
  }

  private recordStructuralOps(dirtyInfo: DirtyInfo, source: StructuralOp["source"]): void {
    const ops = buildStructuralOpsFromDirtyInfo(dirtyInfo, source, () =>
      this.nextStructuralTimestamp()
    );
    if (ops.length === 0) {
      return;
    }

    const phase: StructuralOrderingEvent["phase"] =
      source === "local" ? "local_emit" : "remote_apply";

    if (source === "local") {
      this.pendingLocalStructuralOps.push(...ops);
    } else {
      this.pendingRemoteStructuralOps.push(...ops);
    }

    this.onStructuralOrdering?.({
      phase,
      ordered: ops,
      conflicts: [],
      dropped: [],
      localPending: this.pendingLocalStructuralOps,
      remotePending: this.pendingRemoteStructuralOps,
    });
  }

  private flushStructuralOrdering(phase: StructuralOrderingEvent["phase"]): void {
    if (
      this.pendingLocalStructuralOps.length === 0 &&
      this.pendingRemoteStructuralOps.length === 0
    ) {
      return;
    }

    const result = mergeAndOrderStructuralOps(
      this.pendingLocalStructuralOps,
      this.pendingRemoteStructuralOps,
      (event, data) => this.logStructuralOrdering(event, data)
    );

    if (result.conflicts.length > 0) {
      const conflictError = new Error("Structural op conflict detected");
      (conflictError as Error & { code: string }).code = "STRUCTURAL_OP_CONFLICT";
      this.onError?.(conflictError);
    }

    this.onStructuralOrdering?.({
      phase,
      ordered: result.ordered,
      conflicts: result.conflicts,
      dropped: result.dropped,
      localPending: this.pendingLocalStructuralOps,
      remotePending: this.pendingRemoteStructuralOps,
    });

    this.pendingLocalStructuralOps = [];
    this.pendingRemoteStructuralOps = [];
  }

  private logStructuralOrdering(event: string, data: Record<string, unknown>): void {
    if (this.onError) {
      const err = new Error(`Structural ordering event: ${event}`);
      (err as Error & { code: string; data: Record<string, unknown> }).code = event;
      (err as Error & { code: string; data: Record<string, unknown> }).data = data;
      this.onError(err);
      return;
    }

    logger.warn("mapping", "Structural ordering event", { event, data });
  }

  private enforceAIGateway(tr: Transaction): { isAIIntent: boolean; hasGatewayMeta: boolean } {
    const isAIIntent = tr.getMeta(AI_INTENT_META) === true;
    const hasGatewayMeta = hasGatewayMetadata(tr);

    if (isAIIntent && !hasGatewayMeta) {
      const error = new Error("AI write rejected: missing gateway metadata");
      (error as Error & { code?: string; data?: Record<string, unknown> }).code =
        "AI_GATEWAY_REJECTED";
      (error as Error & { code?: string; data?: Record<string, unknown> }).data = {
        aiIntent: true,
        hasGatewayMeta,
      };
      this.onError?.(error as Error);
      logger.error("gateway", "Rejected AI write without gateway metadata");
      throw error;
    }

    // Dev-only signal for suspicious (unguarded) large insertions
    if (!hasGatewayMeta && detectUnvalidatedAIWrite(tr) && process.env.NODE_ENV !== "production") {
      logger.warn("gateway", "Suspicious unvalidated write detected");
    }

    return { isAIIntent, hasGatewayMeta };
  }

  public handleTransaction(tr: Transaction): void {
    if (!this.view) {
      return;
    }

    try {
      if (this.runtime.isDegraded()) {
        const error = new Error("Bridge degraded: refusing to apply transaction");
        (error as Error & { code?: string }).code = "BRIDGE_DEGRADED";
        throw error;
      }

      // 1. Update PM view state first (responsive UI)
      const nextState = this.view.state.apply(tr);
      this.view.updateState(nextState);

      // 2. Sync the transaction to Loro (IDs will be handled in syncTransactionToLoro)
      this.syncTransactionToLoro(tr);

      this.debouncedSyncFromLoro();
    } catch (error) {
      this.onError?.(error as Error);
      throw error;
    }
  }

  /**
   * Sync a ProseMirror transaction to Loro WITHOUT updating PM view state.
   * Use this when React is managing the EditorState externally (e.g., with @handlewithcare/react-prosemirror).
   */
  public syncTransactionToLoro(tr: Transaction): void {
    if (!tr.docChanged || !this.view) {
      return;
    }

    try {
      if (this.runtime.isDegraded()) {
        return;
      }

      // P0 SAFETY: Ensure block IDs are assigned before syncing to Loro
      // This is the last chance to fix missing IDs.
      if (shouldAssignBlockIds(tr)) {
        const idTr = assignMissingBlockIds(this.view.state, () => nextBlockId(this.runtime.doc));
        if (idTr) {
          // Apply ID fixes to PM view (to stay in sync)
          idTr.setMeta("addToHistory", false);
          this.view.dispatch(idTr);
          // Note: dispatch will call handleTransaction/syncTransactionToLoro recursively,
          // which is fine since assignMissingBlockIds is idempotent and will return null next time.
          return;
        }
      }

      this.syncTransactionInternal(tr);
    } catch (err) {
      this.onError?.(err as Error);
      throw err;
    }
  }

  /**
   * Shared internal logic for syncing a PM transaction to Loro.
   * Handles security, dirty info, and CRDT application.
   */
  private syncTransactionInternal(tr: Transaction): void {
    this.enforceAIGateway(tr);
    this.ensureHistoryMeta(tr);

    const bridgeDirtyInfo = this.emitDirtyInfo(tr);
    this.assertDirtyInfo(bridgeDirtyInfo);

    this.applyTransactionToLoro(tr);
    this.checkDivergenceAfterSync(tr);
  }

  private ensureHistoryMeta(tr: Transaction): void {
    if (!tr.docChanged && tr.getMeta("addToHistory") !== false && !tr.getMeta("history")) {
      tr.setMeta("addToHistory", false);
    }
  }

  private emitDirtyInfo(tr: Transaction): DirtyInfo {
    const documentOrder = collectContentBlockOrder(tr.doc);
    const { dirtyInfo: bridgeDirtyInfo, expandedBlocks } = computeDirtyInfoWithPolicy(
      tr,
      documentOrder
    );
    this.recordStructuralOps(bridgeDirtyInfo, "local");
    this.onDirtyInfo?.({ ...bridgeDirtyInfo, expandedBlocks });
    return bridgeDirtyInfo;
  }

  private assertDirtyInfo(bridgeDirtyInfo: DirtyInfo): void {
    if (process.env.NODE_ENV === "production") {
      return;
    }
    const result = assertDirtyInfoSuperset(bridgeDirtyInfo, bridgeDirtyInfo);
    if (!result.ok) {
      const error = new Error(`DirtyInfo under-reported: ${formatDirtyInfoDiff(result.diff)}`);
      (error as Error & { code: string }).code = "DIRTYINFO_UNDER_REPORTED";
      this.onError?.(error);
    }
  }

  private applyTransactionToLoro(tr: Transaction): void {
    try {
      if (process.env.NODE_ENV !== "production") {
        logger.info("mapping", "Syncing transaction to Loro", {
          docChanged: tr.docChanged,
          steps: tr.steps.length,
        });
      }
      const originTag = this.buildOriginTag(tr);
      this.applyTransactionWithUndo(tr, originTag);
    } catch (err) {
      this.runtime.setDegraded(true);
      const error = new Error(
        `[LFCC Bridge] Loro apply failed: ${(err as Error).message ?? String(err)}`
      );
      (error as Error & { code?: string; data?: Record<string, unknown> }).code = "LORO_APPLY_FAIL";
      (error as Error & { code?: string; data?: Record<string, unknown> }).data = {
        docId: this.runtime.docId,
        origin: this.originTag,
      };
      this.onError?.(error);
      throw error;
    }
  }

  private buildOriginTag(tr: Transaction): string {
    const gatewayOrigin = hasGatewayMetadata(tr)
      ? buildAICommitOriginWithMeta({
          source: tr.getMeta(AI_GATEWAY_SOURCE) as string | undefined,
          requestId: tr.getMeta(AI_GATEWAY_REQUEST_ID) as string | undefined,
          agentId: tr.getMeta(AI_GATEWAY_AGENT_ID) as string | undefined,
          intentId: tr.getMeta(AI_GATEWAY_INTENT_ID) as string | undefined,
        })
      : undefined;
    return gatewayOrigin ?? this.originTag;
  }

  private applyTransactionWithUndo(tr: Transaction, originTag: string): void {
    const shouldGroupUndo = tr.getMeta(LFCC_STRUCTURAL_META) === true;
    if (shouldGroupUndo) {
      this.runtime.undoManager.groupStart();
    }
    try {
      const applyResult = applyPmTransactionToLoro(tr, this.runtime, originTag);
      this.recordLocalApply(applyResult);
    } finally {
      if (shouldGroupUndo) {
        this.runtime.undoManager.groupEnd();
      }
    }
  }

  private checkDivergenceAfterSync(tr: Transaction): void {
    if (!this.enableDivergenceDetection || !this.view) {
      return;
    }
    try {
      const nextState = this.view.state.apply(tr);
      this.checkDivergence(nextState);
    } catch {
      this.checkDivergence(this.view.state);
    }
  }

  /**
   * PERF-001: Debounced sync-from-Loro to reduce render thrashing during rapid typing
   */
  private debouncedSyncFromLoro(): void {
    if (this.syncDebounceMs <= 0) {
      // Debounce disabled, sync immediately
      this.syncFromLoro();
      return;
    }

    this.syncPending = true;

    if (this.syncDebounceTimer) {
      // Already have a timer, let it fire
      return;
    }

    this.syncDebounceTimer = setTimeout(() => {
      this.syncDebounceTimer = null;
      if (this.syncPending) {
        this.syncPending = false;
        this.syncFromLoro();
      }
    }, this.syncDebounceMs);
  }

  /**
   * PERF-007: Rebuild the BlockID -> Position cache from the current PM document.
   * Call after any sync to keep the cache warm.
   */
  private rebuildBlockIdCache(): void {
    this.blockIdCache.clear();
    if (!this.view) {
      return;
    }

    const doc = this.view.state.doc;
    let pos = 0;
    for (let i = 0; i < doc.childCount; i++) {
      const child = doc.child(i);
      const blockId = child.attrs.block_id;
      if (typeof blockId === "string" && blockId) {
        this.blockIdCache.set(blockId, { pos, size: child.nodeSize });
      }
      pos += child.nodeSize;
    }
  }

  private shouldLogPerf(): boolean {
    return process.env.NODE_ENV !== "production" && process.env.LFCC_BRIDGE_METRICS === "true";
  }

  private recordLocalApply(result: ApplyPmTransactionResult | null): void {
    if (!result) {
      return;
    }

    this.perfStats.localSyncs += 1;
    if (result.path === "fast_text") {
      this.perfStats.localFastText += 1;
    } else if (result.path === "text_batch") {
      this.perfStats.localTextBatch += 1;
    } else if (result.path === "reorder_only") {
      this.perfStats.localReorderOnly += 1;
    } else if (result.path === "structural_partial") {
      this.perfStats.localPartial += 1;
    } else {
      this.perfStats.localFull += 1;
    }

    this.maybeLogPerf();
  }

  private recordRemoteSync(mode: "patch" | "multi_patch" | "full" | "eq_skip"): void {
    if (mode === "eq_skip") {
      this.perfStats.remoteEqSkip += 1;
      return;
    }

    this.perfStats.remoteSyncs += 1;
    if (mode === "patch") {
      this.perfStats.remotePatch += 1;
    } else if (mode === "multi_patch") {
      this.perfStats.remoteMultiPatch += 1;
    } else {
      this.perfStats.remoteFull += 1;
    }

    this.maybeLogPerf();
  }

  private maybeLogPerf(): void {
    if (!this.shouldLogPerf()) {
      return;
    }

    const now = Date.now();
    if (now - this.perfLastLogMs < 5000) {
      return;
    }

    this.perfLastLogMs = now;
    logger.info("mapping", "Bridge perf stats", {
      localSyncs: this.perfStats.localSyncs,
      localFastText: this.perfStats.localFastText,
      localTextBatch: this.perfStats.localTextBatch,
      localReorderOnly: this.perfStats.localReorderOnly,
      localPartial: this.perfStats.localPartial,
      localFull: this.perfStats.localFull,
      remoteSyncs: this.perfStats.remoteSyncs,
      remotePatch: this.perfStats.remotePatch,
      remoteMultiPatch: this.perfStats.remoteMultiPatch,
      remoteFull: this.perfStats.remoteFull,
      remoteEqSkip: this.perfStats.remoteEqSkip,
    });
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: sync path coordinates projection, dirty tracking, and selection preservation
  syncFromLoro(): void {
    // console.log("[Bridge] syncFromLoro triggered");
    if (!this.view) {
      return;
    }

    // PERF-006: Skip sync if Loro version hasn't changed
    const currentVersion = this.getFrontierSignature();
    if (this.lastSyncedVersion === currentVersion) {
      return;
    }

    const pmDoc = projectLoroToPm(this.runtime.doc, this.adapter.schema);
    const currentDoc = this.view.state.doc;

    // Early exit if no changes
    if (currentDoc.eq(pmDoc)) {
      // Content matches, but Loro changed (Metadata/Annotations?).
      // Dispatch empty transaction to allow plugins to update.
      const tr = this.view.state.tr
        .setMeta(BRIDGE_ORIGIN_META, "loro")
        .setMeta("addToHistory", false);
      this.view.dispatch(tr);

      this.lastSyncedVersion = currentVersion;
      this.recordRemoteSync("eq_skip");
      return;
    }

    const { state } = this.view;

    const patchTr = this.buildPatchTransaction(state, currentDoc, pmDoc);
    const multiPatchTr = patchTr
      ? null
      : this.buildMultiRangePatchTransaction(state, currentDoc, pmDoc);
    const patchMode = patchTr ? "patch" : multiPatchTr ? "multi_patch" : "full";
    let tr = patchTr ?? multiPatchTr ?? this.buildFullReplaceTransaction(state, currentDoc, pmDoc);
    this.recordRemoteSync(patchMode);

    if (process.env.NODE_ENV !== "production") {
      logger.info("mapping", "syncFromLoro projection stats", {
        blockCount: pmDoc.childCount,
        patchMode,
      });
    }
    const remoteDirtyInfo = computeDirtyInfo(tr);
    if (remoteDirtyInfo.opCodes.length > 0) {
      this.recordStructuralOps(remoteDirtyInfo, "remote");
    }
    this.flushStructuralOrdering("remote_apply");

    // Mark this as coming from Loro to avoid re-sync loop
    tr = tr.setMeta(BRIDGE_ORIGIN_META, "loro");
    tr = tr.setMeta("addToHistory", false);

    // P0-2 FIX: Multi-tier selection restoration with better fallback strategies
    // Tier 1: SpanList-based (blockId + offset) - most stable for structural changes
    // Tier 2: Position mapping - works for text-only changes
    // Tier 3: Nearest valid position - handles deleted blocks
    // Tier 4: Document start - last resort fallback
    const oldSelection = state.selection;
    let selectionRestored = false;
    let selectionRestorationTier: 1 | 2 | 3 | 4 = 1;

    if (!oldSelection.empty) {
      // Tier 1: Try SpanList-based restoration (blockId + offset)
      try {
        const spanListResult = pmSelectionToSpanList(oldSelection, state, this.runtime, {
          includeCursor: true,
        });
        if (spanListResult.spanList.length > 0 && spanListResult.verified) {
          const restoredState = state.apply(tr);
          const restoredRanges = spanListToPmRanges(
            spanListResult.spanList,
            this.runtime,
            restoredState
          );
          if (restoredRanges.length > 0) {
            const { TextSelection } = require("prosemirror-state");
            const from = Math.min(restoredRanges[0].from, tr.doc.content.size);
            const to = Math.min(restoredRanges[restoredRanges.length - 1].to, tr.doc.content.size);
            if (from >= 0 && to >= from) {
              const newSelection = TextSelection.create(tr.doc, from, to);
              tr = tr.setSelection(newSelection);
              selectionRestored = true;
              selectionRestorationTier = 1;
            }
          }
        }
      } catch {
        // Fall through to Tier 2
      }
    }

    // Tier 2: Position-based mapping (works for text changes within same block)
    if (!selectionRestored && !oldSelection.empty) {
      try {
        const mappedSelection = oldSelection.map(tr.doc, tr.mapping);
        const from = mappedSelection.$from.pos;
        const to = mappedSelection.$to.pos;
        if (from >= 0 && to <= tr.doc.content.size && from <= to) {
          tr = tr.setSelection(mappedSelection);
          selectionRestored = true;
          selectionRestorationTier = 2;
        }
      } catch {
        // Fall through to Tier 3
      }
    }

    // Tier 3: Find nearest valid position (handles deleted blocks)
    if (!selectionRestored && !oldSelection.empty) {
      try {
        const { TextSelection } = require("prosemirror-state");
        // Try to find a valid position near the original anchor
        const targetPos = Math.min(oldSelection.anchor, tr.doc.content.size);
        const $pos = tr.doc.resolve(Math.max(0, targetPos));
        // Find the nearest textblock
        let foundPos: number | null = null;
        for (let d = $pos.depth; d >= 0; d--) {
          const node = $pos.node(d);
          if (node.isTextblock) {
            foundPos = $pos.before(d) + 1;
            break;
          }
        }
        if (foundPos === null && tr.doc.firstChild) {
          // No textblock at position, find first one in document
          tr.doc.descendants((node, pos) => {
            if (foundPos === null && node.isTextblock) {
              foundPos = pos + 1;
              return false;
            }
            return true;
          });
        }
        if (foundPos !== null && foundPos >= 0 && foundPos <= tr.doc.content.size) {
          tr = tr.setSelection(TextSelection.create(tr.doc, foundPos));
          selectionRestored = true;
          selectionRestorationTier = 3;
        }
      } catch {
        // Fall through to Tier 4
      }
    }

    // Tier 4: Document start (last resort)
    if (!selectionRestored) {
      try {
        const { TextSelection } = require("prosemirror-state");
        // Position at start of first textblock
        let firstTextPos = 1;
        tr.doc.descendants((node, pos) => {
          if (node.isTextblock) {
            firstTextPos = pos + 1;
            return false;
          }
          return true;
        });
        tr = tr.setSelection(
          TextSelection.create(tr.doc, Math.min(firstTextPos, tr.doc.content.size))
        );
        selectionRestorationTier = 4;
      } catch {
        // Selection will remain as default
      }
    }

    // P0-2: Log selection restoration tier for debugging/telemetry
    if (process.env.NODE_ENV !== "production" && !oldSelection.empty) {
      logger.info("mapping", "Selection restored", {
        tier: selectionRestorationTier,
      });
    }

    // Apply the transaction (this will not trigger handleTransaction
    // dispatch since we're updating state directly)
    try {
      const nextState = state.apply(tr);
      this.view.updateState(nextState);
      // Update version after successful sync
      this.lastSyncedVersion = currentVersion;
      // PERF-007: Rebuild block cache for next incremental sync
      this.rebuildBlockIdCache();
      // PERF-008: Notify React of state change (for controlled mode)
      this.onStateChange?.(nextState);
    } catch (err) {
      this.runtime.setDegraded?.(true);
      const error = new Error(
        `[LFCC Bridge] syncFromLoro apply failed: ${(err as Error).message ?? String(err)}`
      );
      (error as Error & { code?: string }).code = "SYNC_FROM_LORO_FAIL";
      this.onError?.(error);
      throw error;
    }
  }

  private buildPatchTransaction(
    state: EditorState,
    currentDoc: EditorState["doc"],
    nextDoc: EditorState["doc"]
  ): Transaction | null {
    const start = currentDoc.content.findDiffStart(nextDoc.content);
    if (start == null) {
      return null;
    }

    const end = currentDoc.content.findDiffEnd(nextDoc.content);
    const endInCurrent = end?.a ?? start;
    const endInNext = end?.b ?? start;

    // PERF-009: Trust findDiff results to avoid O(N) doc.eq check
    // If start is null, docs are identical (handled by caller)
    // If findDiffStart returns a value, we can safely replace the range.

    const slice = nextDoc.slice(start, endInNext);
    const tr = state.tr.replace(start, endInCurrent, slice);

    // Development only verification
    if (process.env.NODE_ENV !== "production") {
      if (!tr.doc.eq(nextDoc)) {
        logger.warn("mapping", "Patch transaction resulted in divergent document state");
        return null;
      }
    }

    return tr;
  }

  private buildMultiRangePatchTransaction(
    state: EditorState,
    currentDoc: EditorState["doc"],
    nextDoc: EditorState["doc"]
  ): Transaction | null {
    const currentBlocks = this.collectTopLevelBlocks(currentDoc);
    const nextBlocks = this.collectTopLevelBlocks(nextDoc);
    if (!currentBlocks || !nextBlocks) {
      return null;
    }

    if (currentBlocks.length !== nextBlocks.length) {
      return null;
    }

    for (let i = 0; i < currentBlocks.length; i += 1) {
      if (currentBlocks[i].blockId !== nextBlocks[i].blockId) {
        return null;
      }
    }

    const changes: Array<{ pos: number; size: number; node: PMNode }> = [];
    for (let i = 0; i < currentBlocks.length; i += 1) {
      const current = currentBlocks[i];
      const next = nextBlocks[i];
      if (!current.node.eq(next.node)) {
        changes.push({ pos: current.pos, size: current.node.nodeSize, node: next.node });
      }
    }

    if (changes.length === 0) {
      return null;
    }

    const tr = state.tr;
    const sortedChanges = changes.sort((a, b) => b.pos - a.pos);
    for (const change of sortedChanges) {
      tr.replaceWith(change.pos, change.pos + change.size, change.node);
    }

    if (process.env.NODE_ENV !== "production") {
      if (!tr.doc.eq(nextDoc)) {
        logger.warn("mapping", "Multi-range patch resulted in divergent document state");
        return null;
      }
    }

    return tr;
  }

  private buildFullReplaceTransaction(
    state: EditorState,
    currentDoc: EditorState["doc"],
    nextDoc: EditorState["doc"]
  ): Transaction {
    return state.tr.replaceWith(0, currentDoc.content.size, nextDoc.content);
  }

  private collectTopLevelBlocks(doc: EditorState["doc"]): Array<{
    blockId: string;
    pos: number;
    node: PMNode;
  }> | null {
    const blocks: Array<{ blockId: string; pos: number; node: PMNode }> = [];
    let pos = 0;

    for (let i = 0; i < doc.childCount; i += 1) {
      const child = doc.child(i);
      const blockId = child.attrs.block_id;
      if (typeof blockId !== "string" || blockId.trim() === "") {
        return null;
      }

      blocks.push({ blockId, pos, node: child });
      pos += child.nodeSize;
    }

    return blocks;
  }
}
