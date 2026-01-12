/**
 * Import Module
 *
 * Public exports for the content import engine.
 */

export { ImportManager } from "./ImportManager";
export { ProxyImportManager } from "./ProxyImportManager";
export type {
  CreateImportJobInput,
  ImportManagerConfig,
  ImportManagerEvents,
  IngestorFn,
  IngestResult,
  // New types for Unified Import System
  RawAsset,
  CreateRawAssetInput,
  StorageProvider,
  DocumentAsset,
  CreateDocumentAssetInput,
  DocumentAssetRole,
  DocumentVersion,
  CreateDocumentVersionInput,
  VersionChangeKind,
} from "./types";

// Asset Storage
export { AssetStore, getAssetStore, computeHash } from "./AssetStore";
export type { AssetStoreConfig, WriteAssetResult } from "./AssetStore";

// Ingestors
export {
  createUrlIngestor,
  createFileIngestor,
  createRssIngestor,
  createYouTubeIngestor,
  registerFile,
  createRssSourceRef,
} from "./ingestors";
export type { UrlIngestorConfig, RssIngestorConfig } from "./ingestors";

// RSS Polling
export { RssPollingScheduler, createRssPollingScheduler } from "./RssPollingScheduler";
export type {
  RssPollingSchedulerConfig,
  FeedProvider,
  RssFeedSubscription,
  RssItemInfo,
} from "./RssPollingScheduler";

// Feed Providers
export {
  LocalStorageFeedProvider,
  createLocalStorageFeedProvider,
} from "./LocalStorageFeedProvider";
export type { LocalStorageFeedProviderConfig } from "./LocalStorageFeedProvider";
export { SqliteFeedProvider, createSqliteFeedProvider } from "./SqliteFeedProvider";
export type { SqliteFeedProviderConfig } from "./SqliteFeedProvider";
