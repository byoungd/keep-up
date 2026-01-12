/**
 * LFCC Conformance Kit - Real Adapters
 *
 * Uses the actual Loro + Shadow + Canonicalizer paths.
 */

import {
  type CanonInputNode,
  type CanonNode,
  type ShadowBlock,
  type ShadowDocument,
  applyOp,
  canonicalizeDocument,
  createShadowDocument,
  stableStringifyCanon,
} from "@keepup/core";
import {
  type BlockNode,
  type LoroRuntime,
  createEmptyDoc,
  createLoroRuntime,
  ensureBlockMap,
  getRootBlocks,
  parseAttrs,
  readBlockTree,
  updateBlockText,
} from "@keepup/lfcc-bridge";
import type { FuzzOp } from "../../op-fuzzer/types";
import type {
  AdapterFactory,
  ApplyResult,
  BlockInfo,
  CanonicalizerAdapter,
  LoroAdapter,
  MarkInfo,
  ShadowAdapter,
} from "../types";

const DEFAULT_BLOCK_IDS = ["block-1", "block-2", "block-3"];
const DEFAULT_BLOCK_TEXTS = ["Hello world", "This is a test document", "With multiple paragraphs"];
const LORO_PEER_ID = 1;
const SHADOW_PEER_ID = 2;

const EMPTY_MARKS: MarkInfo[] = [];

function createSequentialIdGenerator(
  prefix: string,
  startAt: number
): {
  next: () => string;
  reset: (nextId: number) => void;
} {
  let nextId = startAt;
  return {
    next: () => `${prefix}${nextId++}`,
    reset: (value: number) => {
      nextId = value;
    },
  };
}

function nextIdFromExisting(ids: string[], prefix: string, fallback: number): number {
  let max = fallback - 1;
  for (const id of ids) {
    if (!id.startsWith(prefix)) {
      continue;
    }
    const suffix = Number.parseInt(id.slice(prefix.length), 10);
    if (!Number.isNaN(suffix)) {
      max = Math.max(max, suffix);
    }
  }
  return max + 1;
}

function coerceAttrs(attrs: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (typeof value === "string") {
      result[key] = value;
    } else if (typeof value === "number" || typeof value === "boolean") {
      result[key] = String(value);
    }
  }
  return result;
}

function mapBlockTypeToTag(type: string): string {
  switch (type) {
    case "paragraph":
      return "p";
    case "heading":
      return "h1";
    case "list":
      return "ul";
    case "list_item":
    case "listItem":
      return "li";
    case "quote":
      return "blockquote";
    case "code":
    case "code_block":
      return "pre";
    case "table":
      return "table";
    case "table_row":
      return "tr";
    case "table_cell":
      return "td";
    default:
      return "p";
  }
}

function mapTagToBlockType(tag: string, _attrs: Record<string, string>): string | null {
  switch (tag.toLowerCase()) {
    case "doc":
      return "document";
    case "p":
    case "div":
      return "paragraph";
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6":
      return "heading";
    case "ul":
    case "ol":
      return "list";
    case "li":
      return "list_item";
    case "table":
      return "table";
    case "tr":
      return "table_row";
    case "td":
    case "th":
      return "table_cell";
    case "blockquote":
      return "quote";
    case "pre":
      return "code_block";
    default:
      return null;
  }
}

function buildTextChildren(text: string | undefined): CanonInputNode[] {
  if (!text) {
    return [];
  }
  return [{ kind: "text", text }];
}

function blockNodeToCanon(block: BlockNode): CanonInputNode {
  const attrs = coerceAttrs(parseAttrs(block.attrs));
  const children = block.children.map(blockNodeToCanon);

  return {
    kind: "element",
    tag: mapBlockTypeToTag(block.type),
    attrs,
    children: children.length > 0 ? children : buildTextChildren(block.text),
  };
}

function shadowBlockToCanon(
  doc: ShadowDocument,
  blockId: string,
  visited: Set<string>
): CanonInputNode | null {
  if (visited.has(blockId)) {
    return null;
  }
  const block = doc.blocks.get(blockId);
  if (!block) {
    return null;
  }

  visited.add(blockId);
  const attrs = coerceAttrs(block.attrs ?? {});
  const children = block.children_ids
    .map((childId) => shadowBlockToCanon(doc, childId, visited))
    .filter((child): child is CanonInputNode => !!child);

  return {
    kind: "element",
    tag: mapBlockTypeToTag(block.type),
    attrs,
    children: children.length > 0 ? children : buildTextChildren(block.text),
  };
}

