import type { DirtyInfo, DocumentBlockOrder, NeighborExpansionPolicy } from "@ku0/core";
import { DEFAULT_NEIGHBOR_EXPANSION_POLICY, expandTouchedBlocks } from "@ku0/core";
import type { Frontiers, LoroDoc } from "loro-crdt";
import type { Node as PMNode, ResolvedPos } from "prosemirror-model";
import type { Transaction } from "prosemirror-state";

export type DirtyInfoResult = {
  dirtyInfo: DirtyInfo;
  expandedBlocks: string[];
  structural: boolean;
  unknownSteps: string[];
};

export type TransactionClassification = {
  opCodes: string[];
  structural: boolean;
  unknownSteps: string[];
};

/** ProseMirror step JSON structure (partial) */
type StepJSON = {
  stepType?: string;
  from?: number;
  to?: number;
  slice?: {
    content?: Array<{ type?: string }>;
  };
};

type ChangedRange = { from: number; to: number };

export type ClassificationOptions = {
  strict?: boolean;
  assertStructural?: boolean;
};

const BLOCK_NODE_NAMES = new Set([
  "paragraph",
  "heading",
  "list",
  "list_item",
  "quote",
  "code_block",
  "horizontalRule",
  "table",
  "table_row",
  "table_cell",
]);

const LIST_CONTAINER_NAMES = new Set(["list"]);
const TABLE_CONTAINER_NAMES = new Set(["table"]);

const isBlockNode = (node: PMNode): boolean => {
  if (node.type.name === "doc") {
    return false;
  }

  const group = node.type.spec.group ?? "";
  return node.isBlock && group.split(" ").includes("block");
};

const isLeafTextBlock = (node: PMNode): boolean => node.isTextblock;

const hasBlockId = (node: PMNode): node is PMNode & { attrs: { block_id: string } } => {
  const blockId = node.attrs.block_id;
  return typeof blockId === "string" && blockId.trim() !== "";
};

const isBlockNodeName = (name: string | undefined): boolean => {
  if (!name) {
    return false;
  }
  return BLOCK_NODE_NAMES.has(name);
};

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortObject);
  }

  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortObject((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }

  return value;
}

function buildStructuralSignature(doc: PMNode): string {
  const entries: Array<{
    depth: number;
    type: string;
    attrs?: Record<string, unknown>;
  }> = [];

  const walk = (node: PMNode, depth: number) => {
    if (node.type.name === "doc") {
      entries.push({ depth, type: "doc" });
    } else if (!isBlockNode(node)) {
      return;
    } else {
      const attrs = sortObject(node.attrs ?? {}) as Record<string, unknown>;
      entries.push({ depth, type: node.type.name, attrs });
    }

    // Iterate children using node.child() - preferred over forEach for linting
    for (let i = 0; i < node.childCount; i++) {
      walk(node.child(i), depth + 1);
    }
  };

  walk(doc, 0);
  return JSON.stringify(entries);
}

function detectStructuralChange(before: PMNode, after: PMNode): boolean {
  return buildStructuralSignature(before) !== buildStructuralSignature(after);
}

const sliceContainsBlockNodes = (slice: StepJSON["slice"]): boolean => {
  if (!slice || !Array.isArray(slice.content)) {
    return false;
  }

  return slice.content.some((node) => isBlockNodeName(node?.type));
};

function getChangedRange(tr: Transaction): ChangedRange | null {
  const start = tr.before.content.findDiffStart(tr.doc.content);
  if (start == null) {
    return null;
  }

  const end = tr.before.content.findDiffEnd(tr.doc.content);
  const endPos = end ? end.b : start;
  return { from: start, to: endPos };
}

function normalizeRange(range: ChangedRange, docSize: number): ChangedRange | null {
  let { from, to } = range;
  if (from > to) {
    [from, to] = [to, from];
  }
  const clampedFrom = Math.max(0, Math.min(from, docSize));
  const clampedTo = Math.max(0, Math.min(to, docSize));
  return { from: clampedFrom, to: clampedTo };
}

function mergeRanges(ranges: ChangedRange[]): ChangedRange[] {
  if (ranges.length === 0) {
    return [];
  }

  const sorted = [...ranges].sort((a, b) => a.from - b.from || a.to - b.to);
  const merged: ChangedRange[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];
    if (current.from <= last.to) {
      last.to = Math.max(last.to, current.to);
    } else {
      merged.push(current);
    }
  }

  return merged;
}

function safeResolve(doc: PMNode, pos: number): ResolvedPos | null {
  if (pos < 0 || pos > doc.content.size) {
    return null;
  }
  try {
    return doc.resolve(pos);
  } catch {
    return null;
  }
}

