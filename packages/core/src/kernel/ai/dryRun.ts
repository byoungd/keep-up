/**
 * LFCC v0.9 RC - AI Dry-Run Pipeline
 * @see docs/product/LFCC_v0.9_RC_Engineering_Docs/01_Kernel_API_Specification.md Section 5.4
 * @see docs/product/LFCC_v0.9_RC_Engineering_Docs/07_AI_Dry_Run_Pipeline_Design.md
 */

import { canonicalizeDocument } from "../canonicalizer/canonicalize";
import type {
  CanonBlock,
  CanonInputNode,
  CanonNode,
  CanonicalizerPolicyV2,
} from "../canonicalizer/types";
import { DEFAULT_CANONICALIZER_POLICY, isCanonBlock } from "../canonicalizer/types";
import type {
  AIPayloadSanitizer,
  AISanitizationPolicyV1,
  DryRunReport,
  EditorSchemaValidator,
} from "./types";

type DryRunDiag = { kind: string; detail: string };

/**
 * Parse HTML string to CanonInputNode tree
 * Note: This is a simplified parser. Production should use a proper HTML parser.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: legacy parser
function parseHtmlToInputTree(html: string): CanonInputNode {
  // Simple regex-based parser for demonstration
  // In production, use a proper HTML parser like htmlparser2

  const result: CanonInputNode = {
    kind: "element",
    tag: "div",
    attrs: {},
    children: [],
  };

  // Very basic parsing - split by tags
  const tagRegex = /<(\/?)([\w-]+)([^>]*)>/g;
  const parts: Array<{
    type: "text" | "open" | "close";
    content: string;
    tag?: string;
    attrs?: string;
  }> = [];

  let lastIndex = 0;
  let match: RegExpExecArray | null = null;

  while (true) {
    match = tagRegex.exec(html);
    if (match === null) {
      break;
    }
    // Text before tag
    if (match.index > lastIndex) {
      const text = html.slice(lastIndex, match.index);
      if (text.trim()) {
        parts.push({ type: "text", content: text });
      }
    }

    const isClose = match[1] === "/";
    const tag = match[2].toLowerCase();
    const attrs = match[3];

    parts.push({
      type: isClose ? "close" : "open",
      content: match[0],
      tag,
      attrs: isClose ? undefined : attrs,
    });

    lastIndex = match.index + match[0].length;
  }

  // Remaining text
  if (lastIndex < html.length) {
    const text = html.slice(lastIndex);
    if (text.trim()) {
      parts.push({ type: "text", content: text });
    }
  }

  // Build tree from parts
  const stack: Array<{
    kind: "element";
    tag: string;
    attrs: Record<string, string>;
    children: CanonInputNode[];
  }> = [
    result as {
      kind: "element";
      tag: string;
      attrs: Record<string, string>;
      children: CanonInputNode[];
    },
  ];

  for (const part of parts) {
    const current = stack[stack.length - 1];

    if (part.type === "text") {
      current.children.push({ kind: "text", text: part.content });
    } else if (part.type === "open" && part.tag) {
      const attrs = parseAttrs(part.attrs ?? "");
      const node: CanonInputNode = {
        kind: "element",
        tag: part.tag,
        attrs,
        children: [],
      };
      current.children.push(node);

      // Self-closing tags
      const selfClosing = ["br", "hr", "img", "input", "meta", "link"];
      if (!selfClosing.includes(part.tag)) {
        stack.push(
          node as {
            kind: "element";
            tag: string;
            attrs: Record<string, string>;
            children: CanonInputNode[];
          }
        );
      }
    } else if (part.type === "close" && part.tag) {
      // Pop stack until we find matching tag
      while (stack.length > 1 && stack[stack.length - 1].tag !== part.tag) {
        stack.pop();
      }
      if (stack.length > 1) {
        stack.pop();
      }
    }
  }

  return result;
}

/**
 * Parse attribute string to Record
 */
