# File Ingest Plugin

File import plugin for Markdown, PDF, EPUB, and TXT files.
Outputs `IngestionMeta` for use with `AtomicIngestionService`.

## Features

- Import from local files (path or Buffer)
- Import from URLs (HTTP/HTTPS)
- Automatic format detection
- Support for Markdown, PDF, EPUB, TXT

## Installation

```bash
pnpm add @packages/ingest-file
```

## Usage

### Import from Local File

```typescript
import { createFileImporter } from '@packages/ingest-file';

const importer = createFileImporter();

// Import from file path
const meta = await importer.importFile({ path: './document.md' });
console.log(meta.title, meta.content);

// Import from buffer
const buffer = fs.readFileSync('./document.pdf');
const meta2 = await importer.importFile({ 
  buffer, 
  filename: 'document.pdf' 
});
```

### Import from URL

```typescript
const importer = createFileImporter();

// Import markdown from GitHub
const meta = await importer.importFromUrl(
  'https://raw.githubusercontent.com/user/repo/main/README.md'
);

// Import PDF with custom timeout
const pdfMeta = await importer.importFromUrl(
  'https://example.com/document.pdf',
  { timeout: 60000 }
);

// Batch import from URLs
const metas = await importer.importFromUrls([
  'https://example.com/doc1.md',
  'https://example.com/doc2.txt',
]);
```

### With AtomicIngestionService

```typescript
import { createFilePlugin } from '@packages/ingest-file';
import { AtomicIngestionService } from '@keepup/app/src/root/persistence';

const plugin = createFilePlugin();
const meta = await plugin.import({ path: './book.epub' });

const handle = await AtomicIngestionService.beginIngestion(meta);
await AtomicIngestionService.commitIngestion(handle);
```

## Supported Formats

| Format   | Extensions              | MIME Types                    |
|----------|-------------------------|-------------------------------|
| Markdown | .md, .markdown, .mdown  | text/markdown, text/x-markdown|
| PDF      | .pdf                    | application/pdf               |
| EPUB     | .epub                   | application/epub+zip          |
| TXT      | .txt, .text             | text/plain                    |

## Options

### FileImportOptions

```typescript
interface FileImportOptions {
  maxFileSize?: number;      // Default: 50MB
  encoding?: BufferEncoding; // For TXT files
  extractImages?: boolean;   // Future feature
  parserOptions?: Record<string, unknown>;
}
```

### UrlImportOptions

```typescript
interface UrlImportOptions extends FileImportOptions {
  timeout?: number;    // Default: 30000ms
  userAgent?: string;  // Custom User-Agent header
}
```

## Error Handling

```typescript
import { 
  FileNotFoundError,
  UnsupportedFormatError,
  ParseError,
  EncryptedFileError,
  FileTooLargeError,
  UrlFetchError,
} from '@packages/ingest-file';

try {
  const meta = await importer.importFromUrl('https://example.com/doc.pdf');
} catch (error) {
  if (error instanceof UrlFetchError) {
    console.error('Download failed:', error.url, error.statusCode);
  } else if (error instanceof EncryptedFileError) {
    console.error('PDF is password-protected');
  } else if (error instanceof ParseError) {
    console.error('Parse failed:', error.message);
  }
}
```

## Output Format

```typescript
interface IngestionMeta {
  title: string;    // Extracted from file metadata or filename
  content: string;  // Plain text content
  sourceId?: string; // file:// URI or content hash
  metadata?: Record<string, unknown>; // Parsed metadata (frontmatter, PDF info, etc.)
}
```

## Testing

```bash
# Run unit tests
pnpm test

# Test URL import with public files
pnpm test:import

# PDF quality tests
pnpm ingest-file:pdf:test       # Quick (PR gate, <30s)
pnpm ingest-file:pdf:test:full  # Full (nightly)
pnpm ingest-file:pdf:report     # JSON report to artifacts/
```

### PDF Quality Metrics & Gates

The PDF parser tracks quality indicators via `IngestNormalizationStats`:

| Metric | Description | Gate Threshold |
|--------|-------------|----------------|
| `fragmentationRatio` | Single-char words / total words | < 15% |
| `nonAsciiRatio` | Non-ASCII chars / total chars | < 10% |
| `avgParagraphLength` | Average paragraph length | > 50 chars |
| `shortParagraphRatio` | Short paragraphs / total | < 60% |
| `minContentLength` | Minimum extracted content | > 100 chars |

Quality gates are enforced in FULL (nightly) mode. Gate failures include actionable details:
```
fragmentation_exceeded: 18.5% > 15%
```

### Pitfalls & Mitigations

1. **Remote URL tests can hang**: Use timeout + local buffer fallback
2. **Silent failures**: Every await has logging; failures set `process.exitCode = 1`
3. **Report truncation**: Console shows summary only; details in JSON file

See `docs/ingest-file-pdf.md` for full contract documentation.
