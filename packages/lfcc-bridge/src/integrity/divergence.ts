/**
 * LFCC v0.9 RC - Shadow-Editor Divergence Detection
 * @see docs/product/LFCC_v0.9_RC_Engineering_Docs/03_Shadow_Model_and_Bridge_Architecture.md
 *
 * Implements lightweight checksum comparison between Editor and Loro (Shadow) states
 * to detect divergence and trigger hard-reset (re-project) when needed.
 */

import type { LoroDoc } from "loro-crdt";
import type { Schema } from "prosemirror-model";
import type { EditorState } from "prosemirror-state";
import { projectLoroToPm } from "../projection/projection";
import { getChecksumInput } from "../security/canonicalizer";

export type DivergenceCheckResult = {
  diverged: boolean;
  editorChecksum: string;
  loroChecksum: string;
  reason?: string;
};

export type DivergenceDetectorOptions = {
  /** Check interval in milliseconds (default: 5000) */
  checkIntervalMs?: number;
  /** Enable periodic checks (default: true) */
  enablePeriodicChecks?: boolean;
  /** Callback when divergence detected */
  onDivergence?: (result: DivergenceCheckResult) => void;
  /** Callback for errors */
  onError?: (error: Error) => void;
  /** Provider for current editor state (required for periodic checks) */
  viewProvider?: () => { view: { state: EditorState } } | null;
  /** Provider for Loro document (required for periodic checks) */
  runtime?: { doc: LoroDoc };
  /** Schema for projection (required for periodic checks) */
  schema?: Schema;
};

/**
 * Divergence Detector for Mode B Conformance
 *
 * Performs lightweight checksum comparison between Editor and Loro states
 * to detect when they diverge (e.g., due to editor bugs or race conditions).
 */
export class DivergenceDetector {
  private checkIntervalMs: number;
  private enablePeriodicChecks: boolean;
  private onDivergence?: (result: DivergenceCheckResult) => void;
  private onError?: (error: Error) => void;
  private checkTimer: ReturnType<typeof setInterval> | null = null;
  private lastEditorChecksum: string | null = null;
  private lastLoroChecksum: string | null = null;
  private lastQuickMatch = false;
  private viewProvider?: () => { view: { state: EditorState } } | null;
  private runtime?: { doc: LoroDoc };
  private schema?: Schema;

  constructor(options: DivergenceDetectorOptions = {}) {
    this.checkIntervalMs = options.checkIntervalMs ?? 5000;
    this.enablePeriodicChecks = options.enablePeriodicChecks ?? true;
    this.onDivergence = options.onDivergence;
    this.onError = options.onError;
    this.viewProvider = options.viewProvider;
    this.runtime = options.runtime;
    this.schema = options.schema;
  }

  /**
   * Start periodic divergence checks
   */
  start(): void {
    if (!this.enablePeriodicChecks) {
      return;
    }

    if (this.checkTimer) {
      this.stop();
    }

    this.checkTimer = setInterval(() => {
      // Perform automatic periodic check
      if (!this.viewProvider || !this.runtime || !this.schema) {
        // Missing required providers, skip check
        return;
      }

      const view = this.viewProvider();
      if (!view) {
        // View not available, skip check
        return;
      }

      try {
        this.checkDivergence(view.view.state, this.runtime.doc, this.schema);
        // onDivergence callback is already called in checkDivergence if divergence detected
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.onError?.(err);
      }
    }, this.checkIntervalMs);
  }

  /**
   * Stop periodic divergence checks
   */
  stop(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
  }

  /**
   * Check for divergence between Editor and Loro states
   * Uses two-tier checksum: O(1) quick check first, then O(N) deep check if needed.
   * Returns true if divergence detected, false otherwise
   */
  checkDivergence(
    editorState: EditorState,
    loroDoc: LoroDoc,
    schema: Schema
  ): DivergenceCheckResult {
    try {
      // Tier 1: Quick structural check (O(1))
      const quickEditorChecksum = this.computeQuickChecksum(editorState.doc);
      const quickLoroChecksum = this.computeQuickLoroChecksum(loroDoc, schema);

      // If quick checksums match AND we had a previous full match, skip deep check
      if (quickEditorChecksum === quickLoroChecksum && this.lastQuickMatch) {
        return {
          diverged: false,
          editorChecksum: quickEditorChecksum,
          loroChecksum: quickLoroChecksum,
        };
      }

      // Tier 2: Deep structural check (O(N))
      const editorChecksum = this.computeEditorChecksum(editorState);
      const loroChecksum = this.computeLoroChecksum(loroDoc, schema);

      const diverged = editorChecksum !== loroChecksum;

      const result: DivergenceCheckResult = {
        diverged,
        editorChecksum,
        loroChecksum,
        reason: diverged ? "Checksum mismatch between editor and Loro states" : undefined,
      };

      // Store checksums and quick match state for next iteration
      this.lastEditorChecksum = editorChecksum;
      this.lastLoroChecksum = loroChecksum;
      this.lastQuickMatch = !diverged && quickEditorChecksum === quickLoroChecksum;

      if (diverged && this.onDivergence) {
        this.onDivergence(result);
      }

      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.onError?.(err);
      return {
        diverged: false,
        editorChecksum: "",
        loroChecksum: "",
        reason: `Error during divergence check: ${err.message}`,
      };
    }
  }