function parseAttrs(attrStr: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex = /([\w-]+)\s*=\s*["']([^"']*)["']/g;
  let match: RegExpExecArray | null = null;

  while (true) {
    match = attrRegex.exec(attrStr);
    if (match === null) {
      break;
    }
    attrs[match[1].toLowerCase()] = match[2];
  }

  return attrs;
}

/**
 * Execute the AI dry-run pipeline
 * Pipeline: Sanitize -> Canonicalize -> Schema Dry-Run
 *
 * @param input - HTML or Markdown payload
 * @param sanitizer - Sanitizer implementation
 * @param validator - Editor schema validator
 * @param policy - Sanitization policy
 * @returns Dry-run report with success/failure and diagnostics
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: dry run logic
export async function dryRunAIPayload(
  input: { html?: string; markdown?: string },
  sanitizer: AIPayloadSanitizer,
  validator: EditorSchemaValidator,
  policy: AISanitizationPolicyV1,
  canonPolicy: CanonicalizerPolicyV2 = DEFAULT_CANONICALIZER_POLICY
): Promise<DryRunReport> {
  const diagnostics: DryRunDiag[] = [];

  // Stage 1: Sanitize
  const sanitized = sanitizer.sanitize(input, policy);
  diagnostics.push(...sanitized.diagnostics);

  // P0.1: Fail-closed - check for sanitization errors
  if (sanitized.errors && sanitized.errors.length > 0) {
    diagnostics.push(
      ...sanitized.errors.map((e) => ({
        kind: e.kind,
        detail: e.detail,
      }))
    );
    return {
      ok: false,
      reason: `Sanitization errors: ${sanitized.errors.map((e) => e.detail).join("; ")}`,
      diagnostics,
    };
  }

  // Check if sanitization produced empty result when it shouldn't
  const hasInput = input.html || input.markdown;
  const hasOutput = sanitized.sanitized_html || sanitized.sanitized_markdown;

  if (hasInput && !hasOutput) {
    return {
      ok: false,
      reason: "Sanitization produced empty payload",
      diagnostics,
    };
  }

  // Check for payload too large error
  if (sanitized.diagnostics.some((d) => d.kind === "payload_too_large")) {
    return {
      ok: false,
      reason: "Payload exceeds size limit",
      diagnostics,
    };
  }

  // Stage 2: Canonicalize
  let canonRoot: CanonNode | undefined;

  try {
    if (sanitized.sanitized_html) {
      const inputTree = parseHtmlToInputTree(sanitized.sanitized_html);
      const canonResult = canonicalizeDocument({ root: inputTree }, canonPolicy);
      canonRoot = canonResult.root;

      // Add canonicalizer diagnostics
      for (const diag of canonResult.diagnostics) {
        diagnostics.push({ kind: diag.kind, detail: "path" in diag ? diag.path : "" });
      }

      // Check for unknown blocks if policy requires rejection
      if (policy.reject_unknown_structure) {
        const hasUnknown = canonResult.diagnostics.some(
          (d) => d.kind === "unknown_block" || d.kind === "unknown_mark"
        );
        if (hasUnknown) {
          return {
            ok: false,
            reason: "Payload contains unknown structure",
            canon_root: canonRoot,
            diagnostics,
          };
        }
      }
    }
  } catch (err) {
    diagnostics.push({
      kind: "canonicalize_error",
      detail: err instanceof Error ? err.message : "Unknown error",
    });
    return {
      ok: false,
      reason: "Canonicalization failed",
      diagnostics,
    };
  }

  // Stage 3: Schema Dry-Run
  try {
    const schemaResult = validator.dryRunApply({
      html: sanitized.sanitized_html,
      markdown: sanitized.sanitized_markdown,
    });

    if (!schemaResult.ok) {
      diagnostics.push({
        kind: "schema_invalid",
        detail: schemaResult.error ?? "Schema validation failed",
      });
      return {
        ok: false,
        reason: "Schema validation failed",
        canon_root: canonRoot,
        diagnostics,
      };
    }
  } catch (err) {
    diagnostics.push({
      kind: "schema_error",
      detail: err instanceof Error ? err.message : "Unknown error",
    });
    return {
      ok: false,
      reason: "Schema dry-run threw exception",
      canon_root: canonRoot,
      diagnostics,
    };
  }

  // All stages passed
  return {
    ok: true,
    canon_root: canonRoot,
    diagnostics,
  };
}

/**
 * Create a simple pass-through validator for testing
 */
