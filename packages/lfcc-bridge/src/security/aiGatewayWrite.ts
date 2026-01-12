/**
 * AI Gateway Write - Single Entry Point for AI-generated Content
 *
 * D2: All AI write paths MUST use this module to ensure gateway validation.
 * Direct editor transactions without gateway metadata will be rejected.
 */

import type { Transaction } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

/** Metadata key for gateway-validated AI writes */
export const AI_GATEWAY_META = "ai-gateway-validated";
/** Marker that this transaction originates from an AI write path */
export const AI_INTENT_META = "ai-intent";
/** Commit origin prefix used for AI-authored Loro updates */
export const AI_COMMIT_ORIGIN_PREFIX = "lfcc:ai";
/** Commit origin tag for AI-authored Loro updates */
export const AI_COMMIT_ORIGIN = AI_COMMIT_ORIGIN_PREFIX;

/** Source identifier for AI writes (for diagnostics) */
export const AI_GATEWAY_SOURCE = "ai-gateway-source";
/** Request id for AI gateway writes (idempotency/audit) */
export const AI_GATEWAY_REQUEST_ID = "ai-gateway-request-id";
/** Agent id for AI gateway writes (audit) */
export const AI_GATEWAY_AGENT_ID = "ai-gateway-agent-id";
/** Intent id for AI gateway writes (audit) */
export const AI_GATEWAY_INTENT_ID = "ai-gateway-intent-id";
/** Provenance metadata for AI gateway writes */
export const AI_GATEWAY_META_DATA = "ai-gateway-meta";

export type AIWriteAction = "replace" | "insert_below" | "insert_above";

export interface AIGatewayWriteOptions {
  /** The validated text to write */
  text: string;
  /** Write action type */
  action: AIWriteAction;
  /** Source identifier for diagnostics */
  source?: string;
  /** Gateway request id (idempotency/audit) */
  requestId?: string;
  /** Agent id for audit attribution */
  agentId?: string;
  /** Intent id for traceability */
  intentId?: string;
  /** Provenance metadata blob */
  aiMeta?: unknown;
}

export interface AIGatewayWriteMetadata {
  /** Source identifier for diagnostics */
  source?: string;
  /** Gateway request id (idempotency/audit) */
  requestId?: string;
  /** Agent id for audit attribution */
  agentId?: string;
  /** Intent id for traceability */
  intentId?: string;
  /** Provenance metadata blob */
  aiMeta?: unknown;
}

export interface AIGatewayWriteResult {
  success: boolean;
  transaction?: Transaction;
  error?: string;
}

/**
 * Apply AI gateway metadata to an existing transaction.
 */
export function markAIGatewayTransaction(
  tr: Transaction,
  metadata: AIGatewayWriteMetadata
): Transaction {
  const source = metadata.source ?? "ai-gateway";
  let next = tr
    .setMeta(AI_GATEWAY_META, true)
    .setMeta(AI_GATEWAY_SOURCE, source)
    .setMeta(AI_INTENT_META, true);

  if (metadata.requestId) {
    next = next.setMeta(AI_GATEWAY_REQUEST_ID, metadata.requestId);
  }
  if (metadata.agentId) {
    next = next.setMeta(AI_GATEWAY_AGENT_ID, metadata.agentId);
  }
  if (metadata.intentId) {
    next = next.setMeta(AI_GATEWAY_INTENT_ID, metadata.intentId);
  }
  if (metadata.aiMeta !== undefined) {
    next = next.setMeta(AI_GATEWAY_META_DATA, metadata.aiMeta);
  }

  return next;
}

/**
 * Apply an AI-validated write to the editor.
 *
 * This is the ONLY sanctioned path for AI-generated content to enter the editor.
 * All transactions are marked with gateway metadata for downstream validation.
 *
 * @param view - ProseMirror EditorView
 * @param options - Write options
 * @returns Result indicating success or failure
 */
