/**
 * LFCC LoroDocumentProvider
 *
 * Implements GatewayDocumentProvider interface backed by Loro + DocumentFacade.
 * Bridges the AI Gateway with the CRDT document model.
 */

import { computeTextSimilarity, gateway } from "@ku0/core";
import { readAllAnnotations } from "../annotations/annotationSchema";
import { verifyAnnotationSpans } from "../annotations/verificationSync";
import type { BlockNode } from "../crdt/crdtSchema";
import type { LoroRuntime } from "../runtime/loroRuntime";
import type { DocumentFacade } from "./types";

type GatewayDocumentProvider = gateway.GatewayDocumentProvider;
type DocFrontierTag = gateway.DocFrontierTag;
type FrontierComparison = gateway.FrontierComparison;
type SpanState = gateway.SpanState;
type TargetingHashConfig = {
  windowSize: { left: number; right: number };
  neighborWindow: { left: number; right: number };
};

const SELECTION_SPAN_PREFIX = "selection";
const DEFAULT_TARGETING_CONFIG: TargetingHashConfig = {
  windowSize: { left: 50, right: 50 },
  neighborWindow: { left: 20, right: 20 },
};

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

type BlockMeta = {
  blockType: string;
  parentBlockId: string | null;
  parentPath: string | null;
  blockIndex: number;
};

function buildBlockMetaMap(blocks: BlockNode[]): Map<string, BlockMeta> {
  const map = new Map<string, BlockMeta>();
  const walk = (block: BlockNode, parentPath: string[], parentBlockId: string | null): void => {
    const nextIndex = map.size;
    map.set(block.id, {
      blockType: block.type,
      parentBlockId,
      parentPath: parentPath.length > 0 ? parentPath.join("/") : null,
      blockIndex: nextIndex,
    });
    const nextPath = [...parentPath, block.id];
    for (const child of block.children) {
      walk(child, nextPath, block.id);
    }
  };

  for (const block of blocks) {
    walk(block, [], null);
  }

  return map;
}

function resolveTargetingConfig(config?: Partial<TargetingHashConfig>): TargetingHashConfig {
  return {
    windowSize: {
      left: config?.windowSize?.left ?? DEFAULT_TARGETING_CONFIG.windowSize.left,
      right: config?.windowSize?.right ?? DEFAULT_TARGETING_CONFIG.windowSize.right,
    },
    neighborWindow: {
      left: config?.neighborWindow?.left ?? DEFAULT_TARGETING_CONFIG.neighborWindow.left,
      right: config?.neighborWindow?.right ?? DEFAULT_TARGETING_CONFIG.neighborWindow.right,
    },
  };
}

function isValidSpanRange(start: number, end: number, length: number): boolean {
  return (
    Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start && end <= length
  );
}

