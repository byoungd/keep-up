"use client";

import { annotationController } from "@/lib/annotations/annotationController";
import { useCommentStore } from "@/lib/annotations/commentStore";
import { useAnnotationStore } from "@/lib/kernel/store";
import type { SpanList } from "@ku0/lfcc-bridge";
import { pmSelectionToSpanList, spanListToPmRanges } from "@ku0/lfcc-bridge";
import type { LoroRuntime } from "@ku0/lfcc-bridge";
import type { Node as PMNode } from "prosemirror-model";
import { TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

import { LIQUID_REFACTOR_SEED } from "./seedLfccDemo";

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

type LeafBlock = { id: string; node: PMNode };

const collectLeafBlocks = (doc: PMNode): LeafBlock[] => {
  const blocks: LeafBlock[] = [];
  doc.descendants((node) => {
    const group = node.type.spec.group ?? "";
    const isBlock = node.isBlock && group.split(" ").includes("block");
    if (!isBlock || !isLeafTextBlock(node) || !hasBlockId(node)) {
      return;
    }
    blocks.push({ id: node.attrs.block_id, node });
  });
  return blocks;
};

const findSpanInBlock = (
  block: LeafBlock,
  text: string
): { blockId: string; start: number; end: number } | null => {
  const blockText = block.node.textContent;
  if (!blockText) {
    return null;
  }
  const start = blockText.indexOf(text);
  if (start < 0) {
    return null;
  }
  return { blockId: block.id, start, end: start + text.length };
};

const buildSeedAnnotationId = (seedKey: string, index: number) => `lfcc-seed-${seedKey}-${index}`;

type SeedValue = number | "liquid-refactor" | undefined;

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions (extracted for complexity reduction)
// ─────────────────────────────────────────────────────────────────────────────

/** Build span list from seed annotation spans */
function buildSpanListFromSeed(
  blocks: LeafBlock[],
  seedSpans: Array<{ blockIndex: number; text: string }>
): SpanList {
  const spans: SpanList = [];

  for (const span of seedSpans) {
    const block = blocks[span.blockIndex];
    if (!block) {
      return []; // Return empty if any block is missing
    }

    const match = findSpanInBlock(block, span.text);
    if (!match) {
      return []; // Return empty if any text match fails
    }

    spans.push(match);
  }

  return spans;
}

/** Create seed annotation with optional comments */
function createSeedAnnotation(
  index: number,
  spans: SpanList,
  seed: (typeof LIQUID_REFACTOR_SEED.annotations)[0]
): boolean {
  const content = seed.spans.map((span) => span.text).join(" / ");
  const annotation = annotationController.createAnnotation({
    id: buildSeedAnnotationId("liquid-refactor", index),
    spanList: spans,
    content,
    color: seed.color ?? "yellow",
    displayState: "active",
    verified: true,
  });

  if (seed.comments?.length) {
    const commentStore = useCommentStore.getState();
    for (const comment of seed.comments) {
      commentStore.addComment(annotation.id, comment, "Reviewer");
    }
  }

  return true;
}

export function seedLfccAnnotations(
  view: EditorView,
  runtime: LoroRuntime,
  seedValue?: SeedValue
): boolean {
  const existing = Object.keys(useAnnotationStore.getState().annotations).length;
  if (existing > 0) {
    return true;
  }

  const leafBlocks = collectLeafBlocks(view.state.doc);
  if (leafBlocks.length < 2) {
    return false;
  }

  if (seedValue === "liquid-refactor") {
    return seedLiquidRefactorAnnotations(leafBlocks);
  }

  return seedDefaultAnnotation(view, runtime, seedValue, leafBlocks);
}

function seedLiquidRefactorAnnotations(blocks: LeafBlock[]): boolean {
  let created = false;

  for (const [index, seed] of LIQUID_REFACTOR_SEED.annotations.entries()) {
    const spans = buildSpanListFromSeed(blocks, seed.spans);
    if (spans.length === 0) {
      continue;
    }

    if (createSeedAnnotation(index, spans, seed)) {
      created = true;
    }
  }

  return created;
}

function seedDefaultAnnotation(
  view: EditorView,
  runtime: LoroRuntime,
  seedValue: SeedValue,
  blocks: LeafBlock[]
): boolean {
  const [first, second] = blocks;
  const spanList: SpanList = [
    {
      blockId: first.id,
      start: 5,
      end: Math.min(28, first.node.content.size),
    },
    {
      blockId: second.id,
      start: 0,
      end: Math.min(32, second.node.content.size),
    },
  ];

  const ranges = spanListToPmRanges(spanList, runtime, view.state);
  if (ranges.length === 0) {
    return false;
  }

  const selection = TextSelection.create(
    view.state.doc,
    ranges[0].from,
    ranges[ranges.length - 1].to
  );

  const selectionResult = pmSelectionToSpanList(selection, view.state, runtime, {
    strict: true,
    chainPolicy: { kind: "required_order", maxInterveningBlocks: 0 },
  });

  if (selectionResult.spanList.length === 0) {
    return false;
  }

  const content = view.state.doc.textBetween(selection.from, selection.to, "\n");
  const seedKey = seedValue ? String(seedValue) : "default";
  annotationController.createAnnotation({
    id: buildSeedAnnotationId(seedKey, 0),
    spanList: selectionResult.spanList,
    chain: selectionResult.chain,
    content,
    color: "yellow",
    displayState: selectionResult.verified ? "active" : "active_unverified",
    verified: selectionResult.verified,
  });

  return true;
}
