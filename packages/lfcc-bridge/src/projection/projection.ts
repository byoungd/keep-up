import type { LoroDoc } from "loro-crdt";
import type { Node as PMNode, Schema } from "prosemirror-model";

import {
  type BlockKind,
  type BlockNode,
  type MarkType,
  type RichText,
  type TextSpan,
  isContainerBlock,
  parseAttrs,
  readBlockTree,
  serializeAttrs,
} from "../crdt/crdtSchema";
import { pmSchema } from "../pm/pmSchema";

const SUPPORTED_BLOCK_TYPES: BlockKind[] = [
  "paragraph",
  "heading",
  "quote",
  "code",
  "horizontal_rule",
  "table",
  "table_row",
  "table_cell",
  "image",
  "video",
  "embed",
  "message",
];

const blockTypeSet = new Set<BlockKind>(SUPPORTED_BLOCK_TYPES);

function resolveBlockType(type: string): BlockKind {
  if (type === "code_block") {
    return "code";
  }
  if (type === "horizontalRule") {
    return "horizontal_rule";
  }
  if (type === "image") {
    return "image";
  }
  if (type === "video") {
    return "video";
  }
  if (type === "embed") {
    return "embed";
  }
  if (type === "message") {
    return "message";
  }
  return blockTypeSet.has(type as BlockKind) ? (type as BlockKind) : "paragraph";
}

function textToInlineNodes(text: string, schema: Schema): PMNode[] {
  if (!text) {
    return [];
  }

  const parts = text.split("\n");
  const nodes: PMNode[] = [];
  parts.forEach((part, index) => {
    if (part.length > 0) {
      nodes.push(schema.text(part));
    }
    if (index < parts.length - 1) {
      nodes.push(schema.nodes.hard_break.create());
    }
  });

  return nodes;
}

function textToTextNodes(text: string, schema: Schema): PMNode[] {
  if (!text) {
    return [];
  }

  return [schema.text(text)];
}

/** Convert RichText spans to PM inline nodes with marks */
function richTextToInlineNodes(richText: RichText, schema: Schema): PMNode[] {
  if (!richText || richText.length === 0) {
    return [];
  }

  const nodes: PMNode[] = [];

  for (const span of richText) {
    if (!span.text) {
      continue;
    }

    // Handle newlines within spans
    const parts = span.text.split("\n");
    parts.forEach((part, index) => {
      if (part.length > 0) {
        // Build PM marks from stored marks
        const pmMarks = (span.marks ?? [])
          .map((m) => {
            const markType = schema.marks[m.type];
            if (!markType) {
              return null;
            }
            return markType.create(m.attrs ?? {});
          })
          .filter((m): m is NonNullable<typeof m> => m !== null);

        nodes.push(schema.text(part, pmMarks));
      }
      if (index < parts.length - 1) {
        nodes.push(schema.nodes.hard_break.create());
      }
    });
  }

  return nodes;
}

/** Extract RichText from a PM node's inline content */
function extractRichText(node: PMNode): RichText {
  const richText: RichText = [];

  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child.isText && child.text) {
      const marks: TextSpan["marks"] = child.marks.map((mark) => {
        const attrs: Record<string, unknown> = {};
        // Only include non-empty attrs (e.g., link href)
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
      // Append newline to last span or create new
      if (richText.length > 0) {
        richText[richText.length - 1].text += "\n";
      } else {
        richText.push({ text: "\n" });
      }
    }
  }

  return richText;
}

/** Get inline nodes from block, preferring richText over plain text */
function getInlineContent(block: BlockNode, schema: Schema): PMNode[] {
  if (block.richText && block.richText.length > 0) {
    return richTextToInlineNodes(block.richText, schema);
  }
  return textToInlineNodes(block.text ?? "", schema);
}

/**
 * Convert a single Loro BlockNode to a ProseMirror Node.
 * Exported for incremental sync operations.
 */
// Helper functions to reduce cognitive complexity of blockToPmNode

function createHeadingNode(
  block: BlockNode,
  schema: Schema,
  baseAttrs: { block_id: string; attrs: unknown }
): PMNode {
  const parsed = parseAttrs(block.attrs);
  const level = typeof parsed.level === "number" ? parsed.level : 1;
  return schema.nodes.heading.create({ ...baseAttrs, level }, getInlineContent(block, schema));
}