  /**
   * Quick structural checksum (O(1))
   * Uses childCount, content size, and textContent length for fast comparison
   */
  private computeQuickChecksum(doc: EditorState["doc"]): string {
    return `${doc.childCount}|${doc.content.size}|${doc.textContent.length}`;
  }

  /**
   * Quick Loro checksum (O(1) projection time assumed negligible for small docs)
   * Falls back to empty string on error
   */
  private computeQuickLoroChecksum(loroDoc: LoroDoc, schema: Schema): string {
    try {
      const pmDoc = projectLoroToPm(loroDoc, schema);
      return `${pmDoc.childCount}|${pmDoc.content.size}|${pmDoc.textContent.length}`;
    } catch {
      return "";
    }
  }

  /**
   * Compute structural checksum for Editor state
   * LFCC v0.9.4: Uses Canonicalizer (§8) for deterministic serialization
   */
  private computeEditorChecksum(editorState: EditorState): string {
    const canonicalInput = getChecksumInput(editorState.doc);
    return this.simpleHash(canonicalInput);
  }

  /**
   * Serialize marks from a node for checksum
   */
  private serializeMarks(node: ReturnType<EditorState["doc"]["nodeAt"]>): string {
    if (!node || node.isText) {
      return "";
    }

    const markSet: string[] = [];
    node.descendants((child, pos) => {
      if (child.isText && child.marks.length > 0) {
        const markNames = child.marks
          .map((m) => m.type.name)
          .sort()
          .join(",");
        markSet.push(`${pos}:${markNames}`);
      }
    });
    return markSet.join("&");
  }

