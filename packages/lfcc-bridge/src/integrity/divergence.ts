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
   * P1.1-Hardened: Includes block order, text content, marks, and attrs
   */
  private computeEditorChecksum(editorState: EditorState): string {
    const doc = editorState.doc;
    const segments: string[] = [];
    let order = 0;

    doc.descendants((node) => {
      const blockId = node.attrs.block_id;
      if (typeof blockId === "string" && blockId.trim() !== "") {
        // Include: order, blockId, type, text content, marks, attrs
        const textContent = node.textContent;
        const marks = this.serializeMarks(node);
        const attrs = this.serializeAttrs(node.attrs);

        segments.push(`${order}|${blockId}|${node.type.name}|${textContent}|${marks}|${attrs}`);
        order++;
      }
    });

    return this.simpleHash(segments.join(";"));
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
   * P1.1-Hardened: Includes block order, text content, marks, and attrs
   */
  private computeLoroChecksum(loroDoc: LoroDoc, schema: Schema): string {
    try {
      const pmDoc = projectLoroToPm(loroDoc, schema);
      const segments: string[] = [];
      let order = 0;

      pmDoc.descendants((node) => {
        const blockId = node.attrs.block_id;
        if (typeof blockId === "string" && blockId.trim() !== "") {
          const textContent = node.textContent;
          const marks = this.serializeMarks(node);
          const attrs = this.serializeAttrs(node.attrs);

          segments.push(`${order}|${blockId}|${node.type.name}|${textContent}|${marks}|${attrs}`);
          order++;
        }
      });

      return this.simpleHash(segments.join(";"));
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
}

/**
 * Create a divergence detector
 */
export function createDivergenceDetector(options?: DivergenceDetectorOptions): DivergenceDetector {
  return new DivergenceDetector(options);
}
