/**
 * LFCC v0.9 RC - Recursive Canonicalizer
 * @see docs/product/LFCC_v0.9_RC_Engineering_Docs/01_Kernel_API_Specification.md Section 2
 * @see docs/product/LFCC_v0.9_RC_Engineering_Docs/10_Recursive_Canonicalization_Deep_Dive.md
 */

import { processMarkAttributes } from "./attrs";
import { isMarkTag, sortMarks, tagToMark } from "./marks";
import { isEmptyText, normalizeWhitespace, wasWhitespaceNormalized } from "./normalizeText";
import type {
  CanonBlock,
  CanonDiag,
  CanonInputNode,
  CanonMark,
  CanonNode,
  CanonText,
  CanonicalizeDocumentInput,
  CanonicalizeResult,
  CanonicalizerPolicyV2,
} from "./types";
import { DEFAULT_CANONICALIZER_POLICY } from "./types";

/** Default tag to block type mapping */
const DEFAULT_BLOCK_TAGS: Record<string, string> = {
  p: "paragraph",
  div: "paragraph",
  h1: "heading",
  h2: "heading",
  h3: "heading",
  h4: "heading",
  h5: "heading",
  h6: "heading",
  ul: "list",
  ol: "list",
  li: "list_item",
  table: "table",
  tr: "table_row",
  td: "table_cell",
  th: "table_cell",
  blockquote: "quote",
  pre: "code_block",
};

function defaultMapTagToBlockType(tag: string, _attrs: Record<string, string>): string | null {
  return DEFAULT_BLOCK_TAGS[tag.toLowerCase()] ?? null;
}

function isBlockTag(
  tag: string,
  attrs: Record<string, string>,
  mapFn: (tag: string, attrs: Record<string, string>) => string | null
): boolean {
  return mapFn(tag, attrs) !== null;
}

/** Stable key ordering for attrs */
function canonicalizeAttrs(attrs: Record<string, string>): Record<string, unknown> {
  const keys = Object.keys(attrs).sort();
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    result[key] = attrs[key];
  }
  return result;
}

type TraversalContext = {
  path: string;
  activeMarks: Set<CanonMark>;
  activeAttrs: { href?: string };
  policy: CanonicalizerPolicyV2;
  mapTagToBlockType: (tag: string, attrs: Record<string, string>) => string | null;
  diagnostics: CanonDiag[];
};

/** Collected text segment during inline traversal */
type TextSegment = {
  text: string;
  marks: Set<CanonMark>;
  attrs: { href?: string };
};

/**
 * Traverse inline content and collect text segments with marks
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: inline collection logic
function collectInlineSegments(node: CanonInputNode, ctx: TraversalContext): TextSegment[] {
  if (node.kind === "text") {
    let text = node.text;
    if (ctx.policy.normalize_whitespace) {
      const normalized = normalizeWhitespace(text);
      if (wasWhitespaceNormalized(text, normalized)) {
        ctx.diagnostics.push({ kind: "normalized_whitespace", path: ctx.path });
      }
      text = normalized;
    }
    if (ctx.policy.drop_empty_nodes && isEmptyText(text)) {
      return [];
    }
    return [
      {
        text,
        marks: new Set(ctx.activeMarks),
        attrs: { ...ctx.activeAttrs },
      },
    ];
  }

  const tag = node.tag.toLowerCase();

  // Handle mark tags
  const mark = tagToMark(tag);
  if (mark) {
    const prevMarks = new Set(ctx.activeMarks);
    const prevAttrs = { ...ctx.activeAttrs };

    ctx.activeMarks.add(mark);

    // P0.3: Process mark attributes - only link marks may have href
    const processedAttrs = processMarkAttributes(mark, node.attrs);

    if (processedAttrs.href) {
      ctx.activeAttrs.href = processedAttrs.href;
    } else {
      // P0.3: Invalid usage handling
      if (mark === "link" && node.attrs.href) {
        // Invalid URL in link
        ctx.diagnostics.push({
          kind: "dropped_invalid_href",
          path: ctx.path,
          href: node.attrs.href,
        });
      } else if (mark !== "link" && node.attrs.href) {
        // Href on non-link mark
        ctx.diagnostics.push({
          kind: "dropped_non_link_href",
          path: ctx.path,
          mark: mark,
        });
      }
      ctx.activeAttrs = {}; // Clear attributes
    }

    const segments: TextSegment[] = [];
    for (let i = 0; i < node.children.length; i++) {
      const childPath = `${ctx.path}/${i}`;
      segments.push(...collectInlineSegments(node.children[i], { ...ctx, path: childPath }));
    }

    ctx.activeMarks = prevMarks;
    ctx.activeAttrs = prevAttrs;
    return segments;
  }

  // Unknown inline element - traverse children
  if (!isBlockTag(tag, node.attrs, ctx.mapTagToBlockType)) {
    ctx.diagnostics.push({ kind: "unknown_mark", tag, path: ctx.path });
    const segments: TextSegment[] = [];
    for (let i = 0; i < node.children.length; i++) {
      const childPath = `${ctx.path}/${i}`;
      segments.push(...collectInlineSegments(node.children[i], { ...ctx, path: childPath }));
    }
    return segments;
  }

  return [];
}

/**
 * Merge adjacent text segments with identical marks/attrs
 */