function isValidSelectionRange(start: number, end: number, length: number): boolean {
  return (
    Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end >= start && end <= length
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

const SHA256_INIT = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
];

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function rotr(value: number, amount: number): number {
  return (value >>> amount) | (value << (32 - amount));
}

function sha256Hex(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const bitLength = bytes.length * 8;
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const buffer = new Uint8Array(paddedLength);
  buffer.set(bytes);
  buffer[bytes.length] = 0x80;

  const view = new DataView(buffer.buffer);
  const high = Math.floor(bitLength / 0x100000000);
  const low = bitLength >>> 0;
  view.setUint32(paddedLength - 8, high, false);
  view.setUint32(paddedLength - 4, low, false);

  const w = new Uint32Array(64);
  let h0 = SHA256_INIT[0];
  let h1 = SHA256_INIT[1];
  let h2 = SHA256_INIT[2];
  let h3 = SHA256_INIT[3];
  let h4 = SHA256_INIT[4];
  let h5 = SHA256_INIT[5];
  let h6 = SHA256_INIT[6];
  let h7 = SHA256_INIT[7];

  for (let offset = 0; offset < buffer.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i += 1) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((value) => value.toString(16).padStart(8, "0"))
    .join("");
}

function computeContextHash(blockId: string, text: string): string {
  const normalizedText = normalizeLF(text);
  const input = `LFCC_SPAN_V2\nblock_id=${blockId}\ntext=${normalizedText}`;
  try {
    return sha256Hex(input);
  } catch {
    return simpleHash256(input);
  }
}

type SelectionSpanDescriptor = {
  annotationId: string;
  blockId: string;
  start: number;
  end: number;
};

export function buildSelectionAnnotationId(requestId: string): string {
  return `${SELECTION_SPAN_PREFIX}:${requestId}`;
}

export function buildSelectionSpanId(
  requestId: string,
  blockId: string,
  start: number,
  end: number
): string {
  return `${SELECTION_SPAN_PREFIX}:${requestId}:${blockId}:${start}:${end}`;
}

function parseSelectionSpanId(spanId: string): SelectionSpanDescriptor | null {
  if (!spanId.startsWith(`${SELECTION_SPAN_PREFIX}:`)) {
    return null;
  }
  const parts = spanId.split(":");
  if (parts.length !== 5) {
    return null;
  }
  const requestId = parts[1];
  const blockId = parts[2];
  const start = Number.parseInt(parts[3], 10);
  const end = Number.parseInt(parts[4], 10);
  if (!requestId || !blockId || !Number.isFinite(start) || !Number.isFinite(end)) {
    return null;
  }
  return {
    annotationId: buildSelectionAnnotationId(requestId),
    blockId,
    start,
    end,
  };
}

type SpanSignalBundle = {
  blockType: string;
  parentBlockId: string | null;
  parentPath: string | null;
  windowHash: string;
  neighborHash: { left?: string; right?: string };
  structureHash: string;
};

function computeSpanSignals(
  blockId: string,
  text: string,
  start: number,
  end: number,
  blockMeta: BlockMeta | undefined,
  targetingConfig: TargetingHashConfig
): SpanSignalBundle {
  const blockType = blockMeta?.blockType ?? "unknown";
  const parentBlockId = blockMeta?.parentBlockId ?? null;
  const parentPath = blockMeta?.parentPath ?? null;
  return {
    blockType,
    parentBlockId,
    parentPath,
    windowHash: gateway.computeSpanWindowHash({
      blockId,
      spanStart: start,
      spanEnd: end,
      blockText: text,
      windowSize: targetingConfig.windowSize,
    }),
    neighborHash: gateway.computeNeighborHash({
      blockId,
      spanStart: start,
      spanEnd: end,
      blockText: text,
      neighborWindow: targetingConfig.neighborWindow,
    }),
    structureHash: gateway.computeStructureHash({
      blockId,
      blockType,
      parentBlockId,
      parentPath,
    }),
  };
}

function buildSpanBaseState(input: {
  annotationId: string;
  blockId: string;
  start: number;
  end: number;
  isVerified: boolean;
  blockTextMap: Map<string, string>;
  blockMetaMap: Map<string, BlockMeta>;
  targetingConfig: TargetingHashConfig;
}): Omit<SpanState, "span_id"> | null {
  const text = input.blockTextMap.get(input.blockId);
  if (text === undefined) {
    return null;
  }
  if (!isValidSpanRange(input.start, input.end, text.length)) {
    return null;
  }
  const spanText = text.slice(input.start, input.end);
  const contextHash = computeContextHash(input.blockId, spanText);
  const blockMeta = input.blockMetaMap.get(input.blockId);
  const signals = computeSpanSignals(
    input.blockId,
    text,
    input.start,
    input.end,
    blockMeta,
    input.targetingConfig
  );

  return {
    annotation_id: input.annotationId,
    block_id: input.blockId,
    block_type: signals.blockType,
    parent_block_id: signals.parentBlockId,
    parent_path: signals.parentPath,
    block_index: blockMeta?.blockIndex,
    span_start: input.start,
    span_end: input.end,
    text: spanText,
    context_hash: contextHash,
    window_hash: signals.windowHash,
    neighbor_hash: signals.neighborHash,
    structure_hash: signals.structureHash,
    is_verified: input.isVerified,
  };
}

function buildSpanStateIndex(
  blockTextMap: Map<string, string>,
  blockMetaMap: Map<string, BlockMeta>,
  runtime: LoroRuntime,
  targetingConfig: TargetingHashConfig
): Map<string, SpanState> {
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
      const baseState = buildSpanBaseState({
        annotationId: annotation.id,
        blockId: span.blockId,
        start: span.start,
        end: span.end,
        isVerified,
        blockTextMap,
        blockMetaMap,
        targetingConfig,
      });
      if (!baseState) {
        continue;
      }
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

function buildSelectionSpanState(
  spanId: string,
  blockTextMap: Map<string, string>,
  blockMetaMap: Map<string, BlockMeta>,
  targetingConfig: TargetingHashConfig
): SpanState | null {
  const descriptor = parseSelectionSpanId(spanId);
  if (!descriptor) {
    return null;
  }
  const text = blockTextMap.get(descriptor.blockId);
  if (text === undefined) {
    return null;
  }
  if (!isValidSelectionRange(descriptor.start, descriptor.end, text.length)) {
    return null;
  }
  const spanText = text.slice(descriptor.start, descriptor.end);
  const blockMeta = blockMetaMap.get(descriptor.blockId);
  const windowHash = gateway.computeSpanWindowHash({
    blockId: descriptor.blockId,
    spanStart: descriptor.start,
    spanEnd: descriptor.end,
    blockText: text,
    windowSize: targetingConfig.windowSize,
  });
  const neighborHash = gateway.computeNeighborHash({
    blockId: descriptor.blockId,
    spanStart: descriptor.start,
    spanEnd: descriptor.end,
    blockText: text,
    neighborWindow: targetingConfig.neighborWindow,
  });
  const structureHash = gateway.computeStructureHash({
    blockId: descriptor.blockId,
    blockType: blockMeta?.blockType ?? "unknown",
    parentBlockId: blockMeta?.parentBlockId ?? null,
    parentPath: blockMeta?.parentPath ?? null,
  });
  return {
    span_id: spanId,
    annotation_id: descriptor.annotationId,
    block_id: descriptor.blockId,
    block_type: blockMeta?.blockType ?? "unknown",
    parent_block_id: blockMeta?.parentBlockId ?? null,
    parent_path: blockMeta?.parentPath ?? null,
    block_index: blockMeta?.blockIndex,
    span_start: descriptor.start,
    span_end: descriptor.end,
    text: spanText,
    context_hash: computeContextHash(descriptor.blockId, spanText),
    window_hash: windowHash,
    neighbor_hash: neighborHash,
    structure_hash: structureHash,
    is_verified: true,
  };
}

function shouldSkipFuzzyCandidate(text: string, candidate: string, threshold: number): boolean {
  const maxLen = Math.max(text.length, candidate.length);
  if (maxLen === 0) {
    return false;
  }
  const lengthDiff = Math.abs(text.length - candidate.length);
  return lengthDiff / maxLen > 1 - threshold;
}

function findBestFuzzySpan(
  spanStates: Map<string, SpanState>,
  text: string,
  threshold: number
): SpanState | null {
  let bestMatch: SpanState | null = null;
  let bestScore = threshold;

  for (const [, state] of spanStates) {
    if (!state.text) {
      continue;
    }
    if (shouldSkipFuzzyCandidate(text, state.text, threshold)) {
      continue;
    }
    const score = computeTextSimilarity(text, state.text);
    if (score >= threshold && (bestMatch === null || score > bestScore)) {
      bestMatch = state;
      bestScore = score;
    }
  }

  return bestMatch;
}

// ============================================================================
// Gateway Document Provider
// ============================================================================

/**
 * Create a GatewayDocumentProvider backed by Loro.
 */
export function createLoroDocumentProvider(
  facade: DocumentFacade,
  runtime: LoroRuntime,
  options?: { targeting?: Partial<TargetingHashConfig> }
): GatewayDocumentProvider {
  const targetingConfig = resolveTargetingConfig(options?.targeting);
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
      const blocks = facade.getBlocks();
      const blockTextMap = buildBlockTextMap(blocks);
      const blockMetaMap = buildBlockMetaMap(blocks);
      const spanStates = buildSpanStateIndex(blockTextMap, blockMetaMap, runtime, targetingConfig);
      const direct = spanStates.get(spanId);
      if (direct) {
        return direct;
      }
      return buildSelectionSpanState(spanId, blockTextMap, blockMetaMap, targetingConfig);
    },

    getSpanStates(spanIds: string[]): Map<string, SpanState> {
      const blocks = facade.getBlocks();
      const blockTextMap = buildBlockTextMap(blocks);
      const blockMetaMap = buildBlockMetaMap(blocks);
      const spanStates = buildSpanStateIndex(blockTextMap, blockMetaMap, runtime, targetingConfig);
      const result = new Map<string, SpanState>();
      for (const spanId of spanIds) {
        const state = spanStates.get(spanId);
        if (state) {
          result.set(spanId, state);
          continue;
        }
        const derived = buildSelectionSpanState(
          spanId,
          blockTextMap,
          blockMetaMap,
          targetingConfig
        );
        if (derived) {
          result.set(spanId, derived);
        }
      }
      return result;
    },

    getAllSpanStates(): Map<string, SpanState> {
      const blocks = facade.getBlocks();
      const blockTextMap = buildBlockTextMap(blocks);
      const blockMetaMap = buildBlockMetaMap(blocks);
      return buildSpanStateIndex(blockTextMap, blockMetaMap, runtime, targetingConfig);
    },

    documentExists(docId: string): boolean {
      return facade.docId === docId;
    },
  };
}

