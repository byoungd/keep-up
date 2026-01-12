/**
 * Database and Import System Initialization
 */

import { ErrorCodes } from "@/lib/errors/types";
import { importFeatureFlags } from "@/lib/import/importFeatures";
import { AutoSwitchDbClient } from "@keepup/db";
import {
  ImportManager,
  type IngestorFn,
  RssPollingScheduler,
  SqliteFeedProvider,
  createFileIngestor,
  createRssIngestor,
  createUrlIngestor,
  createYouTubeIngestor,
  registerFile,
} from "@keepup/db";

// Singleton instances
let dbClientPromise: Promise<AutoSwitchDbClient> | undefined;
let importManagerPromise:
  | Promise<ImportManager | import("@keepup/db").ProxyImportManager>
  | undefined;
let rssScheduler: RssPollingScheduler | undefined;

type ErrorWithCode = Error & { code?: string };

function createUnsupportedIngestor(errorCode: string, message: string): IngestorFn {
  return async () => {
    const error: ErrorWithCode = new Error(message);
    error.name = "ImportUnsupportedError";
    error.code = errorCode;
    throw error;
  };
}

/**
 * Get the database client instance.
 * Initializes it if not already initialized.
 */
export function getDbClient(): Promise<AutoSwitchDbClient> {
  if (!dbClientPromise) {
    dbClientPromise = (async () => {
      let dbName: string | undefined;
      if (typeof window !== "undefined") {
        try {
          const params = new URLSearchParams(window.location.search);
          dbName = params.get("db") || undefined;
        } catch {
          // ignore
        }
      }
      const client = new AutoSwitchDbClient("/db-worker.js", dbName);
      await client.init();
      return client;
    })();
  }
  return dbClientPromise;
}

/**
 * Get the import manager instance.
 * Initializes it if not already initialized.
 */
export async function getImportManager(): Promise<
  ImportManager | import("@keepup/db").ProxyImportManager
> {
  if (!importManagerPromise) {
    importManagerPromise = (async () => {
      const db = await getDbClient();
      const health = await db.healthCheck();

      // If using Worker (SQLite), use ProxyImportManager
      if (health.driver === "sqlite-opfs") {
        const { ProxyImportManager } = await import("@keepup/db");
        // biome-ignore lint/suspicious/noExplicitAny: WorkerDbClient compatibility checked via driver string
        const proxyManager = new ProxyImportManager(db as any);

        // Start RSS polling scheduler for SQLite
        if (importFeatureFlags.rss && !rssScheduler) {
          startRssPollingScheduler(db, proxyManager);
        }

        return proxyManager;
      }

      return await createLocalImportManager(db);
    })();
  }
  return importManagerPromise;
}

async function createLocalImportManager(db: AutoSwitchDbClient): Promise<ImportManager> {
  // Fallback: Local ImportManager (for IDB / Main Thread)
  const manager = new ImportManager(db, {
    concurrency: 2,
    maxRetries: 3,
    retryDelayMs: 1000,
  });

  // Register ingestors locally
  if (importFeatureFlags.url) {
    manager.registerIngestor("url", createUrlIngestor({}));
  } else {
    manager.registerIngestor(
      "url",
      createUnsupportedIngestor(
        ErrorCodes.URL_IMPORT_UNSUPPORTED,
        "URL import is not available. Paste text instead."
      )
    );
  }
  manager.registerIngestor("file", createFileIngestor());
  if (importFeatureFlags.rss) {
    manager.registerIngestor("rss", createRssIngestor({ db }));
  }
  if (importFeatureFlags.youtube) {
    manager.registerIngestor("youtube", createYouTubeIngestor({}));
  }

  // Resume jobs
  try {
    await manager.resume();
  } catch (err) {
    console.error("[ImportManager] Failed to resume jobs", err);
  }

  return manager;
}

/**
 * Start the RSS polling scheduler for automatic feed updates.
 * Only runs when using SQLite and RSS feature is enabled.
 */
function startRssPollingScheduler(
  db: AutoSwitchDbClient,
  importManager: import("@keepup/db").ProxyImportManager
): void {
  if (rssScheduler) {
    return; // Already started
  }

  const feedProvider = new SqliteFeedProvider({
    db,
    proxyUrl: "/api/rss/fetch", // CORS bypass proxy
    defaultPollIntervalMs: 15 * 60 * 1000, // 15 minutes
    fetchTimeoutMs: 30000,
  });

  rssScheduler = new RssPollingScheduler({
    db,
    feedProvider,
    // biome-ignore lint/suspicious/noExplicitAny: ProxyImportManager type compatibility with RssPollingScheduler
    importManager: importManager as any,
    minPollIntervalMs: 5 * 60 * 1000, // Check for feeds to poll every 5 minutes
    maxConcurrentFeeds: 3,
  });

  // Only start if this tab is the leader (to avoid duplicate polling)
  db.onLeaderChange((isLeader) => {
    if (isLeader && rssScheduler) {
      console.info("[RSS] Starting polling scheduler (leader)");
      rssScheduler.start();
    } else if (!isLeader && rssScheduler) {
      console.info("[RSS] Stopping polling scheduler (not leader)");
      rssScheduler.stop();
    }
  });
}

/**
 * Get the RSS polling scheduler instance (if running).
 */
export function getRssScheduler(): RssPollingScheduler | undefined {
  return rssScheduler;
}

// Re-export specific helpers that might be needed by UI
export { registerFile };
