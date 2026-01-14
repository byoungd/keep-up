import { canonicalizeText, computeCanonicalHash } from "@keepup/core";
import { RSSNormalizer } from "./normalizer";
import type { RSSItem } from "./types";

export type DuplicateReason = "stable_id" | "title_content";

export interface DuplicateEntry {
  /** Reason for collapsing the duplicate. */
  reason: DuplicateReason;
  /** Key that was matched (stableId or title+content). */
  key: string;
  /** Item that was kept. */
  kept: RSSItem;
  /** Item that was dropped. */
  dropped: RSSItem;
}

export interface DedupedItems {
  items: RSSItem[];
  duplicates: DuplicateEntry[];
}

/**
 * Fast dedupe using only stable IDs (guid/url hash).
 * Intended for pre-normalization filtering.
 */
export function dedupeRssItemsByStableId(items: RSSItem[]): DedupedItems {
  const stableMap = new Map<string, RSSItem>();
  const duplicates: DuplicateEntry[] = [];

  for (const item of items) {
    const stableId = buildStableId(item);
    if (!stableId) {
      const fallbackKey = `fallback:${stableMap.size}`;
      stableMap.set(fallbackKey, item);
      continue;
    }

    const existing = stableMap.get(stableId);
    if (existing) {
      const kept = preferByScore(existing, item);
      const dropped = kept === existing ? item : existing;
      stableMap.set(stableId, kept);
      duplicates.push({
        reason: "stable_id",
        key: stableId,
        kept,
        dropped,
      });
      continue;
    }

    stableMap.set(stableId, item);
  }

  return {
    items: Array.from(stableMap.values()),
    duplicates,
  };
}

interface CandidateKey {
  stableId?: string;
  titleContentKey?: string;
  score: number;
}

/**
 * Deduplicate RSS items using stable identifiers first (guid/link),
 * then normalized title + canonical content hash.
 * Prefers items with longer cleaned content (assumed fuller text).
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: dedupe logic
export function dedupeRssItems(items: RSSItem[]): DedupedItems {
  const stableMap = new Map<string, RSSItem>();
  const titleContentMap = new Map<string, RSSItem>();
  const duplicates: DuplicateEntry[] = [];

  for (const item of items) {
    const key = buildCandidateKey(item);
    const existingByStable = key.stableId ? stableMap.get(key.stableId) : undefined;

    if (key.stableId && existingByStable) {
      const kept = preferByScore(existingByStable, item);
      const dropped = kept === existingByStable ? item : existingByStable;
      stableMap.set(key.stableId, kept);
      duplicates.push({
        reason: "stable_id",
        key: key.stableId,
        kept,
        dropped,
      });
      continue;
    }

    const existingByTitle = key.titleContentKey
      ? titleContentMap.get(key.titleContentKey)
      : undefined;

    if (key.titleContentKey && existingByTitle) {
      const kept = preferByScore(existingByTitle, item);
      const dropped = kept === existingByTitle ? item : existingByTitle;
      titleContentMap.set(key.titleContentKey, kept);
      duplicates.push({
        reason: "title_content",
        key: key.titleContentKey,
        kept,
        dropped,
      });
      continue;
    }

    if (key.stableId) {
      stableMap.set(key.stableId, item);
    } else if (key.titleContentKey) {
      titleContentMap.set(key.titleContentKey, item);
    } else {
      // No dedupe keys available; keep as-is
      const fallbackKey = `idx_${stableMap.size + titleContentMap.size}`;
      titleContentMap.set(fallbackKey, item);
    }
  }

  const itemsFromStable = Array.from(stableMap.values());
  const itemsFromTitle = Array.from(titleContentMap.values());

  // Merge stable and title maps, ensuring uniqueness
  const merged = new Map<string, RSSItem>();
  for (const it of [...itemsFromStable, ...itemsFromTitle]) {
    const id = buildIdentity(it);
    merged.set(id, it);
  }

  return {
    items: Array.from(merged.values()),
    duplicates,
  };
}

function buildCandidateKey(item: RSSItem): CandidateKey {
  const stableId = buildStableId(item);
  const { titleContentKey, score } = buildTitleContentKey(item);
  return { stableId, titleContentKey, score };
}

function buildStableId(item: RSSItem): string | undefined {
  if (item.guid) {
    return RSSNormalizer.generateStableId(item.link ?? "", item.guid);
  }
  if (item.link) {
    return RSSNormalizer.generateStableId(item.link);
  }
  return undefined;
}

function buildTitleContentKey(item: RSSItem): { titleContentKey?: string; score: number } {
  const normalizedTitle = normalizeTitle(item.title ?? "");
  const contentHash = buildContentHash(item);
  const score = (item["content:encoded"] || item.content || item.description || "").length;

  if (!normalizedTitle && !contentHash) {
    return { titleContentKey: undefined, score };
  }

  return {
    titleContentKey: `${normalizedTitle}::${contentHash ?? "no-content"}`,
    score,
  };
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[\s\n\r\t]+/g, " ")
    .replace(/[^\w\s]/g, "")
    .trim();
}

function buildContentHash(item: RSSItem): string | undefined {
  const raw = item["content:encoded"] || item.content || item.description || "";
  if (!raw.trim()) {
    return undefined;
  }
  const cleaned = RSSNormalizer.cleanContent(raw);
  const canonical = canonicalizeText(cleaned);
  return computeCanonicalHash(canonical.blocks.map((text) => ({ text }))).docHash;
}

function preferByScore(a: RSSItem, b: RSSItem): RSSItem {
  const scoreA = (a["content:encoded"] || a.content || a.description || "").length;
  const scoreB = (b["content:encoded"] || b.content || b.description || "").length;
  return scoreB > scoreA ? b : a;
}

function buildIdentity(item: RSSItem): string {
  const stableId = buildStableId(item);
  if (stableId) {
    return `stable:${stableId}`;
  }
  const title = normalizeTitle(item.title ?? "");
  const link = item.link ? RSSNormalizer.normalizeUrl(item.link) : "no-link";
  return `fallback:${title}:${link}`;
}