function shadowDocToCanonInput(doc: ShadowDocument): CanonInputNode {
  const visited = new Set<string>();
  const children = doc.block_order
    .map((blockId) => shadowBlockToCanon(doc, blockId, visited))
    .filter((child): child is CanonInputNode => !!child);

  return {
    kind: "element",
    tag: "doc",
    attrs: {},
    children,
  };
}

function loroDocToCanonInput(runtime: LoroRuntime): CanonInputNode {
  const blocks = readBlockTree(runtime.doc);
  const children = blocks.map(blockNodeToCanon);

  return {
    kind: "element",
    tag: "doc",
    attrs: {},
    children,
  };
}

function createShadowDocWithIds(blockIds: string[], texts: string[]): ShadowDocument {
  const base = createShadowDocument();
  const blocks = new Map(base.blocks);
  const order: string[] = [];

  for (let i = 0; i < blockIds.length; i++) {
    const id = blockIds[i];
    const text = texts[i] ?? "";
    const block: ShadowBlock = {
      id,
      type: "paragraph",
      attrs: {},
      text,
      parent_id: base.root_id,
      children_ids: [],
    };
    blocks.set(id, block);
    order.push(id);
  }

  const root = blocks.get(base.root_id);
  if (root) {
    blocks.set(base.root_id, { ...root, children_ids: [...order] });
  }

  return {
    ...base,
    blocks,
    block_order: order,
  };
}

function isContentBlock(type: string): boolean {
  return ["paragraph", "heading", "list_item", "code", "quote", "table_cell"].includes(type);
}

function shadowDocFromBlockTree(blocks: BlockNode[]): ShadowDocument {
  const base = createShadowDocument();
  const blockMap = new Map(base.blocks);
  const blockOrder: string[] = [];

  const addNode = (node: BlockNode, parentId: string | null): void => {
    const attrs = parseAttrs(node.attrs);
    const block: ShadowBlock = {
      id: node.id,
      type: node.type,
      attrs,
      text: node.text,
      parent_id: parentId,
      children_ids: node.children.map((child) => child.id),
    };
    blockMap.set(node.id, block);

    if (isContentBlock(node.type)) {
      blockOrder.push(node.id);
    }

    for (const child of node.children) {
      addNode(child, node.id);
    }
  };

  for (const node of blocks) {
    addNode(node, base.root_id);
  }

  const root = blockMap.get(base.root_id);
  if (root) {
    blockMap.set(base.root_id, {
      ...root,
      children_ids: blocks.map((block) => block.id),
    });
  }

  return {
    ...base,
    blocks: blockMap,
    block_order: blockOrder,
  };
}

function mapApplyResult(success: boolean, error?: string): ApplyResult {
  return success ? { success: true } : { success: false, error: error ?? "unknown error" };
}

export class RealLoroAdapter implements LoroAdapter {
  private runtime: LoroRuntime;
  private idGenerator = createSequentialIdGenerator("block-", DEFAULT_BLOCK_IDS.length + 1);

  constructor() {
    this.runtime = createLoroRuntime({ peerId: LORO_PEER_ID });
    this.bootstrapBlocks(DEFAULT_BLOCK_IDS, DEFAULT_BLOCK_TEXTS);
  }

  loadSnapshot(bytes: Uint8Array): void {
    this.runtime = createLoroRuntime({ peerId: LORO_PEER_ID });
    this.runtime.importBytes(bytes);
    this.resetIdGeneratorFromDoc();
  }

  getRuntime(): LoroRuntime {
    return this.runtime;
  }

  exportSnapshot(): Uint8Array {
    return this.runtime.exportSnapshot();
  }

  applyOp(op: FuzzOp): ApplyResult {
    switch (op.type) {
      case "InsertText":
        return this.applyTextEdit(op.blockId, op.offset, 0, op.text);
      case "DeleteText":
        return this.applyTextEdit(op.blockId, op.offset, op.length, "");
      case "SplitBlock":
        return this.splitBlock(op.blockId, op.offset);
      case "JoinWithPrev":
        return this.joinWithPrev(op.blockId);
      case "ReorderBlock":
        return this.reorderBlock(op.blockId, op.targetIndex);
      default:
        return { success: true };
    }
  }

