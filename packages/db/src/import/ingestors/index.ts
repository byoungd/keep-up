/**
 * Ingestors Module
 *
 * Export all ingestors for use with ImportManager.
 */

export { createUrlIngestor, type UrlIngestorConfig } from "./urlIngestor";
export {
  createFileIngestor,
  registerFile,
  removePendingFile,
  cleanupStalePendingFiles,
  getPendingFileCount,
} from "./fileIngestor";
export { createRssIngestor, createRssSourceRef, type RssIngestorConfig } from "./rssIngestor";
export { createYouTubeIngestor, type YouTubeIngestorConfig } from "./youtubeIngestor";
