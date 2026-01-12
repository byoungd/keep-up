/**
 * Analytics - Public API
 *
 * Unified analytics tracking for the application.
 *
 * @example
 * ```ts
 * import { track, EventNames, getContentLengthBucket } from '@/lib/analytics';
 *
 * // Track an import success
 * track({
 *   name: EventNames.IMPORT_SUCCEEDED,
 *   sourceType: 'url',
 *   contentLengthBucket: getContentLengthBucket(content.length),
 *   durationMs: Date.now() - startTime,
 * });
 *
 * // In tests
 * const { getEvents, clear, disable } = enableTestMode();
 * // ... perform actions ...
 * expect(getEvents()).toContainEqual({ name: 'import_succeeded', ... });
 * ```
 */

export {
  EventNames,
  getContentLengthBucket,
  getNameLengthBucket,
  type AnalyticsEvent,
  type ContentLengthBucket,
  type NameLengthBucket,
} from "./events";

export {
  enableTestMode,
  isTestMode,
  track,
  trackNotFound,
  trackPageView,
} from "./track";