export function applyAIGatewayWrite(
  view: EditorView,
  options: AIGatewayWriteOptions
): AIGatewayWriteResult {
  const {
    text,
    action,
    source = "ai-context-menu",
    requestId,
    agentId,
    intentId,
    aiMeta,
  } = options;

  if (!view || !view.state) {
    return { success: false, error: "No editor view available" };
  }

  if (process.env.NEXT_PUBLIC_ENABLE_AI_WRITES === "false") {
    return { success: false, error: "AI writes are disabled" };
  }

  if (!text || typeof text !== "string") {
    return { success: false, error: "Invalid text content" };
  }

  const { state } = view;
  const { schema, selection } = state;
  const { from, to } = selection;

  let tr: Transaction;

  try {
    switch (action) {
      case "replace":
        tr = state.tr.replaceSelectionWith(schema.text(text));
        break;

      case "insert_below":
        tr = state.tr.insert(to, schema.text(` ${text}`));
        break;

      case "insert_above":
        tr = state.tr.insert(from, schema.text(`${text} `));
        break;

      default:
        return { success: false, error: `Unknown action: ${action}` };
    }

    // Mark transaction with gateway metadata - CRITICAL for D3 validation
    tr = markAIGatewayTransaction(tr, {
      source,
      requestId,
      agentId,
      intentId,
      aiMeta,
    });

    // Dispatch the transaction
    view.dispatch(tr);
    view.focus();

    return { success: true, transaction: tr };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: `Failed to apply AI write: ${message}` };
  }
}

/**
 * Check if a transaction has valid gateway metadata
 */
export function hasGatewayMetadata(tr: Transaction): boolean {
  return tr.getMeta(AI_GATEWAY_META) === true;
}

/**
 * Get the source of a gateway-validated transaction
 */
export function getGatewaySource(tr: Transaction): string | undefined {
  return tr.getMeta(AI_GATEWAY_SOURCE) as string | undefined;
}

/**
 * Build a commit origin string for AI-authored updates.
 * Uses a sanitized suffix so logs can attribute source without leaking content.
 */
export function buildAICommitOrigin(source?: string): string {
  if (!source) {
    return AI_COMMIT_ORIGIN;
  }
  const trimmed = source.trim();
  if (!trimmed) {
    return AI_COMMIT_ORIGIN;
  }
  const safe = trimmed.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${AI_COMMIT_ORIGIN_PREFIX}:${safe}`;
}

/**
 * Build a commit origin string including AI request metadata.
 * Keeps the payload small and sanitized for logs.
 */
export function buildAICommitOriginWithMeta(options: {
  source?: string;
  requestId?: string;
  agentId?: string;
  intentId?: string;
}): string {
  const base = buildAICommitOrigin(options.source);
  const parts: string[] = [];
  const sanitize = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "_");

  if (options.requestId) {
    parts.push(`req_${sanitize(options.requestId)}`);
  }
  if (options.agentId) {
    parts.push(`agent_${sanitize(options.agentId)}`);
  }
  if (options.intentId) {
    parts.push(`intent_${sanitize(options.intentId)}`);
  }

  if (parts.length === 0) {
    return base;
  }
  return `${base}:${parts.join(":")}`;
}

/**
 * Detect if a transaction appears to be an AI write without gateway metadata.
 * Used for runtime bypass detection in D3.
 *
 * Heuristics:
 * - Large text insertion (>50 chars)
 * - Contains common AI output patterns
 * - Not from known safe origins (undo, loro sync)
 */
export function detectUnvalidatedAIWrite(tr: Transaction): boolean {
  // Skip if already validated
  if (hasGatewayMetadata(tr)) {
    return false;
  }

  // Skip known safe origins
  const origin = tr.getMeta("origin") || tr.getMeta("lfcc-bridge");
  if (origin === "loro" || origin === "undo" || origin === "redo") {
    return false;
  }

  // Check for large text insertions
  let totalInsertedChars = 0;
  for (const step of tr.steps) {
    const stepJson = step.toJSON();
    if (stepJson.stepType === "replace" && stepJson.slice?.content) {
      for (const node of stepJson.slice.content) {
        if (node.text) {
          totalInsertedChars += node.text.length;
        }
      }
    }
  }

  // Large insertions without gateway metadata are suspicious
  return totalInsertedChars > 100;
}
