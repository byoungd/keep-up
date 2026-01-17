/**
 * Import Module
 *
 * Public exports for the content import engine.
 */

export type { AssetStoreConfig, WriteAssetResult } from "./AssetStore";
// Asset Storage
export { AssetStore, computeHash, getAssetStore } from "./AssetStore";
export { ImportManager } from "./ImportManager";
export type { RssIngestorConfig, UrlIngestorConfig } from "./ingestors";
// Ingestors
export {
  createFileIngestor,
  createRssIngestor,
  createRssSourceRef,
  createUrlIngestor,
  createYouTubeIngestor,
  registerFile,
} from "./ingestors";
export type { LocalStorageFeedProviderConfig } from "./LocalStorageFeedProvider";
// Feed Providers
export {
  createLocalStorageFeedProvider,
  LocalStorageFeedProvider,
} from "./LocalStorageFeedProvider";
export { ProxyImportManager } from "./ProxyImportManager";
export type {
  FeedProvider,
  RssFeedSubscription,
  RssItemInfo,
  RssPollingSchedulerConfig,
} from "./RssPollingScheduler";
// RSS Polling
export { createRssPollingScheduler, RssPollingScheduler } from "./RssPollingScheduler";
export type { SqliteFeedProviderConfig } from "./SqliteFeedProvider";
export { createSqliteFeedProvider, SqliteFeedProvider } from "./SqliteFeedProvider";
export type {
  CreateDocumentAssetInput,
  CreateDocumentVersionInput,
  CreateImportJobInput,
  CreateRawAssetInput,
  DocumentAsset,
  DocumentAssetRole,
  DocumentVersion,
  ImportManagerConfig,
  ImportManagerEvents,
  IngestorFn,
  IngestResult,
  // New types for Unified Import System
  RawAsset,
  StorageProvider,
  VersionChangeKind,
} from "./types";
