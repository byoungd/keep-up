import type { Node as PMNode } from "prosemirror-model";
import type { Transaction } from "prosemirror-state";

import {
  assertValidBlockTree,
  computeTextDelta,
  type MarkType,
  type RichText,
  syncBlockChildrenOrder,
  syncRootBlockOrder,
  type TextSpan,
  updateBlockText,
  writeBlockTree,
  writeBlockTreePartial,
} from "../crdt/crdtSchema";
import { computeDirtyInfo } from "../dirty/dirtyInfo";
import { pmDocToBlockTree } from "../projection/projection";
import type { LoroRuntime } from "../runtime/loroRuntime";
import { validateRange } from "../utils/unicode";

export const BRIDGE_ORIGIN_META = "lfcc-bridge-origin" as const;
export const LFCC_STRUCTURAL_META = "lfcc-structural" as const;
export type BridgeOrigin = "pm" | "loro";

export type ApplyPmTransactionResult = {
  path: "fast_text" | "text_batch" | "reorder_only" | "structural_partial" | "structural_full";
  opCodes: string[];
  touchedBlocks: string[];
};

const CONTAINER_NODE_NAMES = new Set(["quote", "table", "table_row", "table_cell", "message"]);

/** Extract block ID from a PM node if it has one */
function getBlockId(node: PMNode): string | null {
  const blockId = node.attrs?.block_id;
  return typeof blockId === "string" && blockId.trim() !== "" ? blockId : null;
}

/** Extract RichText from PM node's inline content */
function extractRichTextFromNode(node: PMNode): RichText {
  const richText: RichText = [];

  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child.isText && child.text) {
      const marks: TextSpan["marks"] = child.marks.map((mark) => {
        const attrs: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(mark.attrs)) {
          if (value !== null && value !== undefined && value !== "") {
            attrs[key] = value;
          }
        }
        return {
          type: mark.type.name as MarkType,
          ...(Object.keys(attrs).length > 0 ? { attrs } : {}),
        };
      });

      richText.push({
        text: child.text,
        ...(marks.length > 0 ? { marks } : {}),
      });
    } else if (child.type.name === "hard_break") {
      if (richText.length > 0) {
        richText[richText.length - 1].text += "\n";
      } else {
        richText.push({ text: "\n" });
      }
    }
  }

  return richText;
}

/**
 * Validate step type for fast path
 */
function isValidStepType(stepType: string): boolean {
  return stepType === "replace" || stepType === "addMark" || stepType === "removeMark";
}

