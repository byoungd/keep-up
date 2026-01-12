/**
 * LFCC LoroDocumentProvider
 *
 * Implements GatewayDocumentProvider interface backed by Loro + DocumentFacade.
 * Bridges the AI Gateway with the CRDT document model.
 */

import type { gateway } from "@keepup/core";
import type { LoroRuntime } from "../runtime/loroRuntime";
import type { DocumentFacade } from "./types";

type GatewayDocumentProvider = gateway.GatewayDocumentProvider;
type DocFrontierTag = gateway.DocFrontierTag;
type FrontierComparison = gateway.FrontierComparison;
type SpanState = gateway.SpanState;

/**
 * Parse frontier tag string into peer-counter map.
 */
function parseFrontierTag(tag: string): Map<string, number> {
  const map = new Map<string, number>();
  if (!tag) {
    return map;
  }
  for (const entry of tag.split("|")) {
    const [peer, counter] = entry.split(":");
    if (peer && counter) {
      map.set(peer, Number.parseInt(counter, 10));
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
    const serverCounter = serverMap.get(peer) ?? -1;
    if (clientCounter > serverCounter) {
      clientAhead = true;
    } else if (clientCounter < serverCounter) {
      serverAhead = true;
    }
  }

  for (const [peer, serverCounter] of serverMap) {
    if (!clientMap.has(peer) && serverCounter >= 0) {
      serverAhead = true;
    }
  }

  return { clientAhead, serverAhead };
}

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
      if (!frontiers || frontiers.length === 0) {
        return "";
      }
      // Encode frontiers as sorted "peer:counter" pairs
      const entries = frontiers.map((f) => `${f.peer}:${f.counter}`);
      entries.sort();
      return entries.join("|");
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
      const comparison = compareFrontierMaps(clientMap, serverMap);

      if (comparison.clientAhead && comparison.serverAhead) {
        return "diverged";
      }
      if (comparison.clientAhead) {
        return "ahead";
      }
      if (comparison.serverAhead) {
        return "behind";
      }
      return "equal";
    },

    getSpanState(spanId: string): SpanState | null {
      // Span lookup via annotations
      const annotations = facade.getAnnotations();
      for (const ann of annotations) {
        for (const span of ann.spans) {
          const spanIdCandidate = `${ann.id}:${span.blockId}:${span.start}:${span.end}`;
          if (spanIdCandidate === spanId || ann.id === spanId) {
            const block = facade.getBlock(span.blockId);
            const text = block?.text ?? "";
            const spanText = text.slice(span.start, span.end);
            const contextHash = hashString(spanText);

            return {
              span_id: spanId,
              annotation_id: ann.id,
              block_id: span.blockId,
              text: spanText,
              context_hash: contextHash,
              is_verified: ann.attrs?.verified === true,
            };
          }
        }
      }
      return null;
    },

    getSpanStates(spanIds: string[]): Map<string, SpanState> {
      const result = new Map<string, SpanState>();
      for (const spanId of spanIds) {
        const state = this.getSpanState(spanId);
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
 * Simple string hash for context verification.
 */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(16);
}