  getFrontierTag(): string {
    return JSON.stringify(this.runtime.frontiers);
  }

  getBlockIds(): string[] {
    const root = getRootBlocks(this.runtime.doc);
    return root.toArray().filter((id): id is string => typeof id === "string");
  }

  getBlock(blockId: string): BlockInfo | null {
    const map = ensureBlockMap(this.runtime.doc, blockId);
    const typeValue = map.get("type");
    const type = typeof typeValue === "string" ? typeValue : "paragraph";

    const textLength = this.getTextLength(blockId);
    const childrenContainer = map.get("children");
    const childIds =
      childrenContainer && typeof childrenContainer === "object" && "toArray" in childrenContainer
        ? (childrenContainer as { toArray: () => unknown[] })
            .toArray()
            .filter((id): id is string => typeof id === "string")
        : [];

    return {
      id: blockId,
      type,
      textLength,
      parentId: null,
      childIds,
      marks: EMPTY_MARKS,
    };
  }

  getTextLength(blockId: string): number {
    const map = ensureBlockMap(this.runtime.doc, blockId);
    const textContainer = map.get("text");
    if (textContainer && typeof textContainer === "object" && "toString" in textContainer) {
      return String(textContainer.toString()).length;
    }
    return 0;
  }

  private bootstrapBlocks(blockIds: string[], texts: string[]): void {
    const root = getRootBlocks(this.runtime.doc);
    for (let i = 0; i < blockIds.length; i++) {
      const id = blockIds[i];
      const text = texts[i] ?? "";
      root.insert(i, id);
      const map = ensureBlockMap(this.runtime.doc, id);
      map.set("type", "paragraph");
      map.set("attrs", JSON.stringify({}));
      updateBlockText(this.runtime.doc, id, text);
    }

    createEmptyDoc(this.runtime.doc);
    this.resetIdGeneratorFromDoc();
  }

  private resetIdGeneratorFromDoc(): void {
    const ids = this.getBlockIds();
    const nextId = nextIdFromExisting(ids, "block-", DEFAULT_BLOCK_IDS.length + 1);
    this.idGenerator.reset(nextId);
  }

  private applyTextEdit(
    blockId: string,
    offset: number,
    deleteCount: number,
    insert: string
  ): ApplyResult {
    const map = ensureBlockMap(this.runtime.doc, blockId);
    const textContainer = map.get("text");
    const current =
      textContainer && typeof textContainer === "object" && "toString" in textContainer
        ? String(textContainer.toString())
        : "";

    if (offset < 0 || offset > current.length) {
      return mapApplyResult(false, "offset out of bounds");
    }

    const safeDelete = Math.min(deleteCount, current.length - offset);
    const next = current.slice(0, offset) + insert + current.slice(offset + safeDelete);
    updateBlockText(this.runtime.doc, blockId, next);
    return mapApplyResult(true);
  }

  private splitBlock(blockId: string, offset: number): ApplyResult {
    const currentLength = this.getTextLength(blockId);
    if (offset < 0 || offset > currentLength) {
      return mapApplyResult(false, "offset out of bounds");
    }

    const map = ensureBlockMap(this.runtime.doc, blockId);
    const textContainer = map.get("text");
    const current =
      textContainer && typeof textContainer === "object" && "toString" in textContainer
        ? String(textContainer.toString())
        : "";

    const leftText = current.slice(0, offset);
    const rightText = current.slice(offset);
    const newId = this.idGenerator.next();

    const root = getRootBlocks(this.runtime.doc);
    const ids = root.toArray().filter((id): id is string => typeof id === "string");
    const idx = ids.indexOf(blockId);
    if (idx === -1) {
      return mapApplyResult(false, "block not in root list");
    }

    root.insert(idx + 1, newId);
    const newMap = ensureBlockMap(this.runtime.doc, newId);
    newMap.set("type", map.get("type") ?? "paragraph");
    newMap.set("attrs", map.get("attrs") ?? JSON.stringify({}));
    updateBlockText(this.runtime.doc, blockId, leftText);
    updateBlockText(this.runtime.doc, newId, rightText);

    return mapApplyResult(true);
  }