function isTextOnlyOps(opCodes: string[]): boolean {
  if (opCodes.length === 0) {
    return false;
  }
  return opCodes.every((code) => code === "OP_TEXT_EDIT" || code === "OP_MARK_EDIT");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b)
    );
    return `{${entries
      .map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * Check if slice contains only text nodes (no structural changes)
 */
function isTextOnlySlice(slice: { content?: Array<{ type?: string }> } | undefined): boolean {
  if (!slice?.content) {
    return true;
  }
  return !slice.content.some((n) => n.type && n.type !== "text" && n.type !== "hard_break");
}

/** Check if this is a text-only edit within a single block */
function tryFastPath(tr: Transaction): {
  blockId: string;
  stepType: string;
  beforeText: string;
  afterText: string;
  richText: RichText;
} | null {
  // Must have exactly one step
  if (tr.steps.length !== 1) {
    return null;
  }

  const step = tr.steps[0];
  const json = step.toJSON?.() as Record<string, unknown> | undefined;
  if (!json) {
    return null;
  }

  const stepType = json.stepType as string;

  // Only handle replace and mark steps
  if (!isValidStepType(stepType)) {
    return null;
  }

  const from = json.from as number;
  const to = json.to as number;

  // DEFECT-001: UTF-16 Surrogate Pair Guard - Validate edit range
  if (stepType === "replace") {
    const beforeText = tr.before.textBetween(from, to);
    const validation = validateRange(beforeText, 0, beforeText.length);
    if (!validation.valid) {
      // Fail-closed: Reject operation if range splits surrogate pairs
      return null; // Fall back to full sync which will handle validation
    }
  }

  // Resolve positions in the BEFORE doc
  const $from = tr.before.resolve(from);
  const $to = tr.before.resolve(to);

  // Must be in the same textblock
  if (!$from.sameParent($to) || !$from.parent.isTextblock) {
    return null;
  }

  const blockNode = $from.parent;
  const blockId = getBlockId(blockNode);
  if (!blockId) {
    return null;
  }

  // For replace steps, check if slice contains block nodes (structural change)
  if (stepType === "replace") {
    const slice = json.slice as { content?: Array<{ type?: string }> } | undefined;
    if (!isTextOnlySlice(slice)) {
      return null;
    }
  }

  // Find the updated block in the AFTER doc
  const blockPos = $from.before($from.depth);
  const afterBlockNode = tr.doc.nodeAt(blockPos);
  if (!afterBlockNode || getBlockId(afterBlockNode) !== blockId) {
    return null;
  }

  const beforeText = blockNode.textContent;
  const afterText = afterBlockNode.textContent;
  const richText = extractRichTextFromNode(afterBlockNode);
  const hasMarks = richText.some((span) => span.marks && span.marks.length > 0);

  return {
    blockId,
    stepType,
    beforeText,
    afterText,
    richText: hasMarks ? richText : [],
  };
}

function collectLeafTextBlocks(doc: PMNode): Map<string, PMNode> {
  const blocks = new Map<string, PMNode>();
  doc.descendants((node) => {
    if (!node.isTextblock) {
      return true;
    }
    const blockId = getBlockId(node);
    if (blockId) {
      blocks.set(blockId, node);
    }
    return true;
  });
  return blocks;
}

function leafBlocksUnchanged(before: PMNode, after: PMNode): boolean {
  const beforeBlocks = collectLeafTextBlocks(before);
  const afterBlocks = collectLeafTextBlocks(after);
  if (beforeBlocks.size !== afterBlocks.size) {
    return false;
  }

  for (const [blockId, beforeNode] of beforeBlocks) {
    const afterNode = afterBlocks.get(blockId);
    if (!afterNode || !beforeNode.eq(afterNode)) {
      return false;
    }
  }

  return true;
}

type ContainerMeta = {
  type: string;
  attrsKey: string;
  childIds: string[];
};

function collectContainerMeta(doc: PMNode): Map<string, ContainerMeta> | null {
  const containers = new Map<string, ContainerMeta>();
  let invalid = false;

  doc.descendants((node) => {
    if (invalid) {
      return false;
    }
    if (!CONTAINER_NODE_NAMES.has(node.type.name)) {
      return true;
    }

    const blockId = getBlockId(node);
    if (!blockId) {
      invalid = true;
      return false;
    }

    const childIds: string[] = [];
    for (let i = 0; i < node.childCount; i += 1) {
      const child = node.child(i);
      if (!child.isBlock || child.type.name === "doc") {
        continue;
      }
      const childId = getBlockId(child);
      if (!childId) {
        invalid = true;
        return false;
      }
      childIds.push(childId);
    }

    containers.set(blockId, {
      type: node.type.name,
      attrsKey: stableStringify(node.attrs),
      childIds,
    });
    return true;
  });

  return invalid ? null : containers;
}

function tryBatchTextUpdate(
  tr: Transaction,
  runtime: LoroRuntime,
  originTag: string,
  touchedBlocks: string[],
  opCodes: string[]
): ApplyPmTransactionResult | null {
  if (touchedBlocks.length === 0) {
    return null;
  }

  const beforeBlocks = collectLeafTextBlocks(tr.before);
  const afterBlocks = collectLeafTextBlocks(tr.doc);

  for (const blockId of touchedBlocks) {
    const beforeNode = beforeBlocks.get(blockId);
    const afterNode = afterBlocks.get(blockId);
    if (!beforeNode || !afterNode) {
      return null;
    }

    const beforeText = beforeNode.textContent;
    const afterText = afterNode.textContent;
    const validation = validateRange(afterText, 0, afterText.length);
    if (!validation.valid) {
      throw new Error(
        `UTF-16 validation failed: ${validation.error ?? "Text contains invalid surrogate pairs"}`
      );
    }

    const richText = extractRichTextFromNode(afterNode);
    const hasMarks = richText.some((span) => span.marks && span.marks.length > 0);
    const textDelta = computeTextDelta(beforeText, afterText);
    updateBlockText(runtime.doc, blockId, afterText, hasMarks ? richText : undefined, {
      textDelta: textDelta ?? undefined,
      expectedText: beforeText,
    });
  }

  runtime.commit(originTag);
  return {
    path: "text_batch",
    opCodes,
    touchedBlocks,
  };
}

function hasAttributeChanges(before: PMNode, after: PMNode, touchedBlocks: string[]): boolean {
  if (touchedBlocks.length === 0) {
    return false;
  }

  const beforeBlocks = collectLeafTextBlocks(before);
  const afterBlocks = collectLeafTextBlocks(after);

  for (const blockId of touchedBlocks) {
    const beforeNode = beforeBlocks.get(blockId);
    const afterNode = afterBlocks.get(blockId);
    if (!beforeNode || !afterNode) {
      continue;
    }
    if (stableStringify(beforeNode.attrs) !== stableStringify(afterNode.attrs)) {
      return true;
    }
  }

  return false;
}

function tryReorderContainers(
  tr: Transaction,
  runtime: LoroRuntime,
  originTag: string,
  opCodes: string[],
  touchedBlocks: string[]
): ApplyPmTransactionResult | null {
  if (!leafBlocksUnchanged(tr.before, tr.doc)) {
    return null;
  }

  const beforeContainers = collectContainerMeta(tr.before);
  const afterContainers = collectContainerMeta(tr.doc);
  if (!beforeContainers || !afterContainers) {
    return null;
  }
  if (beforeContainers.size !== afterContainers.size) {
    return null;
  }

  for (const [blockId, beforeMeta] of beforeContainers) {
    const afterMeta = afterContainers.get(blockId);
    if (!afterMeta) {
      return null;
    }
    if (beforeMeta.type !== afterMeta.type || beforeMeta.attrsKey !== afterMeta.attrsKey) {
      return null;
    }
  }

  const rootBlocks = collectRootBlocks(tr.doc);
  if (!rootBlocks) {
    return null;
  }

  syncRootBlockOrder(
    runtime.doc,
    rootBlocks.map((entry) => entry.blockId)
  );
  for (const [blockId, meta] of afterContainers) {
    syncBlockChildrenOrder(runtime.doc, blockId, meta.childIds);
  }
  runtime.commit(originTag);
  return {
    path: "reorder_only",
    opCodes,
    touchedBlocks,
  };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex PM transaction processing
export function applyPmTransactionToLoro(
  tr: Transaction,
  runtime: LoroRuntime,
  originTag: string
): ApplyPmTransactionResult | null {
  if (!tr.docChanged) {
    return null;
  }

  const origin = tr.getMeta(BRIDGE_ORIGIN_META) as BridgeOrigin | undefined;
  if (origin === "loro") {
    return null;
  }
  const forceStructural = tr.getMeta(LFCC_STRUCTURAL_META) === true;

  // Try fast path for text-only edits
  const fastPathResult = forceStructural ? null : tryFastPath(tr);
  if (fastPathResult) {
    // DEFECT-001: UTF-16 Surrogate Pair Guard - Validate text before updating
    const validation = validateRange(fastPathResult.afterText, 0, fastPathResult.afterText.length);
    if (!validation.valid) {
      // Fail-closed: Reject operation if text contains invalid surrogate pairs
      throw new Error(
        `UTF-16 validation failed: ${validation.error ?? "Text contains invalid surrogate pairs"}`
      );
    }

    const textDelta = computeTextDelta(fastPathResult.beforeText, fastPathResult.afterText);
    updateBlockText(
      runtime.doc,
      fastPathResult.blockId,
      fastPathResult.afterText,
      fastPathResult.richText.length > 0 ? fastPathResult.richText : undefined,
      {
        textDelta: textDelta ?? undefined,
        expectedText: fastPathResult.beforeText,
      }
    );
    runtime.commit(originTag);
    return {
      path: "fast_text",
      opCodes: [fastPathResult.stepType === "replace" ? "OP_TEXT_EDIT" : "OP_MARK_EDIT"],
      touchedBlocks: [fastPathResult.blockId],
    };
  }

  const dirtyInfo = computeDirtyInfo(tr);
  const opCodeSet = new Set(dirtyInfo.opCodes);
  if (isTextOnlyOps(dirtyInfo.opCodes)) {
    const attrChanged = hasAttributeChanges(tr.before, tr.doc, dirtyInfo.touchedBlocks);
    if (!attrChanged && !forceStructural) {
      const batchResult = tryBatchTextUpdate(
        tr,
        runtime,
        originTag,
        dirtyInfo.touchedBlocks,
        dirtyInfo.opCodes
      );
      if (batchResult) {
        return batchResult;
      }
    }
  }
  const isReorderCandidate = opCodeSet.has("OP_REORDER");

  if (isReorderCandidate) {
    const beforeBlocks = collectRootBlocks(tr.before);
    const afterBlocks = collectRootBlocks(tr.doc);
    if (beforeBlocks && afterBlocks) {
      const beforeIds = beforeBlocks.map((entry) => entry.blockId);
      const afterIds = afterBlocks.map((entry) => entry.blockId);
      const orderChanged =
        beforeIds.length !== afterIds.length ||
        beforeIds.some((id, index) => id !== afterIds[index]);

      if (orderChanged && rootBlocksUnchanged(beforeBlocks, afterBlocks)) {
        syncRootBlockOrder(runtime.doc, afterIds);
        runtime.commit(originTag);
        return {
          path: "reorder_only",
          opCodes: dirtyInfo.opCodes,
          touchedBlocks: dirtyInfo.touchedBlocks,
        };
      }
    }

    const containerReorder = tryReorderContainers(
      tr,
      runtime,
      originTag,
      dirtyInfo.opCodes,
      dirtyInfo.touchedBlocks
    );
    if (containerReorder) {
      return containerReorder;
    }
  }

  // Fall back to partial sync for structural changes
  // P2 FIX: Use computeDirtyInfo to scope updates to touched blocks only
  const blocks = pmDocToBlockTree(tr.doc);
  assertValidBlockTree(blocks);

  const touchedBlockIds = new Set(dirtyInfo.touchedBlocks);
  let path: ApplyPmTransactionResult["path"] = "structural_full";

  // If we have touched blocks info, use partial write; otherwise fall back to full
  if (touchedBlockIds.size > 0) {
    writeBlockTreePartial(runtime.doc, blocks, touchedBlockIds);
    path = "structural_partial";
  } else {
    // Fallback: full write if dirtyInfo is empty (e.g., unknown step types)
    writeBlockTree(runtime.doc, blocks);
  }

  runtime.commit(originTag);
  return {
    path,
    opCodes: dirtyInfo.opCodes,
    touchedBlocks: dirtyInfo.touchedBlocks,
  };
}

type RootBlockEntry = { blockId: string; node: PMNode };

function collectRootBlocks(doc: PMNode): RootBlockEntry[] | null {
  const entries: RootBlockEntry[] = [];
  for (let i = 0; i < doc.childCount; i += 1) {
    const child = doc.child(i);
    const blockId = getBlockId(child);
    if (!blockId) {
      return null;
    }
    entries.push({ blockId, node: child });
  }
  return entries;
}

function rootBlocksUnchanged(before: RootBlockEntry[], after: RootBlockEntry[]): boolean {
  if (before.length !== after.length) {
    return false;
  }

  const afterMap = new Map(after.map((entry) => [entry.blockId, entry.node]));
  for (const entry of before) {
    const nextNode = afterMap.get(entry.blockId);
    if (!nextNode || !entry.node.eq(nextNode)) {
      return false;
    }
  }

  return true;
}
