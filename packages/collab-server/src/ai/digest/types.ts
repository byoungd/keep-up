/**
 * Digest Types
 *
 * Data models for the Daily Digest generation pipeline.
 * Track 2: Intelligence & Logic (AI)
 */

import type { Citation } from "../rag/types";

// ─────────────────────────────────────────────────────────────────────────────
// ContentItem: Input to the Digest Pipeline
// ─────────────────────────────────────────────────────────────────────────────

/** Source type of the content */
export type ContentSource = "rss" | "import" | "manual" | "web";

/** Content item that can be included in a digest */
export interface ContentItem {
  /** Unique identifier */
  id: string;
  /** Source type */
  source: ContentSource;
  /** Original source URL */
  sourceUrl?: string;
  /** Feed ID (for RSS items) */
  feedId?: string;
  /** Title of the content */
  title: string;
  /** Full text content */
  content: string;
  /** Short snippet/summary */
  snippet?: string;
  /** Author name */
  author?: string;
  /** Publication date (ISO string) */
  publishedAt?: string;
  /** Ingestion timestamp */
  ingestedAt: number;
  /** Topic tags */
  topics: string[];
  /** Canonical hash for deduplication */
  canonicalHash: string;
  /** Word count */
  wordCount: number;
  /** Whether full text was fetched */
  hasFullText: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// DigestCard: Individual Card in a Digest
// ─────────────────────────────────────────────────────────────────────────────

/** Confidence level for generated content */
export type ConfidenceLevel = "high" | "medium" | "low";

/** Card type in the digest */
export type DigestCardType =
  | "summary" // Single item summary
  | "cluster" // Multiple related items clustered
  | "highlight" // Key insight/quote
  | "trend"; // Trending topic across sources

/** A single card in the digest */
export interface DigestCard {
  /** Unique card ID */
  id: string;
  /** Card type */
  type: DigestCardType;
  /** Card headline */
  headline: string;
  /** Generated summary */
  summary: string;
  /** "Why it matters" explanation */
  whyItMatters?: string;
  /** Source content items (IDs) */
  sourceItemIds: string[];
  /** Citations with evidence */
  citations: Citation[];
  /** Confidence in the generated content */
  confidence: ConfidenceLevel;
  /** Topics covered */
  topics: string[];
  /** Priority/importance score (0-100) */
  priorityScore: number;
  /** Generation timestamp */
  generatedAt: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Digest: The Daily Digest Container
// ─────────────────────────────────────────────────────────────────────────────

/** Status of the digest */
export type DigestStatus =
  | "pending" // Scheduled but not started
  | "generating" // Currently being generated
  | "ready" // Successfully generated
  | "failed"; // Generation failed

/** The complete daily digest */
export interface Digest {
  /** Unique digest ID */
  id: string;
  /** User ID (owner) */
  userId: string;
  /** Digest date (YYYY-MM-DD) */
  date: string;
  /** Digest title */
  title: string;
  /** Cards in the digest */
  cards: DigestCard[];
  /** Total source items processed */
  sourceItemCount: number;
  /** Generation status */
  status: DigestStatus;
  /** Error message (if failed) */
  error?: string;
  /** Generation started at */
  startedAt?: number;
  /** Generation completed at */
  completedAt?: number;
  /** Token usage for generation */
  tokenUsage?: {
    input: number;
    output: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Verification Types
// ─────────────────────────────────────────────────────────────────────────────

/** Result of citation verification */
export interface VerificationResult {
  /** Card ID being verified */
  cardId: string;
  /** Whether the card passed verification */
  passed: boolean;
  /** Overall confidence after verification */
  confidence: ConfidenceLevel;
  /** Issues found during verification */
  issues: VerificationIssue[];
  /** Verified citations */
  verifiedCitations: Citation[];
}

/** Issue found during verification */
export interface VerificationIssue {
  /** Type of issue */
  type: "missing_source" | "weak_evidence" | "contradiction" | "hallucination";
  /** Description of the issue */
  description: string;
  /** Affected text in the card */
  affectedText?: string;
  /** Severity */
  severity: "error" | "warning";
}

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline Types
// ─────────────────────────────────────────────────────────────────────────────

/** Options for digest generation */
export interface DigestGenerationOptions {
  /** Maximum cards to generate */
  maxCards?: number;
  /** Minimum confidence threshold */
  minConfidence?: ConfidenceLevel;
  /** Topics to focus on (empty = all) */
  focusTopics?: string[];
  /** Whether to include "Why it matters" */
  includeWhyItMatters?: boolean;
  /** Time window for content (hours) */
  timeWindowHours?: number;
}

/** Result of the scout phase */
export interface ScoutResult {
  /** Content items found */
  items: ContentItem[];
  /** Total available */
  totalAvailable: number;
  /** Filters applied */
  filters: {
    timeWindow: { start: number; end: number };
    topics?: string[];
  };
}

/** Result of the rank phase */
export interface RankResult {
  /** Ranked items with scores */
  rankedItems: Array<{
    item: ContentItem;
    score: number;
    cluster?: string;
  }>;
  /** Clusters identified */
  clusters: Array<{
    id: string;
    topic: string;
    itemIds: string[];
    relevanceScore: number;
  }>;
}

/** Result of the synthesize phase */
export interface SynthesizeResult {
  /** Generated cards */
  cards: DigestCard[];
  /** Items that couldn't be synthesized */
  skippedItems: Array<{
    itemId: string;
    reason: string;
  }>;
  /** Token usage */
  tokenUsage: {
    input: number;
    output: number;
  };
}