  private joinWithPrev(blockId: string): ApplyResult {
    const root = getRootBlocks(this.runtime.doc);
    const ids = root.toArray().filter((id): id is string => typeof id === "string");
    const idx = ids.indexOf(blockId);
    if (idx <= 0) {
      return mapApplyResult(false, "no previous block");
    }

    const prevId = ids[idx - 1];
    const prevTextLength = this.getTextLength(prevId);
    const prevMap = ensureBlockMap(this.runtime.doc, prevId);
    const prevTextContainer = prevMap.get("text");
    const prevText =
      prevTextContainer && typeof prevTextContainer === "object" && "toString" in prevTextContainer
        ? String(prevTextContainer.toString())
        : "";

    const currentMap = ensureBlockMap(this.runtime.doc, blockId);
    const currentTextContainer = currentMap.get("text");
    const currentText =
      currentTextContainer &&
      typeof currentTextContainer === "object" &&
      "toString" in currentTextContainer
        ? String(currentTextContainer.toString())
        : "";

    updateBlockText(this.runtime.doc, prevId, prevText + currentText);
    root.delete(idx, 1);

    if (prevTextLength === 0 && currentText.length === 0) {
      return mapApplyResult(true);
    }

    return mapApplyResult(true);
  }

  private reorderBlock(blockId: string, targetIndex: number): ApplyResult {
    const root = getRootBlocks(this.runtime.doc);
    const ids = root.toArray().filter((id): id is string => typeof id === "string");
    const idx = ids.indexOf(blockId);
    if (idx === -1) {
      return mapApplyResult(false, "block not found");
    }
    const nextIndex = Math.max(0, Math.min(targetIndex, ids.length - 1));
    if (idx !== nextIndex) {
      root.move(idx, nextIndex);
    }
    return mapApplyResult(true);
  }
}

export class RealShadowAdapter implements ShadowAdapter {
  private doc: ShadowDocument;
  private idGenerator = createSequentialIdGenerator("block-", DEFAULT_BLOCK_IDS.length + 1);

  constructor() {
    this.doc = createShadowDocWithIds(DEFAULT_BLOCK_IDS, DEFAULT_BLOCK_TEXTS);
  }

  getDoc(): ShadowDocument {
    return this.doc;
  }

  loadSnapshot(bytes: Uint8Array): void {
    const runtime = createLoroRuntime({ peerId: SHADOW_PEER_ID });
    runtime.importBytes(bytes);
    const blocks = readBlockTree(runtime.doc);
    this.doc = shadowDocFromBlockTree(blocks);

    const nextId = nextIdFromExisting(this.getBlockIds(), "block-", DEFAULT_BLOCK_IDS.length + 1);
    this.idGenerator.reset(nextId);
  }

  exportSnapshot(): Uint8Array {
    const json = JSON.stringify({
      blocks: Array.from(this.doc.blocks.entries()),
      blockOrder: this.doc.block_order,
      rootId: this.doc.root_id,
    });
    return new TextEncoder().encode(json);
  }

  applyOp(op: FuzzOp): ApplyResult {
    switch (op.type) {
      case "InsertText":
        return this.applyTextEdit(op.blockId, op.offset, 0, op.text);
      case "DeleteText":
        return this.applyTextEdit(op.blockId, op.offset, op.length, "");
      case "SplitBlock":
        return this.splitBlock(op.blockId, op.offset);
      case "JoinWithPrev":
        return this.joinWithPrev(op.blockId);
      case "ReorderBlock":
        return this.reorderBlock(op.blockId, op.targetIndex);
      default:
        return { success: true };
    }
  }

  getBlockIds(): string[] {
    return [...this.doc.block_order];
  }

  getBlock(blockId: string): BlockInfo | null {
    const block = this.doc.blocks.get(blockId);
    if (!block) {
      return null;
    }
    return {
      id: block.id,
      type: block.type,
      textLength: block.text?.length ?? 0,
      parentId: block.parent_id,
      childIds: [...block.children_ids],
      marks: EMPTY_MARKS,
    };
  }

