# PDF Ingest Contract

## Overview

The PDF parser extracts text content from PDF documents using `unpdf` (Mozilla pdf.js based).

## Parser Behavior

### Text Extraction

| Feature | Behavior |
|---------|----------|
| Text order | Preserved (reading order) |
| Paragraph detection | Y-position gap analysis (1.8x line height) |
| Hyphen merging | Enabled by default (`mergeHyphens: true`) |
| Page numbers | Filtered out (single digit blocks) |
| Short blocks | Filtered (<3 chars) |

### Paragraph Detection Algorithm

```
For each text item on page:
  1. Get Y-position from transform matrix
  2. Calculate gap from previous item
  3. If gap > 1.8 * line_height:
     → Start new paragraph
  4. Else:
     → Append to current paragraph
```

### Title Extraction Priority

1. PDF metadata `Title` field (if present and non-empty)
2. First content block (5-200 chars)
3. Fallback: "Untitled"

## Quality Metrics

The parser tracks these quality indicators:

```typescript
interface IngestNormalizationStats {
  totalChars: number;           // Total extracted characters
  totalWords: number;           // Total word count
  totalParagraphs: number;      // Paragraph count (trimmed)
  totalBlocks: number;          // Total blocks from parser
  singleCharWords: number;      // Single-char word count (fragmentation indicator)
  nonAsciiChars: number;        // Non-ASCII character count
  shortParagraphs: number;      // Paragraphs < 50 chars
  avgParagraphLength: number;   // Average paragraph length
  minParagraphLength: number;   // Minimum paragraph length
  maxParagraphLength: number;   // Maximum paragraph length
  emptyParagraphs: number;      // Number of empty paragraphs
  fragmentationRatio: number;   // singleCharWords / totalWords
  nonAsciiRatio: number;        // non-ASCII chars / totalChars
  shortParagraphRatio: number;  // shortParagraphs / totalParagraphs
}
```

## Quality Gate Thresholds

Quality gates are enforced in FULL (nightly) mode only:

| Threshold | Default | Meaning |
|-----------|---------|---------|
| `maxFragmentationRatio` | 15% | Max single-char words ratio |
| `maxNonAsciiRatio` | 10% | Max non-ASCII chars ratio |
| `minAvgParagraphLength` | 50 | Min average paragraph length |
| `maxShortParagraphRatio` | 60% | Max short paragraphs ratio |
| `minContentLength` | 100 | Min total content length |

## Dependency Policy

| Dependency | Type | Justification |
|------------|------|---------------|
| `unpdf` | Production | Mozilla pdf.js wrapper, high-quality extraction |
| `epub2` | Production | EPUB parsing |
| `zod` | Production | Schema validation |

## Guarantees

| Guarantee | Verified By |
|-----------|-------------|
| ✅ Text order preserved | Manual inspection |
| ✅ Paragraph boundaries detected | Y-position analysis |
| ✅ Metadata extraction (title, author) | PDF metadata API |
| ✅ Encrypted PDF detection | Error handling |
| ✅ Large file handling | maxFileSize option |

## Non-Guarantees

| Limitation | Notes |
|------------|-------|
| ❌ Table structure | Tables extracted as plain text |
| ❌ Image text (OCR) | Not supported |
| ❌ Form fields | Not extracted |
| ❌ Annotations | Not extracted |
| ❌ Exact layout | Text flow only |

## Error Handling

```typescript
import { EncryptedFileError, ParseError } from '@ku0/ingest-file';

try {
  const meta = await importer.importFile({ path: './doc.pdf' });
} catch (error) {
  if (error instanceof EncryptedFileError) {
    // PDF is password-protected
  } else if (error instanceof ParseError) {
    // General parse failure
  }
}
```

## CI Integration

```bash
pnpm ingest-file:pdf:test       # PR gate (<30s)
pnpm ingest-file:pdf:test:full  # Nightly
pnpm ingest-file:pdf:report     # JSON to artifacts/
```

## Parser Options

```typescript
interface PDFParserOptions {
  maxPages?: number;      // Limit pages to parse (default: all)
  mergeHyphens?: boolean; // Merge hyphenated words (default: true)
}
```

## Output Format

```typescript
interface IngestionMeta {
  title: string;    // Extracted title
  content: string;  // Plain text content (paragraphs joined by \n\n)
  sourceId?: string; // file:// URI or URL
  metadata?: Record<string, unknown>; // Parser metadata (author, publisher, etc.)
}
```
