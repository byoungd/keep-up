/**
 * Import Telemetry
 *
 * Placeholder telemetry functions for import events.
 * Replace with actual telemetry implementation (e.g., PostHog, Mixpanel, etc.)
 */

type ImportTelemetryEvent =
  | { name: "import_modal_opened"; tab: string }
  | { name: "import_drop_overlay_shown" }
  | { name: "import_dropped"; type: "file" | "url"; count: number }
  | { name: "import_started"; sourceType: string; jobId: string }
  | { name: "import_succeeded"; jobId: string; documentId?: string }
  | { name: "import_failed"; jobId: string; error: string }
  | { name: "import_dedupe_hit"; jobId: string; existingDocId: string };

const DEBUG = process.env.NODE_ENV === "development";

/**
 * Track an import-related event.
 */
export function trackImportEvent(event: ImportTelemetryEvent): void {
  if (DEBUG) {
    console.debug("[Import Telemetry]", event.name, event);
  }

  // TODO: Replace with actual telemetry provider
  // Example for PostHog:
  // posthog?.capture(event.name, event);

  // Example for custom analytics:
  // analytics.track(event.name, event);
}

/**
 * Track when the import modal is opened.
 */
export function trackModalOpened(tab: string): void {
  trackImportEvent({ name: "import_modal_opened", tab });
}

/**
 * Track when the drop overlay is shown.
 */
export function trackDropOverlayShown(): void {
  trackImportEvent({ name: "import_drop_overlay_shown" });
}

/**
 * Track when content is dropped.
 */
export function trackDrop(type: "file" | "url", count: number): void {
  trackImportEvent({ name: "import_dropped", type, count });
}

/**
 * Track when an import job starts.
 */
export function trackImportStarted(sourceType: string, jobId: string): void {
  trackImportEvent({ name: "import_started", sourceType, jobId });
}

/**
 * Track when an import job succeeds.
 */
export function trackImportSucceeded(jobId: string, documentId?: string): void {
  trackImportEvent({ name: "import_succeeded", jobId, documentId });
}

/**
 * Track when an import job fails.
 */
export function trackImportFailed(jobId: string, error: string): void {
  trackImportEvent({ name: "import_failed", jobId, error });
}

/**
 * Track when a duplicate is detected.
 */
export function trackDedupeHit(jobId: string, existingDocId: string): void {
  trackImportEvent({ name: "import_dedupe_hit", jobId, existingDocId });
}
