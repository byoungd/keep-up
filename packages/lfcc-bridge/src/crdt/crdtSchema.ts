import { observability } from "@ku0/core";
import { type LoroDoc, LoroList, type LoroMap, LoroMovableList, LoroText } from "loro-crdt";
import { validateRange } from "../utils/unicode";

const logger = observability.getLogger();

export type BlockKind =
  | "paragraph"
  | "heading"
  | "quote"
  | "code"
  | "horizontal_rule"
  | "table"
  | "table_row"
  | "table_cell"
  | "image"
  | "video"
  | "embed"
  | "message";

/** List types for flat block architecture */
export type ListType = "bullet" | "ordered" | "task" | null;

/** Standard block attributes for list behavior */
export interface FlatListAttrs {
  list_type?: ListType;
  indent_level?: number; // 0-6
  task_checked?: boolean; // only for task type
}

/** Mark types supported in rich text */
export type MarkType = "bold" | "italic" | "underline" | "strike" | "code" | "link";

/** A single text span with optional marks */
export type TextSpan = {
  text: string;
  marks?: Array<{ type: MarkType; attrs?: Record<string, unknown> }>;
};

/** Rich text content as an array of spans */
export type RichText = TextSpan[];

export type TextDelta = {
  start: number;
  deleteCount: number;
  insertText: string;
};

export type UpdateTextOptions = {
  textDelta?: TextDelta;
  expectedText?: string;
};

export type BlockNode = {
  id: string;
  type: BlockKind;
  attrs: string;
  /** Plain text for backward compat, prefer richText */
  text?: string;
  /** Rich text spans with marks */
  richText?: RichText;
  children: BlockNode[];
};

export const ROOT_BLOCKS_KEY = "blocks";
export const ROOT_META_KEY = "meta";
const BLOCK_SEQ_KEY = "block_seq";
const BLOCK_PREFIX = "block:";

const CONTAINER_BLOCKS = new Set<BlockKind>([
  "quote",
  "table",
  "table_row",
  "table_cell",
  "message",
]);

export function isContainerBlock(kind: BlockKind): boolean {
  return CONTAINER_BLOCKS.has(kind);
}

export function isLeafBlock(kind: BlockKind): boolean {
  return !isContainerBlock(kind);
}

export function blockKey(blockId: string): string {
  return `${BLOCK_PREFIX}${blockId}`;
}

export function getRootBlocks(doc: LoroDoc): LoroMovableList {
  return doc.getMovableList(ROOT_BLOCKS_KEY);
}

export function getMetaMap(doc: LoroDoc): LoroMap {
  return doc.getMap(ROOT_META_KEY);
}

export function nextBlockId(doc: LoroDoc): string {
  const meta = getMetaMap(doc);
  const current = meta.get(BLOCK_SEQ_KEY);
  const next = typeof current === "number" ? current + 1 : 1;
  meta.set(BLOCK_SEQ_KEY, next);
  return `b_${doc.peerIdStr}_${next}`;
}

// ============================================================================
// Schema Versioning
// ============================================================================

const SCHEMA_VERSION_KEY = "schema_version";
/** Current schema version. V2 uses LoroList for RichText. */
export const CURRENT_SCHEMA_VERSION = 2;

/**
 * Get the schema version from document meta.
 * Returns 1 (V1) if not set (legacy docs).
 */
export function getSchemaVersion(doc: LoroDoc): number {
  const meta = getMetaMap(doc);
  const version = meta.get(SCHEMA_VERSION_KEY);
  return typeof version === "number" ? version : 1;
}

/**
 * Set the schema version in document meta.
 */
export function setSchemaVersion(doc: LoroDoc, version: number): void {
  const meta = getMetaMap(doc);
  meta.set(SCHEMA_VERSION_KEY, version);
}

export function serializeAttrs(value: Record<string, unknown>): string {
  return JSON.stringify(sortObject(value));
}

export function parseAttrs(value: string | undefined): Record<string, unknown> {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return {};
  }

  return {};
}

