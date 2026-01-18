/**
 * LFCC v0.9 RC - Integrity Scanner
 * @see docs/product/LFCC_v0.9_RC_Engineering_Docs/08_Conformance_Test_Suite_Plan.md
 */

import type { DirtyInfo } from "../mapping/types.js";
import { computeChainHash, computeContextHash } from "./hash.js";
import type { ChainData, CompareMismatch, DevComparePolicy, SpanData } from "./types.js";

/** Annotation data for scanning */
export type AnnotationScanData = {
  anno_id: string;
  spans: Array<{
    span_id: string;
    block_id: string;
    text: string;
    stored_context_hash: string | null;
  }>;
  chain: {
    block_ids: string[];
    policy_kind: "strict_adjacency" | "required_order" | "bounded_gap";
    max_intervening_blocks: number;
    stored_chain_hash: string | null;
  };
};

/** Document state provider interface */
export interface DocumentStateProvider {
  /** Get all annotations */
  getAnnotations(): AnnotationScanData[];
  /** Get annotations affected by dirty blocks */
  getAnnotationsInBlocks(blockIds: string[]): AnnotationScanData[];
  /** Get current text for a span */
  getSpanText(blockId: string, spanId: string): string | null;
  /** Get block order for chain validation */
  getBlockOrder(): string[];
}

/**
 * Integrity Scanner for comparing dirty-region vs full scan results
 */
export class IntegrityScanner {
  private provider: DocumentStateProvider;

  constructor(provider: DocumentStateProvider, _policy: DevComparePolicy) {
    this.provider = provider;
  }

  /**
   * Scan only dirty regions (affected by recent edits)
   */
  async dirtyScan(dirty: DirtyInfo): Promise<CompareMismatch[]> {
    const mismatches: CompareMismatch[] = [];
    const annotations = this.provider.getAnnotationsInBlocks(dirty.touchedBlocks);

    for (const anno of annotations) {
      const spanMismatches = await this.verifyAnnotationSpans(anno);
      mismatches.push(...spanMismatches);

      const chainMismatch = await this.verifyAnnotationChain(anno);
      if (chainMismatch) {
        mismatches.push(chainMismatch);
      }
    }

    return mismatches;
  }

  /**
   * Full scan of all annotations
   */
  async fullScan(): Promise<CompareMismatch[]> {
    const mismatches: CompareMismatch[] = [];
    const annotations = this.provider.getAnnotations();

    for (const anno of annotations) {
      const spanMismatches = await this.verifyAnnotationSpans(anno);
      mismatches.push(...spanMismatches);

      const chainMismatch = await this.verifyAnnotationChain(anno);
      if (chainMismatch) {
        mismatches.push(chainMismatch);
      }
    }

    return mismatches;
  }

  /**
   * Compare dirty scan vs full scan results
   */
  async compareScans(dirty: DirtyInfo): Promise<{
    dirtyMismatches: CompareMismatch[];
    fullMismatches: CompareMismatch[];
    missedByDirty: CompareMismatch[];
  }> {
    const dirtyMismatches = await this.dirtyScan(dirty);
    const fullMismatches = await this.fullScan();

    // Find mismatches that full scan found but dirty scan missed
    const dirtyAnnoIds = new Set(dirtyMismatches.map((m) => m.anno_id));
    const missedByDirty = fullMismatches.filter((m) => !dirtyAnnoIds.has(m.anno_id));

    return { dirtyMismatches, fullMismatches, missedByDirty };
  }

  /**
   * Verify spans for an annotation
   */
  private async verifyAnnotationSpans(anno: AnnotationScanData): Promise<CompareMismatch[]> {
    const mismatches: CompareMismatch[] = [];

    for (const span of anno.spans) {
      if (span.stored_context_hash === null) {
        continue;
      }

      const currentText = this.provider.getSpanText(span.block_id, span.span_id);
      if (currentText === null) {
        mismatches.push({
          kind: "dirty_missed_span",
          anno_id: anno.anno_id,
          span_id: span.span_id,
          detail: `Span text not found in block ${span.block_id}`,
        });
        continue;
      }

      const spanData: SpanData = {
        span_id: span.span_id,
        block_id: span.block_id,
        text: currentText,
      };

      const result = await computeContextHash(spanData);
      if (result.hash !== span.stored_context_hash) {
        mismatches.push({
          kind: "hash_mismatch",
          anno_id: anno.anno_id,
          span_id: span.span_id,
          detail: `Context hash mismatch: expected ${span.stored_context_hash}, got ${result.hash}`,
        });
      }
    }

    return mismatches;
  }