  /**
   * Serialize attrs for checksum (excluding block_id which is already included)
   */
  private serializeAttrs(attrs: Record<string, unknown>): string {
    const filtered = Object.entries(attrs)
      .filter(([k, v]) => k !== "block_id" && v !== null && v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return filtered.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(",");
  }

  /**
   * Compute structural checksum for Loro state
   * LFCC v0.9.4: Uses Canonicalizer (§8) for deterministic serialization
   */
  private computeLoroChecksum(loroDoc: LoroDoc, schema: Schema): string {
    try {
      const pmDoc = projectLoroToPm(loroDoc, schema);
      const canonicalInput = getChecksumInput(pmDoc);
      return this.simpleHash(canonicalInput);
    } catch (_error) {
      return "";
    }
  }

  /**
   * Simple hash function for checksum (lightweight, not cryptographic)
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Trigger hard-reset: re-project from Loro to Editor
   * This should be called when divergence is detected
   */
  triggerHardReset(
    loroDoc: LoroDoc,
    schema: Schema,
    currentEditorState: EditorState
  ): {
    newDoc: ReturnType<typeof projectLoroToPm>;
    needsReset: boolean;
  } {
    try {
      const newDoc = projectLoroToPm(loroDoc, schema);
      const currentDoc = currentEditorState.doc;

      // Check if reset is actually needed
      const needsReset = !currentDoc.eq(newDoc);

      return { newDoc, needsReset };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.onError?.(err);
      return {
        newDoc: currentEditorState.doc,
        needsReset: false,
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // P2-1: Enhanced Divergence Detection
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * P2-1: Analyze divergence to identify root cause
   * Returns structured information about what diverged
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: P2-1 divergence analysis requires complex branching
  analyzeDivergence(
    editorState: EditorState,
    loroDoc: LoroDoc,
    schema: Schema
  ): DivergenceAnalysis {
    const analysis: DivergenceAnalysis = {
      diverged: false,
      blockCountMismatch: false,
      textContentMismatch: false,
      attributeMismatch: false,
      orderMismatch: false,
      divergedBlockIds: [],
      missingInEditor: [],
      missingInLoro: [],
    };

    try {
      const editorBlocks = this.collectBlockInfo(editorState.doc);
      const loroDoc_ = projectLoroToPm(loroDoc, schema);
      const loroBlocks = this.collectBlockInfo(loroDoc_);

      // Check block count
      if (editorBlocks.size !== loroBlocks.size) {
        analysis.diverged = true;
        analysis.blockCountMismatch = true;
      }

      // Find missing blocks
      for (const [id, editorBlock] of editorBlocks) {
        const loroBlock = loroBlocks.get(id);
        if (!loroBlock) {
          analysis.diverged = true;
          analysis.missingInLoro.push(id);
        } else {
          // Compare block content
          if (editorBlock.text !== loroBlock.text) {
            analysis.diverged = true;
            analysis.textContentMismatch = true;
            analysis.divergedBlockIds.push(id);
          }
          if (editorBlock.attrs !== loroBlock.attrs) {
            analysis.diverged = true;
            analysis.attributeMismatch = true;
            if (!analysis.divergedBlockIds.includes(id)) {
              analysis.divergedBlockIds.push(id);
            }
          }
          if (editorBlock.order !== loroBlock.order) {
            analysis.diverged = true;
            analysis.orderMismatch = true;
          }
        }
      }

      // Find blocks in Loro but not in Editor
      for (const [id] of loroBlocks) {
        if (!editorBlocks.has(id)) {
          analysis.diverged = true;
          analysis.missingInEditor.push(id);
        }
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.onError?.(err);
    }

    return analysis;
  }

  /**
   * P2-1: Collect block information for comparison
   */
  private collectBlockInfo(
    doc: EditorState["doc"]
  ): Map<string, { text: string; attrs: string; order: number }> {
    const blocks = new Map<string, { text: string; attrs: string; order: number }>();
    let order = 0;

    doc.descendants((node) => {
      const blockId = node.attrs.block_id;
      if (typeof blockId === "string" && blockId.trim() !== "") {
        blocks.set(blockId, {
          text: node.textContent,
          attrs: this.serializeAttrs(node.attrs),
          order: order++,
        });
      }
    });

    return blocks;
  }

  /**
   * P2-1: Attempt soft reset - only replace diverged blocks
   * Preserves decorations and editor state where possible
   */
  triggerSoftReset(
    divergedBlockIds: string[],
    loroDoc: LoroDoc,
    schema: Schema,
    currentEditorState: EditorState
  ): {
    transaction: import("prosemirror-state").Transaction | null;
    resetBlockCount: number;
  } {
    if (divergedBlockIds.length === 0) {
      return { transaction: null, resetBlockCount: 0 };
    }

    try {
      const loroDocPm = projectLoroToPm(loroDoc, schema);
      const loroBlocks = new Map<string, import("prosemirror-model").Node>();

      // Collect Loro blocks by ID
      loroDocPm.descendants((node, _pos) => {
        const blockId = node.attrs.block_id;
        if (typeof blockId === "string" && divergedBlockIds.includes(blockId)) {
          loroBlocks.set(blockId, node);
        }
      });

      // Build transaction to replace only diverged blocks
      let tr = currentEditorState.tr;
      let resetCount = 0;

      currentEditorState.doc.descendants((node, pos) => {
        const blockId = node.attrs.block_id;
        if (typeof blockId === "string" && loroBlocks.has(blockId)) {
          const replacement = loroBlocks.get(blockId);
          if (replacement) {
            tr = tr.replaceWith(pos, pos + node.nodeSize, replacement);
            resetCount++;
          }
        }
      });

      if (resetCount === 0) {
        return { transaction: null, resetBlockCount: 0 };
      }

      // Mark as coming from Loro
      tr = tr.setMeta("lfcc-bridge-origin", "loro");
      tr = tr.setMeta("addToHistory", false);

      return { transaction: tr, resetBlockCount: resetCount };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.onError?.(err);
      return { transaction: null, resetBlockCount: 0 };
    }
  }
}

/**
 * P2-1: Divergence analysis result type
 */
export type DivergenceAnalysis = {
  diverged: boolean;
  blockCountMismatch: boolean;
  textContentMismatch: boolean;
  attributeMismatch: boolean;
  orderMismatch: boolean;
  divergedBlockIds: string[];
  missingInEditor: string[];
  missingInLoro: string[];
};

/**
 * Create a divergence detector
 */
export function createDivergenceDetector(options?: DivergenceDetectorOptions): DivergenceDetector {
  return new DivergenceDetector(options);
}
