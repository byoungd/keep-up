/**
 * AI Panel Constants
 *
 * Centralized constants for AI-related features to ensure consistency
 * and make configuration changes easier.
 */

// ───────────────────────────────────────────────────────────────────────────────
// Streaming & Request
// ───────────────────────────────────────────────────────────────────────────────

/** Request timeout in milliseconds (30 seconds) */
export const REQUEST_TIMEOUT_MS = 30_000;

/** SSE stream completion marker */
export const SSE_DONE_MARKER = "[DONE]";

/** Debounce delay for stream chunk processing (ms) */
export const STREAM_CHUNK_DEBOUNCE_MS = 16;

// ──────────────────────────────────────────────────────────────────────────────
// Input Area
// ──────────────────────────────────────────────────────────────────────────────

/** Maximum characters allowed in input */
export const MAX_INPUT_CHARS = 4_000;

/** Minimum rows for textarea */
export const MIN_INPUT_ROWS = 1;

/** Maximum rows for textarea before scrolling */
export const MAX_INPUT_ROWS = 6;

// ───────────────────────────────────────────────────────────────────────────────
// Persistence
// ───────────────────────────────────────────────────────────────────────────────

/** Maximum number of messages to persist in localStorage */
export const MAX_PERSISTED_MESSAGES = 200;

/** Maximum payload size in bytes for localStorage */
export const MAX_PAYLOAD_BYTES = 250_000;

// ───────────────────────────────────────────────────────────────────────────────
// Context Builder
// ───────────────────────────────────────────────────────────────────────────────

/** Default maximum messages to include in context */
export const DEFAULT_MAX_MESSAGES = 12;

/** Default character budget for context */
export const DEFAULT_CHAR_BUDGET = 12_000;

/** Minimum characters reserved for user input */
export const DEFAULT_MIN_USER_CHARS = 2_000;

// ──────────────────────────────────────────────────────────────────────────────
// UI
// ───────────────────────────────────────────────────────────────────────────────

/** Auto-scroll threshold in pixels */
export const AUTO_SCROLL_THRESHOLD_PX = 24;

/** Default estimated message height for virtualization */
export const DEFAULT_MESSAGE_HEIGHT = 120;

/** Overscan pixels for virtualized list */
export const VIRTUAL_LIST_OVERSCAN_PX = 240;
