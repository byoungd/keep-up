import { ensureBlockMap } from "@keepup/lfcc-bridge";
import type { LoroRuntime, SpanList } from "@keepup/lfcc-bridge";
import type { Node as PMNode } from "prosemirror-model";
import type { EditorState } from "prosemirror-state";

export type ReferenceAnchor = {
  id: string;
  docId?: string;
  blockId: string;
  startUtf16: number;
  endUtf16: number;
  exactHash: string;
  prefixHash: string;
  suffixHash: string;
  exactText: string;
  prefixText: string;
  suffixText: string;
  createdAtRev: string;
};

export type ReferenceResolutionStatus = "resolved" | "remapped" | "unresolved";

export type ResolvedReference = {
  anchor: ReferenceAnchor;
  status: ReferenceResolutionStatus;
  startUtf16?: number;
  endUtf16?: number;
  reason?: string;
};

export type ReferenceRange = {
  status: ReferenceResolutionStatus;
  from?: number;
  to?: number;
  reason?: string;
};

const PREFIX_WINDOW = 20;
const SUFFIX_WINDOW = 20;

function hashString(text: string): string {
  let h1 = 0xdeadbeef ^ text.length;
  let h2 = 0x41c6ce57 ^ text.length;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${(h1 >>> 0).toString(16)}${(h2 >>> 0).toString(16)}`;
}

function clampRange(text: string, start: number, end: number) {
  const safeStart = Math.max(0, Math.min(start, text.length));
  const safeEnd = Math.max(safeStart, Math.min(end, text.length));
  return { safeStart, safeEnd };
}

export function buildReferenceAnchors(
  spans: SpanList,
  runtime: LoroRuntime,
  docId?: string
): ReferenceAnchor[] {
  const anchors: ReferenceAnchor[] = [];
  for (const span of spans) {
    const blockMap = ensureBlockMap(runtime.doc, span.blockId);
    const rawText = blockMap.get("text");
    const blockText =
      typeof rawText === "string"
        ? rawText
        : rawText && typeof rawText.toString === "function"
          ? rawText.toString()
          : "";
    if (!blockText) {
      continue;
    }
    const { safeStart, safeEnd } = clampRange(blockText, span.start, span.end);
    if (safeEnd <= safeStart) {
      continue;
    }
    const exactText = blockText.slice(safeStart, safeEnd);
    const prefixText = blockText.slice(Math.max(0, safeStart - PREFIX_WINDOW), safeStart);
    const suffixText = blockText.slice(
      safeEnd,
      Math.min(blockText.length, safeEnd + SUFFIX_WINDOW)
    );
    const exactHash = hashString(exactText);
    const prefixHash = hashString(prefixText);
    const suffixHash = hashString(suffixText);
    const id = `ref-${span.blockId}-${safeStart}-${safeEnd}-${exactHash.slice(0, 8)}`;
    anchors.push({
      id,
      docId,
      blockId: span.blockId,
      startUtf16: safeStart,
      endUtf16: safeEnd,
      exactHash,
      prefixHash,
      suffixHash,
      exactText,
      prefixText,
      suffixText,
      createdAtRev: JSON.stringify(runtime.frontiers),
    });
  }
  return anchors;
}

export function resolveReferenceInBlock(
  anchor: ReferenceAnchor,
  blockText: string
): ResolvedReference {
  const { safeStart, safeEnd } = clampRange(blockText, anchor.startUtf16, anchor.endUtf16);
  const currentText = blockText.slice(safeStart, safeEnd);
  if (currentText && hashString(currentText) === anchor.exactHash) {
    return {
      anchor,
      status: "resolved",
      startUtf16: safeStart,
      endUtf16: safeEnd,
    };
  }

  const exactMatches = findExactMatches(blockText, anchor.exactText);
  if (exactMatches.length === 1) {
    const [match] = exactMatches;
    return {
      anchor,
      status: "remapped",
      startUtf16: match.start,
      endUtf16: match.end,
    };
  }
  if (exactMatches.length > 1) {
    return { anchor, status: "unresolved", reason: "ambiguous" };
  }

  const fallback = findPrefixSuffixMatch(blockText, anchor);
  if (fallback) {
    return {
      anchor,
      status: "remapped",
      startUtf16: fallback.start,
      endUtf16: fallback.end,
    };
  }

  return { anchor, status: "unresolved", reason: "not_found" };
}

type BlockEntry = { pos: number; node: PMNode };

const CONTAINER_NODE_NAMES = new Set([
  "list",
  "list_item",
  "quote",
  "table",
  "table_row",
  "table_cell",
]);

function isLeafTextBlock(node: PMNode): boolean {
  if (!node.isTextblock) {
    return false;
  }
  return !CONTAINER_NODE_NAMES.has(node.type.name);
}

function hasBlockId(node: PMNode): node is PMNode & { attrs: { block_id: string } } {
  const blockId = node.attrs?.block_id;
  return typeof blockId === "string" && blockId.trim() !== "";
}

function findBlockEntry(state: EditorState, blockId: string): BlockEntry | null {
  let entry: BlockEntry | null = null;
  state.doc.descendants((node, pos) => {
    if (entry) {
      return false;
    }
    const group = node.type.spec.group ?? "";
    const isBlock = node.isBlock && group.split(" ").includes("block");
    if (!isBlock || !isLeafTextBlock(node) || !hasBlockId(node)) {
      return;
    }
    if (node.attrs.block_id === blockId) {
      entry = { pos, node };
      return false;
    }
  });
  return entry;
}

export function resolveReferenceInState(
  anchor: ReferenceAnchor,
  state: EditorState
): ReferenceRange {
  const entry = findBlockEntry(state, anchor.blockId);
  if (!entry) {
    return { status: "unresolved", reason: "missing_block" };
  }
  const blockText = entry.node.textContent;
  const resolved = resolveReferenceInBlock(anchor, blockText);
  if (resolved.status === "unresolved") {
    return { status: "unresolved", reason: resolved.reason };
  }
  const contentStart = entry.pos + 1;
  const from = contentStart + (resolved.startUtf16 ?? 0);
  const to = contentStart + (resolved.endUtf16 ?? 0);
  if (to <= from) {
    return { status: "unresolved", reason: "invalid_range" };
  }
  return { status: resolved.status, from, to };
}

type MatchRange = { start: number; end: number };

function findExactMatches(blockText: string, exactText: string): MatchRange[] {
  if (!exactText) {
    return [];
  }
  const matches: MatchRange[] = [];
  let index = 0;
  while (index < blockText.length) {
    const next = blockText.indexOf(exactText, index);
    if (next === -1) {
      break;
    }
    matches.push({ start: next, end: next + exactText.length });
    index = next + exactText.length;
  }
  return matches;
}

function findPrefixSuffixMatch(blockText: string, anchor: ReferenceAnchor): MatchRange | null {
  if (!anchor.prefixText || !anchor.suffixText) {
    return null;
  }
  const candidates: MatchRange[] = [];
  let prefixIndex = 0;
  while (prefixIndex < blockText.length) {
    const nextPrefix = blockText.indexOf(anchor.prefixText, prefixIndex);
    if (nextPrefix === -1) {
      break;
    }
    const candidate = checkCandidateAtPrefix(blockText, anchor, nextPrefix);
    if (candidate) {
      candidates.push(candidate);
    }
    prefixIndex = nextPrefix + anchor.prefixText.length;
  }
  if (candidates.length === 1) {
    return candidates[0] ?? null;
  }
  return null;
}

function checkCandidateAtPrefix(
  blockText: string,
  anchor: ReferenceAnchor,
  prefixIndex: number
): MatchRange | null {
  if (!anchor.prefixText || !anchor.suffixText) {
    return null;
  }
  const candidateStart = prefixIndex + anchor.prefixText.length;
  const nextSuffix = blockText.indexOf(anchor.suffixText, candidateStart);
  if (nextSuffix !== -1) {
    const candidateEnd = nextSuffix;
    if (candidateEnd > candidateStart) {
      const candidateText = blockText.slice(candidateStart, candidateEnd);
      if (hashString(candidateText) === anchor.exactHash) {
        return { start: candidateStart, end: candidateEnd };
      }
    }
  }
  return null;
}
