/**
 * LFCC LoroDocumentProvider
 *
 * Implements GatewayDocumentProvider interface backed by Loro + DocumentFacade.
 * Bridges the AI Gateway with the CRDT document model.
 */

import { createHash } from "node:crypto";
import { gateway } from "@keepup/core";
import { readAllAnnotations } from "../annotations/annotationSchema";
import { verifyAnnotationSpans } from "../annotations/verificationSync";
import type { BlockNode } from "../crdt/crdtSchema";
import type { LoroRuntime } from "../runtime/loroRuntime";
import type { DocumentFacade } from "./types";

type GatewayDocumentProvider = gateway.GatewayDocumentProvider;
type DocFrontierTag = gateway.DocFrontierTag;
type FrontierComparison = gateway.FrontierComparison;
type SpanState = gateway.SpanState;

// ============================================================================
// Frontier Helpers
// ============================================================================

/**
 * Parse frontier tag string into peer-counter map.
 */
function parseFrontierTag(tag: string): Map<string, number> {
  const map = new Map<string, number>();
  if (!tag) {
    return map;
  }
  for (const entry of tag.split("|")) {
    if (!entry) {
      continue;
    }
    const [peer, counterText] = entry.split(":");
    if (!peer || !counterText) {
      continue;
    }
    const counter = Number.parseInt(counterText, 10);
    if (Number.isFinite(counter)) {
      map.set(peer, counter);
    }
  }
  return map;
}

/**
 * Compare two frontier maps and return status flags.
 */
function compareFrontierMaps(
  clientMap: Map<string, number>,
  serverMap: Map<string, number>
): { clientAhead: boolean; serverAhead: boolean } {
  let clientAhead = false;
  let serverAhead = false;

  for (const [peer, clientCounter] of clientMap) {
    const serverCounter = serverMap.get(peer);
    if (serverCounter === undefined) {
      clientAhead = true;
      continue;
    }
    if (clientCounter > serverCounter) {
      clientAhead = true;
    } else if (clientCounter < serverCounter) {
      serverAhead = true;
    }
  }

  for (const [peer] of serverMap) {
    if (!clientMap.has(peer)) {
      serverAhead = true;
    }
  }

  return { clientAhead, serverAhead };
}

function serializeFrontier(frontiers: Array<{ peer: string | number; counter: number }>): string {
  if (!frontiers || frontiers.length === 0) {
    return "";
  }
  const entries = frontiers.map((frontier) => `${String(frontier.peer)}:${frontier.counter}`);
  entries.sort();
  return entries.join("|");
}

// ============================================================================
// Span Helpers
// ============================================================================

function buildBlockTextMap(blocks: BlockNode[]): Map<string, string> {
  const map = new Map<string, string>();
  const stack = [...blocks];
  while (stack.length > 0) {
    const block = stack.pop();
    if (!block) {
      continue;
    }
    map.set(block.id, block.text ?? "");
    if (block.children.length > 0) {
      stack.push(...block.children);
    }
  }
  return map;
}

function isValidSpanRange(start: number, end: number, length: number): boolean {
  return (
    Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start && end <= length
  );
}

function buildSpanIdCandidates(
  annotationId: string,
  index: number,
  span: { blockId: string; start: number; end: number },
  includeAnnotationId: boolean
): string[] {
  const candidates = [
    `${annotationId}:${span.blockId}:${span.start}:${span.end}`,
    `s${index}-${span.blockId}-${span.start}-${span.end}`,
  ];
  if (includeAnnotationId) {
    candidates.push(annotationId);
  }
  return candidates;
}

function registerSpanState(
  map: Map<string, SpanState>,
  duplicates: Set<string>,
  spanId: string,
  state: Omit<SpanState, "span_id">
): void {
  if (duplicates.has(spanId)) {
    return;
  }
  if (map.has(spanId)) {
    map.delete(spanId);
    duplicates.add(spanId);
    return;
  }
  map.set(spanId, { ...state, span_id: spanId });
}

function normalizeLF(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function simpleHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash << 5) + hash + str.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