function createParagraphNode(
  block: BlockNode,
  schema: Schema,
  baseAttrs: { block_id: string; attrs: unknown }
): PMNode {
  const parsed = parseAttrs(block.attrs);
  // Include list attributes for flat block architecture
  const listAttrs = {
    list_type: parsed.list_type ?? null,
    indent_level: typeof parsed.indent_level === "number" ? parsed.indent_level : 0,
    task_checked: parsed.task_checked === true,
  };
  return schema.nodes.paragraph.create(
    { ...baseAttrs, ...listAttrs },
    getInlineContent(block, schema)
  );
}

function createTableNode(
  block: BlockNode,
  schema: Schema,
  baseAttrs: { block_id: string; attrs: unknown },
  type: "table" | "table_row" | "table_cell"
): PMNode {
  const children = block.children.map((child) => blockToPmNode(child, schema));

  if (type === "table") {
    return schema.nodes.table.create(baseAttrs, children);
  }

  if (type === "table_row") {
    return schema.nodes.table_row.create(baseAttrs, children);
  }

  // table_cell
  const parsed = parseAttrs(block.attrs);
  return schema.nodes.table_cell.create(
    {
      ...baseAttrs,
      colspan: typeof parsed.colspan === "number" ? parsed.colspan : 1,
      rowspan: typeof parsed.rowspan === "number" ? parsed.rowspan : 1,
      colwidth: Array.isArray(parsed.colwidth) ? parsed.colwidth : null,
      background: parsed.background ?? null,
    },
    children
  );
}

function createMediaNode(
  block: BlockNode,
  schema: Schema,
  baseAttrs: { block_id: string; attrs: unknown },
  type: "image" | "video" | "embed"
): PMNode {
  const parsed = parseAttrs(block.attrs);

  if (type === "image") {
    return schema.nodes.image.create({
      ...baseAttrs,
      src: parsed.src ?? "",
      alt: parsed.alt ?? "",
      title: parsed.title ?? "",
    });
  }

  if (type === "video") {
    return schema.nodes.video.create({
      ...baseAttrs,
      src: parsed.src ?? "",
      controls: parsed.controls !== false, // Default to true
      title: parsed.title ?? "",
    });
  }

  // embed
  return schema.nodes.embed.create({
    ...baseAttrs,
    src: parsed.src ?? "",
    caption: parsed.caption ?? "",
  });
}

function createMessageNode(
  block: BlockNode,
  schema: Schema,
  baseAttrs: { block_id: string; attrs: unknown }
): PMNode {
  const parsed = parseAttrs(block.attrs);
  const role = typeof parsed.role === "string" ? parsed.role : "assistant";
  const messageId = typeof parsed.message_id === "string" ? parsed.message_id : block.id;
  const timestamp = typeof parsed.timestamp === "number" ? parsed.timestamp : 0;
  const streaming = parsed.streaming === true;
  const model = typeof parsed.model === "string" ? parsed.model : null;

  const children =
    block.children.length > 0
      ? block.children.map((child) => blockToPmNode(child, schema))
      : [
          schema.nodes.paragraph.create({
            block_id: `${block.id}_content`,
            attrs: serializeAttrs({}),
          }),
        ];

  return schema.nodes.message.create(
    {
      ...baseAttrs,
      role,
      message_id: messageId,
      timestamp,
      streaming,
      model,
    },
    children
  );
}

/**
 * Convert a single Loro BlockNode to a ProseMirror Node.
 * Exported for incremental sync operations.
 */
export function blockToPmNode(block: BlockNode, schema: Schema): PMNode {
  const baseAttrs = {
    block_id: block.id,
    attrs: block.attrs,
  };

  switch (block.type) {
    case "heading":
      return createHeadingNode(block, schema, baseAttrs);

    case "paragraph":
      return createParagraphNode(block, schema, baseAttrs);

    case "quote":
      return schema.nodes.quote.create(
        baseAttrs,
        block.children.map((child) => blockToPmNode(child, schema))
      );

    case "code":
      return schema.nodes.code_block.create(baseAttrs, textToTextNodes(block.text ?? "", schema));

    case "horizontal_rule":
      return schema.nodes.horizontalRule.create(baseAttrs);

    case "table":
    case "table_row":
    case "table_cell":
      return createTableNode(block, schema, baseAttrs, block.type);

    case "image":
    case "video":
    case "embed":
      return createMediaNode(block, schema, baseAttrs, block.type);

    case "message":
      return createMessageNode(block, schema, baseAttrs);

    default:
      return schema.nodes.paragraph.create(baseAttrs, getInlineContent(block, schema));
  }
}

