/**
 * Ingest Normalization Stats
 *
 * Provides observability into PDF parsing quality.
 * Used for quality gates, regression testing, and CI reporting.
 *
 * Data Flow:
 *   PDF Buffer → unpdf → TextContent[] → extractPageBlocks() → blocks[] → Normalizer → IngestionMeta
 *                                              ↓
 *                                    IngestNormalizationStats
 */

/**
 * Detailed statistics for PDF ingest quality assessment.
 */
export interface IngestNormalizationStats {
  // === Content Metrics ===
  /** Total character count in final content */
  totalChars: number;
  /** Total word count (whitespace-separated tokens) */
  totalWords: number;
  /** Total paragraph count (double-newline separated) */
  totalParagraphs: number;
  /** Total block count from parser (before normalization) */
  totalBlocks: number;

  // === Fragmentation Metrics ===
  /** Single-character alphabetic words (fragmentation indicator) */
  singleCharWords: number;
  /** Ratio: singleCharWords / totalWords */
  fragmentationRatio: number;

  // === Encoding/Quality Metrics ===
  /** Non-ASCII characters (potential encoding issues) */
  nonAsciiChars: number;
  /** Ratio: nonAsciiChars / totalChars */
  nonAsciiRatio: number;

  // === Paragraph Metrics ===
  /** Paragraphs with < 50 characters */
  shortParagraphs: number;
  /** Ratio: shortParagraphs / totalParagraphs */
  shortParagraphRatio: number;
  /** Average paragraph length in characters */
  avgParagraphLength: number;
  /** Minimum paragraph length */
  minParagraphLength: number;
  /** Maximum paragraph length */
  maxParagraphLength: number;
  /** Empty paragraphs (whitespace only) */
  emptyParagraphs: number;

  // === Extensible Fields (future) ===
  /** Duplicate line ratio (future) */
  duplicateLineRatio?: number;
  /** Suspected header/footer ratio (future) */
  headerFooterRatio?: number;
}

/**
 * Analyze content and compute normalization stats.
 */
export function computeIngestStats(content: string, blockCount?: number): IngestNormalizationStats {
  const paragraphs = content.split("\n\n").filter((p) => p.trim().length > 0);
  const allParagraphs = content.split("\n\n");
  const words = content.split(/\s+/).filter((w) => w.length > 0);
  const singleCharWords = words.filter((w) => w.length === 1 && /[a-zA-Z]/.test(w));
  const nonAsciiChars = (content.match(/[^\x20-\x7E\n\r\t]/g) || []).length;
  const shortParagraphs = paragraphs.filter((p) => p.length < 50).length;
  const emptyParagraphs = allParagraphs.filter((p) => p.trim().length === 0).length;

  const paragraphLengths = paragraphs.map((p) => p.length);
  const avgParagraphLength =
    paragraphs.length > 0
      ? paragraphLengths.reduce((sum, len) => sum + len, 0) / paragraphs.length
      : 0;
  const minParagraphLength = paragraphs.length > 0 ? Math.min(...paragraphLengths) : 0;
  const maxParagraphLength = paragraphs.length > 0 ? Math.max(...paragraphLengths) : 0;

  return {
    totalChars: content.length,
    totalWords: words.length,
    totalParagraphs: paragraphs.length,
    totalBlocks: blockCount ?? paragraphs.length,

    singleCharWords: singleCharWords.length,
    fragmentationRatio:
      words.length > 0 ? Math.round((singleCharWords.length / words.length) * 10000) / 10000 : 0,

    nonAsciiChars,
    nonAsciiRatio:
      content.length > 0 ? Math.round((nonAsciiChars / content.length) * 10000) / 10000 : 0,

    shortParagraphs,
    shortParagraphRatio:
      paragraphs.length > 0 ? Math.round((shortParagraphs / paragraphs.length) * 10000) / 10000 : 0,
    avgParagraphLength: Math.round(avgParagraphLength),
    minParagraphLength,
    maxParagraphLength,
    emptyParagraphs,
  };
}

/**
 * Quality gate thresholds for PDF ingest.
 */
export const INGEST_QUALITY_THRESHOLDS = {
  /** Max single-char word ratio (fragmentation) */
  maxFragmentationRatio: 0.15,
  /** Max non-ASCII character ratio */
  maxNonAsciiRatio: 0.1,
  /** Min average paragraph length */
  minAvgParagraphLength: 50,
  /** Max short paragraph ratio */
  maxShortParagraphRatio: 0.6,
  /** Min total content length */
  minContentLength: 100,
} as const;

export type IngestQualityThresholds = typeof INGEST_QUALITY_THRESHOLDS;