function mergeSegments(
  segments: TextSegment[],
  policy: CanonicalizerPolicyV2,
  diagnostics: CanonDiag[],
  path: string
): CanonText[] {
  if (segments.length === 0) {
    return [];
  }

  const result: CanonText[] = [];
  let current: TextSegment | null = null;

  for (const seg of segments) {
    if (!current) {
      current = seg;
      continue;
    }

    // Check if marks and attrs match
    const marksMatch =
      current.marks.size === seg.marks.size && [...current.marks].every((m) => seg.marks.has(m));
    const attrsMatch = current.attrs.href === seg.attrs.href;

    if (marksMatch && attrsMatch) {
      current.text += seg.text;
    } else {
      result.push(segmentToCanonText(current, policy, diagnostics, path));
      current = seg;
    }
  }

  if (current) {
    result.push(segmentToCanonText(current, policy, diagnostics, path));
  }

  return result;
}

function segmentToCanonText(
  seg: TextSegment,
  policy: CanonicalizerPolicyV2,
  _diagnostics: CanonDiag[],
  _path: string
): CanonText {
  const text: CanonText = {
    text: seg.text,
    marks: sortMarks(seg.marks, policy),
    is_leaf: true,
  };

  if (seg.attrs.href) {
    text.attrs = { href: seg.attrs.href };
  }

  return text;
}

