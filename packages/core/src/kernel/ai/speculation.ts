/**
 * LFCC v0.9.1+ — Speculative Execution Layer
 *
 * Preview AI changes before committing to the document.
 * Supports multiple concurrent speculations for comparison.
 *
 * @see docs/specs/proposals/LFCC_v0.9.1_AI_Native_Enhancement.md
 */

import type { EditIntent } from "./intent";
import type { AIOperationMeta } from "./opcodes";

// ============================================================================
// Speculation Identity
// ============================================================================

/** Unique speculation identifier */
export type SpeculationId = string & { readonly __brand: "SpeculationId" };

/**
 * Create a speculation ID.
 */
export function speculationId(id: string): SpeculationId {
  return id as SpeculationId;
}

// ============================================================================
// Speculation State
// ============================================================================

/**
 * State of a speculation.
 */
export type SpeculationState =
  | "active" // Currently being edited
  | "ready" // Ready to commit
  | "committed" // Applied to document
  | "discarded"; // User rejected

// ============================================================================
// Text Range
// ============================================================================

/**
 * A range of text within a block.
 */
export interface TextRange {
  block_id: string;
  start: number;
  end: number;
  content?: string;
}

// ============================================================================
// Speculation Diff
// ============================================================================

/**
 * Diff between speculation and base document.
 */
export interface SpeculationDiff {
  /** Ranges of added content */
  added_ranges: TextRange[];

  /** Ranges of removed content */
  removed_ranges: TextRange[];

  /** Ranges of modified content */
  modified_ranges: Array<{
    original: TextRange;
    modified: TextRange;
  }>;

  /** Summary statistics */
  summary: {
    blocks_affected: number;
    chars_added: number;
    chars_removed: number;
    net_change: number;
  };
}

// ============================================================================
// Speculation
// ============================================================================

/**
 * A speculative branch of the document.
 */
export interface Speculation {
  /** Unique identifier */
  id: SpeculationId;

  /** Base version this speculation branches from */
  base_frontier: string;

  /** Intent for this speculation */
  intent: EditIntent;

  /** AI metadata (if AI-generated) */
  ai_meta?: AIOperationMeta;

  /** Current state */
  state: SpeculationState;

  /** Confidence score (0-1) */
  confidence: number;

  /** Content changes by block */
  changes: Map<string, BlockChange>;

  /** When created */
  created_at: number;

  /** Label for UI display */
  label?: string;
}

/**
 * Changes to a single block.
 */
export interface BlockChange {
  block_id: string;
  original_content: string;
  speculative_content: string;
  change_type: "insert" | "modify" | "delete";
}

// ============================================================================
// Speculation Comparison
// ============================================================================

/**
 * Comparison of multiple speculations.
 */
export interface SpeculationComparison {
  /** Speculations being compared */
  speculations: SpeculationId[];

  /** Blocks where speculations differ */
  differing_blocks: string[];

  /** Side-by-side content for each differing block */
  side_by_side: Array<{
    block_id: string;
    original: string;
    variants: Array<{
      speculation_id: SpeculationId;
      content: string;
      confidence: number;
    }>;
  }>;

  /** Recommendation (highest confidence) */
  recommended?: SpeculationId;
}

// ============================================================================
// Commit Result
// ============================================================================

/**
 * Result of committing a speculation.
 */
export interface SpeculationCommitResult {
  /** Whether commit succeeded */
  success: boolean;

  /** Speculation that was committed */
  speculation_id: SpeculationId;

  /** Blocks that were modified */
  affected_blocks: string[];

  /** Error message (if failed) */
  error?: string;
}

// ============================================================================
// Speculative Layer Interface
// ============================================================================

/**
 * Layer for managing speculative document branches.
 */
export interface SpeculativeLayer {
  /**
   * Create a new speculation.
   */
  createSpeculation(
    baseFrontier: string,
    intent: EditIntent,
    options?: {
      ai_meta?: AIOperationMeta;
      label?: string;
      confidence?: number;
    }
  ): SpeculationId;

  /**
   * Apply content changes to a speculation.
   */
  applyToSpeculation(speculationId: SpeculationId, blockId: string, newContent: string): void;