function collectChangedRanges(tr: Transaction): ChangedRange[] {
  if (tr.steps.length === 0) {
    return [];
  }

  const ranges: ChangedRange[] = [];

  // P0 FIX: Also analyze steps directly for attribute-only or markup changes
  // which might not report ranges in stepMap.forEach
  for (let i = 0; i < tr.steps.length; i++) {
    const step = tr.steps[i];
    const map = tr.mapping.maps[i];
    const mapAfter = tr.mapping.slice(i + 1);

    let stepTouched = false;
    map.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      stepTouched = true;
      const mappedFrom = mapAfter.map(newStart, -1);
      const mappedTo = mapAfter.map(newEnd, 1);
      const normalized = normalizeRange({ from: mappedFrom, to: mappedTo }, tr.doc.content.size);
      if (normalized) {
        ranges.push(normalized);
      }
    });

    // If stepMap.forEach was empty (e.g. AttrStep, MarkStep), use step's JSON to find pos
    if (!stepTouched) {
      const json = step.toJSON() as { from?: number; to?: number; pos?: number };
      const from = json.from ?? json.pos;
      const to = json.to ?? from;

      if (typeof from === "number" && typeof to === "number") {
        const start = mapAfter.map(from, -1);
        const end = mapAfter.map(to, 1);
        ranges.push({ from: start, to: end });
      }
    }
  }

  return mergeRanges(ranges);
}

type LeafTextBlock = {
  node: PMNode;
  pos: number;
  blockId: string;
};

function findLeafTextBlock($pos: ResolvedPos): LeafTextBlock | null {
  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth);
    if (!isBlockNode(node) || !isLeafTextBlock(node) || !hasBlockId(node)) {
      continue;
    }
    return { node, pos: $pos.before(depth), blockId: node.attrs.block_id };
  }

  return null;
}

function addTouchedRange(
  ranges: Array<{ blockId: string; start: number; end: number }>,
  block: LeafTextBlock,
  from: number,
  to: number
): void {
  const contentStart = block.pos + 1;
  const contentEnd = block.pos + block.node.content.size;
  const rangeStart = Math.max(from, contentStart);
  const rangeEnd = Math.min(to, contentEnd);

  if (rangeEnd <= rangeStart) {
    return;
  }

  ranges.push({
    blockId: block.blockId,
    start: rangeStart - contentStart,
    end: rangeEnd - contentStart,
  });
}

function addTouchedRangeAtPosition(
  ranges: Array<{ blockId: string; start: number; end: number }>,
  doc: PMNode,
  pos: number
): void {
  const block = findLeafTextBlock(doc.resolve(pos));
  if (!block) {
    return;
  }

  const contentStart = block.pos + 1;
  const maxOffset = block.node.content.size;
  const offset = Math.max(0, Math.min(pos - contentStart, maxOffset));

  ranges.push({
    blockId: block.blockId,
    start: offset,
    end: offset,
  });
}

function collectTouchedRanges(
  doc: PMNode,
  ranges: ChangedRange[]
): Array<{ blockId: string; start: number; end: number }> {
  const touched: Array<{ blockId: string; start: number; end: number }> = [];

  for (const range of ranges) {
    if (range.from === range.to) {
      addTouchedRangeAtPosition(touched, doc, range.from);
      continue;
    }

    const fromBlock = findLeafTextBlock(doc.resolve(range.from));
    const toBlock = findLeafTextBlock(doc.resolve(range.to));

    if (fromBlock && toBlock && fromBlock.blockId === toBlock.blockId) {
      addTouchedRange(touched, fromBlock, range.from, range.to);
      continue;
    }

    doc.nodesBetween(range.from, range.to, (node, pos) => {
      if (!isBlockNode(node) || !isLeafTextBlock(node) || !hasBlockId(node)) {
        return;
      }

      addTouchedRange(touched, { node, pos, blockId: node.attrs.block_id }, range.from, range.to);
    });
  }

  return touched;
}

export function collectContentBlockOrder(doc: PMNode): DocumentBlockOrder {
  const contentBlockIds: string[] = [];
  const blockMeta: Record<string, { listDepth: number; tableDepth: number }> = {};

  const walk = (node: PMNode, listDepth: number, tableDepth: number) => {
    const nextListDepth = listDepth + (LIST_CONTAINER_NAMES.has(node.type.name) ? 1 : 0);
    const nextTableDepth = tableDepth + (TABLE_CONTAINER_NAMES.has(node.type.name) ? 1 : 0);

    if (isBlockNode(node) && isLeafTextBlock(node) && hasBlockId(node)) {
      const blockId = node.attrs.block_id;
      contentBlockIds.push(blockId);
      blockMeta[blockId] = { listDepth: nextListDepth, tableDepth: nextTableDepth };
    }

    for (let i = 0; i < node.childCount; i++) {
      walk(node.child(i), nextListDepth, nextTableDepth);
    }
  };

  walk(doc, 0, 0);

  return { contentBlockIds };
}

