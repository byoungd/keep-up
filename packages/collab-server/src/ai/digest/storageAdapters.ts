/**
 * Storage Adapters for Digest Module
 *
 * Bridges the DbDriver interface to the ContentStore/DigestStore
 * interfaces expected by DigestService.
 *
 * NOTE: These adapters are designed to work with DbDriver from @ku0/db.
 * Import the actual DbDriver types when integrating with the app.
 */

import type { Citation } from "../rag/types";
import type {
  ConfidenceLevel,
  ContentItem,
  ContentSource,
  Digest,
  DigestCard,
  DigestCardType,
  DigestStatus,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// DbDriver Types (mirrored from @ku0/db for decoupling)
// ─────────────────────────────────────────────────────────────────────────────

/** Represents a row from the `content_items` table. */
interface ContentItemRow {
  itemId: string;
  source: ContentSource;
  sourceUrl: string | null;
  feedId: string | null;
  title: string;
  content: string;
  snippet: string | null;
  author: string | null;
  publishedAt: number | null;
  ingestedAt: number;
  topicsJson: string;
  canonicalHash: string;
  wordCount: number;
  hasFullText: boolean;
}

/** Represents a row from the `digests` table. */
interface DigestRow {
  digestId: string;
  userId: string;
  date: string;
  title: string;
  status: DigestStatus;
  error: string | null;
  sourceItemCount: number;
  tokenUsageJson: string | null;
  startedAt: number | null;
  completedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

/** Represents a row from the `digest_cards` table. */
interface DigestCardRow {
  cardId: string;
  digestId: string;
  cardType: DigestCardType;
  headline: string;
  summary: string;
  whyItMatters: string | null;
  confidence: ConfidenceLevel;
  priorityScore: number;
  topicsJson: string;
  citationsJson: string;
  orderIndex: number;
  generatedAt: number;
}

/** Options for listing content items. */
interface ListContentItemsOptions {
  startTime?: number;
  endTime?: number;
  source?: ContentSource;
  feedId?: string;
  limit?: number;
  offset?: number;
}

/** Options for listing digests. */
interface ListDigestsOptions {
  userId: string;
  status?: DigestStatus;
  limit?: number;
  offset?: number;
}

/**
 * Minimal DbDriver interface for digest operations.
 * Implementations should come from @ku0/db.
 */
export interface DigestDbDriver {
  // Content Item operations
  upsertContentItem(item: ContentItemRow): Promise<void>;
  getContentItem(itemId: string): Promise<ContentItemRow | null>;
  getContentItemByHash(canonicalHash: string): Promise<ContentItemRow | null>;
  listContentItems(options?: ListContentItemsOptions): Promise<ContentItemRow[]>;

  // Digest operations
  createDigest(digest: Omit<DigestRow, "createdAt" | "updatedAt">): Promise<void>;
  updateDigest(
    digestId: string,
    updates: Partial<
      Pick<
        DigestRow,
        "status" | "error" | "sourceItemCount" | "tokenUsageJson" | "startedAt" | "completedAt"
      >
    >
  ): Promise<void>;
  getDigest(digestId: string): Promise<DigestRow | null>;
  getDigestByDate(userId: string, date: string): Promise<DigestRow | null>;
  listDigests(options: ListDigestsOptions): Promise<DigestRow[]>;

  // Digest Card operations
  createDigestCard(card: DigestCardRow): Promise<void>;
  listDigestCards(digestId: string): Promise<DigestCardRow[]>;
  linkCardSource(cardId: string, sourceItemId: string, sourceType: string): Promise<void>;
  getCardSourceIds(cardId: string): Promise<string[]>;
}

// ─────────────────────────────────────────────────────────────────────────────
// ContentStore Adapter
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Adapts DbDriver to ContentStore interface for DigestService.
 */
export class ContentStoreAdapter {
  constructor(private readonly db: DigestDbDriver) {}

  /**
   * Get content items within a time range.
   */
  async getItemsInRange(start: number, end: number): Promise<ContentItem[]> {
    const rows = await this.db.listContentItems({
      startTime: start,
      endTime: end,
    });
    return rows.map(rowToContentItem);
  }

  /**
   * Get content items by IDs.
   */
  async getItemsByIds(ids: string[]): Promise<ContentItem[]> {
    const items: ContentItem[] = [];
    for (const id of ids) {
      const row = await this.db.getContentItem(id);
      if (row) {
        items.push(rowToContentItem(row));
      }
    }
    return items;
  }

  /**
   * Get items by topic.
   */
  async getItemsByTopic(topic: string): Promise<ContentItem[]> {
    // Query all items and filter by topic
    // TODO: Add topic index query for better performance
    const rows = await this.db.listContentItems({ limit: 1000 });
    return rows
      .filter((row) => {
        const topics = parseJsonArray<string>(row.topicsJson);
        return topics.includes(topic);
      })
      .map(rowToContentItem);
  }

  /**
   * Save a content item.
   */
  async saveItem(item: ContentItem): Promise<void> {
    await this.db.upsertContentItem(contentItemToRow(item));
  }

  /**
   * Check if content already exists (by hash).
   */
  async existsByHash(canonicalHash: string): Promise<boolean> {
    const existing = await this.db.getContentItemByHash(canonicalHash);
    return existing !== null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DigestStore Adapter
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Adapts DbDriver to DigestStore interface for DigestService.
 */
export class DigestStoreAdapter {
  constructor(private readonly db: DigestDbDriver) {}

  /**
   * Save a digest (create or update).
   */
  async save(digest: Digest): Promise<void> {
    const existing = await this.db.getDigest(digest.id);

    if (existing) {
      await this.db.updateDigest(digest.id, {
        status: digest.status,
        error: digest.error ?? null,
        sourceItemCount: digest.sourceItemCount,
        tokenUsageJson: digest.tokenUsage ? JSON.stringify(digest.tokenUsage) : null,
        startedAt: digest.startedAt ?? null,
        completedAt: digest.completedAt ?? null,
      });
    } else {
      await this.db.createDigest({
        digestId: digest.id,
        userId: digest.userId,
        date: digest.date,
        title: digest.title,
        status: digest.status,
        error: digest.error ?? null,
        sourceItemCount: digest.sourceItemCount,
        tokenUsageJson: digest.tokenUsage ? JSON.stringify(digest.tokenUsage) : null,
        startedAt: digest.startedAt ?? null,
        completedAt: digest.completedAt ?? null,
      });
    }

    // Save cards
    for (let index = 0; index < digest.cards.length; index++) {
      const card = digest.cards[index];
      await this.db.createDigestCard(digestCardToRow(card, digest.id, index));

      // Link source items
      for (const sourceId of card.sourceItemIds) {
        await this.db.linkCardSource(card.id, sourceId, "content_item");
      }
    }
  }

  /**
   * Get a digest by ID.
   */
  async getById(id: string): Promise<Digest | null> {
    const row = await this.db.getDigest(id);
    if (!row) {
      return null;
    }

    const cardRows = await this.db.listDigestCards(id);
    const cards = await this.hydrateCards(cardRows);

    return rowToDigest(row, cards);
  }

  /**
   * Get a digest by user and date.
   */
  async getByDate(userId: string, date: string): Promise<Digest | null> {
    const row = await this.db.getDigestByDate(userId, date);
    if (!row) {
      return null;
    }

    const cardRows = await this.db.listDigestCards(row.digestId);
    const cards = await this.hydrateCards(cardRows);

    return rowToDigest(row, cards);
  }

  /**
   * List recent digests for a user.
   */
  async listRecent(userId: string, limit: number): Promise<Digest[]> {
    const rows = await this.db.listDigests({ userId, limit });
    const digests: Digest[] = [];

    for (const row of rows) {
      const cardRows = await this.db.listDigestCards(row.digestId);
      const cards = await this.hydrateCards(cardRows);
      digests.push(rowToDigest(row, cards));
    }

    return digests;
  }

  /**
   * Hydrate card rows with source item IDs.
   */
  private async hydrateCards(cardRows: DigestCardRow[]): Promise<DigestCard[]> {
    const cards: DigestCard[] = [];

    for (const row of cardRows) {
      const sourceIds = await this.db.getCardSourceIds(row.cardId);
      cards.push(rowToDigestCard(row, sourceIds));
    }

    return cards;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Conversion Functions
// ─────────────────────────────────────────────────────────────────────────────

function rowToContentItem(row: ContentItemRow): ContentItem {
  return {
    id: row.itemId,
    source: row.source as ContentSource,
    sourceUrl: row.sourceUrl ?? undefined,
    feedId: row.feedId ?? undefined,
    title: row.title,
    content: row.content,
    snippet: row.snippet ?? undefined,
    author: row.author ?? undefined,
    publishedAt: row.publishedAt ? new Date(row.publishedAt).toISOString() : undefined,
    ingestedAt: row.ingestedAt,
    topics: parseJsonArray<string>(row.topicsJson),
    canonicalHash: row.canonicalHash,
    wordCount: row.wordCount,
    hasFullText: row.hasFullText,
  };
}

function contentItemToRow(item: ContentItem): ContentItemRow {
  return {
    itemId: item.id,
    source: item.source,
    sourceUrl: item.sourceUrl ?? null,
    feedId: item.feedId ?? null,
    title: item.title,
    content: item.content,
    snippet: item.snippet ?? null,
    author: item.author ?? null,
    publishedAt: item.publishedAt ? new Date(item.publishedAt).getTime() : null,
    ingestedAt: item.ingestedAt,
    topicsJson: JSON.stringify(item.topics),
    canonicalHash: item.canonicalHash,
    wordCount: item.wordCount,
    hasFullText: item.hasFullText,
  };
}

function rowToDigest(row: DigestRow, cards: DigestCard[]): Digest {
  return {
    id: row.digestId,
    userId: row.userId,
    date: row.date,
    title: row.title,
    status: row.status as DigestStatus,
    error: row.error ?? undefined,
    sourceItemCount: row.sourceItemCount,
    cards,
    startedAt: row.startedAt ?? undefined,
    completedAt: row.completedAt ?? undefined,
    tokenUsage: row.tokenUsageJson ? JSON.parse(row.tokenUsageJson) : undefined,
  };
}

function rowToDigestCard(row: DigestCardRow, sourceItemIds: string[]): DigestCard {
  return {
    id: row.cardId,
    type: row.cardType as DigestCardType,
    headline: row.headline,
    summary: row.summary,
    whyItMatters: row.whyItMatters ?? undefined,
    confidence: row.confidence as ConfidenceLevel,
    priorityScore: row.priorityScore,
    topics: parseJsonArray<string>(row.topicsJson),
    citations: parseJsonArray<Citation>(row.citationsJson),
    sourceItemIds,
    generatedAt: row.generatedAt,
  };
}

function digestCardToRow(card: DigestCard, digestId: string, orderIndex: number): DigestCardRow {
  return {
    cardId: card.id,
    digestId,
    cardType: card.type,
    headline: card.headline,
    summary: card.summary,
    whyItMatters: card.whyItMatters ?? null,
    confidence: card.confidence,
    priorityScore: card.priorityScore,
    topicsJson: JSON.stringify(card.topics),
    citationsJson: JSON.stringify(card.citations),
    orderIndex,
    generatedAt: card.generatedAt,
  };
}

function parseJsonArray<T>(json: string): T[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