/**
 * Recursively canonicalize a block node
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: canon logic
function canonicalizeNode(
  node: CanonInputNode,
  ctx: TraversalContext,
  idCounter: { value: number }
): CanonNode | null {
  if (node.kind === "text") {
    // Text at block level - wrap in implicit paragraph
    let text = node.text;
    if (ctx.policy.normalize_whitespace) {
      text = normalizeWhitespace(text);
    }
    if (ctx.policy.drop_empty_nodes && isEmptyText(text)) {
      ctx.diagnostics.push({ kind: "dropped_empty_node", path: ctx.path });
      return null;
    }
    return {
      text,
      marks: [],
      is_leaf: true,
    };
  }

  const tag = node.tag.toLowerCase();
  const blockType = ctx.mapTagToBlockType(tag, node.attrs);

  if (blockType) {
    // This is a block element
    const id = `r/${idCounter.value++}`;
    const children: CanonNode[] = [];

    // Separate block children from inline content
    const inlineNodes: CanonInputNode[] = [];
    const blockNodes: CanonInputNode[] = [];

    for (const child of node.children) {
      if (child.kind === "text") {
        inlineNodes.push(child);
      } else if (isBlockTag(child.tag, child.attrs, ctx.mapTagToBlockType)) {
        // Flush inline content first
        if (inlineNodes.length > 0) {
          const segments = inlineNodes.flatMap((n, i) =>
            collectInlineSegments(n, {
              ...ctx,
              path: `${ctx.path}/inline/${i}`,
              activeMarks: new Set(),
              activeAttrs: {},
            })
          );
          children.push(
            ...mergeSegments(segments, ctx.policy, ctx.diagnostics, `${ctx.path}/inline`)
          );
          inlineNodes.length = 0;
        }
        blockNodes.push(child);
      } else if (isMarkTag(child.tag)) {
        inlineNodes.push(child);
      } else {
        // Unknown element - treat as inline
        inlineNodes.push(child);
      }
    }

    // Process remaining inline content
    if (inlineNodes.length > 0) {
      const segments = inlineNodes.flatMap((n, i) =>
        collectInlineSegments(n, {
          ...ctx,
          path: `${ctx.path}/inline/${i}`,
          activeMarks: new Set(),
          activeAttrs: {},
        })
      );
      children.push(...mergeSegments(segments, ctx.policy, ctx.diagnostics, `${ctx.path}/inline`));
    }

    // Process block children recursively
    for (let i = 0; i < blockNodes.length; i++) {
      const childPath = `${ctx.path}/${i}`;
      const childNode = canonicalizeNode(blockNodes[i], { ...ctx, path: childPath }, idCounter);
      if (childNode) {
        children.push(childNode);
      }
    }

    // Drop empty blocks if policy requires
    if (ctx.policy.drop_empty_nodes && children.length === 0) {
      ctx.diagnostics.push({ kind: "dropped_empty_node", path: ctx.path });
      return null;
    }

    return {
      id,
      type: blockType,
      attrs: canonicalizeAttrs(node.attrs),
      children,
    };
  }

  // Not a block - check if it's a mark wrapper at block level
  if (isMarkTag(tag)) {
    const segments = collectInlineSegments(node, {
      ...ctx,
      activeMarks: new Set(),
      activeAttrs: {},
    });
    const merged = mergeSegments(segments, ctx.policy, ctx.diagnostics, `${ctx.path}/inline`);
    if (merged.length === 1) {
      return merged[0];
    }
    // Multiple segments - wrap in implicit paragraph
    if (merged.length > 0) {
      return {
        id: `r/${idCounter.value++}`,
        type: "paragraph",
        attrs: {},
        children: merged,
      };
    }
    return null;
  }

  // Unknown block tag
  ctx.diagnostics.push({ kind: "unknown_block", tag, path: ctx.path });

  // Try to process children anyway
  const children: CanonNode[] = [];
  for (let i = 0; i < node.children.length; i++) {
    const childPath = `${ctx.path}/${i}`;
    const childNode = canonicalizeNode(node.children[i], { ...ctx, path: childPath }, idCounter);
    if (childNode) {
      children.push(childNode);
    }
  }

  if (children.length === 0) {
    return null;
  }

  return {
    id: `r/${idCounter.value++}`,
    type: "unknown",
    attrs: canonicalizeAttrs(node.attrs),
    children,
  };
}

/**
 * Canonicalize a document tree
 * @param input - The input document with root node
 * @param policy - Canonicalizer policy (defaults to v2)
 * @returns Canonical tree and diagnostics
 */
export function canonicalizeDocument(
  input: CanonicalizeDocumentInput,
  policy: CanonicalizerPolicyV2 = DEFAULT_CANONICALIZER_POLICY
): CanonicalizeResult {
  const diagnostics: CanonDiag[] = [];
  const mapFn = input.mapTagToBlockType ?? defaultMapTagToBlockType;

  const ctx: TraversalContext = {
    path: "r",
    activeMarks: new Set(),
    activeAttrs: {},
    policy,
    mapTagToBlockType: mapFn,
    diagnostics,
  };

  const idCounter = { value: 0 };
  const root = canonicalizeNode(input.root, ctx, idCounter);

  if (!root) {
    // Empty document - return empty root block
    return {
      root: {
        id: "r/0",
        type: "document",
        attrs: {},
        children: [],
      },
      diagnostics,
    };
  }

  return { root, diagnostics };
}

/**
 * Canonicalize a single block
 */
export function canonicalizeBlock(
  input: CanonInputNode,
  policy: CanonicalizerPolicyV2 = DEFAULT_CANONICALIZER_POLICY
): CanonBlock {
  const result = canonicalizeDocument({ root: input }, policy);
  if ("type" in result.root) {
    return result.root as CanonBlock;
  }
  // Wrap text in paragraph
  return {
    id: "r/0",
    type: "paragraph",
    attrs: {},
    children: [result.root],
  };
}

/**
 * Stable JSON stringify for canonical nodes
 * Ensures deterministic output for comparisons
 */
export function stableStringifyCanon(node: CanonNode): string {
  return JSON.stringify(node, (_, value) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const sorted: Record<string, unknown> = {};
      for (const key of Object.keys(value).sort()) {
        sorted[key] = value[key];
      }
      return sorted;
    }
    return value;
  });
}
