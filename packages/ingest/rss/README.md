# @ku0/ingest-rss

RSS/Atom feed ingestion pipeline for the Reader application.

## Overview

This package provides:
- **Feed parsing** - RSS 2.0, Atom, and JSON Feed support
- **Content extraction** - Full-text extraction via Readability
- **Atomic ingestion** - Transactional document import
- **Default feeds** - Curated feed sources by category

## Installation

```bash
pnpm add @ku0/ingest-rss
```

## Quick Start

```typescript
import { RSSIngestor, getAllDefaultFeeds } from '@ku0/ingest-rss';

const ingestor = new RSSIngestor();

// Fetch and parse a feed
const results = await ingestor.fetchFeed({
  url: 'https://example.com/feed.xml',
  platform: 'RSS',
});

// Process results
for (const result of results) {
  console.log(result.doc.title);
  console.log(result.blocks.length, 'blocks');
}

// Get default feeds by category
const feeds = getAllDefaultFeeds();
```

## API Reference

### RSSIngestor

```typescript
class RSSIngestor {
  fetchFeed(source: FeedSource, options?: RSSIngestOptions): Promise<IngestResult[]>;
  fetchFeedEnhanced(source: FeedSource, options?: EnhancedIngestOptions): Promise<EnhancedIngestResult>;
  fetchFeedForIngestion(source: FeedSource, options?: RSSIngestOptions): Promise<IngestionMeta[]>;
}
```

### FeedSource

```typescript
interface FeedSource {
  url: string;
  platform?: 'Reddit' | 'Hacker News' | string;
}
```

### IngestResult

```typescript
interface IngestResult {
  doc: Doc;
  blocks: DocBlock[];
  originalId: string;
  raw: RSSItem;
}
```

### Default Feeds

```typescript
import { getAllDefaultFeeds, getDefaultFeedsByCategory } from '@ku0/ingest-rss';

// Get all feeds
const allFeeds = getAllDefaultFeeds();

// Get by category
const techFeeds = getDefaultFeedsByCategory('tech');
const newsFeeds = getDefaultFeedsByCategory('news');
```

### Full-Text Extraction

> **Note**: Full-text extraction uses jsdom and must be used server-side only.

```typescript
// Server-side only
import { extractFromHtml } from '@ku0/ingest-rss/src/contentExtractor';

const content = extractFromHtml(html, { baseUrl: 'https://example.com' });
```

## Browser-Safe Utilities

For client-side code, use the browser-safe utilities:

```typescript
import { containsHtml, stripHtmlTags, isSnippet } from '@ku0/ingest-rss';

const hasHtml = containsHtml(text);
const cleaned = stripHtmlTags(htmlContent);
const isShort = isSnippet(content, 500);
```

## Conditional Requests

Support for ETag and Last-Modified headers:

```typescript
const result = await ingestor.fetchFeedEnhanced(source, {
  etag: previousEtag,
  lastModified: previousLastModified,
});

if (!result.modified) {
  console.log('Feed unchanged');
} else {
  // Process new items
  console.log('New etag:', result.etag);
}
```

## Testing

```bash
pnpm --filter @ku0/ingest-rss test
```

## License

MIT