  /**
   * Get a speculation by ID.
   */
  getSpeculation(speculationId: SpeculationId): Speculation | undefined;

  /**
   * Get diff between speculation and base.
   */
  getSpeculationDiff(speculationId: SpeculationId): SpeculationDiff | undefined;

  /**
   * Commit speculation to main document.
   */
  commitSpeculation(speculationId: SpeculationId): SpeculationCommitResult;

  /**
   * Discard a speculation.
   */
  discardSpeculation(speculationId: SpeculationId): void;

  /**
   * Compare multiple speculations.
   */
  compareSpeculations(ids: SpeculationId[]): SpeculationComparison;

  /**
   * Get all active speculations.
   */
  getActiveSpeculations(): Speculation[];

  /**
   * Set confidence for a speculation.
   */
  setConfidence(speculationId: SpeculationId, confidence: number): void;
}

// ============================================================================
// Speculative Layer Implementation
// ============================================================================

let speculationCounter = 0;

/**
 * Generate unique speculation ID.
 */
export function generateSpeculationId(): SpeculationId {
  const timestamp = Date.now().toString(36);
  const counter = (speculationCounter++).toString(36).padStart(4, "0");
  const random = Math.random().toString(36).substring(2, 6);
  return speculationId(`spec_${timestamp}_${counter}_${random}`);
}

/**
 * In-memory speculative layer implementation.
 */
export class InMemorySpeculativeLayer implements SpeculativeLayer {
  private speculations = new Map<SpeculationId, Speculation>();
  private baseContentProvider: (blockId: string) => string;
  private commitHandler?: (speculation: Speculation) => boolean;

  constructor(
    baseContentProvider: (blockId: string) => string,
    commitHandler?: (speculation: Speculation) => boolean
  ) {
    this.baseContentProvider = baseContentProvider;
    this.commitHandler = commitHandler;
  }

  createSpeculation(
    baseFrontier: string,
    intent: EditIntent,
    options?: {
      ai_meta?: AIOperationMeta;
      label?: string;
      confidence?: number;
    }
  ): SpeculationId {
    const id = generateSpeculationId();

    const speculation: Speculation = {
      id,
      base_frontier: baseFrontier,
      intent,
      ai_meta: options?.ai_meta,
      state: "active",
      confidence: options?.confidence ?? 0.5,
      changes: new Map(),
      created_at: Date.now(),
      label: options?.label,
    };

    this.speculations.set(id, speculation);
    return id;
  }

  applyToSpeculation(speculationId: SpeculationId, blockId: string, newContent: string): void {
    const speculation = this.speculations.get(speculationId);
    if (!speculation || speculation.state !== "active") {
      return;
    }

    // Get original content
    const originalContent = this.baseContentProvider(blockId);

    // Determine change type
    let changeType: "insert" | "modify" | "delete";
    if (originalContent === "") {
      changeType = "insert";
    } else if (newContent === "") {
      changeType = "delete";
    } else {
      changeType = "modify";
    }

    speculation.changes.set(blockId, {
      block_id: blockId,
      original_content: originalContent,
      speculative_content: newContent,
      change_type: changeType,
    });
  }

  getSpeculation(speculationId: SpeculationId): Speculation | undefined {
    return this.speculations.get(speculationId);
  }

  getSpeculationDiff(speculationId: SpeculationId): SpeculationDiff | undefined {
    const speculation = this.speculations.get(speculationId);
    if (!speculation) {
      return undefined;
    }

    const addedRanges: TextRange[] = [];
    const removedRanges: TextRange[] = [];
    const modifiedRanges: Array<{ original: TextRange; modified: TextRange }> = [];

    let charsAdded = 0;
    let charsRemoved = 0;

    for (const change of speculation.changes.values()) {
      switch (change.change_type) {
        case "insert":
          addedRanges.push({
            block_id: change.block_id,
            start: 0,
            end: change.speculative_content.length,
            content: change.speculative_content,
          });
          charsAdded += change.speculative_content.length;
          break;

        case "delete":
          removedRanges.push({
            block_id: change.block_id,
            start: 0,
            end: change.original_content.length,
            content: change.original_content,
          });
          charsRemoved += change.original_content.length;
          break;

        case "modify":
          modifiedRanges.push({
            original: {
              block_id: change.block_id,
              start: 0,
              end: change.original_content.length,
              content: change.original_content,
            },
            modified: {
              block_id: change.block_id,
              start: 0,
              end: change.speculative_content.length,
              content: change.speculative_content,
            },
          });
          // Approximate char changes
          charsAdded += Math.max(
            0,
            change.speculative_content.length - change.original_content.length
          );
          charsRemoved += Math.max(
            0,
            change.original_content.length - change.speculative_content.length
          );
          break;
      }
    }

    return {
      added_ranges: addedRanges,
      removed_ranges: removedRanges,
      modified_ranges: modifiedRanges,
      summary: {
        blocks_affected: speculation.changes.size,
        chars_added: charsAdded,
        chars_removed: charsRemoved,
        net_change: charsAdded - charsRemoved,
      },
    };
  }