/** Classification state accumulated during step analysis */
type ClassificationState = {
  opCodes: Set<string>;
  unknownSteps: string[];
  structural: boolean;
  forceFullScan: boolean;
};

/** Result of classifying a single step */
type StepClassification = {
  opCode: string | null;
  structural: boolean;
  unknown: boolean;
};

/**
 * Classify a single ProseMirror step
 */
function classifyStep(step: { toJSON?: () => unknown }, docBeforeStep: PMNode): StepClassification {
  const json = step.toJSON?.() as StepJSON | undefined;
  const stepType = json?.stepType;

  // Unknown step type
  if (!stepType) {
    return { opCode: null, structural: true, unknown: true };
  }

  // Mark operations are never structural
  if (stepType === "addMark" || stepType === "removeMark") {
    return { opCode: "OP_MARK_EDIT", structural: false, unknown: false };
  }

  // Replace operations need deeper analysis
  if (stepType === "replace" || stepType === "replaceAround") {
    return classifyReplaceStep(json, docBeforeStep);
  }

  // Unknown step type
  return { opCode: null, structural: true, unknown: true };
}

/**
 * Classify a replace/replaceAround step
 */
function classifyReplaceStep(
  json: StepJSON | undefined,
  docBeforeStep: PMNode
): StepClassification {
  const slice = json?.slice;
  const sliceHasBlocks = sliceContainsBlockNodes(slice);
  const from = typeof json?.from === "number" ? json.from : null;
  const to = typeof json?.to === "number" ? json.to : null;

  if (from == null || to == null) {
    return { opCode: null, structural: true, unknown: true };
  }

  // Check if edit is within a single textblock
  const $from = safeResolve(docBeforeStep, from);
  const $to = safeResolve(docBeforeStep, to);
  if (!$from || !$to) {
    return { opCode: null, structural: true, unknown: true };
  }
  const sameTextblock = $from.sameParent($to) && $from.parent.isTextblock;

  if (sameTextblock && !sliceHasBlocks) {
    return { opCode: "OP_TEXT_EDIT", structural: false, unknown: false };
  }

  // Structural change detected
  if (sliceHasBlocks) {
    const opCode = from === to ? "OP_BLOCK_SPLIT" : "OP_PASTE";
    return { opCode, structural: true, unknown: false };
  }

  if (from !== to && slice?.content?.length === 0) {
    return { opCode: "OP_BLOCK_JOIN", structural: true, unknown: false };
  }

  // Fallback: unknown structural change
  return { opCode: null, structural: true, unknown: true };
}

/**
 * Analyze step-by-step and accumulate classification state
 */
function analyzeSteps(tr: Transaction): ClassificationState {
  const state: ClassificationState = {
    opCodes: new Set<string>(),
    unknownSteps: [],
    structural: false,
    forceFullScan: false,
  };

  // History operations always require full scan
  if (tr.getMeta("history")) {
    state.opCodes.add("OP_HISTORY_RESTORE");
    state.opCodes.add("OP_IMMUTABLE_REWRITE");
    state.forceFullScan = true;
  }

  const stepDocs = (tr as unknown as { docs?: PMNode[] }).docs;

  for (let i = 0; i < tr.steps.length; i++) {
    const step = tr.steps[i];
    const docBeforeStep = stepDocs?.[i] ?? tr.before;
    const result = classifyStep(step, docBeforeStep);

    if (result.unknown) {
      state.unknownSteps.push("unknown");
      state.structural = true;
      state.forceFullScan = true;
    } else if (result.opCode) {
      state.opCodes.add(result.opCode);
    }

    if (result.structural) {
      state.structural = true;
      state.forceFullScan = true;
    }
  }

  return state;
}

/**
 * Fast block count (O(N) but avoids full order tracking overhead)
 */
function countContentBlocks(doc: PMNode): number {
  let count = 0;
  doc.nodesBetween(0, doc.content.size, (node) => {
    if (isBlockNode(node) && isLeafTextBlock(node) && hasBlockId(node)) {
      count++;
    }
    return true;
  });
  return count;
}

/**
 * Analyze block structure changes (optimized slow path)
 * Uses fast count check first to avoid full order comparison when possible.
 */