function simpleHash256(str: string): string {
  const parts: string[] = [];
  for (let i = 0; i < 4; i += 1) {
    const part = simpleHash(`${i}:${str}`).padStart(16, "0");
    parts.push(part);
  }
  return parts.join("");
}

function computeContextHash(blockId: string, text: string): string {
  const normalizedText = normalizeLF(text);
  const input = `LFCC_SPAN_V2\nblock_id=${blockId}\ntext=${normalizedText}`;
  try {
    return createHash("sha256").update(input).digest("hex");
  } catch {
    return simpleHash256(input);
  }
}

function buildSpanStateIndex(facade: DocumentFacade, runtime: LoroRuntime): Map<string, SpanState> {
  const blockTextMap = buildBlockTextMap(facade.getBlocks());
  const blockExists = (blockId: string) => blockTextMap.has(blockId);
  const annotations = readAllAnnotations(runtime.doc);
  const spanStates = new Map<string, SpanState>();
  const duplicates = new Set<string>();

  for (const annotation of annotations) {
    const verification = verifyAnnotationSpans(runtime.doc, annotation, blockExists);
    const isVerified = annotation.storedState === "active" && verification.status === "active";
    const includeAnnotationId = annotation.spans.length === 1;

    for (let i = 0; i < annotation.spans.length; i += 1) {
      const span = annotation.spans[i];
      const text = blockTextMap.get(span.blockId);
      if (text === undefined) {
        continue;
      }
      if (!isValidSpanRange(span.start, span.end, text.length)) {
        continue;
      }
      const spanText = text.slice(span.start, span.end);
      const contextHash = computeContextHash(span.blockId, spanText);
      const baseState: Omit<SpanState, "span_id"> = {
        annotation_id: annotation.id,
        block_id: span.blockId,
        text: spanText,
        context_hash: contextHash,
        is_verified: isVerified,
      };
      const candidates = buildSpanIdCandidates(
        annotation.id,
        i,
        span,
        includeAnnotationId && i === 0
      );
      for (const candidate of candidates) {
        registerSpanState(spanStates, duplicates, candidate, baseState);
      }
    }
  }

  return spanStates;
}

// ============================================================================
// Gateway Document Provider
// ============================================================================

/**
 * Create a GatewayDocumentProvider backed by Loro.
 */
export function createLoroDocumentProvider(
  facade: DocumentFacade,
  runtime: LoroRuntime
): GatewayDocumentProvider {
  return {
    getFrontierTag(): DocFrontierTag {
      const frontiers = runtime.doc.frontiers();
      return serializeFrontier(frontiers);
    },

    compareFrontiers(
      clientFrontier: DocFrontierTag,
      serverFrontier: DocFrontierTag
    ): FrontierComparison {
      if (clientFrontier === serverFrontier) {
        return "equal";
      }

      const clientMap = parseFrontierTag(clientFrontier);
      const serverMap = parseFrontierTag(serverFrontier);
      const { clientAhead, serverAhead } = compareFrontierMaps(clientMap, serverMap);

      if (clientAhead && serverAhead) {
        return "diverged";
      }
      if (clientAhead) {
        return "ahead";
      }
      if (serverAhead) {
        return "behind";
      }
      return "equal";
    },

    getSpanState(spanId: string): SpanState | null {
      const spanStates = buildSpanStateIndex(facade, runtime);
      return spanStates.get(spanId) ?? null;
    },

    getSpanStates(spanIds: string[]): Map<string, SpanState> {
      const spanStates = buildSpanStateIndex(facade, runtime);
      const result = new Map<string, SpanState>();
      for (const spanId of spanIds) {
        const state = spanStates.get(spanId);
        if (state) {
          result.set(spanId, state);
        }
      }
      return result;
    },

    documentExists(docId: string): boolean {
      return facade.docId === docId;
    },
  };
}

/**
 * Create an AI Gateway instance wired to the Loro document provider.
 */
export function createLoroAIGateway(
  facade: DocumentFacade,
  runtime: LoroRuntime
): gateway.AIGateway {
  const provider = createLoroDocumentProvider(facade, runtime);
  return gateway.createAIGatewayWithDefaults(provider);
}