function setMapValueIfChanged(map: LoroMap, key: string, value: string): void {
  const current = map.get(key);
  if (current !== value) {
    map.set(key, value);
  }
}

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortObject);
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    return entries
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .reduce<Record<string, unknown>>((acc, [key, val]) => {
        acc[key] = sortObject(val);
        return acc;
      }, {});
  }

  return value;
}

export function createEmptyDoc(doc: LoroDoc): string {
  const root = getRootBlocks(doc);
  if (root.length > 0) {
    const existing = root.toArray()[0];
    return typeof existing === "string" ? existing : nextBlockId(doc);
  }

  const blockId = nextBlockId(doc);
  root.insert(0, blockId);
  const block = ensureBlockMap(doc, blockId);
  block.set("type", "paragraph");
  block.set("attrs", serializeAttrs({}));
  const text = block.getOrCreateContainer("text", new LoroText());
  if (text.length > 0) {
    text.delete(0, text.length);
  }
  block.getOrCreateContainer("children", new LoroMovableList());
  return blockId;
}

export function ensureBlockMap(doc: LoroDoc, blockId: string): LoroMap {
  const map = doc.getMap(blockKey(blockId));
  map.getOrCreateContainer("text", new LoroText());
  map.getOrCreateContainer("children", new LoroMovableList());
  return map;
}

// ============================================================================
// P3 FIX: RichText V2 - LoroList-based storage for granular CRDT merging
// ============================================================================

const RICH_TEXT_V2_KEY = "richTextV2";
const RICH_TEXT_V1_KEY = "richText";

/**
 * P3: Write richText using LoroList for granular CRDT merging.
 * Each TextSpan is stored as a separate list item with { text, marks } structure.
 */
export function writeRichTextV2(map: LoroMap, richText: RichText | undefined): void {
  // Always delete V1 on write to migrate forward
  map.delete(RICH_TEXT_V1_KEY);

  if (!richText || richText.length === 0) {
    // Clear V2 container if empty
    const existing = map.get(RICH_TEXT_V2_KEY);
    if (existing) {
      map.delete(RICH_TEXT_V2_KEY);
    }
    return;
  }

  // Get or create V2 container
  const spansContainer = map.getOrCreateContainer(RICH_TEXT_V2_KEY, new LoroList());

  // Clear existing spans
  const currentLength = spansContainer.length;
  if (currentLength > 0) {
    for (let i = currentLength - 1; i >= 0; i--) {
      spansContainer.delete(i, 1);
    }
  }

  // Write each span as a JSON string (LoroList items must be primitives or containers)
  for (const span of richText) {
    spansContainer.push(JSON.stringify(span));
  }
}

type RichTextDiff = {
  start: number;
  deleteCount: number;
  insertSpans: RichText;
};

function normalizeMarkAttrs(
  attrs: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!attrs) {
    return undefined;
  }
  return sortObject(attrs) as Record<string, unknown>;
}

function normalizeTextSpan(span: TextSpan): TextSpan {
  if (!span.marks || span.marks.length === 0) {
    return { text: span.text };
  }

  const marks = span.marks
    .map((mark) => ({
      type: mark.type,
      ...(mark.attrs ? { attrs: normalizeMarkAttrs(mark.attrs) } : {}),
    }))
    .sort((a, b) => a.type.localeCompare(b.type));

  return { text: span.text, ...(marks.length > 0 ? { marks } : {}) };
}

function spanKey(span: TextSpan): string {
  return JSON.stringify(normalizeTextSpan(span));
}