function analyzeBlockStructure(tr: Transaction, state: ClassificationState): void {
  // Fast path: Check block count delta first
  const beforeCount = countContentBlocks(tr.before);
  const afterCount = countContentBlocks(tr.doc);

  if (afterCount > beforeCount) {
    state.opCodes.add("OP_BLOCK_SPLIT");
    state.structural = true;
    // No need for full order comparison - we know it's a split
    return;
  }

  if (afterCount < beforeCount) {
    state.opCodes.add("OP_BLOCK_JOIN");
    state.structural = true;
    // No need for full order comparison - we know it's a join
    return;
  }

  // Slow path: counts are equal, need full order comparison for potential reorder
  const beforeOrder = collectContentBlockOrder(tr.before).contentBlockIds;
  const afterOrder = collectContentBlockOrder(tr.doc).contentBlockIds;

  if (detectReorder(beforeOrder, afterOrder)) {
    state.opCodes.add("OP_REORDER");
    state.structural = true;
  }

  // Add immutable rewrite if structural but no specific op
  const hasNonTextOp = Array.from(state.opCodes).some((code) => code !== "OP_TEXT_EDIT");
  if (state.structural && !hasNonTextOp) {
    state.opCodes.add("OP_IMMUTABLE_REWRITE");
  }
}

/**
 * Validate classification results against options
 */
function validateClassification(
  tr: Transaction,
  state: ClassificationState,
  options: ClassificationOptions
): void {
  if (options.assertStructural) {
    const structuralScan = detectStructuralChange(tr.before, tr.doc);
    if (structuralScan && !state.structural) {
      throw new Error("Structural change missed by classifier");
    }
  }

  if (options.strict && state.unknownSteps.length > 0) {
    throw new Error(`Unknown transaction patterns: ${state.unknownSteps.join(", ")}`);
  }
}

/**
 * Classify a ProseMirror transaction into operation codes
 *
 * @param tr - The transaction to classify
 * @param options - Classification options
 * @returns Classification result with opCodes, structural flag, and unknown steps
 */
export function classifyTransaction(
  tr: Transaction,
  options: ClassificationOptions = {}
): TransactionClassification {
  // Early return for no-change transactions
  if (!tr.docChanged) {
    return { opCodes: [], structural: false, unknownSteps: [] };
  }

  // Step 1: Analyze all steps
  const state = analyzeSteps(tr);

  // Step 2: Fast path - if no structural changes detected, skip block analysis
  if (!state.forceFullScan && !state.structural && state.unknownSteps.length === 0) {
    return {
      opCodes: Array.from(state.opCodes),
      structural: false,
      unknownSteps: [],
    };
  }

  // Step 3: Slow path - analyze block structure changes
  analyzeBlockStructure(tr, state);

  // Step 4: Validate results
  validateClassification(tr, state, options);

  return {
    opCodes: Array.from(state.opCodes),
    structural: state.structural,
    unknownSteps: state.unknownSteps,
  };
}

function detectReorder(before: string[], after: string[]): boolean {
  if (before.length === 0 || before.length !== after.length) {
    return false;
  }

  const beforeSet = new Set(before);
  if (beforeSet.size !== after.length) {
    return false;
  }

  for (const id of after) {
    if (!beforeSet.has(id)) {
      return false;
    }
  }

  // S-02 FIX: Use JSON.stringify for safe comparison
  // Old: before.join("|") !== after.join("|")
  // New: JSON string comparison ensures no delimiter collision
  return JSON.stringify(before) !== JSON.stringify(after);
}

export function computeDirtyInfo(tr: Transaction): DirtyInfo {
  if (!tr.docChanged) {
    return { opCodes: [], touchedBlocks: [] };
  }

  const classification = classifyTransaction(tr);
  let ranges = collectChangedRanges(tr);

  if (ranges.length === 0) {
    const fallback = getChangedRange(tr);
    if (!fallback) {
      return { opCodes: classification.opCodes, touchedBlocks: [] };
    }
    ranges = [fallback];
  }

  const touchedRanges = collectTouchedRanges(tr.doc, ranges);
  const touchedBlocks = Array.from(new Set(touchedRanges.map((entry) => entry.blockId)));

  return {
    opCodes: classification.opCodes,
    touchedBlocks,
    touchedRanges,
  };
}

export function computeDirtyInfoWithPolicy(
  tr: Transaction,
  order: DocumentBlockOrder,
  policy: NeighborExpansionPolicy = DEFAULT_NEIGHBOR_EXPANSION_POLICY,
  options: ClassificationOptions = {}
): DirtyInfoResult {
  const classification = classifyTransaction(tr, options);
  const dirtyInfo = computeDirtyInfo(tr);
  const expandedBlocks = expandTouchedBlocks(dirtyInfo.touchedBlocks, order, policy);

  return {
    dirtyInfo,
    expandedBlocks,
    structural: classification.structural,
    unknownSteps: classification.unknownSteps,
  };
}

export function diffLoroContainers(doc: LoroDoc, from: Frontiers, to: Frontiers): string[] {
  const diffs = doc.diff(from, to, true);
  return diffs.map(([containerId]) => String(containerId));
}
