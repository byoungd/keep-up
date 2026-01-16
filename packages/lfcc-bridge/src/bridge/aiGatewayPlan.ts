/**
 * AI Gateway Plan Application Module
 *
 * Extracted from bridgeController.ts to reduce file size and improve maintainability.
 * Contains helper functions for applying AI-generated plans to the ProseMirror editor.
 *
 * @module aiGatewayPlan
 */

import type { gateway } from "@ku0/core";
import { type Fragment, Slice } from "prosemirror-model";
import type { Transaction } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

import { canonToPmFragment } from "../pm/canonicalToPm";
import type { LoroRuntime } from "../runtime/loroRuntime";
import type { AIGatewayWriteMetadata, AIGatewayWriteResult } from "../security/aiGatewayWrite";
import { type SpanList, spanListToPmRanges } from "../selection/selectionMapping";

// ============================================================================
// Types
// ============================================================================

export type AIGatewayPlanApplyOptions = {
  plan: gateway.ApplyPlan;
  metadata: AIGatewayWriteMetadata;
  payloadHtml?: string;
  spanResolver?: (spanId: string) => { from: number; to: number } | null;
};

export type AIGatewayPlanApplyResult = AIGatewayWriteResult & {
  appliedSpanIds?: string[];
};

export type ApplyPlanInputCheck =
  | { ok: true; view: EditorView; metadata: AIGatewayWriteMetadata; plan: gateway.ApplyPlan }
  | { ok: false; error: string };

export type PayloadFragmentResult =
  | { ok: true; fragment: Fragment | null }
  | { ok: false; error: string };

export type ResolvedApplyOperation = {
  op: gateway.ApplyOperation;
  from: number;
  to: number;
  fragment?: Fragment;
};

export type ResolvedOperationsResult =
  | { ok: true; operations: ResolvedApplyOperation[]; appliedSpanIds: string[] }
  | { ok: false; error: string };

export type ApplyPlanTransactionResult =
  | { ok: true; tr: Transaction }
  | { ok: false; error: string };

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build a ProseMirror Fragment from HTML string.
 */
