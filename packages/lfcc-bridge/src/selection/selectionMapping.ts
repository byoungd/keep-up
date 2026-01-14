import { anchorFromAbsolute } from "@ku0/core";
import { LoroText } from "loro-crdt";
import type { Node as PMNode } from "prosemirror-model";
import type { EditorState, Selection } from "prosemirror-state";

import { ensureBlockMap } from "../crdt/crdtSchema";
import type { LoroRuntime } from "../runtime/loroRuntime";
import { validateRange } from "../utils/unicode";

export type SpanAnchor = {
  anchor: string;
  bias: "before" | "after";
};

export type SpanRange = {
  blockId: string;
  start: number;
  end: number;
  startAnchor?: SpanAnchor;
  endAnchor?: SpanAnchor;
};

export type SpanList = SpanRange[];

export type SpanChainPolicy = {
  kind: "strict_adjacency" | "required_order" | "bounded_gap";
  maxInterveningBlocks: number;
};

export type SpanChain = {
  policy: SpanChainPolicy;
  order: string[];
};

export type SelectionMappingResult = {
  spanList: SpanList;
  chain: SpanChain;
  verified: boolean;
};

export type SelectionMappingOptions = {
  chainPolicy?: SpanChainPolicy;
  strict?: boolean;
  includeCursor?: boolean;
};

const isBlockNode = (node: PMNode): boolean => {
  if (node.type.name === "doc") {
    return false;
  }

  const group = node.type.spec.group ?? "";
  return node.isBlock && group.split(" ").includes("block");
};

const CONTAINER_NODE_NAMES = new Set([
  "list",
  "list_item",
  "quote",
  "table",
  "table_row",
  "table_cell",
]);

const isLeafTextBlock = (node: PMNode): boolean => {
  if (!node.isTextblock) {
    return false;
  }

  return !CONTAINER_NODE_NAMES.has(node.type.name);
};

const hasBlockId = (node: PMNode): node is PMNode & { attrs: { block_id: string } } => {
  const blockId = node.attrs.block_id;
  return typeof blockId === "string" && blockId.trim() !== "";
};