export function diffRichTextSpans(before: RichText, after: RichText): RichTextDiff | null {
  if (before.length === 0 && after.length === 0) {
    return null;
  }

  const beforeKeys = before.map(spanKey);
  const afterKeys = after.map(spanKey);

  if (
    beforeKeys.length === afterKeys.length &&
    beforeKeys.every((key, index) => key === afterKeys[index])
  ) {
    return null;
  }

  let start = 0;
  while (
    start < beforeKeys.length &&
    start < afterKeys.length &&
    beforeKeys[start] === afterKeys[start]
  ) {
    start += 1;
  }

  let endBefore = beforeKeys.length - 1;
  let endAfter = afterKeys.length - 1;
  while (endBefore >= start && endAfter >= start && beforeKeys[endBefore] === afterKeys[endAfter]) {
    endBefore -= 1;
    endAfter -= 1;
  }

  const deleteCount = endBefore >= start ? endBefore - start + 1 : 0;
  const insertSpans = after.slice(start, endAfter + 1);

  return { start, deleteCount, insertSpans };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: rich text migration logic
export function updateRichTextV2(map: LoroMap, richText: RichText | undefined): void {
  // Always delete V1 on write to migrate forward
  map.delete(RICH_TEXT_V1_KEY);

  if (!richText || richText.length === 0) {
    const existing = map.get(RICH_TEXT_V2_KEY);
    if (existing) {
      map.delete(RICH_TEXT_V2_KEY);
    }
    return;
  }

  const spansContainer = map.getOrCreateContainer(RICH_TEXT_V2_KEY, new LoroList());
  const currentItems = spansContainer.toArray();
  const currentSpans: RichText = [];
  let valid = true;

  for (const item of currentItems) {
    if (typeof item !== "string") {
      valid = false;
      break;
    }
    try {
      const parsed = JSON.parse(item) as TextSpan;
      if (parsed.text === undefined) {
        valid = false;
        break;
      }
      currentSpans.push(parsed);
    } catch {
      valid = false;
      break;
    }
  }

  if (!valid) {
    writeRichTextV2(map, richText);
    return;
  }

  const diff = diffRichTextSpans(currentSpans, richText);
  if (!diff) {
    return;
  }

  if (diff.deleteCount === currentSpans.length && diff.insertSpans.length === richText.length) {
    writeRichTextV2(map, richText);
    return;
  }

  if (diff.deleteCount > 0) {
    spansContainer.delete(diff.start, diff.deleteCount);
  }

  for (let i = 0; i < diff.insertSpans.length; i += 1) {
    spansContainer.insert(diff.start + i, JSON.stringify(diff.insertSpans[i]));
  }
}

/**
 * Read richText from V2 LoroList format.
 * V1 fallback removed - migration handles upgrade.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Rich text parsing requires nested validation
export function readRichText(map: LoroMap): RichText | undefined {
  const v2Container = map.get(RICH_TEXT_V2_KEY);
  if (v2Container && typeof v2Container === "object" && "toArray" in v2Container) {
    const loroList = v2Container as LoroList;
    const spans: RichText = [];
    for (const item of loroList.toArray()) {
      if (typeof item === "string") {
        try {
          const span = JSON.parse(item) as TextSpan;
          if (span.text !== undefined) {
            spans.push(span);
          }
        } catch {
          // Skip malformed spans
        }
      }
    }
    if (spans.length > 0) {
      return spans;
    }
  }

  return undefined;
}

/** @deprecated Use readRichText instead */
export const readRichTextV2 = readRichText;

// ============================================================================
// Schema Migration
// ============================================================================

/**
 * Migrate a document from schema V1 to V2.
 * Upgrades all RichText from V1 JSON format to V2 LoroList format.
 */
export function migrateToSchemaV2(doc: LoroDoc): void {
  const version = getSchemaVersion(doc);
  if (version >= CURRENT_SCHEMA_VERSION) {
    return; // Already migrated
  }

  const root = getRootBlocks(doc);
  const blockIds = root.toArray().filter((id): id is string => typeof id === "string");
  const seen = new Set<string>();

  for (const blockId of blockIds) {
    migrateBlockRichText(doc, blockId, seen);
  }

  setSchemaVersion(doc, CURRENT_SCHEMA_VERSION);
}

function migrateBlockRichText(doc: LoroDoc, blockId: string, seen: Set<string>): void {
  if (seen.has(blockId)) {
    return;
  }
  seen.add(blockId);

  const map = ensureBlockMap(doc, blockId);

  // Check for V1 data
  const v1Json = map.get(RICH_TEXT_V1_KEY);
  if (typeof v1Json === "string") {
    try {
      const parsed = JSON.parse(v1Json);
      if (Array.isArray(parsed)) {
        // Write to V2 format (this also deletes V1)
        writeRichTextV2(map, parsed as RichText);
      }
    } catch {
      // Invalid V1 data, just delete it
      map.delete(RICH_TEXT_V1_KEY);
    }
  }

  // Recurse into children
  const childrenContainer = map.getOrCreateContainer("children", new LoroMovableList());
  const childIds = childrenContainer.toArray().filter((id): id is string => typeof id === "string");
  for (const childId of childIds) {
    migrateBlockRichText(doc, childId, seen);
  }
}

export function readBlockTree(doc: LoroDoc): BlockNode[] {
  const root = getRootBlocks(doc);
  const ids = root.toArray().filter((id): id is string => typeof id === "string");
  const seen = new Set<string>();
  return ids.map((id) => readBlockNode(doc, id, seen)).filter(Boolean) as BlockNode[];
}

function readBlockNode(doc: LoroDoc, blockId: string, seen: Set<string>): BlockNode | null {
  if (seen.has(blockId)) {
    return null;
  }

  seen.add(blockId);
  const map = ensureBlockMap(doc, blockId);
  const typeValue = map.get("type");
  const attrsValue = map.get("attrs");
  const type = (typeof typeValue === "string" ? typeValue : "paragraph") as BlockKind;
  const attrs = typeof attrsValue === "string" ? attrsValue : serializeAttrs({});

  const textContainer = map.getOrCreateContainer("text", new LoroText());
  const childrenContainer = map.getOrCreateContainer("children", new LoroMovableList());

  const childrenIds = childrenContainer
    .toArray()
    .filter((id): id is string => typeof id === "string");

  const children = childrenIds
    .map((childId) => readBlockNode(doc, childId, seen))
    .filter(Boolean) as BlockNode[];

  /* P3 FIX: Read rich text from V2 (LoroList) with V1 fallback */
  const richText = readRichTextV2(map);

  return {
    id: blockId,
    type,
    attrs,
    text: isContainerBlock(type) ? undefined : textContainer.toString(),
    richText,
    children,
  };
}

export function writeBlockTree(doc: LoroDoc, blocks: BlockNode[]): void {
  const root = getRootBlocks(doc);
  const desiredIds = blocks.map((block) => block.id);
  syncMovableList(root, desiredIds);

  const visited = new Set<string>();
  for (const block of blocks) {
    writeBlockNode(doc, block, visited);
  }
}

type BlockIndex = {
  blockMap: Map<string, BlockNode>;
  parentMap: Map<string, string>;
};

function buildBlockIndex(blocks: BlockNode[]): BlockIndex {
  const blockMap = new Map<string, BlockNode>();
  const parentMap = new Map<string, string>();

  const walk = (node: BlockNode, parentId?: string) => {
    blockMap.set(node.id, node);
    if (parentId) {
      parentMap.set(node.id, parentId);
    }
    for (const child of node.children) {
      walk(child, node.id);
    }
  };

  for (const block of blocks) {
    walk(block);
  }

  return { blockMap, parentMap };
}

function expandAncestorIds(blockIds: Set<string>, parentMap: Map<string, string>): Set<string> {
  const expanded = new Set(blockIds);
  for (const id of blockIds) {
    let current = parentMap.get(id);
    while (current) {
      if (expanded.has(current)) {
        break;
      }
      expanded.add(current);
      current = parentMap.get(current);
    }
  }
  return expanded;
}

/**
 * P2 FIX: Partial block tree write for structural changes.
 * Only updates blocks in touchedBlockIds, reducing O(N) to O(K).
 * @param doc - Loro document
 * @param blocks - Full block tree (for order sync and lookup)
 * @param touchedBlockIds - Set of block IDs that were actually modified
 */
export function writeBlockTreePartial(
  doc: LoroDoc,
  blocks: BlockNode[],
  touchedBlockIds: Set<string>
): void {
  // Always sync root block order (handles insertions/deletions)
  const root = getRootBlocks(doc);
  const desiredIds = blocks.map((block) => block.id);
  syncMovableList(root, desiredIds);

  const { blockMap, parentMap } = buildBlockIndex(blocks);
  const structuralIds = expandAncestorIds(touchedBlockIds, parentMap);

  // Only write touched blocks and their ancestors
  const visited = new Set<string>();
  for (const blockId of structuralIds) {
    const block = blockMap.get(blockId);
    if (block) {
      writeBlockNodePartial(doc, block, visited, structuralIds);
    }
  }
}

function writeBlockNode(doc: LoroDoc, block: BlockNode, visited: Set<string>): void {
  if (visited.has(block.id)) {
    return;
  }

  visited.add(block.id);
  const map = ensureBlockMap(doc, block.id);
  setMapValueIfChanged(map, "type", block.type);
  setMapValueIfChanged(map, "attrs", block.attrs);

  const childrenContainer = map.getOrCreateContainer("children", new LoroMovableList());
  const childIds = block.children.map((child) => child.id);
  syncMovableList(childrenContainer, childIds);

  if (isLeafBlock(block.type)) {
    updateBlockText(doc, block.id, block.text ?? "", block.richText);
  }

  for (const child of block.children) {
    writeBlockNode(doc, child, visited);
  }
}

function writeBlockNodePartial(
  doc: LoroDoc,
  block: BlockNode,
  visited: Set<string>,
  allowedIds: Set<string>
): void {
  if (visited.has(block.id)) {
    return;
  }

  visited.add(block.id);
  const map = ensureBlockMap(doc, block.id);
  setMapValueIfChanged(map, "type", block.type);
  setMapValueIfChanged(map, "attrs", block.attrs);

  const childrenContainer = map.getOrCreateContainer("children", new LoroMovableList());
  const childIds = block.children.map((child) => child.id);
  syncMovableList(childrenContainer, childIds);

  if (isLeafBlock(block.type)) {
    updateBlockText(doc, block.id, block.text ?? "", block.richText);
  }

  for (const child of block.children) {
    if (allowedIds.has(child.id)) {
      writeBlockNodePartial(doc, child, visited, allowedIds);
    }
  }
}

export function validateBlockTree(blocks: BlockNode[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  const stack = new Set<string>();

  const visit = (block: BlockNode) => {
    if (block.id.trim() === "") {
      errors.push("Block id must be a non-empty string");
      return;
    }
    if (stack.has(block.id)) {
      errors.push(`Cycle detected at block ${block.id}`);
      return;
    }
    if (seen.has(block.id)) {
      errors.push(`Duplicate block id ${block.id}`);
      return;
    }
    seen.add(block.id);
    stack.add(block.id);
    for (const child of block.children) {
      visit(child);
    }
    stack.delete(block.id);
  };

  for (const block of blocks) {
    visit(block);
  }
  return errors;
}

export function assertValidBlockTree(blocks: BlockNode[]): void {
  const errors = validateBlockTree(blocks);
  if (errors.length > 0) {
    throw new Error(`Invalid block tree: ${errors.join("; ")}`);
  }
}

/**
 * Update only the text content of specific blocks (O(K) where K = number of changed blocks)
 * Use this for pure text edits to avoid full tree sync
 */
export function updateBlockText(
  doc: LoroDoc,
  blockId: string,
  text: string,
  richText?: RichText,
  options?: UpdateTextOptions
): void {
  const map = ensureBlockMap(doc, blockId);
  const textContainer = map.getOrCreateContainer("text", new LoroText());
  const currentText = textContainer.toString();
  const nextText = text ?? "";
  const expectedText = options?.expectedText;
  const delta =
    expectedText !== undefined && expectedText !== currentText
      ? computeTextDelta(currentText, nextText)
      : (options?.textDelta ?? computeTextDelta(currentText, nextText));

  if (delta) {
    const validation = validateRange(currentText, delta.start, delta.start + delta.deleteCount);
    if (validation.valid) {
      applyTextDelta(textContainer, delta);
    } else {
      applyTextUpdate(textContainer, nextText);
    }
  } else if (currentText !== nextText) {
    applyTextUpdate(textContainer, nextText);
  }

  // P3 FIX: Store richText using V2 LoroList-based format
  updateRichTextV2(map, richText);
}

/**
 * Batch update multiple blocks' text content
 * More efficient than writeBlockTree when only text changed
 */
export function updateBlocksText(
  doc: LoroDoc,
  updates: Array<{ blockId: string; text: string; richText?: RichText }>
): void {
  for (const { blockId, text, richText } of updates) {
    updateBlockText(doc, blockId, text, richText);
  }
}

export function computeTextDelta(before: string, after: string): TextDelta | null {
  if (before === after) {
    return null;
  }

  let start = 0;
  const beforeLen = before.length;
  const afterLen = after.length;

  while (start < beforeLen && start < afterLen && before[start] === after[start]) {
    start += 1;
  }

  let endBefore = beforeLen - 1;
  let endAfter = afterLen - 1;
  while (endBefore >= start && endAfter >= start && before[endBefore] === after[endAfter]) {
    endBefore -= 1;
    endAfter -= 1;
  }

  const deleteCount = endBefore >= start ? endBefore - start + 1 : 0;
  const insertText = after.slice(start, endAfter + 1);

  return { start, deleteCount, insertText };
}

function applyTextDelta(textContainer: LoroText, delta: TextDelta): void {
  const start = Math.min(Math.max(0, delta.start), textContainer.length);
  const deleteCount = Math.max(0, Math.min(delta.deleteCount, textContainer.length - start));

  if (deleteCount > 0) {
    textContainer.delete(start, deleteCount);
  }
  if (delta.insertText.length > 0) {
    textContainer.insert(start, delta.insertText);
  }
}

function applyTextUpdate(textContainer: LoroText, nextText: string): void {
  const len = textContainer.length;
  if (len > 0) {
    textContainer.delete(0, len);
  }
  if (nextText.length > 0) {
    textContainer.insert(0, nextText);
  }
}

export function syncRootBlockOrder(doc: LoroDoc, rootBlockIds: string[]): void {
  const root = getRootBlocks(doc);
  syncMovableList(root, rootBlockIds);
}

export function syncBlockChildrenOrder(doc: LoroDoc, blockId: string, childIds: string[]): void {
  const map = ensureBlockMap(doc, blockId);
  const children = map.getOrCreateContainer("children", new LoroMovableList());
  syncMovableList(children, childIds);
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: list sync algorithm
function syncMovableList(list: LoroMovableList, desired: string[]): void {
  const current = list.toArray().filter((id): id is string => typeof id === "string");
  if (current.length === desired.length) {
    let sameOrder = true;
    for (let i = 0; i < current.length; i += 1) {
      if (current[i] !== desired[i]) {
        sameOrder = false;
        break;
      }
    }
    if (sameOrder) {
      return;
    }
  }
  const desiredSet = new Set(desired);

  for (let i = current.length - 1; i >= 0; i -= 1) {
    if (!desiredSet.has(current[i])) {
      try {
        list.delete(i, 1);
        current.splice(i, 1);
      } catch (error) {
        logger.error(
          "mapping",
          "syncMovableList delete failed",
          error instanceof Error ? error : new Error(String(error)),
          { index: i, length: list.length }
        );
        throw error;
      }
    }
  }

  for (let index = 0; index < desired.length; index += 1) {
    const id = desired[index];
    const existingIndex = current.indexOf(id);

    if (existingIndex === -1) {
      try {
        list.insert(index, id);
        current.splice(index, 0, id);
      } catch (error) {
        logger.error(
          "mapping",
          "syncMovableList insert failed",
          error instanceof Error ? error : new Error(String(error)),
          { index, id, length: list.length }
        );
        throw error;
      }
      continue;
    }

    if (existingIndex !== index) {
      try {
        list.move(existingIndex, index);
        current.splice(index, 0, current.splice(existingIndex, 1)[0]);
      } catch (error) {
        logger.error(
          "mapping",
          "syncMovableList move failed",
          error instanceof Error ? error : new Error(String(error)),
          { from: existingIndex, to: index, length: list.length }
        );
        throw error;
      }
    }
  }
}
