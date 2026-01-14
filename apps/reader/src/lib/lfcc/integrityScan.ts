import { buildBlockIndex } from "@/lib/annotations/annotationResolution";
import type { Annotation } from "@/lib/kernel/types";
import type { DirtyInfo } from "@ku0/core";
import {
  type AnnotationScanData,
  DEFAULT_DEV_COMPARE_POLICY,
  type DocumentStateProvider,
  type ForceFullScanResult,
  IntegrityScanner,
  computeChainHash,
  computeContextHash,
  forceFullScan,
} from "@ku0/core";
import type { EditorView } from "prosemirror-view";

type SpanLookupEntry = {
  blockId: string;
  start: number;
  end: number;
};

export type IntegrityScanSummary = {
  ok: boolean;
  failureCount: number;
  report: ForceFullScanResult["report"];
};

function buildSpanId(index: number, blockId: string, start: number, end: number): string {
  return `s${index}-${blockId}-${start}-${end}`;
}
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: legacy scanner logic
async function buildAnnotationScanData(
  view: EditorView,
  annotations: Annotation[]
): Promise<{
  scanData: AnnotationScanData[];
  spanLookup: Map<string, SpanLookupEntry>;
  blockOrder: string[];
}> {
  const blockIndex = buildBlockIndex(view.state);
  const spanLookup = new Map<string, SpanLookupEntry>();
  const scanData: AnnotationScanData[] = [];

  for (const annotation of annotations) {
    const spans = annotation.spans ?? [];
    const spanEntries: AnnotationScanData["spans"] = [];

    for (let i = 0; i < spans.length; i += 1) {
      const span = spans[i];
      const spanId = buildSpanId(i, span.blockId, span.start, span.end);
      spanLookup.set(spanId, { blockId: span.blockId, start: span.start, end: span.end });

      const entry = blockIndex.blockMap.get(span.blockId);
      let storedContextHash: string | null = null;
      let text = "";

      if (entry) {
        text = entry.node.textBetween(span.start, span.end, "\n");
        try {
          const hashResult = await computeContextHash({
            span_id: spanId,
            block_id: span.blockId,
            text,
          });
          storedContextHash = hashResult.hash;
        } catch {
          storedContextHash = null;
        }
      }

      spanEntries.push({
        span_id: spanId,
        block_id: span.blockId,
        text,
        stored_context_hash: storedContextHash,
      });
    }

    const chainBlocks = annotation.chain?.order ?? spans.map((span) => span.blockId);
    const policyKind = annotation.chain?.policy?.kind ?? "required_order";
    const maxInterveningBlocks = annotation.chain?.policy?.maxInterveningBlocks ?? 0;

    let storedChainHash: string | null = null;
    if (chainBlocks.length > 0) {
      try {
        const hashResult = await computeChainHash({
          policy_kind: policyKind,
          max_intervening_blocks: maxInterveningBlocks,
          block_ids: chainBlocks,
        });
        storedChainHash = hashResult.hash;
      } catch {
        storedChainHash = null;
      }
    }

    scanData.push({
      anno_id: annotation.id,
      spans: spanEntries,
      chain: {
        block_ids: chainBlocks,
        policy_kind: policyKind,
        max_intervening_blocks: maxInterveningBlocks,
        stored_chain_hash: storedChainHash,
      },
    });
  }

  return { scanData, spanLookup, blockOrder: blockIndex.blockOrder };
}

function createDocumentStateProvider(
  view: EditorView,
  scanData: AnnotationScanData[],
  spanLookup: Map<string, SpanLookupEntry>
): DocumentStateProvider {
  const blockIndex = buildBlockIndex(view.state);

  return {
    getAnnotations() {
      return scanData;
    },
    getAnnotationsInBlocks(blockIds) {
      if (blockIds.length === 0) {
        return [];
      }
      const blockSet = new Set(blockIds);
      return scanData.filter((anno) => anno.spans.some((span) => blockSet.has(span.block_id)));
    },
    getSpanText(blockId, spanId) {
      const span = spanLookup.get(spanId);
      if (!span) {
        return null;
      }

      const entry = blockIndex.blockMap.get(blockId);
      if (!entry) {
        return null;
      }

      return entry.node.textBetween(span.start, span.end, "\n");
    },
    getBlockOrder() {
      return blockIndex.blockOrder;
    },
  };
}

export async function runIntegrityScan(params: {
  view: EditorView;
  annotations: Annotation[];
  lastDirtyInfo?: DirtyInfo | null;
}): Promise<IntegrityScanSummary> {
  const { view, annotations, lastDirtyInfo } = params;
  const { scanData, spanLookup, blockOrder } = await buildAnnotationScanData(view, annotations);
  const provider = createDocumentStateProvider(view, scanData, spanLookup);
  const scanner = new IntegrityScanner(provider, DEFAULT_DEV_COMPARE_POLICY);

  const result = await forceFullScan(scanner, scanData, blockOrder, {
    compareDirty: Boolean(lastDirtyInfo),
    lastDirtyInfo: lastDirtyInfo ?? undefined,
    generateJson: false,
  });

  const failureCount = result.report.summary.total_mismatches;

  return {
    ok: failureCount === 0,
    failureCount,
    report: result.report,
  };
}
