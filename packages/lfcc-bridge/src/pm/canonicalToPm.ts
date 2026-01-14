import type { CanonBlock, CanonNode, CanonText } from "@keepup/core";
import { isCanonBlock, isCanonText } from "@keepup/core";
import {
  Fragment,
  type Mark,
  type NodeType,
  type Node as PMNode,
  type Schema,
} from "prosemirror-model";

import { type ListType, serializeAttrs } from "../crdt/crdtSchema";

export type CanonToPmResult = { ok: true; fragment: Fragment } | { ok: false; error: string };

type ConvertContext = {
  listType?: ListType;
};

const BLOCK_TYPE_MAP: Record<string, string> = {
  paragraph: "paragraph",
  heading: "heading",
  quote: "quote",
  code_block: "code_block",
  table: "table",
  table_row: "table_row",
  table_cell: "table_cell",
  list_item: "paragraph",
};

export function canonToPmFragment(canon: CanonNode, schema: Schema): CanonToPmResult {
  const nodes = convertCanonNode(canon, schema, {});
  if (nodes.length === 0) {
    return { ok: false, error: "Canonical content produced no nodes" };
  }
  return { ok: true, fragment: Fragment.fromArray(nodes) };
}

function convertCanonNode(node: CanonNode, schema: Schema, context: ConvertContext): PMNode[] {
  if (isCanonText(node)) {
    return convertTextNode(node, schema, undefined);
  }

  if (!isCanonBlock(node)) {
    return [];
  }

  if (node.type === "doc") {
    return convertBlockChildren(node.children, schema, context);
  }

  if (node.type === "list") {
    const listType = resolveListType(node.attrs);
    return convertBlockChildren(node.children, schema, { ...context, listType });
  }

  const blockNode = convertBlockNode(node, schema, context);
  return blockNode ? [blockNode] : [];
}

function convertTextNode(
  node: CanonText,
  schema: Schema,
  parentType: NodeType | undefined
): PMNode[] {
  if (!node.text) {
    return [];
  }
  const marks = buildMarks(node, schema, parentType);
  return [schema.text(node.text, marks)];
}

function convertBlockNode(
  block: CanonBlock,
  schema: Schema,
  context: ConvertContext
): PMNode | null {
  const nodeType = resolveBlockType(block.type, schema);
  if (!nodeType) {
    return fallbackParagraph(block, schema);
  }

  const attrs = buildBlockAttrs(block, nodeType, context);
  const content = nodeType.isTextblock
    ? convertInlineChildren(block.children, schema, nodeType)
    : convertBlockChildren(block.children, schema, context);

  try {
    return nodeType.create(attrs, content);
  } catch {
    return fallbackParagraph(block, schema);
  }
}

function resolveBlockType(type: string, schema: Schema): NodeType | null {
  if (type === "doc") {
    return null;
  }
  const mapped = BLOCK_TYPE_MAP[type] ?? type;
  return schema.nodes[mapped] ?? null;
}

function buildBlockAttrs(
  block: CanonBlock,
  nodeType: NodeType,
  context: ConvertContext
): Record<string, unknown> {
  const attrs: Record<string, unknown> = {
    attrs: serializeAttrs(block.attrs ?? {}),
  };

  if (nodeType.name === "heading") {
    attrs.level = resolveHeadingLevel(block.attrs);
  }

  if (nodeType.name === "paragraph") {
    const listType = resolveListType(block.attrs) ?? context.listType ?? null;
    if (listType) {
      attrs.list_type = listType;
      const indent = resolveIndentLevel(block.attrs);
      if (indent !== null) {
        attrs.indent_level = indent;
      }
      const taskChecked = resolveTaskChecked(block.attrs);
      if (taskChecked !== null) {
        attrs.task_checked = taskChecked;
      }
    }
  }

  if (nodeType.name === "code_block") {
    attrs.language = resolveStringAttr(block.attrs, "language");
  }

  return attrs;
}

function convertInlineChildren(
  children: CanonNode[],
  schema: Schema,
  parentType: NodeType
): PMNode[] {
  const nodes: PMNode[] = [];
  for (const child of children) {
    if (isCanonText(child)) {
      nodes.push(...convertTextNode(child, schema, parentType));
      continue;
    }
    if (isCanonBlock(child)) {
      const text = extractPlainText(child);
      if (text) {
        nodes.push(schema.text(text));
      }
    }
  }
  return nodes;
}