function collectLeafSpans(
  doc: PMNode,
  from: number,
  to: number
): Array<{ blockId: string; start: number; end: number }> {
  const spans: Array<{ blockId: string; start: number; end: number }> = [];

  doc.nodesBetween(from, to, (node, pos) => {
    if (!isBlockNode(node) || !isLeafTextBlock(node) || !hasBlockId(node)) {
      return;
    }

    // ProseMirror position model:
    // - Block node at position `pos`
    // - Content starts at `pos + 1` (after opening token)
    // - Content ends at `pos + 1 + node.content.size`
    // Previous bug: contentEnd was `pos + node.content.size` (off by 1)
    const contentStart = pos + 1;
    const contentEnd = pos + 1 + node.content.size;
    const rangeStart = Math.max(from, contentStart);
    const rangeEnd = Math.min(to, contentEnd);

    if (rangeEnd <= rangeStart) {
      return;
    }

    spans.push({
      blockId: node.attrs.block_id,
      start: rangeStart - contentStart,
      end: rangeEnd - contentStart,
    });
  });

  return spans;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: selection mapping with multiple validation paths
export function pmSelectionToSpanList(
  selection: Selection,
  state: EditorState,
  runtime: LoroRuntime,
  options: SelectionMappingOptions = {}
): SelectionMappingResult {
  if (selection.empty) {
    if (options.includeCursor) {
      const $from = selection.$from;
      for (let depth = $from.depth; depth > 0; depth -= 1) {
        const node = $from.node(depth);
        if (!isBlockNode(node) || !isLeafTextBlock(node) || !hasBlockId(node)) {
          continue;
        }

        const contentStart = $from.start(depth);
        const rawOffset = selection.from - contentStart;
        const offset = Math.max(0, Math.min(rawOffset, node.content.size));

        const blockMap = ensureBlockMap(runtime.doc, node.attrs.block_id);
        const text = blockMap.getOrCreateContainer("text", new LoroText());
        const length = text.length;
        const safeOffset = Math.min(offset, length);

        let verified = true;
        if (safeOffset !== offset) {
          verified = false;
        }

        const textContent = text.toString();
        const validation = validateRange(textContent, safeOffset, safeOffset);
        if (!validation.valid) {
          verified = false;
          if (options.strict) {
            throw new Error(
              `SURROGATE_PAIR_VIOLATION: Cursor at ${safeOffset} in block ${node.attrs.block_id} splits surrogate pair: ${validation.error}`
            );
          }
        }

        let startAnchor: string | null = null;
        let endAnchor: string | null = null;
        try {
          startAnchor = anchorFromAbsolute(node.attrs.block_id, safeOffset, "after");
          endAnchor = anchorFromAbsolute(node.attrs.block_id, safeOffset, "before");
        } catch {
          verified = false;
        }

        const span: SpanRange = {
          blockId: node.attrs.block_id,
          start: safeOffset,
          end: safeOffset,
          startAnchor: startAnchor ? { anchor: startAnchor, bias: "after" } : undefined,
          endAnchor: endAnchor ? { anchor: endAnchor, bias: "before" } : undefined,
        };

        if (options.strict && !verified) {
          throw new Error("Selection mapping is not fully verified");
        }

        return {
          spanList: [span],
          chain: {
            policy: options.chainPolicy ?? { kind: "required_order", maxInterveningBlocks: 0 },
            order: [span.blockId],
          },
          verified,
        };
      }
    }

    return {
      spanList: [],
      chain: {
        policy: options.chainPolicy ?? { kind: "required_order", maxInterveningBlocks: 0 },
        order: [],
      },
      verified: !options.includeCursor,
    };
  }

  const from = Math.min(selection.from, selection.to);
  const to = Math.max(selection.from, selection.to);
  const spans = collectLeafSpans(state.doc, from, to);
  if (spans.length === 0) {
    if (options.strict) {
      throw new Error("No leaf spans resolved for selection");
    }

    return {
      spanList: [],
      chain: {
        policy: options.chainPolicy ?? { kind: "required_order", maxInterveningBlocks: 0 },
        order: [],
      },
      verified: false,
    };
  }

  let verified = true;
  const spanList: SpanList = spans.map((span) => {
    const blockMap = ensureBlockMap(runtime.doc, span.blockId);
    const text = blockMap.getOrCreateContainer("text", new LoroText());
    const length = text.length;
    const safeStart = Math.min(span.start, length);
    const safeEnd = Math.min(span.end, length);

    if (safeEnd < safeStart) {
      verified = false;
      return span;
    }

    // DEFECT-001: UTF-16 Surrogate Pair Guard - Validate span positions
    const textContent = text.toString();
    const validation = validateRange(textContent, safeStart, safeEnd);
    if (!validation.valid) {
      verified = false;
      if (options.strict) {
        throw new Error(
          `SURROGATE_PAIR_VIOLATION: Span [${safeStart}, ${safeEnd}) in block ${span.blockId} splits surrogate pair: ${validation.error}`
        );
      }
      // In non-strict mode, mark as unverified but continue
    }

    if (safeStart !== span.start || safeEnd !== span.end) {
      verified = false;
    }

    let startAnchor: string;
    let endAnchor: string;
    try {
      startAnchor = anchorFromAbsolute(span.blockId, safeStart, "after");
      endAnchor = anchorFromAbsolute(span.blockId, safeEnd, "before");
    } catch {
      verified = false;
      return span;
    }

    return {
      ...span,
      start: safeStart,
      end: safeEnd,
      startAnchor: { anchor: startAnchor, bias: "after" },
      endAnchor: { anchor: endAnchor, bias: "before" },
    };
  });

  if (options.strict && !verified) {
    throw new Error("Selection mapping is not fully verified");
  }

  return {
    spanList,
    chain: {
      policy: options.chainPolicy ?? { kind: "required_order", maxInterveningBlocks: 0 },
      order: spanList.map((span) => span.blockId),
    },
    verified,
  };
}

export function spanListToPmRanges(
  spanList: SpanList,
  _runtime: LoroRuntime,
  state: EditorState
): Array<{ from: number; to: number }> {
  if (spanList.length === 0) {
    return [];
  }

  const blockMap = new Map<string, { pos: number; node: PMNode }>();
  state.doc.descendants((node, pos) => {
    if (!isBlockNode(node) || !isLeafTextBlock(node) || !hasBlockId(node)) {
      return;
    }

    blockMap.set(node.attrs.block_id, { pos, node });
  });

  return spanList
    .map((span) => {
      const entry = blockMap.get(span.blockId);
      if (!entry) {
        return null;
      }

      const contentStart = entry.pos + 1;
      const from = contentStart + span.start;
      const to = contentStart + span.end;
      return { from, to };
    })
    .filter((range): range is { from: number; to: number } => range !== null);
}
