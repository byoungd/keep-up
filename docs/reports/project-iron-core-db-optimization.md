# Project Iron Core: DB Optimization Report

## Scope
Review RSS feed/article persistence in `packages/db` and optimize the unread-items query used by the feed UI.

## Findings
- **Feeds**: `rss_subscriptions` stores feed metadata and poll state (`status`, `error_message`, `etag`, `last_modified`).
- **Feed Items**: `feed_items` stores per-entry state (read/saved, document linkage).
- **Articles**: `content_items` is the canonical table for ingested article text + metadata (`canonical_hash`, `ingested_at`, `feed_id`).
- Existing indexes already cover:
  - `feed_items` by `subscription_id` and `published_at`
  - `feed_items` by `read_state` and `published_at` (for ordered unread lists)
  - `content_items` by `ingested_at` and `canonical_hash`

## Optimization Applied
- Added a composite index for unread counts:
  - `idx_feed_items_read_state_subscription` on `(read_state, subscription_id)`
  - This matches `countUnreadFeedItems()` (`read_state = 'unread'` plus optional `subscription_id`) and avoids table scans.
- Added migration `V11 -> V12` so existing databases receive the new index.

## Notes
- No circular dependencies were found between `@ku0/core` and the ingest packages. Ingest depends on core utilities; core does not import ingest modules.
- The unread-list ordering index (`idx_feed_items_read_state` with `published_at DESC`) remains the best fit for list queries and is preserved.

## Follow-Up Ideas (Not in Scope)
- Track per-feed `etag`/`last_modified` in scheduler state to reduce feed payloads.
- Add query metrics around feed/unread operations for regression detection.