export function projectLoroToPm(doc: LoroDoc, schema: Schema = pmSchema): PMNode {
  const blocks = readBlockTree(doc);
  const blockNodes = blocks.map((block) => blockToPmNode(block, schema));
  return schema.nodes.doc.create(null, blockNodes);
}

function attrsFromPmNode(node: PMNode): string {
  const rawAttrs = node.attrs;

  // Start with existing serialized attrs if present
  let baseAttrs: Record<string, unknown> = {};
  if (typeof rawAttrs.attrs === "string") {
    baseAttrs = parseAttrs(rawAttrs.attrs);
  }
  const {
    list_type: _serializedListType,
    indent_level: _serializedIndentLevel,
    task_checked: _serializedTaskChecked,
    ...baseWithoutListAttrs
  } = baseAttrs;
  baseAttrs = baseWithoutListAttrs;

  // Extract non-standard attrs (excluding block_id and attrs)
  const { block_id, attrs, list_type, indent_level, task_checked, ...rest } = rawAttrs as Record<
    string,
    unknown
  >;

  // Merge list attrs if they're set (non-default values)
  const mergedAttrs = { ...baseAttrs, ...rest };

  // Only include list attrs if they have meaningful values
  if (list_type !== null && list_type !== undefined) {
    mergedAttrs.list_type = list_type;
  }
  if (typeof indent_level === "number" && indent_level > 0) {
    mergedAttrs.indent_level = indent_level;
  }
  if (list_type === "task" && task_checked === true) {
    mergedAttrs.task_checked = true;
  }

  // Clean up image/video attributes from serialized attrs if they exist as direct node props
  // We construct a new object to avoid 'delete' operator and mutation
  const { src, alt, title, controls, caption, ...cleanAttrs } = mergedAttrs as Record<
    string,
    unknown
  >;

  return serializeAttrs(cleanAttrs);
}

export function pmNodeToBlock(node: PMNode): BlockNode {
  const blockType = resolveBlockType(node.type.name);
  const blockId = typeof node.attrs.block_id === "string" ? node.attrs.block_id : "";
  const attrs = attrsFromPmNode(node);

  if (blockType === "image") {
    // Merge image attributes into serialized attrs for storage
    const currentAttrs = parseAttrs(attrs);
    const imageAttrs = {
      ...currentAttrs,
      src: node.attrs.src,
      alt: node.attrs.alt,
      title: node.attrs.title,
    };
    return {
      id: blockId,
      type: "image",
      attrs: serializeAttrs(imageAttrs),
      children: [],
    };
  }

  if (blockType === "video") {
    const currentAttrs = parseAttrs(attrs);
    const videoAttrs = {
      ...currentAttrs,
      src: node.attrs.src,
      controls: node.attrs.controls,
      title: node.attrs.title,
    };
    return {
      id: blockId,
      type: "video",
      attrs: serializeAttrs(videoAttrs),
      children: [],
    };
  }

  if (blockType === "embed") {
    const currentAttrs = parseAttrs(attrs);
    const embedAttrs = {
      ...currentAttrs,
      src: node.attrs.src,
      caption: node.attrs.caption,
    };
    return {
      id: blockId,
      type: "embed",
      attrs: serializeAttrs(embedAttrs),
      children: [],
    };
  }

  if (isContainerBlock(blockType)) {
    const children: BlockNode[] = [];
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (!child.isBlock || child.type.name === "doc") {
        continue;
      }
      children.push(pmNodeToBlock(child));
    }

    return {
      id: blockId,
      type: blockType,
      attrs,
      children,
    };
  }

  const richText = extractRichText(node);
  const hasMarks = richText.some((span) => span.marks && span.marks.length > 0);

  return {
    id: blockId,
    type: blockType,
    attrs,
    text: node.textContent,
    // Only include richText if there are marks to preserve
    ...(hasMarks ? { richText } : {}),
    children: [],
  };
}

export function pmDocToBlockTree(doc: PMNode): BlockNode[] {
  const blocks: BlockNode[] = [];
  for (let i = 0; i < doc.childCount; i++) {
    const child = doc.child(i);
    if (!child.isBlock || child.type.name === "doc") {
      continue;
    }
    blocks.push(pmNodeToBlock(child));
  }

  // P0 DEFENCE: Never return empty list for non-empty PM doc
  if (blocks.length === 0 && doc.childCount > 0) {
    throw new Error(
      `Failed to extract any blocks from PM doc with ${doc.childCount} children. Schema mismatch?`
    );
  }

  return blocks;
}

