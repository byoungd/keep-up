import type { IngestionMeta } from "./atomicAdapter";
import type { DuplicateEntry } from "./deduper";
import type { RssIngestStats, RssQualityReport } from "./rssStats";
import type { IngestResult } from "./types";

export interface RSSFetchInfo {
  etag?: string;
  lastModified?: string;
  modified: boolean;
  durationMs?: number;
}

export interface RSSIngestStatsBundle {
  raw: RssIngestStats;
  deduped: RssIngestStats;
}

export interface RSSIngestReport {
  metas: IngestionMeta[];
  /** Deduped, mapped items (Doc + Blocks) for direct consumption. */
  items: IngestResult[];
  stats: RSSIngestStatsBundle;
  duplicates: DuplicateEntry[];
  fetch: RSSFetchInfo;
  /** Quality gate evaluation based on deduped stats. */
  quality: RssQualityReport;
}