  commitSpeculation(speculationId: SpeculationId): SpeculationCommitResult {
    const speculation = this.speculations.get(speculationId);
    if (!speculation) {
      return {
        success: false,
        speculation_id: speculationId,
        affected_blocks: [],
        error: "Speculation not found",
      };
    }

    if (speculation.state !== "active" && speculation.state !== "ready") {
      return {
        success: false,
        speculation_id: speculationId,
        affected_blocks: [],
        error: `Cannot commit speculation in state: ${speculation.state}`,
      };
    }

    // Invoke commit handler
    if (this.commitHandler) {
      const success = this.commitHandler(speculation);
      if (!success) {
        return {
          success: false,
          speculation_id: speculationId,
          affected_blocks: Array.from(speculation.changes.keys()),
          error: "Commit handler rejected the speculation",
        };
      }
    }

    speculation.state = "committed";

    return {
      success: true,
      speculation_id: speculationId,
      affected_blocks: Array.from(speculation.changes.keys()),
    };
  }

  discardSpeculation(speculationId: SpeculationId): void {
    const speculation = this.speculations.get(speculationId);
    if (speculation) {
      speculation.state = "discarded";
    }
  }

  compareSpeculations(ids: SpeculationId[]): SpeculationComparison {
    const specs = ids
      .map((id) => this.speculations.get(id))
      .filter((s): s is Speculation => s !== undefined);

    // Find all affected blocks
    const allBlocks = new Set<string>();
    for (const spec of specs) {
      for (const blockId of spec.changes.keys()) {
        allBlocks.add(blockId);
      }
    }

    // Build side-by-side comparison
    const sideBySide: SpeculationComparison["side_by_side"] = [];

    for (const blockId of allBlocks) {
      const original = this.baseContentProvider(blockId);
      const variants: Array<{
        speculation_id: SpeculationId;
        content: string;
        confidence: number;
      }> = [];

      for (const spec of specs) {
        const change = spec.changes.get(blockId);
        variants.push({
          speculation_id: spec.id,
          content: change?.speculative_content ?? original,
          confidence: spec.confidence,
        });
      }

      // Only include if there are differences
      const hasVariance = variants.some((v) => v.content !== original);
      if (hasVariance) {
        sideBySide.push({ block_id: blockId, original, variants });
      }
    }

    // Find highest confidence as recommendation
    let recommended: SpeculationId | undefined;
    let highestConfidence = 0;
    for (const spec of specs) {
      if (spec.confidence > highestConfidence) {
        highestConfidence = spec.confidence;
        recommended = spec.id;
      }
    }

    return {
      speculations: ids,
      differing_blocks: Array.from(allBlocks),
      side_by_side: sideBySide,
      recommended,
    };
  }

  getActiveSpeculations(): Speculation[] {
    return Array.from(this.speculations.values()).filter(
      (s) => s.state === "active" || s.state === "ready"
    );
  }

  setConfidence(speculationId: SpeculationId, confidence: number): void {
    const speculation = this.speculations.get(speculationId);
    if (speculation) {
      speculation.confidence = Math.max(0, Math.min(1, confidence));
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a speculative layer.
 */
export function createSpeculativeLayer(
  baseContentProvider: (blockId: string) => string,
  commitHandler?: (speculation: Speculation) => boolean
): SpeculativeLayer {
  return new InMemorySpeculativeLayer(baseContentProvider, commitHandler);
}
