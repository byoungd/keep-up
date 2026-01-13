/**
 * Analytics Tracking
 *
 * Unified tracking API with support for:
 * - Development logging
 * - Test mocking
 * - Production analytics (placeholder for PostHog/Mixpanel/etc.)
 */

import { telemetryTrack } from "@/lib/analytics/telemetryAdapter";
import type { AnalyticsEvent } from "./events";

/**
 * Event sink for testing - stores tracked events.
 */
let testSink: AnalyticsEvent[] | null = null;

/**
 * Enable test mode - events are stored in memory for assertions.
 * Returns a function to get tracked events.
 */
export function enableTestMode(): {
  getEvents: () => AnalyticsEvent[];
  clear: () => void;
  disable: () => void;
} {
  testSink = [];
  return {
    getEvents: () => testSink ?? [],
    clear: () => {
      if (testSink) {
        testSink.length = 0;
      }
    },
    disable: () => {
      testSink = null;
    },
  };
}

/**
 * Check if test mode is enabled.
 */
export function isTestMode(): boolean {
  return testSink !== null;
}

/**
 * Track an analytics event.
 *
 * @example
 * ```ts
 * track({ name: 'import_succeeded', sourceType: 'url', contentLengthBucket: 'medium', durationMs: 1234 });
 * ```
 */
export function track<T extends AnalyticsEvent>(event: T): void {
  // Test mode: store in sink
  if (testSink !== null) {
    testSink.push(event);
    return;
  }

  telemetryTrack(event);
}

/**
 * Track a page view event.
 */
export function trackPageView(page: string): void {
  track({ name: "page_viewed", page });
}

/**
 * Track a 404 not found event.
 */
export function trackNotFound(attemptedPath: string): void {
  track({ name: "not_found_viewed", attemptedPath });
}