export function createLoroGatewayRetryProviders(
  facade: DocumentFacade,
  runtime: LoroRuntime,
  options?: { targeting?: Partial<TargetingHashConfig> }
): {
  rebaseProvider: gateway.RebaseProvider;
  relocationProvider: gateway.RelocationProvider;
} {
  const provider = createLoroDocumentProvider(facade, runtime, options);
  const targetingConfig = resolveTargetingConfig(options?.targeting);

  return {
    rebaseProvider: {
      async fetchLatest(docId: string, spanIds: string[]) {
        if (docId !== facade.docId) {
          return {
            success: false,
            newFrontier: provider.getFrontierTag(),
            updatedSpans: new Map<string, SpanState>(),
          };
        }
        return {
          success: true,
          newFrontier: provider.getFrontierTag(),
          updatedSpans: provider.getSpanStates(spanIds),
        };
      },
    },
    relocationProvider: {
      findByContextHash(docId: string, contextHash: string) {
        if (docId !== facade.docId) {
          return null;
        }
        const blocks = facade.getBlocks();
        const blockTextMap = buildBlockTextMap(blocks);
        const blockMetaMap = buildBlockMetaMap(blocks);
        const spanStates = buildSpanStateIndex(
          blockTextMap,
          blockMetaMap,
          runtime,
          targetingConfig
        );
        const entries = [...spanStates.entries()].sort((a, b) => a[0].localeCompare(b[0]));
        for (const [, state] of entries) {
          if (state.context_hash === contextHash) {
            return state;
          }
        }
        return null;
      },
      findByFuzzyText(docId: string, text: string, threshold: number) {
        if (docId !== facade.docId) {
          return null;
        }

        const blocks = facade.getBlocks();
        const blockTextMap = buildBlockTextMap(blocks);
        const blockMetaMap = buildBlockMetaMap(blocks);
        const spanStates = buildSpanStateIndex(
          blockTextMap,
          blockMetaMap,
          runtime,
          targetingConfig
        );
        return findBestFuzzySpan(spanStates, text, threshold);
      },
    },
  };
}

/**
 * Create an AI Gateway instance wired to the Loro document provider.
 */
export function createLoroAIGateway(
  facade: DocumentFacade,
  runtime: LoroRuntime,
  options?: { targeting?: Partial<TargetingHashConfig> }
): gateway.AIGateway {
  const provider = createLoroDocumentProvider(facade, runtime, options);
  return gateway.createAIGatewayWithDefaults(provider);
}