  getTextLength(blockId: string): number {
    return this.doc.blocks.get(blockId)?.text?.length ?? 0;
  }

  private applyTextEdit(
    blockId: string,
    offset: number,
    deleteCount: number,
    insert: string
  ): ApplyResult {
    const op = {
      code: "OP_TEXT_EDIT",
      block_id: blockId,
      offset,
      delete_count: deleteCount,
      insert,
    } as const;

    const result = applyOp(this.doc, op);
    this.doc = result.doc;
    return { success: true };
  }

  private splitBlock(blockId: string, offset: number): ApplyResult {
    const block = this.doc.blocks.get(blockId);
    if (!block) {
      return mapApplyResult(false, "block not found");
    }
    const text = block.text ?? "";
    if (offset < 0 || offset > text.length) {
      return mapApplyResult(false, "offset out of bounds");
    }

    const leftText = text.slice(0, offset);
    const rightText = text.slice(offset);
    const newId = this.idGenerator.next();

    const newBlocks = new Map(this.doc.blocks);
    newBlocks.set(blockId, { ...block, text: leftText });

    const newBlock: ShadowBlock = {
      id: newId,
      type: block.type,
      attrs: { ...block.attrs },
      text: rightText,
      parent_id: block.parent_id,
      children_ids: [],
    };
    newBlocks.set(newId, newBlock);

    const order = [...this.doc.block_order];
    const idx = order.indexOf(blockId);
    if (idx === -1) {
      return mapApplyResult(false, "block not in order");
    }
    order.splice(idx + 1, 0, newId);

    const root = newBlocks.get(this.doc.root_id);
    if (root) {
      newBlocks.set(this.doc.root_id, {
        ...root,
        children_ids: [...order],
      });
    }

    this.doc = {
      ...this.doc,
      blocks: newBlocks,
      block_order: order,
    };

    return mapApplyResult(true);
  }

  private joinWithPrev(blockId: string): ApplyResult {
    const order = [...this.doc.block_order];
    const idx = order.indexOf(blockId);
    if (idx <= 0) {
      return mapApplyResult(false, "no previous block");
    }

    const op = {
      code: "OP_BLOCK_JOIN",
      left_block_id: order[idx - 1],
      right_block_id: blockId,
    } as const;

    const result = applyOp(this.doc, op);
    this.doc = result.doc;
    return { success: true };
  }

  private reorderBlock(blockId: string, targetIndex: number): ApplyResult {
    const order = [...this.doc.block_order];
    const idx = order.indexOf(blockId);
    if (idx === -1) {
      return mapApplyResult(false, "block not in order");
    }

    const nextIndex = Math.max(0, Math.min(targetIndex, order.length - 1));
    order.splice(idx, 1);
    order.splice(nextIndex, 0, blockId);

    const blocks = new Map(this.doc.blocks);
    const root = blocks.get(this.doc.root_id);
    if (root) {
      blocks.set(this.doc.root_id, { ...root, children_ids: [...order] });
    }

    this.doc = {
      ...this.doc,
      blocks,
      block_order: order,
    };

    return mapApplyResult(true);
  }
}

export class RealCanonicalizerAdapter implements CanonicalizerAdapter {
  canonicalizeFromLoro(loro: LoroAdapter): CanonNode {
    const adapter = loro as RealLoroAdapter;
    const input = loroDocToCanonInput(adapter.getRuntime());
    return canonicalizeDocument({ root: input, mapTagToBlockType }).root;
  }

  canonicalizeFromShadow(shadow: ShadowAdapter): CanonNode {
    const adapter = shadow as RealShadowAdapter;
    const input = shadowDocToCanonInput(adapter.getDoc());
    return canonicalizeDocument({ root: input, mapTagToBlockType }).root;
  }

  // Convenience for debugging
  stableStringify(node: CanonNode): string {
    return stableStringifyCanon(node);
  }
}

export class RealAdapterFactory implements AdapterFactory {
  createLoroAdapter(): LoroAdapter {
    return new RealLoroAdapter();
  }

  createShadowAdapter(): ShadowAdapter {
    return new RealShadowAdapter();
  }

  createCanonicalizerAdapter(): CanonicalizerAdapter {
    return new RealCanonicalizerAdapter();
  }
}