// ─────────────────────────────────────────────────────────────────────────────
// P1-1: Incremental Projection Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * P1-1: Incrementally update a PM document by replacing only specified blocks.
 * This is much faster than full re-projection for large documents.
 *
 * @param currentDoc - The current PM document
 * @param updatedBlocks - Map of blockId -> updated BlockNode
 * @param schema - PM schema to use
 * @returns New PM document with updated blocks, or null if incremental update not possible
 */
export function projectIncrementalUpdate(
  currentDoc: PMNode,
  updatedBlocks: Map<string, BlockNode>,
  schema: Schema = pmSchema
): PMNode | null {
  if (updatedBlocks.size === 0) {
    return currentDoc;
  }

  // Fast path: check if all updated blocks exist in current doc
  const children: PMNode[] = [];
  let hasChanges = false;

  for (let i = 0; i < currentDoc.childCount; i++) {
    const child = currentDoc.child(i);
    const blockId = child.attrs.block_id;

    if (typeof blockId === "string" && updatedBlocks.has(blockId)) {
      // Replace with updated block
      const updatedBlock = updatedBlocks.get(blockId);
      if (updatedBlock) {
        children.push(blockToPmNode(updatedBlock, schema));
        hasChanges = true;
      } else {
        children.push(child);
      }
    } else {
      children.push(child);
    }
  }

  if (!hasChanges) {
    return null; // No blocks were updated
  }

  return schema.nodes.doc.create(null, children);
}

/**
 * P1-1: Compute which blocks have changed between two Loro snapshots.
 * Uses block checksums for fast comparison.
 *
 * @param oldBlocks - Previous block tree
 * @param newBlocks - Current block tree
 * @returns Set of block IDs that have changed
 */
export function computeChangedBlockIds(
  oldBlocks: BlockNode[],
  newBlocks: BlockNode[]
): Set<string> {
  const changed = new Set<string>();

  // Build lookup maps
  const oldMap = new Map<string, BlockNode>();
  const collectBlocks = (blocks: BlockNode[], map: Map<string, BlockNode>) => {
    for (const block of blocks) {
      map.set(block.id, block);
      if (block.children.length > 0) {
        collectBlocks(block.children, map);
      }
    }
  };
  collectBlocks(oldBlocks, oldMap);

  // Compare new blocks against old
  const compareBlocks = (blocks: BlockNode[]) => {
    for (const block of blocks) {
      const oldBlock = oldMap.get(block.id);
      if (!oldBlock) {
        // New block
        changed.add(block.id);
      } else if (!blockEquals(oldBlock, block)) {
        // Changed block
        changed.add(block.id);
      }
      if (block.children.length > 0) {
        compareBlocks(block.children);
      }
    }
  };
  compareBlocks(newBlocks);

  // Check for deleted blocks
  const newMap = new Map<string, BlockNode>();
  collectBlocks(newBlocks, newMap);
  for (const [id] of oldMap) {
    if (!newMap.has(id)) {
      changed.add(id);
    }
  }

  return changed;
}

/**
 * P1-1: Fast equality check for two BlockNodes.
 * Compares type, text, attrs, and child count (not deep children equality).
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: P1-1 comparison logic requires multiple field checks
function blockEquals(a: BlockNode, b: BlockNode): boolean {
  if (a.type !== b.type) {
    return false;
  }
  if (a.text !== b.text) {
    return false;
  }
  if (a.attrs !== b.attrs) {
    return false;
  }
  if (a.children.length !== b.children.length) {
    return false;
  }
  // Compare richText if present
  if (a.richText && b.richText) {
    if (a.richText.length !== b.richText.length) {
      return false;
    }
    for (let i = 0; i < a.richText.length; i++) {
      const spanA = a.richText[i];
      const spanB = b.richText[i];
      if (spanA.text !== spanB.text) {
        return false;
      }
      if (JSON.stringify(spanA.marks) !== JSON.stringify(spanB.marks)) {
        return false;
      }
    }
  } else if (a.richText || b.richText) {
    return false;
  }
  // Compare child IDs only (not deep equality for performance)
  for (let i = 0; i < a.children.length; i++) {
    if (a.children[i].id !== b.children[i].id) {
      return false;
    }
  }
  return true;
}