export function createPassThroughValidator(): EditorSchemaValidator {
  return {
    dryRunApply(_input: { html?: string; markdown?: string }) {
      return { ok: true };
    },
  };
}

/**
 * Create a validator that rejects specific patterns
 */
export function createPatternRejectValidator(rejectPatterns: RegExp[]): EditorSchemaValidator {
  return {
    dryRunApply(input: { html?: string; markdown?: string }) {
      const content = `${input.html ?? ""}${input.markdown ?? ""}`;

      for (const pattern of rejectPatterns) {
        if (pattern.test(content)) {
          return { ok: false, error: `Content matches rejected pattern: ${pattern}` };
        }
      }

      return { ok: true };
    },
  };
}
// --- Structural Dry Run (Phase 3) ---

export type StructuralOp = {
  kind: "convert_blocks";
  targetBlockIds: string[];
  newType: "bullet_list" | "ordered_list" | "blockquote";
};

export type StructuralPreview = {
  originalBlocks: CanonNode[];
  previewBlocks: CanonNode[];
  impactedBlockIds: string[];
};

/**
 * Simulate a structural operation to generate a preview and validate invariants
 */
export function dryRunStructural(
  docRoot: CanonNode,
  op: StructuralOp
): { ok: boolean; preview?: StructuralPreview; error?: string } {
  // Use isCanonBlock type guard
  if (!isCanonBlock(docRoot) || docRoot.type !== "doc") {
    // Ideally we expect a 'doc' block as root, or just any block serving as root
    // But CanonNode root is typically a block.
    if (!isCanonBlock(docRoot)) {
      return { ok: false, error: "Invalid root node: must be a block" };
    }
  }

  const originals: CanonNode[] = [];
  const children = (docRoot as CanonBlock).children || [];

  for (const child of children) {
    if (isCanonBlock(child) && child.id && op.targetBlockIds.includes(child.id)) {
      originals.push(child);
    }
  }

  if (originals.length !== op.targetBlockIds.length) {
    return { ok: false, error: "Could not locate all target blocks in root" };
  }

  // 2. Generate Preview Blocks (Transformation)
  const previewBlocks: CanonNode[] = [];

  if (op.newType === "bullet_list" || op.newType === "ordered_list") {
    // Wrap items in list items
    const listBlock: CanonBlock = {
      id: `preview_list_${Math.random().toString(36).slice(2)}`,
      type: op.newType,
      attrs: {},
      children: originals.map((orig) => {
        // Must be a block to be a child of list? Actually list items wrap content.
        // Assuming orig is a block (paragraph usually).
        // If orig is text, we wrap it.
        const children = isCanonBlock(orig) ? orig.children : [orig];

        const listItem: CanonBlock = {
          id: isCanonBlock(orig) ? orig.id : `li_${Math.random().toString(36).slice(2)}`,
          type: "list_item",
          attrs: {},
          children: children,
        };
        return listItem;
      }),
    };
    previewBlocks.push(listBlock);
  } else if (op.newType === "blockquote") {
    // Wrap in quote
    const quoteBlock: CanonBlock = {
      id: `preview_quote_${Math.random().toString(36).slice(2)}`,
      type: "blockquote",
      attrs: {},
      children: originals,
    };
    previewBlocks.push(quoteBlock);
  }

  return {
    ok: true,
    preview: {
      originalBlocks: originals,
      previewBlocks,
      impactedBlockIds: op.targetBlockIds,
    },
  };
}