  /**
   * Verify chain for an annotation
   */
  private async verifyAnnotationChain(anno: AnnotationScanData): Promise<CompareMismatch | null> {
    if (anno.chain.stored_chain_hash === null) {
      return null;
    }

    const blockOrder = this.provider.getBlockOrder();

    // Verify chain policy
    const chainValid = this.validateChainPolicy(
      anno.chain.block_ids,
      anno.chain.policy_kind,
      anno.chain.max_intervening_blocks,
      blockOrder
    );

    if (!chainValid.valid) {
      return {
        kind: "chain_violation",
        anno_id: anno.anno_id,
        detail: chainValid.reason,
      };
    }

    // Verify chain hash
    const chainData: ChainData = {
      policy_kind: anno.chain.policy_kind,
      max_intervening_blocks: anno.chain.max_intervening_blocks,
      block_ids: anno.chain.block_ids,
    };

    const result = await computeChainHash(chainData);
    if (result.hash !== anno.chain.stored_chain_hash) {
      return {
        kind: "hash_mismatch",
        anno_id: anno.anno_id,
        detail: `Chain hash mismatch: expected ${anno.chain.stored_chain_hash}, got ${result.hash}`,
      };
    }

    return null;
  }

  /**
   * Validate chain policy constraints
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: policy logic
  private validateChainPolicy(
    chainBlockIds: string[],
    policyKind: "strict_adjacency" | "required_order" | "bounded_gap",
    maxIntervening: number,
    blockOrder: string[]
  ): { valid: boolean; reason: string } {
    if (chainBlockIds.length === 0) {
      return { valid: false, reason: "Empty chain" };
    }

    // Get indices in document order
    const indices = chainBlockIds.map((id) => blockOrder.indexOf(id));

    // Check all blocks exist
    if (indices.some((i) => i === -1)) {
      const missing = chainBlockIds.filter((id) => blockOrder.indexOf(id) === -1);
      return { valid: false, reason: `Missing blocks: ${missing.join(", ")}` };
    }

    // Check order is preserved
    for (let i = 1; i < indices.length; i++) {
      if (indices[i] <= indices[i - 1]) {
        return { valid: false, reason: "Chain order violated" };
      }
    }

    // Check policy-specific constraints
    switch (policyKind) {
      case "strict_adjacency":
        for (let i = 1; i < indices.length; i++) {
          if (indices[i] !== indices[i - 1] + 1) {
            return { valid: false, reason: "Blocks not adjacent (strict_adjacency)" };
          }
        }
        break;

      case "bounded_gap":
        for (let i = 1; i < indices.length; i++) {
          const gap = indices[i] - indices[i - 1] - 1;
          if (gap > maxIntervening) {
            return {
              valid: false,
              reason: `Gap ${gap} exceeds max_intervening_blocks ${maxIntervening}`,
            };
          }
        }
        break;

      case "required_order":
        // Order already checked above
        break;
    }

    return { valid: true, reason: "" };
  }
}

/**
 * Check if a full scan should run now based on policy
 */
export function shouldRunFullScanNow(params: {
  blockCount: number;
  structuralOpsSinceLastFullScan: number;
  idleMs: number;
  policy: DevComparePolicy;
}): boolean {
  const { blockCount, structuralOpsSinceLastFullScan, idleMs, policy } = params;

  // Small documents: always full scan
  if (blockCount <= policy.dev_fullscan_max_blocks) {
    return true;
  }

  // Structural ops trigger
  if (structuralOpsSinceLastFullScan >= policy.dev_structural_ops_fullscan_every) {
    return true;
  }

  // Idle trigger
  if (idleMs >= policy.dev_idle_fullscan_every_ms) {
    return true;
  }

  return false;
}