function convertBlockChildren(
  children: CanonNode[],
  schema: Schema,
  context: ConvertContext
): PMNode[] {
  const nodes: PMNode[] = [];
  let inlineBuffer: CanonText[] = [];

  const flushInline = () => {
    if (inlineBuffer.length === 0) {
      return;
    }
    const paragraph = buildParagraphFromInline(inlineBuffer, schema, context);
    if (paragraph) {
      nodes.push(paragraph);
    }
    inlineBuffer = [];
  };

  for (const child of children) {
    if (isCanonText(child)) {
      inlineBuffer.push(child);
      continue;
    }

    if (isCanonBlock(child)) {
      flushInline();
      nodes.push(...convertCanonNode(child, schema, context));
    }
  }

  flushInline();
  return nodes;
}

function buildParagraphFromInline(
  inline: CanonText[],
  schema: Schema,
  context: ConvertContext
): PMNode | null {
  const paragraph = schema.nodes.paragraph;
  if (!paragraph) {
    return null;
  }

  const content: PMNode[] = [];
  for (const node of inline) {
    content.push(...convertTextNode(node, schema, paragraph));
  }

  const attrs: Record<string, unknown> = {
    attrs: serializeAttrs({}),
  };
  if (context.listType) {
    attrs.list_type = context.listType;
  }

  try {
    return paragraph.create(attrs, content);
  } catch {
    return null;
  }
}

function fallbackParagraph(block: CanonBlock, schema: Schema): PMNode | null {
  const paragraph = schema.nodes.paragraph;
  if (!paragraph) {
    return null;
  }
  const text = extractPlainText(block);
  const attrs: Record<string, unknown> = {
    attrs: serializeAttrs(block.attrs ?? {}),
  };
  return paragraph.create(attrs, text ? schema.text(text) : undefined);
}

function extractPlainText(node: CanonNode): string {
  if (isCanonText(node)) {
    return node.text;
  }
  if (!isCanonBlock(node)) {
    return "";
  }
  return node.children.map((child) => extractPlainText(child)).join("");
}

function buildMarks(node: CanonText, schema: Schema, parentType: NodeType | undefined): Mark[] {
  if (!node.marks || node.marks.length === 0) {
    return [];
  }
  const marks: Mark[] = [];
  for (const markName of node.marks) {
    const markType = schema.marks[markName];
    if (!markType) {
      continue;
    }
    if (parentType && !parentType.allowsMarkType(markType)) {
      continue;
    }
    if (markName === "link") {
      marks.push(markType.create({ href: node.attrs?.href ?? "" }));
      continue;
    }
    marks.push(markType.create());
  }
  return marks;
}

function resolveHeadingLevel(attrs: Record<string, unknown>): number {
  const level = resolveNumericAttr(attrs, "level", 1);
  return clampNumber(level, 1, 6);
}

function resolveListType(attrs: Record<string, unknown>): ListType {
  const raw = resolveStringAttr(attrs, "list_type") ?? resolveStringAttr(attrs, "data-list-type");
  if (!raw) {
    return null;
  }
  const normalized = raw.toLowerCase();
  if (normalized === "bullet" || normalized === "ordered" || normalized === "task") {
    return normalized as ListType;
  }
  if (normalized === "ul") {
    return "bullet";
  }
  if (normalized === "ol") {
    return "ordered";
  }
  return null;
}

function resolveIndentLevel(attrs: Record<string, unknown>): number | null {
  return (
    resolveNumericAttr(attrs, "indent_level", null) ??
    resolveNumericAttr(attrs, "data-indent-level", null)
  );
}

function resolveTaskChecked(attrs: Record<string, unknown>): boolean | null {
  const raw =
    resolveStringAttr(attrs, "task_checked") ?? resolveStringAttr(attrs, "data-task-checked");
  if (!raw) {
    return null;
  }
  if (raw === "true" || raw === "1") {
    return true;
  }
  if (raw === "false" || raw === "0") {
    return false;
  }
  return null;
}

function resolveNumericAttr(
  attrs: Record<string, unknown>,
  key: string,
  fallback: number | null
): number | null {
  const value = attrs[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function resolveStringAttr(attrs: Record<string, unknown>, key: string): string | null {
  const value = attrs[key];
  if (typeof value === "string" && value.trim() !== "") {
    return value;
  }
  return null;
}

function clampNumber(value: number | null, min: number, max: number): number {
  if (value === null) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}