export function buildFragmentFromHtml(
  html: string,
  schema: import("prosemirror-model").Schema
): { ok: true; fragment: import("prosemirror-model").Fragment } | { ok: false; error: string } {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<body>${html}</body>`, "text/html");
    const { DOMParser: PMDOMParser } = require("prosemirror-model");
    const pmParser = PMDOMParser.fromSchema(schema);
    const parsed = pmParser.parse(doc.body);
    return { ok: true, fragment: parsed.content };
  } catch (err) {
    return { ok: false, error: `Failed to parse HTML: ${String(err)}` };
  }
}

/**
 * Parse a span ID into its components.
 * Supports formats:
 * - "selection:v:blockId:start:end"
 * - "s0-blockId-start-end"
 */
export function parseSpanId(
  spanId: string
): { blockId: string; start: number; end: number } | null {
  if (spanId.startsWith("selection:")) {
    const parts = spanId.split(":");
    if (parts.length !== 5) {
      return null;
    }
    const blockId = parts[2];
    const start = Number.parseInt(parts[3], 10);
    const end = Number.parseInt(parts[4], 10);
    if (!blockId || !Number.isFinite(start) || !Number.isFinite(end)) {
      return null;
    }
    return { blockId, start, end };
  }
  if (!spanId.startsWith("s")) {
    return null;
  }
  const parts = spanId.split("-");
  if (parts.length < 4) {
    return null;
  }
  const endText = parts.pop();
  const startText = parts.pop();
  if (!endText || !startText) {
    return null;
  }
  const start = Number(startText);
  const end = Number(endText);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return null;
  }
  const blockId = parts.slice(1).join("-");
  if (!blockId) {
    return null;
  }
  return { blockId, start, end };
}

/**
 * Resolve span ID to PM position range.
 */
export function resolvePlanSpan(
  spanId: string,
  view: EditorView,
  runtime: LoroRuntime,
  customResolver?: (spanId: string) => { from: number; to: number } | null
): { from: number; to: number } | null {
  // Use custom resolver if provided
  if (customResolver) {
    return customResolver(spanId);
  }

  // Try span format: s0-blockId-start-end
  const parsed = parseSpanId(spanId);
  if (parsed) {
    const spanList: SpanList = [{ blockId: parsed.blockId, start: parsed.start, end: parsed.end }];
    const ranges = spanListToPmRanges(spanList, runtime, view.state);
    if (ranges.length > 0) {
      return ranges[0];
    }
  }

  // Fallback: try to resolve spanId as blockId
  const doc = view.state.doc;
  let pos = 0;
  for (let i = 0; i < doc.childCount; i++) {
    const child = doc.child(i);
    const blockId = child.attrs.block_id;
    if (blockId === spanId) {
      return { from: pos, to: pos + child.nodeSize };
    }
    pos += child.nodeSize;
  }

  return null;
}

/**
 * Check if resolved operations have overlapping ranges.
 */
export function hasOverlappingRanges(ops: Array<{ from: number; to: number }>): boolean {
  for (let i = 0; i < ops.length - 1; i++) {
    const current = ops[i];
    const next = ops[i + 1];
    // Since sorted by descending from, check if current.from is within next's range
    if (current.from < next.to) {
      return true;
    }
  }
  return false;
}

/**
 * Validate apply plan inputs.
 */
export function ensureApplyPlanInputs(
  view: EditorView | null,
  options: AIGatewayPlanApplyOptions
): ApplyPlanInputCheck {
  if (!view || !view.state) {
    return { ok: false, error: "No editor view available" };
  }

  if (process.env.NEXT_PUBLIC_ENABLE_AI_WRITES === "false") {
    return { ok: false, error: "AI writes are disabled" };
  }

  const { metadata, plan } = options;
  if (!metadata.requestId) {
    return { ok: false, error: "AI write requires requestId for idempotency" };
  }
  if (!metadata.agentId) {
    return { ok: false, error: "AI write requires agentId for audit" };
  }
  if (plan.operations.length === 0) {
    return { ok: false, error: "apply_plan has no operations" };
  }

  return { ok: true, view, metadata, plan };
}

/**
 * Resolve all operations in a plan to ProseMirror positions and fragments.
 */
export function resolveApplyOperations(params: {
  plan: gateway.ApplyPlan;
  view: EditorView;
  runtime: LoroRuntime;
  payloadFragment: Fragment | null;
  spanResolver?: (spanId: string) => { from: number; to: number } | null;
}): ResolvedOperationsResult {
  const resolvedOps: ResolvedApplyOperation[] = [];

  for (const op of params.plan.operations) {
    const range = resolvePlanSpan(op.span_id, params.view, params.runtime, params.spanResolver);
    if (!range) {
      return { ok: false, error: `Unable to resolve span ${op.span_id}` };
    }

    const fragmentResult = resolveOperationFragment({
      op,
      schema: params.view.state.schema,
      payloadFragment: params.payloadFragment,
    });
    if (!fragmentResult.ok) {
      return { ok: false, error: fragmentResult.error };
    }

    resolvedOps.push({ op, from: range.from, to: range.to, fragment: fragmentResult.fragment });
  }

  const orderedOps = [...resolvedOps].sort((a, b) => b.from - a.from);
  if (hasOverlappingRanges(orderedOps)) {
    return { ok: false, error: "apply_plan contains overlapping spans" };
  }

  return {
    ok: true,
    operations: orderedOps,
    appliedSpanIds: params.plan.operations.map((o) => o.span_id),
  };
}

/**
 * Resolve the fragment for a single operation.
 */
export function resolveOperationFragment(params: {
  op: gateway.ApplyOperation;
  schema: import("prosemirror-model").Schema;
  payloadFragment: Fragment | null;
}): { ok: true; fragment?: Fragment } | { ok: false; error: string } {
  if (params.op.type === "delete") {
    return { ok: true };
  }
  if (params.payloadFragment) {
    return { ok: true, fragment: params.payloadFragment };
  }
  if (params.op.content) {
    const result = canonToPmFragment(params.op.content, params.schema);
    if (!result.ok) {
      return { ok: false, error: result.error };
    }
    return { ok: true, fragment: result.fragment };
  }
  return { ok: false, error: `Missing content for ${params.op.type} operation` };
}

/**
 * Build a transaction from resolved operations.
 */
export function buildApplyPlanTransaction(
  view: EditorView,
  operations: ResolvedApplyOperation[]
): ApplyPlanTransactionResult {
  let tr = view.state.tr;
  for (const entry of operations) {
    const { op, from, to } = entry;
    if (from < 0 || to < from) {
      return { ok: false, error: `Invalid span range for ${op.span_id}` };
    }

    if (op.type === "delete") {
      tr = tr.delete(from, to);
      continue;
    }

    const slice = entry.fragment ? Slice.maxOpen(entry.fragment) : Slice.empty;
    if (op.type === "insert") {
      tr = tr.replaceRange(from, from, slice);
    } else {
      tr = tr.replaceRange(from, to, slice);
    }
  }

  return { ok: true, tr };
}
