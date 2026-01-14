# @ku0/ingest-youtube

YouTube transcript ingestion for language learning.

## Overview

This package provides:
- **Transcript extraction** - Fetch YouTube video transcripts
- **Paragraph grouping** - Convert segments into readable paragraphs
- **Metadata fetching** - Video title, channel, duration
- **Atomic ingestion** - Integration with Reader's ingestion pipeline

## Installation

```bash
pnpm add @ku0/ingest-youtube
```

## Quick Start

```typescript
import { YouTubeIngestor } from '@ku0/ingest-youtube';

const ingestor = new YouTubeIngestor();

// Get transcript from URL
const result = await ingestor.getTranscript('https://youtu.be/VIDEO_ID');

console.log(result.metadata.title);
console.log(result.metadata.channel);
console.log(result.paragraphs.length, 'paragraphs');
```

## API Reference

### YouTubeIngestor

```typescript
class YouTubeIngestor {
  getTranscript(url: string, options?: YouTubeIngestOptions): Promise<YouTubeTranscriptResult>;
  ingestToDoc(url: string, options?: YouTubeIngestOptions): Promise<IngestResult>;
}
```

### URL Utilities

```typescript
import { extractVideoId, isValidVideoId, buildWatchUrl } from '@ku0/ingest-youtube';

const videoId = extractVideoId('https://youtu.be/abc123'); // 'abc123'
const isValid = isValidVideoId('abc123'); // true
const url = buildWatchUrl('abc123'); // 'https://www.youtube.com/watch?v=abc123'
const timestamped = buildTimestampedUrl('abc123', 120); // '...&t=120'
```

### Transcript Types

```typescript
interface TranscriptSegment {
  text: string;
  start: number;  // seconds
  duration: number;
}

interface TranscriptParagraph {
  text: string;
  startTime: number;
  endTime: number;
  segmentCount: number;
}

interface YouTubeTranscriptResult {
  metadata: YouTubeVideoMetadata;
  segments: TranscriptSegment[];
  paragraphs: TranscriptParagraph[];
}
```

### Video Metadata

```typescript
interface YouTubeVideoMetadata {
  videoId: string;
  title: string;
  channel: string;
  duration: number;
  thumbnail?: string;
  language?: string;
}
```

### Plugin Integration

For use with AtomicIngestionService:

```typescript
import { createYouTubePlugin } from '@ku0/ingest-youtube';

const plugin = createYouTubePlugin();

// Check if URL is supported
if (plugin.canHandle('https://youtu.be/VIDEO_ID')) {
  const metas = await plugin.fetch({ url: 'https://youtu.be/VIDEO_ID' });
  
  for (const meta of metas) {
    const handle = await ingestionService.beginIngestion(meta);
    await ingestionService.commitIngestion(handle);
  }
}
```

### Paragraph Grouping

```typescript
import { groupIntoParagraphs, formatTimestamp } from '@ku0/ingest-youtube';

const paragraphs = groupIntoParagraphs(segments, {
  maxParagraphDuration: 30,  // seconds
  minSegmentsPerParagraph: 3,
});

const formatted = formatTimestamp(125); // '2:05'
```

## Server-Side Usage

Transcript fetching requires a server-side API route:

```typescript
// pages/api/youtube/transcript.ts
import { fetchTranscript } from '@ku0/ingest-youtube';

export async function GET(req: Request) {
  const videoId = new URL(req.url).searchParams.get('videoId');
  const transcript = await fetchTranscript(videoId!);
  return Response.json(transcript);
}
```

## Testing

```bash
pnpm --filter @ku0/ingest-youtube test
```

## License

MIT
